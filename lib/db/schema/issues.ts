import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const issues = pgTable('issues', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull(),
  type: text('type').notNull(), // 'bug' | 'feature'
  title: text('title').notNull(),
  description: text('description').notNull(),
  status: text('status').notNull().default('reported'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
