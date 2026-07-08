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

    // 2. Check missing columns in user_settings
    const columnsToCheck = [
      { name: 'use_market_data_for_snapshots', type: 'BOOLEAN NOT NULL DEFAULT FALSE' },
      { name: 'budget_alert_threshold', type: 'INTEGER NOT NULL DEFAULT 80' },
      { name: 'notify_goal_milestones', type: 'BOOLEAN NOT NULL DEFAULT TRUE' },
      { name: 'notify_net_worth_milestones', type: 'BOOLEAN NOT NULL DEFAULT TRUE' },
      { name: 'net_worth_milestone_interval', type: 'INTEGER NOT NULL DEFAULT 100000' },
      { name: 'notify_ai_proposals', type: 'BOOLEAN NOT NULL DEFAULT TRUE' },
      { name: 'max_notifications_per_period', type: 'INTEGER NOT NULL DEFAULT 5' },
      { name: 'notification_limiter_period_minutes', type: 'INTEGER NOT NULL DEFAULT 60' },
      // Columns from migration 0059_add_push_notifications_infrastructure
      { name: 'notify_sync_errors', type: 'BOOLEAN NOT NULL DEFAULT TRUE' },
      { name: 'notify_budget_alerts', type: 'BOOLEAN NOT NULL DEFAULT TRUE' },
      { name: 'notify_large_transactions', type: 'BOOLEAN NOT NULL DEFAULT TRUE' },
      { name: 'large_transaction_threshold', type: 'INTEGER NOT NULL DEFAULT 500' },
      { name: 'notify_monthly_summary', type: 'BOOLEAN NOT NULL DEFAULT TRUE' },
      { name: 'notify_daily_net_worth_change', type: 'BOOLEAN NOT NULL DEFAULT TRUE' },
      { name: 'daily_net_worth_alert_time', type: "TEXT NOT NULL DEFAULT '18:00'" },
      { name: 'delete_pending_days', type: 'INTEGER NOT NULL DEFAULT 10' }
    ];

    for (const col of columnsToCheck) {
      const colCheck = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'user_settings' AND column_name = '${col.name}'
      `);
      if (colCheck.rows.length === 0) {
        logger.info(`[migrate] [self-heal] Adding missing ${col.name} column to user_settings...`);
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
      logger.info('[migrate] [self-heal] Adding missing json_mode column to ai_providers...');
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

    // 5. Check if account_share_members table exists
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

    // 6. Check if push_subscriptions table exists
    const tableCheckPush = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_name = 'push_subscriptions'
    `);
    if (tableCheckPush.rows.length === 0) {
      logger.info('[migrate] [self-heal] Creating missing push_subscriptions table...');
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
      logger.info('[migrate] [self-heal] Creating missing sent_notifications table...');
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
      logger.info('[migrate] [self-heal] Creating missing custom_alert_rules table...');
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
        logger.info('[migrate] [self-heal] Adding missing condition_operator column to custom_alert_rules...');
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
        logger.info('[migrate] [self-heal] Adding missing conditions column to custom_alert_rules...');
        await client.query(`
          ALTER TABLE custom_alert_rules
          ADD COLUMN IF NOT EXISTS conditions JSONB
        `);
      }

      const colCheckTree = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'custom_alert_rules' AND column_name = 'condition_tree'
      `);
      if (colCheckTree.rows.length === 0) {
        logger.info('[migrate] [self-heal] Adding missing condition_tree column to custom_alert_rules...');
        await client.query(`
          ALTER TABLE custom_alert_rules
          ADD COLUMN IF NOT EXISTS condition_tree JSONB
        `);
      }
    }

    // Mark unapplied migrations as applied if their artifacts already exist.
    // The self-heal above may create tables/columns that later migrations expect
    // to create, causing "already exists" failures that block subsequent migrations.
    const drizzleDir = path.join(process.cwd(), 'drizzle');
    const markerJournalPath = path.join(drizzleDir, 'meta', '_journal.json');
    const pendingTags = await client.query(`SELECT tag FROM drizzle.__drizzle_migrations`);
    const appliedTagsMap = new Set(pendingTags.rows.map(r => r.tag));
    if (fs.existsSync(markerJournalPath)) {
      const markerJournal = JSON.parse(fs.readFileSync(markerJournalPath, 'utf-8'));
      const migrationArtifacts = [
        { tag: '0059_add_push_notifications_infrastructure', check: `SELECT table_name FROM information_schema.tables WHERE table_name = 'push_subscriptions'` },
        { tag: '0060_add_notifications_limiter_and_milestones', check: `SELECT column_name FROM information_schema.columns WHERE table_name = 'user_settings' AND column_name = 'budget_alert_threshold'` },
        { tag: '0061_add_custom_alert_rules', check: `SELECT table_name FROM information_schema.tables WHERE table_name = 'custom_alert_rules'` },
        { tag: '0062_lame_starjammers', check: `SELECT column_name FROM information_schema.columns WHERE table_name = 'custom_alert_rules' AND column_name = 'condition_operator'` },
      ];
      for (const { tag, check } of migrationArtifacts) {
        if (appliedTagsMap.has(tag)) continue;
        const result = await client.query(check);
        if (result.rows.length > 0) {
          const entry = markerJournal.entries.find(e => e.tag === tag);
          if (!entry) continue;
          const sqlPath = path.join(drizzleDir, entry.tag + '.sql');
          if (!fs.existsSync(sqlPath)) continue;
          const sql = fs.readFileSync(sqlPath, 'utf-8');
          const hash = crypto.createHash('sha256').update(sql).digest('hex');
          await client.query(
            'INSERT INTO drizzle.__drizzle_migrations (tag, hash, created_at) VALUES ($1, $2, $3)',
            [tag, hash, entry.when || Date.now()]
          );
          logger.info(`[migrate] [self-heal] Marked migration ${tag} as applied (artifacts already exist)`);
        }
      }
    }

    // 9a. Add unique constraint on sent_notifications(user_id, key) for dedup safety
    const uniqueKeyCheck = await client.query(`
      SELECT constraint_name FROM information_schema.table_constraints
      WHERE table_name = 'sent_notifications' AND constraint_type = 'UNIQUE'
        AND constraint_name = 'sent_notifications_user_id_key_unique'
    `);
    if (uniqueKeyCheck.rows.length === 0) {
      // Delete any existing duplicates before adding the constraint
      await client.query(`
        DELETE FROM sent_notifications
        WHERE id IN (
          SELECT id FROM (
            SELECT id, row_number() OVER (PARTITION BY user_id, key ORDER BY sent_at DESC) AS rn
            FROM sent_notifications
          ) dup
          WHERE dup.rn > 1
        )
      `);
      await client.query(`
        ALTER TABLE sent_notifications
        ADD CONSTRAINT sent_notifications_user_id_key_unique UNIQUE (user_id, key)
      `);
      logger.info('[migrate] [self-heal] Added unique constraint on sent_notifications(user_id, key)');
    }

    // 9b. Add index on sent_notifications(user_id, sent_at) for rate limiter
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sent_notifications_user_sent_at
      ON sent_notifications (user_id, sent_at)
    `);

    // 9c. Add index on push_subscriptions(user_id) for subscription lookups
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id
      ON push_subscriptions (user_id)
    `);

    // 9d. Add index on custom_alert_rules(user_id) to prevent full-table scans during sync
    await client.query(`
      CREATE INDEX IF NOT EXISTS custom_alert_rules_user_id_idx
      ON custom_alert_rules (user_id)
    `);

    // 10. Drop FK constraints that reference the "user" table — the app uses
    //    the "users" (plural) table with usernames and never populates "user".
    //    These FKs were removed in migration 0063; self-heal as a safety net.
    await client.query(`ALTER TABLE push_subscriptions DROP CONSTRAINT IF EXISTS push_subscriptions_user_id_user_id_fk`);
    await client.query(`ALTER TABLE push_subscriptions DROP CONSTRAINT IF EXISTS push_subscriptions_user_id_fkey`);
    await client.query(`ALTER TABLE sent_notifications DROP CONSTRAINT IF EXISTS sent_notifications_user_id_user_id_fk`);
    await client.query(`ALTER TABLE sent_notifications DROP CONSTRAINT IF EXISTS sent_notifications_user_id_fkey`);
    await client.query(`ALTER TABLE custom_alert_rules DROP CONSTRAINT IF EXISTS custom_alert_rules_user_id_user_id_fk`);
    await client.query(`ALTER TABLE custom_alert_rules DROP CONSTRAINT IF EXISTS custom_alert_rules_user_id_fkey`);
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
