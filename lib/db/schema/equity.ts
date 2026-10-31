import {
  boolean,
  date,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { accounts } from './accounts';

// ── Equity Grants (Private & Public Company Stock Options / RSUs / Common) ───
export const equityGrants = pgTable(
  'equity_grants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    companyName: text('company_name').notNull(),
    grantName: text('grant_name').notNull(),
    // 'iso' | 'nso' | 'rsu' | 'common'
    grantType: text('grant_type').notNull().default('iso'),
    grantDate: date('grant_date').notNull(),
    vestingStartDate: date('vesting_start_date').notNull(),
    expirationDate: date('expiration_date'),
    totalShares: text('total_shares').notNull(),
    exercisedShares: text('exercised_shares').notNull().default('0'),
    soldShares: text('sold_shares').notNull().default('0'),
    strikePrice: text('strike_price').notNull().default('0'),
    currentFmv: text('current_fmv').notNull().default('0'),
    preferredPrice: text('preferred_price'),
    // 'fmv' | 'preferred'
    valuationMode: text('valuation_mode').notNull().default('fmv'),
    // Encrypted JSON string: VestingScheduleConfig
    vestingSchedule: text('vesting_schedule').notNull(),
    earlyExerciseAllowed: boolean('early_exercise_allowed').notNull().default(false),
    filed83b: boolean('filed_83b').notNull().default(false),
    earlyExerciseDate: date('early_exercise_date'),
    logoUrl: text('logo_url'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('equity_grants_user_id_idx').on(t.userId),
    index('equity_grants_account_id_idx').on(t.accountId),
  ]
);

