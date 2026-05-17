import { pgTable, uuid, text, boolean, timestamp, integer, foreignKey, unique, date, index, jsonb, serial } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const aiProviders = pgTable("ai_providers", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	name: text().notNull(),
	endpoint: text().notNull(),
	model: text().notNull(),
	apiKeyEncrypted: text("api_key_encrypted"),
	isActive: boolean("is_active").default(false).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const fireScenarios = pgTable("fire_scenarios", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	name: text().default('Primary Scenario').notNull(),
	isDefault: boolean("is_default").default(false).notNull(),
	currentAge: integer("current_age"),
	targetAge: integer("target_age"),
	targetAnnualExpenses: text("target_annual_expenses"),
	currentInvestableAssets: text("current_investable_assets"),
	annualContributions: text("annual_contributions"),
	expectedReturnRate: text("expected_return_rate"),
	inflationRate: text("inflation_rate"),
	safeWithdrawalRate: text("safe_withdrawal_rate"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const transactions = pgTable("transactions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	accountId: uuid("account_id").notNull(),
	externalId: text("external_id").notNull(),
	date: date().notNull(),
	postedDate: date("posted_date"),
	amount: text().notNull(),
	description: text().notNull(),
	payee: text(),
	memo: text(),
	pending: boolean().default(false).notNull(),
	categoryId: uuid("category_id"),
	notes: text(),
	reviewed: boolean().default(false).notNull(),
	ignored: boolean().default(false).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	categorizedByAi: boolean("categorized_by_ai").default(false).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [accounts.id],
			name: "transactions_account_id_accounts_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.categoryId],
			foreignColumns: [categories.id],
			name: "transactions_category_id_categories_id_fk"
		}).onDelete("set null"),
	unique("transactions_account_id_external_id_unique").on(table.accountId, table.externalId),
]);

export const categoryRules = pgTable("category_rules", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	name: text().notNull(),
	priority: integer().default(0).notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	conditionField: text("condition_field").notNull(),
	conditionOperator: text("condition_operator").notNull(),
	conditionValue: text("condition_value").notNull(),
	conditionCaseSensitive: boolean("condition_case_sensitive").default(false).notNull(),
	setCategoryId: uuid("set_category_id"),
	setPayee: text("set_payee"),
	setReviewed: boolean("set_reviewed"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	isSystem: boolean("is_system").default(false).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.setCategoryId],
			foreignColumns: [categories.id],
			name: "category_rules_set_category_id_categories_id_fk"
		}).onDelete("set null"),
]);

export const verification = pgTable("verification", {
	id: text().primaryKey().notNull(),
	identifier: text().notNull(),
	value: text().notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
});

export const user = pgTable("user", {
	id: text().primaryKey().notNull(),
	name: text().notNull(),
	email: text().notNull(),
	emailVerified: timestamp("email_verified", { withTimezone: true, mode: 'string' }),
	image: text(),
}, (table) => [
	unique("user_email_unique").on(table.email),
]);

export const account = pgTable("account", {
	id: text().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	type: text().notNull(),
	provider: text().notNull(),
	providerAccountId: text("provider_account_id").notNull(),
	refreshToken: text("refresh_token"),
	accessToken: text("access_token"),
	expiresAt: integer("expires_at"),
	tokenType: text("token_type"),
	scope: text(),
	idToken: text("id_token"),
	sessionState: text("session_state"),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "account_user_id_user_id_fk"
		}).onDelete("cascade"),
]);

export const simplefinConnections = pgTable("simplefin_connections", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	accessUrlEncrypted: text("access_url_encrypted").notNull(),
	accessUrlIv: text("access_url_iv").notNull(),
	accessUrlTag: text("access_url_tag").notNull(),
	label: text().default('Primary').notNull(),
	lastSyncAt: timestamp("last_sync_at", { withTimezone: true, mode: 'string' }),
	lastSyncStatus: text("last_sync_status").default('pending').notNull(),
	lastSyncError: text("last_sync_error"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const categories = pgTable("categories", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	parentId: uuid("parent_id"),
	name: text().notNull(),
	color: text().default('#6366f1').notNull(),
	icon: text(),
	isIncome: boolean("is_income").default(false).notNull(),
	isSystem: boolean("is_system").default(false).notNull(),
	excludeFromReports: boolean("exclude_from_reports").default(false).notNull(),
	displayOrder: integer("display_order").default(0).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const session = pgTable("session", {
	id: text().primaryKey().notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }).notNull(),
	token: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).notNull(),
	ipAddr: text("ip_addr"),
	userAgent: text("user_agent"),
	userId: text("user_id").notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "session_user_id_user_id_fk"
		}).onDelete("cascade"),
	unique("session_token_unique").on(table.token),
]);

