import { pgTable, text, timestamp, uuid, jsonb, index } from 'drizzle-orm/pg-core';

// ── Background Job Execution Logs ────────────────────────────────────────────
// Tracks execution runs, durations, and outputs of automated scheduler jobs
export const schedulerJobLogs = pgTable('scheduler_job_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  jobName: text('job_name').notNull(),
  userId: text('user_id').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  status: text('status').notNull(), // 'success' | 'failed'
  errorMessage: text('error_message'),
  details: jsonb('details'),
}, (table) => [
  index('scheduler_job_logs_user_started_idx').on(table.userId, table.startedAt),
  index('scheduler_job_logs_started_at_idx').on(table.startedAt),
]);
