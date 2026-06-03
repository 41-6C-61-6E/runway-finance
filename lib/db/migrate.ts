import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { logger } from '@/lib/logger';

export async function initDb(databaseUrl: string): Promise<void> {
  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();
  try {
    await ensureMigrationsTable(client);
    await runSelfHealingChecks(client);

    const migrationsFolder = path.join(process.cwd(), 'drizzle');
    const journalPath = path.join(migrationsFolder, 'meta', '_journal.json');

    if (!fs.existsSync(journalPath)) {
      logger.warn('[migrate] No migration journal found, skipping migrations');
      return;
    }

    const journal = JSON.parse(fs.readFileSync(journalPath, 'utf-8'));
    const entries = journal.entries.sort((a: { idx: number }, b: { idx: number }) => a.idx - b.idx);
    const applied = await client.query('SELECT tag FROM drizzle.__drizzle_migrations');
    const appliedTags = new Set(applied.rows.map((r: { tag: string }) => r.tag));

    let count = 0;
    for (const entry of entries) {
      if (appliedTags.has(entry.tag)) continue;

      const sqlPath = path.join(migrationsFolder, entry.tag + '.sql');
      if (!fs.existsSync(sqlPath)) {
        logger.warn(`[migrate] File not found: ${sqlPath}`);
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
          [entry.tag, hash, entry.when || Date.now()]
        );
        await client.query('COMMIT');
        logger.info(`[migrate] Applied: ${entry.tag}`);
        count++;
      } catch (e) {
        await client.query('ROLLBACK');
        logger.error(`[migrate] FAILED: ${entry.tag} - ${e instanceof Error ? e.message : String(e)}`);
        throw e;
      }
    }
    logger.info(`[migrate] Complete: ${count} pending migration(s) applied`);
  } finally {
    client.release();
    await pool.end();
  }
}

async function runSelfHealingChecks(client: any): Promise<void> {
  logger.info('[migrate] Running database self-healing checks...');
  try {
    // 1. Check if primary_user_id column exists on user_encryption_keys
    const colCheck = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'user_encryption_keys' AND column_name = 'primary_user_id'
    `);
    if (colCheck.rows.length === 0) {
      logger.info('[migrate] [self-heal] Adding missing primary_user_id column to user_encryption_keys...');
      await client.query(`
        ALTER TABLE user_encryption_keys
        ADD COLUMN IF NOT EXISTS primary_user_id TEXT
      `);
    }

    // 2. Check if account_sharing_invitations table exists
    const tableCheck1 = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_name = 'account_sharing_invitations'
    `);
    if (tableCheck1.rows.length === 0) {
      logger.info('[migrate] [self-heal] Creating missing account_sharing_invitations table...');
      await client.query(`
        CREATE TABLE IF NOT EXISTS account_sharing_invitations (
          id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          inviter_user_id TEXT NOT NULL,
          invitee_email   TEXT NOT NULL,
          pin_hash        TEXT NOT NULL,
          pin             TEXT,
          status          TEXT NOT NULL DEFAULT 'pending',
          created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
    }

    // 3. Check if account_share_members table exists
    const tableCheck2 = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_name = 'account_share_members'
    `);
    if (tableCheck2.rows.length === 0) {
      logger.info('[migrate] [self-heal] Creating missing account_share_members table...');
      await client.query(`
        CREATE TABLE IF NOT EXISTS account_share_members (
          id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          primary_user_id TEXT NOT NULL,
          member_user_id  TEXT NOT NULL,
          invitation_id   UUID REFERENCES account_sharing_invitations(id) ON DELETE SET NULL,
          status          TEXT NOT NULL DEFAULT 'active',
          joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          removed_at      TIMESTAMPTZ,
          removed_by      TEXT,
          UNIQUE (primary_user_id, member_user_id)
        )
      `);
    }
  } catch (err) {
    logger.error('[migrate] Self-healing checks failed', { error: err instanceof Error ? err.message : String(err) });
    // Don't crash startup on self-healing check failure, but log it
  }
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

  const colCheck = await client.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'drizzle' AND table_name = '__drizzle_migrations' AND column_name = 'tag'
  `);

  if (colCheck.rows.length === 0) {
    logger.info('[migrate] Upgrading __drizzle_migrations table (adding tag column)...');
    await client.query('ALTER TABLE drizzle.__drizzle_migrations ADD COLUMN tag TEXT');

    const journalPath = path.join(process.cwd(), 'drizzle', 'meta', '_journal.json');
    if (fs.existsSync(journalPath)) {
      const journal = JSON.parse(fs.readFileSync(journalPath, 'utf-8'));
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
    }

    await client.query(
      "UPDATE drizzle.__drizzle_migrations SET tag = 'legacy_' || id WHERE tag IS NULL"
    );

    await client.query('ALTER TABLE drizzle.__drizzle_migrations ALTER COLUMN tag SET NOT NULL');
    await client.query(
      'ALTER TABLE drizzle.__drizzle_migrations ADD CONSTRAINT __drizzle_migrations_tag_key UNIQUE (tag)'
    );
    logger.info('[migrate] Migration table upgraded.');
  }
}
