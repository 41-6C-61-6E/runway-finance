import {
  boolean,
  date,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { accounts } from './accounts';
import { categories } from './transactions';

// ── Recurring Streams ────────────────────────────────────────────────────────
// Auto-detected and user-defined recurring income, bills, and subscriptions
export const recurringStreams = pgTable('recurring_streams', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull(),
  accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'cascade' }),
  categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  payee: text('payee'),
  amount: text('amount').notNull(), // Encrypted text
  currency: text('currency').notNull().default('USD'),
  type: text('type').notNull().default('subscription'), // 'income' | 'subscription' | 'bill' | 'loan' | 'transfer' | 'other'
  frequency: text('frequency').notNull().default('monthly'), // 'weekly' | 'biweekly' | 'semimonthly' | 'monthly' | 'quarterly' | 'yearly'
  intervalDays: integer('interval_days'),
  anchorDate: date('anchor_date').notNull(),
  nextExpectedDate: date('next_expected_date').notNull(),
  isAutoDetected: boolean('is_auto_detected').notNull().default(true),
  isConfirmed: boolean('is_confirmed').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  confidence: integer('confidence').notNull().default(100), // 0 to 100
  isVariableAmount: boolean('is_variable_amount').notNull().default(false),
  averageAmount: text('average_amount'), // Encrypted text
  metadata: jsonb('metadata').default({}), // e.g. matchedTransactionIds, priceHistory, notes, logo
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
