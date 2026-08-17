import {
  boolean,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { accounts } from './accounts';
import { categories } from './transactions';

// ── Recurring Transactions ──────────────────────────────────────────────────
export const recurringTransactions = pgTable(
  'recurring_transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull(),

    // Detection / Matching info (encrypted merchant name and match pattern)
    merchantName: text('merchant_name').notNull(),
    matchPattern: text('match_pattern').notNull(),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
    accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'cascade' }),

    // Recurrence info
    frequency: text('frequency').notNull(), // 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'semi_annual' | 'annual'
    averageAmount: text('average_amount').notNull(), // Encrypted average observed amount
    lastAmount: text('last_amount').notNull(), // Encrypted most recent amount
    lastDate: date('last_date').notNull(), // Most recent occurrence date (YYYY-MM-DD)
    nextExpectedDate: date('next_expected_date'), // Projected next occurrence date (YYYY-MM-DD)

    // Flow type
    flowType: text('flow_type').notNull().default('expense'), // 'income' | 'expense'

    // User overrides & status
    isConfirmed: boolean('is_confirmed').notNull().default(false),
    isDismissed: boolean('is_dismissed').notNull().default(false),
    isPaused: boolean('is_paused').notNull().default(false),
    customName: text('custom_name'), // Encrypted user-provided display name
    notes: text('notes'), // Encrypted notes

    // Stats & scoring
    occurrenceCount: integer('occurrence_count').notNull().default(0),
    confidence: integer('confidence').notNull().default(0), // 0-100 score

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('recurring_txn_user_idx').on(t.userId),
    index('recurring_txn_user_account_idx').on(t.userId, t.accountId),
    index('recurring_txn_next_date_idx').on(t.userId, t.nextExpectedDate),
  ]
);

export type RecurringTransaction = typeof recurringTransactions.$inferSelect;
export type NewRecurringTransaction = typeof recurringTransactions.$inferInsert;
