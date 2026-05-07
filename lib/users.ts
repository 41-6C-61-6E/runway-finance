import bcrypt from 'bcryptjs';
import { getPool } from './db';

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
