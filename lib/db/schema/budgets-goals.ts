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
import { accounts } from './accounts';
import { categories, tags } from './transactions';

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
  categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
  priority: integer('priority').notNull().default(0),
  status: text('status').notNull().default('active'),
  linkedAccountId: uuid('linked_account_id').references(() => accounts.id, { onDelete: 'set null' }),
  percentage: text('percentage').notNull(),
  reserve: text('reserve').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  allocatedAmount: text('allocated_amount').notNull().default('0'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Goal Allocation History ────────────────────────────────────────────────────
// Tracks allocation snapshots over time for historical analysis
export const goalAllocationHistory = pgTable('goal_allocation_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull(),
  goalId: uuid('goal_id').notNull().references(() => financialGoals.id, { onDelete: 'cascade' }),
  accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'set null' }),
  snapshotDate: date('snapshot_date').notNull().defaultNow(),
  accountBalance: text('account_balance').notNull(),
  allocatedAmount: text('allocated_amount').notNull().default('0'),
  desiredAmount: text('desired_amount').notNull().default('0'),
  percentage: text('percentage').notNull().default('100'),
  priority: integer('priority').notNull().default(0),
  sortOrder: integer('sort_order').notNull().default(0),
  isUnderfunded: boolean('is_underfunded').notNull().default(false),
  remainingOnAccount: text('remaining_on_account').notNull().default('0'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
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

// ── Budget & Goal Tags ────────────────────────────────────────────────────────
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
