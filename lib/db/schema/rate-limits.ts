import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

// ── Shared (DB-backed) Rate Limits ───────────────────────────────────────────
// Atomic per-key counters shared across processes/instances, used by
// checkRateLimit when the in-memory map is not sufficient.
export const rateLimits = pgTable('rate_limits', {
  key: text('key').primaryKey(),
  count: integer('count').notNull().default(1),
  windowStart: timestamp('window_start', { withTimezone: true }).notNull().defaultNow(),
});
