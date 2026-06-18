import {
  boolean,
  date,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { simplifinConnections, plaidConnections } from './connections';

// ── Import Log ────────────────────────────────────────────────────────────────
export const importLog = pgTable('import_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull(),
  fileName: text('file_name').notNull(),
  importType: text('import_type').notNull(), // 'transactions' | 'account_snapshots'
  status: text('status').notNull().default('completed'), // 'completed' | 'failed' | 'partial'
  recordsImported: integer('records_imported').notNull().default(0),
  recordsSkipped: integer('records_skipped').notNull().default(0),
  recordsErrored: integer('records_errored').notNull().default(0),
  columnMapping: jsonb('column_mapping'), // { csvColumn: systemField }
  accountMapping: jsonb('account_mapping'), // { csvAccountRef: accountId }
  categoryMapping: jsonb('category_mapping'), // { csvCategoryName: categoryId }
  startDate: date('start_date'),
  endDate: date('end_date'),
  dataStartDate: date('data_start_date'),
  dataEndDate: date('data_end_date'),
  fileContent: text('file_content'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Accounts ─────────────────────────────────────────────────────────────────
export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull(),
    connectionId: uuid('connection_id')
      .references(() => simplifinConnections.id, { onDelete: 'cascade' }),
    plaidConnectionId: uuid('plaid_connection_id')
      .references(() => plaidConnections.id, { onDelete: 'cascade' }),
    externalId: text('external_id').notNull(),
    name: text('name').notNull(),
    currency: text('currency').notNull().default('USD'),
    balance: text('balance').notNull(),
    balanceDate: timestamp('balance_date', { withTimezone: true }),
    type: text('type').notNull(),
    metadata: text('metadata'),
    institution: text('institution'),
    isHidden: boolean('is_hidden').notNull().default(false),
    isExcludedFromNetWorth: boolean('is_excluded_from_net_worth').notNull().default(false),
    displayOrder: integer('display_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique().on(t.connectionId, t.externalId),
    unique().on(t.plaidConnectionId, t.externalId),
  ]
);

// ── Holdings ─────────────────────────────────────────────────────────────────
export const holdings = pgTable(
  'holdings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    securityId: text('security_id').notNull(),
    ticker: text('ticker'),
    name: text('name'),
    quantity: text('quantity').notNull(),
    price: text('price').notNull(),
    costBasis: text('cost_basis'),
    value: text('value').notNull(),
    currency: text('currency').notNull().default('USD'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique().on(t.accountId, t.securityId),
  ]
);

// ── Holding Snapshots ────────────────────────────────────────────────────────
export const holdingSnapshots = pgTable(
  'holding_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    snapshotDate: date('snapshot_date').notNull(),
    securityId: text('security_id').notNull(),
    ticker: text('ticker'),
    name: text('name'),
    quantity: text('quantity').notNull(),
    price: text('price').notNull(),
    value: text('value').notNull(),
    costBasis: text('cost_basis'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique().on(t.userId, t.accountId, t.securityId, t.snapshotDate),
  ]
);

// ── Account Snapshots ────────────────────────────────────────────────────────
// Track individual account balances over time for historical analysis and reporting
export const accountSnapshots = pgTable(
  'account_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    snapshotDate: date('snapshot_date').notNull(),
    balance: text('balance').notNull(),
    isSynthetic: boolean('is_synthetic').notNull().default(false),
    isImported: boolean('is_imported').notNull().default(false),
    importId: uuid('import_id').references(() => importLog.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.userId, t.accountId, t.snapshotDate)]
);
