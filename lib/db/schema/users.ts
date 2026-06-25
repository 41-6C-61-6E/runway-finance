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
  showSyntheticData: jsonb('show_synthetic_data').default({ global: true, netWorth: true, investments: true, realEstate: true, cashFlowProjections: true }),
  showImportedData: jsonb('show_imported_data').default({ global: true, netWorth: true, investments: true, realEstate: true, cashFlowProjections: true }),
  useMarketDataForSnapshots: boolean('use_market_data_for_snapshots').notNull().default(false),
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
  notifySyncErrors: boolean('notify_sync_errors').notNull().default(true),
  notifyBudgetAlerts: boolean('notify_budget_alerts').notNull().default(true),
  notifyLargeTransactions: boolean('notify_large_transactions').notNull().default(true),
  largeTransactionThreshold: integer('large_transaction_threshold').notNull().default(500),
  notifyMonthlySummary: boolean('notify_monthly_summary').notNull().default(true),
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
  jsonMode: boolean('json_mode').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
