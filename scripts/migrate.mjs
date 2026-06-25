import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(__dirname, '..', 'drizzle');
const journalPath = path.join(migrationsFolder, 'meta', '_journal.json');

async function runSelfHealingChecks(client) {
  console.log('[migrate] Running database self-healing checks...');
  try {
    // 1. Check if primary_user_id column exists on user_encryption_keys
    const colCheck = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'user_encryption_keys' AND column_name = 'primary_user_id'
    `);
    if (colCheck.rows.length === 0) {
      console.log('[migrate] [self-heal] Adding missing primary_user_id column to user_encryption_keys...');
      await client.query(`
        ALTER TABLE user_encryption_keys
        ADD COLUMN IF NOT EXISTS primary_user_id TEXT
      `);
    }

    // 2. Check missing columns in user_settings
    const columnsToCheck = [
      { name: 'use_market_data_for_snapshots', type: 'BOOLEAN NOT NULL DEFAULT FALSE' },
      { name: 'budget_alert_threshold', type: 'INTEGER NOT NULL DEFAULT 80' },
      { name: 'notify_goal_milestones', type: 'BOOLEAN NOT NULL DEFAULT TRUE' },
      { name: 'notify_net_worth_milestones', type: 'BOOLEAN NOT NULL DEFAULT TRUE' },
      { name: 'net_worth_milestone_interval', type: 'INTEGER NOT NULL DEFAULT 100000' },
      { name: 'notify_ai_proposals', type: 'BOOLEAN NOT NULL DEFAULT TRUE' },
      { name: 'max_notifications_per_period', type: 'INTEGER NOT NULL DEFAULT 5' },
      { name: 'notification_limiter_period_minutes', type: 'INTEGER NOT NULL DEFAULT 60' }
    ];

    for (const col of columnsToCheck) {
      const colCheck = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'user_settings' AND column_name = '${col.name}'
      `);
      if (colCheck.rows.length === 0) {
        console.log(`[migrate] [self-heal] Adding missing ${col.name} column to user_settings...`);
        await client.query(`
          ALTER TABLE user_settings
          ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}
        `);
      }
    }

    // 3. Check if json_mode column exists on ai_providers
    const colCheck3 = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'ai_providers' AND column_name = 'json_mode'
    `);
    if (colCheck3.rows.length === 0) {
      console.log('[migrate] [self-heal] Adding missing json_mode column to ai_providers...');
      await client.query(`
        ALTER TABLE ai_providers
        ADD COLUMN IF NOT EXISTS json_mode BOOLEAN NOT NULL DEFAULT FALSE
      `);
    }

    // 4. Check if account_sharing_invitations table exists
    const tableCheck1 = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_name = 'account_sharing_invitations'
    `);
    if (tableCheck1.rows.length === 0) {
      console.log('[migrate] [self-heal] Creating missing account_sharing_invitations table...');
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

    // 5. Check if account_share_members table exists
    const tableCheck2 = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_name = 'account_share_members'
    `);
    if (tableCheck2.rows.length === 0) {
      console.log('[migrate] [self-heal] Creating missing account_share_members table...');
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

    // 6. Check if push_subscriptions table exists
    const tableCheckPush = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_name = 'push_subscriptions'
    `);
    if (tableCheckPush.rows.length === 0) {
      console.log('[migrate] [self-heal] Creating missing push_subscriptions table...');
      await client.query(`
        CREATE TABLE IF NOT EXISTS push_subscriptions (
          id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id    TEXT NOT NULL,
          endpoint   TEXT NOT NULL,
          keys       JSONB NOT NULL,
          user_agent TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
    }

    // 7. Check if sent_notifications table exists
    const tableCheckSent = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_name = 'sent_notifications'
    `);
    if (tableCheckSent.rows.length === 0) {
      console.log('[migrate] [self-heal] Creating missing sent_notifications table...');
      await client.query(`
        CREATE TABLE IF NOT EXISTS sent_notifications (
          id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id TEXT NOT NULL,
          type    TEXT NOT NULL,
          key     TEXT NOT NULL,
          sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
    }

    // 8. Check if custom_alert_rules table exists
    const tableCheckCustom = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_name = 'custom_alert_rules'
    `);
    if (tableCheckCustom.rows.length === 0) {
      console.log('[migrate] [self-heal] Creating missing custom_alert_rules table...');
      await client.query(`
        CREATE TABLE IF NOT EXISTS custom_alert_rules (
          id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id            TEXT NOT NULL,
          name               TEXT NOT NULL,
          is_enabled         BOOLEAN NOT NULL DEFAULT TRUE,
          trigger_type       TEXT NOT NULL,
          criteria           JSONB NOT NULL,
          condition_operator TEXT DEFAULT 'AND',
          conditions         JSONB,
          created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
    } else {
      // Ensure condition_operator and conditions columns exist (migration 0062)
      const colCheckOperator = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'custom_alert_rules' AND column_name = 'condition_operator'
      `);
      if (colCheckOperator.rows.length === 0) {
        console.log('[migrate] [self-heal] Adding missing condition_operator column to custom_alert_rules...');
        await client.query(`
          ALTER TABLE custom_alert_rules
          ADD COLUMN IF NOT EXISTS condition_operator TEXT DEFAULT 'AND'
        `);
      }

      const colCheckConditions = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'custom_alert_rules' AND column_name = 'conditions'
      `);
      if (colCheckConditions.rows.length === 0) {
        console.log('[migrate] [self-heal] Adding missing conditions column to custom_alert_rules...');
        await client.query(`
          ALTER TABLE custom_alert_rules
          ADD COLUMN IF NOT EXISTS conditions JSONB
        `);
      }
    }
  } catch (err) {
    console.error('[migrate] Self-healing checks failed:', err.message);
    // Don't crash startup on self-healing check failure, but log it
  }
}

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
    await runSelfHealingChecks(client);

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
