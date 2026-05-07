import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './db/schema';

let pool: Pool | null = null;

export function getPool(): Pool {
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    console.error('DATABASE_URL is not set. PostgreSQL features will not work.');
    return null as unknown as Pool;
  }
  if (!pool) {
    pool = new Pool({
      connectionString: DATABASE_URL,
    });
  }
  return pool;
}

export function getDb() {
  const pool = getPool();
  if (!pool) {
    throw new Error('Database pool is not available. Ensure DATABASE_URL is set.');
  }
  return drizzle(pool, { schema });
}

export async function initDb(): Promise<void> {
  const pool = getPool();
  if (!pool) return;

  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        email TEXT
      );
    `);
  } finally {
    client.release();
  }
}
