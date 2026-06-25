import { pgTable, text, timestamp, uuid, jsonb } from 'drizzle-orm/pg-core';
import { user } from './users';

// ── Push Subscriptions ────────────────────────────────────────────────────────
// Stores device-specific push subscriptions for users
export const pushSubscriptions = pgTable('push_subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  endpoint: text('endpoint').notNull(),
  keys: jsonb('keys').notNull().$type<{ p256dh: string; auth: string }>(),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Sent Notifications Logs ───────────────────────────────────────────────────
// Tracks sent alerts to prevent duplicate notifications (e.g. daily budget alerts)
export const sentNotifications = pgTable('sent_notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), // 'budget_alert' | 'sync_error' | 'large_transaction'
  key: text('key').notNull(), // Unique key e.g., 'budget:2026-06:category_id'
  sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
});
