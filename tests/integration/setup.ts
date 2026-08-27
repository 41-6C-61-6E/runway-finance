import { beforeAll, afterAll, beforeEach } from 'vitest';
import { getPool } from '@/lib/db';
import { initDb } from '@/lib/db/migrate';

// L-13 (2026-08-27 security review): no hardcoded local test-DB password.
// Point DATABASE_URL at a dedicated test database before running
// `pnpm test:integration` (see README "Integration tests").
const testDbUrl = process.env.DATABASE_URL;

function requireTestDbUrl(): string {
  if (!testDbUrl) {
    throw new Error(
      'DATABASE_URL is not set for integration tests. Export a dedicated ' +
        'test database URL, e.g. ' +
        'DATABASE_URL=postgresql://postgres:<strong-password>@localhost:5432/runway_finance_test ' +
        '(see README "Integration tests"). Refusing to run without it.'
    );
  }
  return testDbUrl;
}

export async function truncateAllTestTables() {
  const pool = getPool();
  if (!pool) return;
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
        AND table_name != '__drizzle_migrations';
    `);
    const tableNames = res.rows.map((r: any) => `"${r.table_name}"`);
    if (tableNames.length > 0) {
      await client.query(`TRUNCATE TABLE ${tableNames.join(', ')} CASCADE;`);
    }
  } catch (err: any) {
    console.error('Error truncating tables in setup:', err.message);
  } finally {
    client.release();
  }
}

beforeAll(async () => {
  await initDb(requireTestDbUrl());
  await truncateAllTestTables();
});

beforeEach(async () => {
  await truncateAllTestTables();
});

afterAll(async () => {
  await truncateAllTestTables();
  const pool = getPool();
  if (pool) {
    await pool.end();
  }
});
