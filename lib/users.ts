import bcrypt from 'bcryptjs';
import type { PoolClient } from 'pg';
import { getPool } from './db';
import { deriveKeyFromPassword, unwrapKey, wrapKey, generateDEK, getServerKey } from './crypto';
import { getDb } from './db';
import { userEncryptionKeys, dekVersions, dekVersionWraps } from './db/schema';
import { and, eq } from 'drizzle-orm';

// Drizzle instance type (without the concrete $client brand, so a db bound to
// a transactional PoolClient is also assignable).
type Db = Omit<ReturnType<typeof getDb>, '$client'>;

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array {
  return new Uint8Array(hex.match(/.{2}/g)!.map((c) => parseInt(c, 16)));
}

export interface User {
  username: string;
  password_hash: string;
  email?: string;
}

export async function getUsers(): Promise<Omit<User, 'password_hash'>[]> {
  const pool = getPool();
  if (!pool) return [];

  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      'SELECT id, username, email FROM users'
    );
    return rows.map(({ id, username, email }) => ({
      username,
      email,
    }));
  } finally {
    client.release();
  }
}

export async function addUser(
  user: { username: string; password: string; email?: string },
  client?: PoolClient
): Promise<User> {
  const password_hash = await bcrypt.hash(user.password, 12);

  const insert = async (c: PoolClient): Promise<User> => {
    const { rows } = await c.query(
      'INSERT INTO users (username, password_hash, email) VALUES ($1, $2, $3) RETURNING username, password_hash, email',
      [user.username, password_hash, user.email || null]
    );
    return rows[0];
  };

  // When a caller-provided client is passed, run on it directly (the caller
  // owns the transaction and the release); otherwise keep the legacy behavior.
  if (client) {
    return insert(client);
  }

  const pool = getPool();
  if (!pool) throw new Error('Database not available');

  const c = await pool.connect();
  try {
    return await insert(c);
  } finally {
    c.release();
  }
}

export async function findUser(username: string): Promise<User | undefined> {
  const pool = getPool();
  if (!pool) return undefined;

  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      'SELECT username, password_hash, email FROM users WHERE username = $1',
      [username]
    );
    return rows[0] || undefined;
  } finally {
    client.release();
  }
}

export async function updatePassword(username: string, currentPassword: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
  const pool = getPool();
  if (!pool) return { success: false, error: 'Database not available' };

  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      'SELECT password_hash FROM users WHERE username = $1',
      [username]
    );
    const user = rows[0];
    if (!user) return { success: false, error: 'User not found' };

    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) return { success: false, error: 'Current password is incorrect' };

    const password_hash = await bcrypt.hash(newPassword, 12);
    await client.query(
      'UPDATE users SET password_hash = $1 WHERE username = $2',
      [password_hash, username]
    );

    // Re-wrap DEK with new password
    try {
      const db = getDb();
      const [keyRow] = await db
        .select()
        .from(userEncryptionKeys)
        .where(eq(userEncryptionKeys.userId, username))
        .limit(1);

      if (keyRow) {
        const salt = hexToBytes(keyRow.salt);
        const oldKek = await deriveKeyFromPassword(currentPassword, salt);
        let dek: Uint8Array;
        if (keyRow.serverWrappedDek && keyRow.serverWrappingIv) {
          // The server wrap is authoritative — the password wrap may predate a
          // household DEK rotation that only refreshed the server-side copies.
          dek = await unwrapKey({
            ciphertext: keyRow.serverWrappedDek,
            iv: keyRow.serverWrappingIv,
            tag: keyRow.serverWrappingTag ?? '',
          }, getServerKey());
        } else {
          dek = await unwrapKey({
            ciphertext: keyRow.wrappedDek,
            iv: keyRow.wrappingIv,
            tag: keyRow.wrappingTag,
          }, oldKek);
        }

        const newSalt = crypto.getRandomValues(new Uint8Array(32));
        const newKek = await deriveKeyFromPassword(newPassword, newSalt);
        const pwdWrapped = await wrapKey(dek, newKek);

        // Also re-wrap with server key
        const serverKey = getServerKey();
        const serverWrapped = await wrapKey(dek, serverKey);

        await db.update(userEncryptionKeys).set({
          wrappedDek: pwdWrapped.ciphertext,
          wrappingIv: pwdWrapped.iv,
          wrappingTag: pwdWrapped.tag,
          serverWrappedDek: serverWrapped.ciphertext,
          serverWrappingIv: serverWrapped.iv,
          serverWrappingTag: serverWrapped.tag,
          salt: bytesToHex(newSalt),
          updatedAt: new Date(),
        }).where(eq(userEncryptionKeys.userId, username));

        // Refresh this user's wrap of the household's current DEK version under
        // the new KEK so the version chain stays readable after the change.
        const householdId = keyRow.primaryUserId ?? username;
        const versionRows = await db
          .select({
            id: dekVersions.id,
            version: dekVersions.version,
            dekWrappedServer: dekVersions.dekWrappedServer,
            wrappingIv: dekVersions.wrappingIv,
            wrappingTag: dekVersions.wrappingTag,
          })
          .from(dekVersions)
          .where(eq(dekVersions.primaryUserId, householdId));

        if (versionRows.length > 0) {
          const latest = versionRows.reduce((a, b) => ((b.version ?? 0) > (a.version ?? 0) ? b : a));
          const versionDek = await unwrapKey({
            ciphertext: latest.dekWrappedServer,
            iv: latest.wrappingIv,
            tag: latest.wrappingTag,
          }, serverKey);
          const versionWrap = await wrapKey(versionDek, newKek);
          await db
            .delete(dekVersionWraps)
            .where(and(eq(dekVersionWraps.versionId, latest.id), eq(dekVersionWraps.memberUserId, username)));
          await db.insert(dekVersionWraps).values({
            versionId: latest.id,
            memberUserId: username,
            wrappedDek: versionWrap.ciphertext,
            wrappingIv: versionWrap.iv,
            wrappingTag: versionWrap.tag,
          });
        }
      }
    } catch (err: any) {
      return { success: false, error: `Password updated but key re-wrap failed: ${err.message}` };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update password' };
  } finally {
    client.release();
  }
}

