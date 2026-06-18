import {
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

// ── SimpleFIN Connections ────────────────────────────────────────────────────
export const simplifinConnections = pgTable('simplefin_connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull(),
  accessUrlEncrypted: text('access_url_encrypted').notNull(),
  accessUrlIv: text('access_url_iv').notNull(),
  accessUrlTag: text('access_url_tag').notNull(),
  label: text('label').notNull().default('Primary'),
  syncFrequency: text('sync_frequency').notNull().default('manual'),
  lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
  lastSyncStatus: text('last_sync_status').notNull().default('pending'),
  lastSyncError: text('last_sync_error'),
  disabledAccounts: jsonb('disabled_accounts').default([]).$type<string[]>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Plaid Connections ────────────────────────────────────────────────────────
export const plaidConnections = pgTable('plaid_connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull(),
  accessTokenEncrypted: text('access_token_encrypted').notNull(),
  accessTokenIv: text('access_token_iv').notNull().default(''),
  accessTokenTag: text('access_token_tag').notNull().default(''),
  itemId: text('item_id').notNull(),
  institutionId: text('institution_id'),
  institutionName: text('institution_name'),
  cursor: text('cursor'),
  label: text('label').notNull().default('Plaid Connection'),
  syncFrequency: text('sync_frequency').notNull().default('manual'),
  lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
  lastSyncStatus: text('last_sync_status').notNull().default('pending'),
  lastSyncError: text('last_sync_error'),
  disabledAccounts: jsonb('disabled_accounts').default([]).$type<string[]>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Sync Logs ────────────────────────────────────────────────────────────────
export const syncLogs = pgTable('sync_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull(),
  connectionId: uuid('connection_id').references(() => simplifinConnections.id),
  plaidConnectionId: uuid('plaid_connection_id').references(() => plaidConnections.id),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  status: text('status').notNull(),
  accountsSynced: text('accounts_synced').notNull(),
  transactionsFetched: text('transactions_fetched').notNull(),
  transactionsNew: text('transactions_new').notNull(),
  errorMessage: text('error_message'),
  durationMs: text('duration_ms'),
  details: text('details'),
});
