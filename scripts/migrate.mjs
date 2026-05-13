import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(__dirname, '..', 'drizzle');
const journalPath = path.join(migrationsFolder, 'meta', '_journal.json');

async function ensureMigrationsTable(client) {
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
    console.log('[migrate] Upgrading __drizzle_migrations table (adding tag column)...');
    await client.query('ALTER TABLE drizzle.__drizzle_migrations ADD COLUMN tag TEXT');

    // Backfill tags by matching journal entry SQL SHA256 against stored hashes
    const journal = JSON.parse(fs.readFileSync(journalPath, 'utf-8'));
    for (const entry of journal.entries) {
      const sqlPath = path.join(migrationsFolder, entry.tag + '.sql');
      if (!fs.existsSync(sqlPath)) continue;
      const sql = fs.readFileSync(sqlPath, 'utf-8');
      const hash = crypto.createHash('sha256').update(sql).digest('hex');
      await client.query(
        'UPDATE drizzle.__drizzle_migrations SET tag = $1 WHERE hash = $2 AND tag IS NULL',
        [entry.tag, hash]
      );
    }

    // Tag any remaining unmatched rows (shouldn't happen, but be safe)
    await client.query(
      "UPDATE drizzle.__drizzle_migrations SET tag = 'legacy_' || id WHERE tag IS NULL"
    );

    await client.query('ALTER TABLE drizzle.__drizzle_migrations ALTER COLUMN tag SET NOT NULL');
    await client.query(
      'ALTER TABLE drizzle.__drizzle_migrations ADD CONSTRAINT __drizzle_migrations_tag_key UNIQUE (tag)'
    );
    console.log('[migrate] Migration table upgraded.');
  }
}

async function migrate() {
  if (!fs.existsSync(journalPath)) {
    console.log('[migrate] No migration journal found');
    return;
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  try {
    await ensureMigrationsTable(client);

    const journal = JSON.parse(fs.readFileSync(journalPath, 'utf-8'));
    const entries = journal.entries.sort((a, b) => a.idx - b.idx);
    const applied = await client.query('SELECT tag FROM drizzle.__drizzle_migrations');
    const appliedTags = new Set(applied.rows.map(r => r.tag));

    let count = 0;
    for (const entry of entries) {
      if (appliedTags.has(entry.tag)) continue;

      const sqlPath = path.join(migrationsFolder, entry.tag + '.sql');
      if (!fs.existsSync(sqlPath)) {
        console.log('[migrate] File not found:', sqlPath);
        continue;
      }

      const sql = fs.readFileSync(sqlPath, 'utf-8');
      const hash = crypto.createHash('sha256').update(sql).digest('hex');
      const statements = sql.split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean);

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
        console.log('[migrate] Applied:', entry.tag);
        count++;
      } catch (e) {
        await client.query('ROLLBACK');
        console.error('[migrate] FAILED:', entry.tag, '-', e.message);
        throw e;
      }
    }
    console.log('[migrate] Complete:', count, 'pending migration(s) applied');
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(e => {
  console.error('[migrate] Fatal:', e.message);
  process.exit(1);
});
