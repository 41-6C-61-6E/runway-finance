import { beforeAll, afterAll, beforeEach } from 'vitest';
import { getPool } from '@/lib/db';
import { initDb } from '@/lib/db/migrate';

const testDbUrl = process.env.DATABASE_URL || 'postgresql://postgres:l45606393b@localhost:5432/runway_finance_test';

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
  await initDb(testDbUrl);
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
