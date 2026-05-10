import {
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

// ── Next Auth Tables (existing) ──────────────────────────────────────────────
// These are created by Next Auth's Drizzle adapter automatically.
// We define them here for type completeness.

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: timestamp('email_verified', { withTimezone: true }),
  image: text('image'),
});

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  ipAddr: text('ip_addr'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
});

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  provider: text('provider').notNull(),
  providerAccountId: text('provider_account_id').notNull(),
  refresh_token: text('refresh_token'),
  access_token: text('access_token'),
  expires_at: integer('expires_at'),
  token_type: text('token_type'),
  scope: text('scope'),
  id_token: text('id_token'),
  session_state: text('session_state'),
});

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
});

// ── User Settings ────────────────────────────────────────────────────────────
export const userSettings = pgTable('user_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull().unique(), // Next Auth user ID (text UUID)
  currency: text('currency').notNull().default('USD'),
  locale: text('locale').notNull().default('en-US'),
  timezone: text('timezone').notNull().default('America/New_York'),
  theme: text('theme').notNull().default('dark'), // 'dark' | 'darker'
  accentColor: text('accent_color').notNull().default('indigo'),
  compactMode: boolean('compact_mode').notNull().default(false),
  dateFormat: text('date_format').notNull().default('MM/DD/YYYY'),
  privacyMode: boolean('privacy_mode').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── SimpleFIN Connections ────────────────────────────────────────────────────
export const simplifinConnections = pgTable('simplefin_connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull(),
  accessUrlEncrypted: text('access_url_encrypted').notNull(),
  accessUrlIv: text('access_url_iv').notNull(),
  accessUrlTag: text('access_url_tag').notNull(),
  label: text('label').notNull().default('Primary'),
  lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
  lastSyncStatus: text('last_sync_status').notNull().default('pending'),
  lastSyncError: text('last_sync_error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Accounts ─────────────────────────────────────────────────────────────────
export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull(),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => simplifinConnections.id, { onDelete: 'cascade' }),
    externalId: text('external_id').notNull(),
    name: text('name').notNull(),
    currency: text('currency').notNull().default('USD'),
    balance: numeric('balance', { precision: 20, scale: 4 }).notNull().default('0'),
    balanceDate: timestamp('balance_date', { withTimezone: true }),
    type: text('type').notNull(), // 'checking'|'savings'|'credit'|'investment'|'loan'|'other'
    institution: text('institution'),
    isHidden: boolean('is_hidden').notNull().default(false),
    isExcludedFromNetWorth: boolean('is_excluded_from_net_worth').notNull().default(false),
    displayOrder: integer('display_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.connectionId, t.externalId)]
);

// ── Categories ───────────────────────────────────────────────────────────────
export const categories = pgTable('categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull(),
  parentId: uuid('parent_id'), // FK to categories(id) — added via SQL after table creation
  name: text('name').notNull(),
  color: text('color').notNull().default('#6366f1'),
  icon: text('icon'),
  isIncome: boolean('is_income').notNull().default(false),
  isSystem: boolean('is_system').notNull().default(false),
  excludeFromReports: boolean('exclude_from_reports').notNull().default(false),
  displayOrder: integer('display_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Transactions ─────────────────────────────────────────────────────────────
export const transactions = pgTable(
  'transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    externalId: text('external_id').notNull(),
    date: date('date').notNull(),
    postedDate: date('posted_date'),
    amount: numeric('amount', { precision: 20, scale: 4 }).notNull(),
    description: text('description').notNull(),
    payee: text('payee'),
    memo: text('memo'),
    pending: boolean('pending').notNull().default(false),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
    notes: text('notes'),
    reviewed: boolean('reviewed').notNull().default(false),
    ignored: boolean('ignored').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.accountId, t.externalId)]
);

// ── Sync Logs ────────────────────────────────────────────────────────────────
export const syncLogs = pgTable('sync_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull(),
  connectionId: uuid('connection_id').references(() => simplifinConnections.id),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  status: text('status').notNull(), // 'running'|'success'|'partial'|'error'
  accountsSynced: integer('accounts_synced').notNull().default(0),
  transactionsFetched: integer('transactions_fetched').notNull().default(0),
  transactionsNew: integer('transactions_new').notNull().default(0),
  errorMessage: text('error_message'),
  durationMs: integer('duration_ms'),
});

// ── Category Rules ───────────────────────────────────────────────────────────
export const categoryRules = pgTable('category_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  priority: integer('priority').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  conditionField: text('condition_field').notNull(),
  conditionOperator: text('condition_operator').notNull(),
  conditionValue: text('condition_value').notNull(),
  conditionCaseSensitive: boolean('condition_case_sensitive').notNull().default(false),
  setCategoryId: uuid('set_category_id').references(() => categories.id, { onDelete: 'set null' }),
  setPayee: text('set_payee'),
  setReviewed: boolean('set_reviewed'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Manual Assets ────────────────────────────────────────────────────────────
export const manualAssets = pgTable('manual_assets', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  assetType: text('asset_type').notNull(),
  isLiability: boolean('is_liability').notNull().default(false),
  value: numeric('value', { precision: 20, scale: 4 }).notNull(),
  currency: text('currency').notNull().default('USD'),
  institution: text('institution'),
  notes: text('notes'),
  isExcludedFromNetWorth: boolean('is_excluded_from_net_worth').notNull().default(false),
  displayOrder: integer('display_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const manualAssetValueHistory = pgTable('manual_asset_value_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  assetId: uuid('asset_id')
    .notNull()
    .references(() => manualAssets.id, { onDelete: 'cascade' }),
  value: numeric('value', { precision: 20, scale: 4 }).notNull(),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
  note: text('note'),
});

// ── Net Worth Snapshots ──────────────────────────────────────────────────────
export const netWorthSnapshots = pgTable(
  'net_worth_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull(),
    snapshotDate: date('snapshot_date').notNull(),
    totalAssets: numeric('total_assets', { precision: 20, scale: 4 }).notNull(),
    totalLiabilities: numeric('total_liabilities', { precision: 20, scale: 4 }).notNull(),
    netWorth: numeric('net_worth', { precision: 20, scale: 4 }).notNull(),
    breakdown: jsonb('breakdown').notNull(),
  },
  (t) => [unique().on(t.userId, t.snapshotDate)]
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
    balance: numeric('balance', { precision: 20, scale: 4 }).notNull(),
    isSynthetic: boolean('is_synthetic').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.userId, t.accountId, t.snapshotDate)]
);