export async function createUserEncryptionKeys(username: string, password: string): Promise<void> {
  const dek = generateDEK();
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const kek = await deriveKeyFromPassword(password, salt);
  const pwdWrapped = await wrapKey(dek, kek);
  const serverKey = getServerKey();
  const serverWrapped = await wrapKey(dek, serverKey);

  const db = getDb();
  await db.insert(userEncryptionKeys).values({
    userId: username,
    wrappedDek: pwdWrapped.ciphertext,
    wrappingIv: pwdWrapped.iv,
    wrappingTag: pwdWrapped.tag,
    serverWrappedDek: serverWrapped.ciphertext,
    serverWrappingIv: serverWrapped.iv,
    serverWrappingTag: serverWrapped.tag,
    salt: bytesToHex(salt),
  });
}

/**
 * For the sharing join flow: wrap the primary user's DEK with a new member's
 * password and store it in user_encryption_keys for the new member.
 *
 * The new member's row points back to the primary via `primaryUserId` so that
 * the auth layer knows to route data queries to the primary's ID.
 */
export async function rewrapDekForUser(
  newUsername: string,
  newPassword: string,
  primaryUsername: string,
  db: Db = getDb()
): Promise<void> {
  // Retrieve the primary's server-wrapped DEK
  const [primaryKeyRow] = await db
    .select()
    .from(userEncryptionKeys)
    .where(eq(userEncryptionKeys.userId, primaryUsername))
    .limit(1);

  if (!primaryKeyRow?.serverWrappedDek || !primaryKeyRow.serverWrappingIv) {
    throw new Error('Primary user encryption key not found or missing server wrap');
  }

  // Unwrap primary's DEK using the server key
  const serverKey = getServerKey();
  const dek = await unwrapKey(
    {
      ciphertext: primaryKeyRow.serverWrappedDek,
      iv: primaryKeyRow.serverWrappingIv,
      tag: primaryKeyRow.serverWrappingTag ?? '',
    },
    serverKey
  );

  // Wrap primary's DEK with the new member's password
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const kek = await deriveKeyFromPassword(newPassword, salt);
  const pwdWrapped = await wrapKey(dek, kek);
  const serverWrapped = await wrapKey(dek, serverKey);

  await db.insert(userEncryptionKeys).values({
    userId: newUsername,
    wrappedDek: pwdWrapped.ciphertext,
    wrappingIv: pwdWrapped.iv,
    wrappingTag: pwdWrapped.tag,
    serverWrappedDek: serverWrapped.ciphertext,
    serverWrappingIv: serverWrapped.iv,
    serverWrappingTag: serverWrapped.tag,
    salt: bytesToHex(salt),
    primaryUserId: primaryUsername,
  });

  // Record this member's wrap of the household's current DEK version so they
  // can decrypt via the version chain on their next login. Legacy households
  // have no version rows, so this is a no-op for them.
  const versionRows = await db
    .select({ id: dekVersions.id, version: dekVersions.version })
    .from(dekVersions)
    .where(eq(dekVersions.primaryUserId, primaryUsername));

  if (versionRows.length > 0) {
    const latest = versionRows.reduce((a, b) => ((b.version ?? 0) > (a.version ?? 0) ? b : a));
    await db.insert(dekVersionWraps).values({
      versionId: latest.id,
      memberUserId: newUsername,
      wrappedDek: pwdWrapped.ciphertext,
      wrappingIv: pwdWrapped.iv,
      wrappingTag: pwdWrapped.tag,
    });
  }
}
