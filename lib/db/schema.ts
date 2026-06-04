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

// ── Users (credential store) ─────────────────────────────────────────────────
export const users = pgTable('users', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  email: text('email'),
});

// ── User Encryption Keys ──────────────────────────────────────────────────────
export const userEncryptionKeys = pgTable('user_encryption_keys', {
  userId: text('user_id').primaryKey(),
  wrappedDek: text('wrapped_dek').notNull(),
  wrappingIv: text('wrapping_iv').notNull(),
  wrappingTag: text('wrapping_tag').notNull(),
  serverWrappedDek: text('server_wrapped_dek'),
  serverWrappingIv: text('server_wrapping_iv'),
  serverWrappingTag: text('server_wrapping_tag'),
  salt: text('salt').notNull(),
  // When set, this user is a share member whose DEK wraps the primary user's raw key.
  primaryUserId: text('primary_user_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Account Sharing Invitations ───────────────────────────────────────────────
export const accountSharingInvitations = pgTable('account_sharing_invitations', {
  id: uuid('id').primaryKey().defaultRandom(),
  inviterUserId: text('inviter_user_id').notNull(),
  inviteeEmail: text('invitee_email').notNull(),
  pinHash: text('pin_hash').notNull(),
  pin: text('pin'),
  status: text('status').notNull().default('pending'), // 'pending' | 'accepted' | 'revoked'
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Account Share Members ─────────────────────────────────────────────────────
export const accountShareMembers = pgTable(
  'account_share_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    primaryUserId: text('primary_user_id').notNull(),
    memberUserId: text('member_user_id').notNull(),
    invitationId: uuid('invitation_id').references(() => accountSharingInvitations.id, { onDelete: 'set null' }),
    status: text('status').notNull().default('active'), // 'active' | 'removed'
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
    removedAt: timestamp('removed_at', { withTimezone: true }),
    removedBy: text('removed_by'),
  },
  (t) => [unique().on(t.primaryUserId, t.memberUserId)]
);

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
  userId: text('user_id').notNull().unique(),
  currency: text('currency').notNull().default('USD'),
  locale: text('locale').notNull().default('en-US'),
  timezone: text('timezone').notNull().default('America/New_York'),
  theme: text('theme').notNull().default('moonlight'),
  accentColor: text('accent_color').notNull().default('violet'),
  compactMode: boolean('compact_mode').notNull().default(false),
  dateFormat: text('date_format').notNull().default('MM/DD/YYYY'),
  privacyMode: boolean('privacy_mode').notNull().default(false),
  chartVisibility: jsonb('chart_visibility').default({}),
  chartColorScheme: text('chart_color_scheme').notNull().default('fauntleroy'),
  forecastMode: text('forecast_mode').notNull().default('hybrid'),
  forecastLookbackMonths: integer('forecast_lookback_months').notNull().default(3),

  hiddenPages: jsonb('hidden_pages').default({}),
  cardStyle: text('card_style').notNull().default('default'),
  showSyntheticData: jsonb('show_synthetic_data').default({ global: true, netWorth: true, realEstate: true, cashFlowProjections: true }),
  showImportedData: jsonb('show_imported_data').default({ global: true, netWorth: true, realEstate: true, cashFlowProjections: true }),
  defaultChartTimeRange: text('default_chart_time_range').notNull().default('1y'),
  defaultChartType: text('default_chart_type').notNull().default('line'),
  reduceTransparency: boolean('reduce_transparency').notNull().default(false),
  hideAccountSubheadings: boolean('hide_account_subheadings').notNull().default(false),
  hideAccountsSidebarByDefault: boolean('hide_accounts_sidebar_by_default').notNull().default(true),
  chartSelections: jsonb('chart_selections').default({}),
  cardCollapsedStates: jsonb('card_collapsed_states').default({}),
  showMathEnabled: boolean('show_math_enabled').notNull().default(false),
  paystubEnabled: boolean('paystub_enabled').notNull().default(false),
  aiSystemPrompt: text('ai_system_prompt'),
  aiAutoAnalyze: boolean('ai_auto_analyze').notNull().default(false),
  aiAutoApprove: boolean('ai_auto_approve').notNull().default(false),
  aiAutoApproveThreshold: integer('ai_auto_approve_threshold').notNull().default(95),
  aiBatchSize: integer('ai_batch_size').notNull().default(25),
  aiAnalysisTimeoutSeconds: integer('ai_analysis_timeout_seconds').notNull().default(3600),
  aiActiveProviderId: uuid('ai_active_provider_id'),
  apiKeys: text('api_keys'),
  accountTagVisibility: jsonb('account_tag_visibility').default({
    sidebar: true,
    transactions: true,
    legend: true,
    budgets: true,
    forecast: true,
    suggestions: true,
  }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── AI Proposals ─────────────────────────────────────────────────────────────
export const aiProposals = pgTable('ai_proposals', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull(),
  type: text('type').notNull(), // 'categorize' | 'create_category' | 'create_rule'
  status: text('status').notNull().default('pending'), // 'pending' | 'approved' | 'rejected'
  confidence: text('confidence'),
  payload: jsonb('payload').notNull().$type<AiProposalPayload>(),
  explanation: text('explanation'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type AiProposalPayload =
  | { type: 'categorize'; transactionId: string; transactionDescription: string; proposedCategoryId: string | null; proposedCategoryName: string; newCategoryProposalIndex?: number }
  | { type: 'create_category'; name: string; parentName: string | null; parentId: string | null; color: string; isIncome: boolean }
  | { type: 'create_rule'; ruleName: string; conditionField: string; conditionOperator: string; conditionValue: string; conditionCaseSensitive: boolean; setCategoryId: string | null; setCategoryName: string | null };

// ── AI Providers ────────────────────────────────────────────────────────────
export const aiProviders = pgTable('ai_providers', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  endpoint: text('endpoint').notNull(),
  model: text('model').notNull(),
  apiKeyEncrypted: text('api_key_encrypted'),
  isActive: boolean('is_active').notNull().default(false),
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
  syncFrequency: text('sync_frequency').notNull().default('manual'),
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
      .references(() => simplifinConnections.id, { onDelete: 'cascade' }),
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
  categoryType: text('category_type').notNull().default('standard'),
  expenseParentId: uuid('expense_parent_id'),
  isSystem: boolean('is_system').notNull().default(false),
  excludeFromReports: boolean('exclude_from_reports').notNull().default(false),
  displayOrder: integer('display_order').notNull().default(0),
  createdByAi: boolean('created_by_ai').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

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
    amount: text('amount').notNull(),
    description: text('description').notNull(),
    payee: text('payee'),
    memo: text('memo'),
    pending: boolean('pending').notNull().default(false),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
    notes: text('notes'),
    reviewed: boolean('reviewed').notNull().default(false),
    categorizedByAi: boolean('categorized_by_ai').notNull().default(false),
    ignored: boolean('ignored').notNull().default(false),
    deleted: boolean('deleted').notNull().default(false),
    isImported: boolean('is_imported').notNull().default(false),
    importId: uuid('import_id').references(() => importLog.id, { onDelete: 'set null' }),
    source: text('source').notNull().default('bank'), // 'bank' | 'manual' | 'import' | 'paystub'
    paystubId: uuid('paystub_id'),
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
  status: text('status').notNull(),
  accountsSynced: text('accounts_synced').notNull(),
  transactionsFetched: text('transactions_fetched').notNull(),
  transactionsNew: text('transactions_new').notNull(),
  errorMessage: text('error_message'),
  durationMs: text('duration_ms'),
  details: text('details'),
});

// ── Tags ─────────────────────────────────────────────────────────────────────
export const tags = pgTable('tags', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  color: text('color').notNull().default('#6366f1'),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Tag Join Tables ───────────────────────────────────────────────────────────
export const transactionTags = pgTable(
  'transaction_tags',
  {
    transactionId: uuid('transaction_id').notNull().references(() => transactions.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => [unique().on(t.transactionId, t.tagId)]
);

export const accountTags = pgTable(
  'account_tags',
  {
    accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => [unique().on(t.accountId, t.tagId)]
);

export const budgetTags = pgTable(
  'budget_tags',
  {
    budgetId: uuid('budget_id').notNull().references(() => budgets.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => [unique().on(t.budgetId, t.tagId)]
);

export const goalTags = pgTable(
  'goal_tags',
  {
    goalId: uuid('goal_id').notNull().references(() => financialGoals.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => [unique().on(t.goalId, t.tagId)]
);

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
  conditions: jsonb('conditions'), // Array of conditions for multi-condition rules
  setCategoryId: uuid('set_category_id').references(() => categories.id, { onDelete: 'set null' }),
  setTagId: uuid('set_tag_id').references(() => tags.id, { onDelete: 'set null' }),
  setPayee: text('set_payee'),
  setReviewed: boolean('set_reviewed'),
  isSystem: boolean('is_system').notNull().default(false),
  createdByAi: boolean('created_by_ai').notNull().default(false),
  overrideExisting: boolean('override_existing').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Net Worth Snapshots ──────────────────────────────────────────────────────
export const netWorthSnapshots = pgTable(
  'net_worth_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull(),
    snapshotDate: date('snapshot_date').notNull(),
    totalAssets: text('total_assets').notNull(),
    totalLiabilities: text('total_liabilities').notNull(),
    netWorth: text('net_worth').notNull(),
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
    balance: text('balance').notNull(),
    isSynthetic: boolean('is_synthetic').notNull().default(false),
    isImported: boolean('is_imported').notNull().default(false),
    importId: uuid('import_id').references(() => importLog.id, { onDelete: 'set null' }),
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
    yearMonth: text('year_month').notNull(),
    totalIncome: text('total_income').notNull(),
    totalExpenses: text('total_expenses').notNull(),
    netCashFlow: text('net_cash_flow').notNull(),
    transactionCount: text('transaction_count').notNull(),
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
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    yearMonth: text('year_month').notNull(),
    amount: text('amount').notNull(),
    transactionCount: text('transaction_count').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.userId, t.categoryId, t.accountId, t.yearMonth)]
);

// ── Category Income Summary ──────────────────────────────────────────────────
// Monthly income breakdown by category for reporting and budgeting
export const categoryIncomeSummary = pgTable(
  'category_income_summary',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull(),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    yearMonth: text('year_month').notNull(),
    amount: text('amount').notNull(),
    transactionCount: text('transaction_count').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.userId, t.categoryId, t.accountId, t.yearMonth)]
);

// ── Budgets ──────────────────────────────────────────────────────────────────
// User-defined budgets for categories and time periods
export const budgets = pgTable('budgets', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull(),
  categoryId: uuid('category_id')
    .notNull()
    .references(() => categories.id, { onDelete: 'cascade' }),
  yearMonth: text('year_month'),
  periodType: text('period_type').notNull().default('monthly'),
  periodKey: text('period_key'),
  amount: text('amount').notNull(),
  isRecurring: boolean('is_recurring').notNull().default(true),
  fundingAccountId: uuid('funding_account_id').references(() => accounts.id, { onDelete: 'set null' }),
  rollover: boolean('rollover').notNull().default(false),
  notes: text('notes'),
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
  type: text('type').notNull(),
  targetAmount: text('target_amount').notNull(),
  currentAmount: text('current_amount').notNull(),
  targetDate: date('target_date'),
  category: text('category'),
  priority: integer('priority').notNull().default(0),
  status: text('status').notNull().default('active'),
  linkedAccountId: uuid('linked_account_id').references(() => accounts.id, { onDelete: 'set null' }),
  percentage: text('percentage').notNull(),
  reserve: text('reserve').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Paystubs ─────────────────────────────────────────────────────────────────
export const paystubs = pgTable('paystubs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull(),
  employerName: text('employer_name').notNull().default(''),
  employeeName: text('employee_name'),
  payPeriodStart: date('pay_period_start').notNull(),
  payPeriodEnd: date('pay_period_end').notNull(),
  checkDate: date('check_date').notNull(),
  adviceNumber: text('advice_number'),
  grossCurrent: text('gross_current').notNull().default('0'),
  taxesCurrent: text('taxes_current').notNull().default('0'),
  deductionsCurrent: text('deductions_current').notNull().default('0'),
  netCurrent: text('net_current').notNull().default('0'),
  grossYtd: text('gross_ytd'),
  taxesYtd: text('taxes_ytd'),
  deductionsYtd: text('deductions_ytd'),
  source: text('source').notNull().default('manual'), // 'json' | 'manual' | 'auto_generated'
  isAutoGenerated: boolean('is_auto_generated').notNull().default(false),
  mappingId: uuid('mapping_id'),
  sourceJson: text('source_json'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Paystub Line Items ───────────────────────────────────────────────────────
export const paystubLineItems = pgTable('paystub_line_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  paystubId: uuid('paystub_id').notNull().references(() => paystubs.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull(),
  section: text('section').notNull(), // 'earnings' | 'taxes' | 'before_tax_deductions' | 'after_tax_deductions'
  description: text('description').notNull(),
  amount: text('amount').notNull().default('0'),
  ytdAmount: text('ytd_amount'),
  hours: text('hours'),
  rate: text('rate'),
  ytdHours: text('ytd_hours'),
  mappingAction: text('mapping_action').notNull().default('import'), // 'import' | 'ignore'
  categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
  transactionId: uuid('transaction_id').references(() => transactions.id, { onDelete: 'set null' }),
});

// ── Paystub Field Mappings ───────────────────────────────────────────────────
// Reusable templates that define how paystub line items map to categories
export const paystubFieldMappings = pgTable('paystub_field_mappings', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  employerName: text('employer_name').notNull().default(''),
  isDefault: boolean('is_default').notNull().default(false),
  mappings: jsonb('mappings').notNull().default({}),
  accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'set null' }),
  tagId: uuid('tag_id').references(() => tags.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Paystub Auto-Generate Settings ───────────────────────────────────────────
// Controls automatic creation of paystubs at the user-defined pay frequency
export const paystubAutoGenerateSettings = pgTable(
  'paystub_auto_generate_settings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull(),
    mappingId: uuid('mapping_id').notNull().references(() => paystubFieldMappings.id, { onDelete: 'cascade' }),
    isEnabled: boolean('is_enabled').notNull().default(false),
    frequency: text('frequency').notNull().default('weekly'), // 'weekly' | 'biweekly' | 'semimonthly' | 'monthly'
    basePaystubId: uuid('base_paystub_id').references(() => paystubs.id, { onDelete: 'set null' }),
    lastGeneratedDate: date('last_generated_date'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.userId, t.mappingId)]
);