export const accounts = pgTable("accounts", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	connectionId: uuid("connection_id"),
	externalId: text("external_id").notNull(),
	name: text().notNull(),
	currency: text().default('USD').notNull(),
	balance: text().notNull(),
	balanceDate: timestamp("balance_date", { withTimezone: true, mode: 'string' }),
	type: text().notNull(),
	institution: text(),
	isHidden: boolean("is_hidden").default(false).notNull(),
	isExcludedFromNetWorth: boolean("is_excluded_from_net_worth").default(false).notNull(),
	displayOrder: integer("display_order").default(0).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	metadata: text(),
}, (table) => [
	foreignKey({
			columns: [table.connectionId],
			foreignColumns: [simplefinConnections.id],
			name: "accounts_connection_id_simplefin_connections_id_fk"
		}).onDelete("cascade"),
	unique("accounts_connection_id_external_id_unique").on(table.connectionId, table.externalId),
]);

export const accountSnapshots = pgTable("account_snapshots", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	accountId: uuid("account_id").notNull(),
	snapshotDate: date("snapshot_date").notNull(),
	balance: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	isSynthetic: boolean("is_synthetic").default(false).notNull(),
}, (table) => [
	index("account_snapshots_user_id_snapshot_date_idx").using("btree", table.userId.asc().nullsLast().op("date_ops"), table.snapshotDate.asc().nullsLast().op("date_ops")),
	foreignKey({
			columns: [table.accountId],
			foreignColumns: [accounts.id],
			name: "account_snapshots_account_id_accounts_id_fk"
		}).onDelete("cascade"),
	unique("account_snapshots_user_id_account_id_snapshot_date_unique").on(table.userId, table.accountId, table.snapshotDate),
]);

export const userEncryptionKeys = pgTable("user_encryption_keys", {
	userId: text("user_id").primaryKey().notNull(),
	wrappedDek: text("wrapped_dek").notNull(),
	wrappingIv: text("wrapping_iv").notNull(),
	wrappingTag: text("wrapping_tag").notNull(),
	serverWrappedDek: text("server_wrapped_dek"),
	serverWrappingIv: text("server_wrapping_iv"),
	serverWrappingTag: text("server_wrapping_tag"),
	salt: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const netWorthSnapshots = pgTable("net_worth_snapshots", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	snapshotDate: date("snapshot_date").notNull(),
	totalAssets: text("total_assets").notNull(),
	totalLiabilities: text("total_liabilities").notNull(),
	netWorth: text("net_worth").notNull(),
	breakdown: jsonb().notNull(),
}, (table) => [
	unique("net_worth_snapshots_user_id_snapshot_date_unique").on(table.userId, table.snapshotDate),
]);

export const monthlyCashFlow = pgTable("monthly_cash_flow", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	yearMonth: text("year_month").notNull(),
	totalIncome: text("total_income").notNull(),
	totalExpenses: text("total_expenses").notNull(),
	netCashFlow: text("net_cash_flow").notNull(),
	transactionCount: text("transaction_count").notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("monthly_cash_flow_user_id_year_month_idx").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.yearMonth.asc().nullsLast().op("text_ops")),
	unique("monthly_cash_flow_user_id_year_month_unique").on(table.userId, table.yearMonth),
]);

export const categorySpendingSummary = pgTable("category_spending_summary", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	categoryId: uuid("category_id").notNull(),
	yearMonth: text("year_month").notNull(),
	amount: text().notNull(),
	transactionCount: text("transaction_count").notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("category_spending_summary_user_id_year_month_idx").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.yearMonth.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.categoryId],
			foreignColumns: [categories.id],
			name: "category_spending_summary_category_id_categories_id_fk"
		}).onDelete("cascade"),
	unique("category_spending_summary_user_id_category_id_year_month_unique").on(table.userId, table.categoryId, table.yearMonth),
]);

export const categoryIncomeSummary = pgTable("category_income_summary", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	categoryId: uuid("category_id").notNull(),
	yearMonth: text("year_month").notNull(),
	amount: text().notNull(),
	transactionCount: text("transaction_count").notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.categoryId],
			foreignColumns: [categories.id],
			name: "category_income_summary_category_id_fkey"
		}).onDelete("cascade"),
	unique("unique_user_category_month_income").on(table.userId, table.categoryId, table.yearMonth),
]);

export const budgets = pgTable("budgets", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	categoryId: uuid("category_id").notNull(),
	yearMonth: text("year_month"),
	amount: text().notNull(),
	isRecurring: boolean("is_recurring").default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	periodType: text("period_type").default('monthly').notNull(),
	periodKey: text("period_key"),
	fundingAccountId: uuid("funding_account_id"),
	rollover: boolean().default(false).notNull(),
	notes: text(),
}, (table) => [
	index("budgets_user_id_year_month_idx").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.yearMonth.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.categoryId],
			foreignColumns: [categories.id],
			name: "budgets_category_id_categories_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.fundingAccountId],
			foreignColumns: [accounts.id],
			name: "budgets_funding_account_id_fkey"
		}).onDelete("set null"),
]);

