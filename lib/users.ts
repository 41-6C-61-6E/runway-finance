import bcrypt from 'bcryptjs';
import { getPool } from './db';
import { deriveKeyFromPassword, unwrapKey, wrapKey, generateDEK, getServerKey } from './crypto';
import { getDb } from './db';
import { userEncryptionKeys } from './db/schema';
import { eq } from 'drizzle-orm';

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

export async function addUser(user: { username: string; password: string; email?: string }): Promise<User> {
  const pool = getPool();
  if (!pool) throw new Error('Database not available');

  const password_hash = await bcrypt.hash(user.password, 12);

  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      'INSERT INTO users (username, password_hash, email) VALUES ($1, $2, $3) RETURNING username, password_hash, email',
      [user.username, password_hash, user.email || null]
    );
    return rows[0];
  } finally {
    client.release();
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
        const dek = await unwrapKey({
          ciphertext: keyRow.wrappedDek,
          iv: keyRow.wrappingIv,
          tag: keyRow.wrappingTag,
        }, oldKek);

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
