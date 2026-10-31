import bcrypt from 'bcryptjs';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { PoolClient } from 'pg';
import * as schema from './db/schema';

function drizzleOnClient(client: PoolClient) {
  return drizzle(client, { schema });
}
import { getPool } from './db';
import { deriveKeyFromPassword, unwrapKey, wrapKey, generateDEK, getServerKey } from './crypto';
import { getDb } from './db';
import { userEncryptionKeys } from './db/schema';
import { eq } from 'drizzle-orm';
import { checkPasswordPolicy } from './password-policy';

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

    // M-2: enforce the shared server-side password policy.
    const policy = checkPasswordPolicy(newPassword);
    if (!policy.ok) return { success: false, error: policy.message ?? 'Weak password' };

    const password_hash = await bcrypt.hash(newPassword, 12);
    // M-9: hash update + DEK re-wrap are ONE transaction — all-or-nothing.
    // A partial state (new hash, old wraps) previously left the user logged
    // in with a mismatched key until the next self-heal.
    // H-3: the in-memory DEK cache is invalidated UNCONDITIONALLY after the
    // commit so no instance keeps serving the old key. Failures here are non-
    // fatal: the cache also expires by TTL and the next login re-derives.
    const invalidateCache = () => {
      void import('./crypto-context').then((m) => m.invalidateUserDEKCache(username)).catch(() => {});
    };
    try {
      await client.query('BEGIN');

      await client.query(
        'UPDATE users SET password_hash = $1 WHERE username = $2',
        [password_hash, username]
      );

      // Re-wrap DEK with the new password within the same transaction.
      const tx: Db = drizzleOnClient(client);
      {
        const [keyRow] = await tx
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

          await tx.update(userEncryptionKeys).set({
            wrappedDek: pwdWrapped.ciphertext,
            wrappingIv: pwdWrapped.iv,
            wrappingTag: pwdWrapped.tag,
            serverWrappedDek: serverWrapped.ciphertext,
            serverWrappingIv: serverWrapped.iv,
            serverWrappingTag: serverWrapped.tag,
            salt: bytesToHex(newSalt),
            updatedAt: new Date(),
          }).where(eq(userEncryptionKeys.userId, username));
        }
      }

      await client.query('COMMIT');
      invalidateCache();
      return { success: true };
    } catch (err: any) {
      try { await client.query('ROLLBACK'); } catch { /* ignore */ }
      return { success: false, error: err.message || 'Failed to update password' };
    }
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
