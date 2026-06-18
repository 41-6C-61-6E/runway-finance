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
import { accounts, importLog } from './accounts';

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