export const financialGoals = pgTable("financial_goals", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	name: text().notNull(),
	description: text(),
	type: text().notNull(),
	targetAmount: text("target_amount").notNull(),
	currentAmount: text("current_amount").notNull(),
	targetDate: date("target_date"),
	category: text(),
	priority: integer().default(0).notNull(),
	status: text().default('active').notNull(),
	linkedAccountId: uuid("linked_account_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	percentage: text(),
	reserve: text(),
}, (table) => [
	index("financial_goals_user_id_status_idx").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.status.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.linkedAccountId],
			foreignColumns: [accounts.id],
			name: "financial_goals_linked_account_id_accounts_id_fk"
		}).onDelete("set null"),
]);

export const retirementProjections = pgTable("retirement_projections", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	name: text().default('Primary Plan').notNull(),
	fireScenarioId: uuid("fire_scenario_id"),
	retirementAge: integer("retirement_age"),
	lifeExpectancy: integer("life_expectancy").default(95),
	portfolioAtRetirement: text("portfolio_at_retirement"),
	expectedReturnRate: text("expected_return_rate"),
	inflationRate: text("inflation_rate"),
	annualWithdrawal: text("annual_withdrawal"),
	ssStartAge: integer("ss_start_age").default(67),
	ssAnnual: text("ss_annual"),
	pensionStartAge: integer("pension_start_age").default(65),
	pensionAnnual: text("pension_annual"),
	partTimeIncome: text("part_time_income"),
	partTimeEndAge: integer("part_time_end_age"),
	rentalIncomeAnnual: text("rental_income_annual"),
	healthcareAnnual: text("healthcare_annual"),
	legacyGoal: text("legacy_goal"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.fireScenarioId],
			foreignColumns: [fireScenarios.id],
			name: "retirement_projections_fire_scenario_id_fkey"
		}).onDelete("set null"),
]);

export const userSettings = pgTable("user_settings", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	currency: text().default('USD').notNull(),
	locale: text().default('en-US').notNull(),
	timezone: text().default('America/New_York').notNull(),
	theme: text().default('dark').notNull(),
	accentColor: text("accent_color").default('indigo').notNull(),
	compactMode: boolean("compact_mode").default(false).notNull(),
	dateFormat: text("date_format").default('MM/DD/YYYY').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	privacyMode: boolean("privacy_mode").default(false).notNull(),
	chartVisibility: jsonb("chart_visibility").default({}),
	chartColorScheme: text("chart_color_scheme").default('forest').notNull(),
	forecastMode: text("forecast_mode").default('hybrid').notNull(),
	forecastLookbackMonths: integer("forecast_lookback_months").default(3).notNull(),
	hiddenPages: jsonb("hidden_pages").default({}),
	cardStyle: text("card_style").default('default').notNull(),
	showSyntheticData: jsonb("show_synthetic_data").default({"global":true,"netWorth":true,"realEstate":true,"cashFlowProjections":true}),
	defaultChartTimeRange: text("default_chart_time_range").default('1y').notNull(),
	defaultChartType: text("default_chart_type").default('line').notNull(),
	reduceTransparency: boolean("reduce_transparency").default(false).notNull(),
	hideAccountSubheadings: boolean("hide_account_subheadings").default(false).notNull(),
	apiKeys: text("api_keys").default('{}'),
	showMathEnabled: boolean("show_math_enabled").default(false).notNull(),
	aiEndpoint: text("ai_endpoint"),
	aiModel: text("ai_model"),
	aiSystemPrompt: text("ai_system_prompt"),
	aiAutoAnalyze: boolean("ai_auto_analyze").default(false).notNull(),
	aiAutoApproveThreshold: integer("ai_auto_approve_threshold").default(95).notNull(),
	aiBatchSize: integer("ai_batch_size").default(25).notNull(),
	aiActiveProviderId: uuid("ai_active_provider_id"),
}, (table) => [
	unique("user_settings_user_id_unique").on(table.userId),
]);

export const users = pgTable("users", {
	id: serial().primaryKey().notNull(),
	username: text().notNull(),
	passwordHash: text("password_hash").notNull(),
	email: text(),
}, (table) => [
	unique("users_username_key").on(table.username),
]);

export const syncLogs = pgTable("sync_logs", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	connectionId: uuid("connection_id"),
	startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	completedAt: timestamp("completed_at", { withTimezone: true, mode: 'string' }),
	status: text().notNull(),
	accountsSynced: text("accounts_synced").notNull(),
	transactionsFetched: text("transactions_fetched").notNull(),
	transactionsNew: text("transactions_new").notNull(),
	errorMessage: text("error_message"),
	durationMs: text("duration_ms"),
}, (table) => [
	foreignKey({
			columns: [table.connectionId],
			foreignColumns: [simplefinConnections.id],
			name: "sync_logs_connection_id_simplefin_connections_id_fk"
		}),
]);

export const aiProposals = pgTable("ai_proposals", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	type: text().notNull(),
	status: text().default('pending').notNull(),
	confidence: text(),
	payload: jsonb().notNull(),
	explanation: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});
