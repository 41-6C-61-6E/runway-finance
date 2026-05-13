import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './db/schema';
import { logger } from '@/lib/logger';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

let pool: Pool | null = null;
let dbInitialized = false;

export function getPool(): Pool {
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    logger.error('DATABASE_URL is not set. PostgreSQL features will not work.');
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

async function ensureMigrationsTable(client: any): Promise<void> {
  await client.query('CREATE SCHEMA IF NOT EXISTS drizzle');
  await client.query(`
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash TEXT NOT NULL,
      created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000
    )
  `);

  // Check if old-style table (no tag column) — upgrade it
  const colCheck = await client.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'drizzle' AND table_name = '__drizzle_migrations' AND column_name = 'tag'
  `);

  if (colCheck.rows.length === 0) {
    logger.info('[db] Upgrading __drizzle_migrations table (adding tag column)...');
    await client.query('ALTER TABLE drizzle.__drizzle_migrations ADD COLUMN tag TEXT');

    // Backfill tags by matching journal entry SQL SHA256 against stored hashes
    const journal = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'drizzle', 'meta', '_journal.json'), 'utf-8')
    );
    for (const entry of journal.entries) {
      const sqlPath = path.join(process.cwd(), 'drizzle', entry.tag + '.sql');
      if (!fs.existsSync(sqlPath)) continue;
      const sql = fs.readFileSync(sqlPath, 'utf-8');
      const hash = crypto.createHash('sha256').update(sql).digest('hex');
      await client.query(
        'UPDATE drizzle.__drizzle_migrations SET tag = $1 WHERE hash = $2 AND tag IS NULL',
        [entry.tag, hash]
      );
    }

    // Tag any remaining unmatched rows
    await client.query(
      "UPDATE drizzle.__drizzle_migrations SET tag = 'legacy_' || id WHERE tag IS NULL"
    );

    await client.query('ALTER TABLE drizzle.__drizzle_migrations ALTER COLUMN tag SET NOT NULL');
    await client.query(
      'ALTER TABLE drizzle.__drizzle_migrations ADD CONSTRAINT __drizzle_migrations_tag_key UNIQUE (tag)'
    );
    logger.info('[db] Migration table upgraded.');
  }
}

export async function initDb(): Promise<void> {
  if (dbInitialized) return;
  dbInitialized = true;

  const pool = getPool();
  if (!pool) return;

  const migrationsFolder = path.join(process.cwd(), 'drizzle');
  const journalPath = path.join(migrationsFolder, 'meta', '_journal.json');

  if (!fs.existsSync(journalPath)) {
    logger.warn('[db] No migration journal found, skipping migrations');
    return;
  }

  const client = await pool.connect();
  try {
    await ensureMigrationsTable(client);

    // Read journal to get ordered list of migrations
    const journal = JSON.parse(fs.readFileSync(journalPath, 'utf-8'));
    const entries = journal.entries.sort((a: { idx: number }, b: { idx: number }) => a.idx - b.idx);

    // Get already-applied tags
    const applied = await client.query('SELECT tag FROM drizzle.__drizzle_migrations');
    const appliedTags = new Set(applied.rows.map((r: { tag: string }) => r.tag));

    let appliedCount = 0;

    for (const entry of entries) {
      if (appliedTags.has(entry.tag)) continue;

      const sqlPath = path.join(migrationsFolder, `${entry.tag}.sql`);
      if (!fs.existsSync(sqlPath)) {
        logger.error(`[db] Migration file not found: ${sqlPath}`);
        continue;
      }

      const sql = fs.readFileSync(sqlPath, 'utf-8');
      const hash = crypto.createHash('sha256').update(sql).digest('hex');
      const statements = sql.split('--> statement-breakpoint').map((s: string) => s.trim()).filter(Boolean);

      try {
        await client.query('BEGIN');
        for (const stmt of statements) {
          await client.query(stmt);
        }
        await client.query(
          'INSERT INTO drizzle.__drizzle_migrations (tag, hash, created_at) VALUES ($1, $2, $3)',
          [entry.tag, hash, entry.when ?? Date.now()]
        );
        await client.query('COMMIT');
        logger.info(`[db] Applied migration: ${entry.tag}`);
        appliedCount++;
      } catch (err) {
        await client.query('ROLLBACK');
        logger.error(`[db] Migration ${entry.tag} failed`, { error: err instanceof Error ? err.message : String(err) });
        throw err;
      }
    }

    if (appliedCount > 0) {
      logger.info(`[db] Applied ${appliedCount} pending migration(s)`);
    } else {
      logger.info('[db] No pending migrations');
    }
  } catch (error) {
    logger.error('[db] Migration process failed', { error: error instanceof Error ? error.message : String(error) });
    throw error;
  } finally {
    client.release();
  }
}