// ── Monthly Cash Flow Summary ────────────────────────────────────────────────
// Pre-aggregated monthly income/expense data for dashboard reporting
export const monthlyCashFlow = pgTable(
  'monthly_cash_flow',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull(),
    yearMonth: text('year_month').notNull(), // Format: 'YYYY-MM'
    totalIncome: numeric('total_income', { precision: 20, scale: 4 }).notNull().default('0'),
    totalExpenses: numeric('total_expenses', { precision: 20, scale: 4 }).notNull().default('0'),
    netCashFlow: numeric('net_cash_flow', { precision: 20, scale: 4 }).notNull().default('0'),
    transactionCount: integer('transaction_count').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.userId, t.yearMonth)]
);

// ── Category Spending Summary ────────────────────────────────────────────────
// Monthly spending breakdown by category for reporting and budgeting
export const categorySpendingSummary = pgTable(
  'category_spending_summary',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull(),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
    yearMonth: text('year_month').notNull(), // Format: 'YYYY-MM'
    amount: numeric('amount', { precision: 20, scale: 4 }).notNull(),
    transactionCount: integer('transaction_count').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.userId, t.categoryId, t.yearMonth)]
);

// ── Budgets ──────────────────────────────────────────────────────────────────
// User-defined budgets for categories and time periods
export const budgets = pgTable('budgets', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull(),
  categoryId: uuid('category_id')
    .notNull()
    .references(() => categories.id, { onDelete: 'cascade' }),
  yearMonth: text('year_month'), // Format: 'YYYY-MM', null = recurring monthly
  amount: numeric('amount', { precision: 20, scale: 4 }).notNull(),
  isRecurring: boolean('is_recurring').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Financial Goals ──────────────────────────────────────────────────────────
// Savings goals with target amounts and progress tracking
export const financialGoals = pgTable('financial_goals', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  type: text('type').notNull(), // 'savings'|'payoff'|'investment'|'other'
  targetAmount: numeric('target_amount', { precision: 20, scale: 4 }).notNull(),
  currentAmount: numeric('current_amount', { precision: 20, scale: 4 }).notNull().default('0'),
  targetDate: date('target_date'),
  category: text('category'), // Optional categorization
  priority: integer('priority').notNull().default(0), // 0=low, 1=medium, 2=high
  status: text('status').notNull().default('active'), // 'active'|'completed'|'paused'
  linkedAccountId: uuid('linked_account_id').references(() => accounts.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── FIRE Scenarios ───────────────────────────────────────────────────────────
export const fireScenarios = pgTable('fire_scenarios', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull(),
  name: text('name').notNull().default('Primary Scenario'),
  isDefault: boolean('is_default').notNull().default(false),
  currentAge: integer('current_age'),
  targetAge: integer('target_age'),
  targetAnnualExpenses: numeric('target_annual_expenses', { precision: 20, scale: 4 }),
  currentInvestableAssets: numeric('current_investable_assets', { precision: 20, scale: 4 }),
  annualContributions: numeric('annual_contributions', { precision: 20, scale: 4 }),
  expectedReturnRate: numeric('expected_return_rate', { precision: 6, scale: 4 }).default('0.07'),
  inflationRate: numeric('inflation_rate', { precision: 6, scale: 4 }).default('0.03'),
  safeWithdrawalRate: numeric('safe_withdrawal_rate', { precision: 6, scale: 4 }).default('0.04'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
