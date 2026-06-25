import { pgTable, text, timestamp, uuid, jsonb, boolean } from 'drizzle-orm/pg-core';

// ── Push Subscriptions ────────────────────────────────────────────────────────
// Stores device-specific push subscriptions for users
export const pushSubscriptions = pgTable('push_subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull(),
  endpoint: text('endpoint').notNull(),
  keys: jsonb('keys').notNull().$type<{ p256dh: string; auth: string }>(),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Sent Notifications Logs ───────────────────────────────────────────────────
// Tracks sent alerts to prevent duplicate notifications (e.g. daily budget alerts)
export const sentNotifications = pgTable('sent_notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull(),
  type: text('type').notNull(), // 'budget_alert' | 'sync_error' | 'large_transaction'
  key: text('key').notNull(), // Unique key e.g., 'budget:2026-06:category_id'
  sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Alert Condition Types ─────────────────────────────────────────────────────
// Shared types for multi-condition alert rules with AND/OR logic

export type ConditionOperator = 'AND' | 'OR';

export type AlertConditionField =
  // Transaction fields
  | 'account'
  | 'amount_min'
  | 'amount_max'
  | 'keyword'
  // Account balance fields
  | 'balance_above_value'
  | 'balance_below_value'
  | 'balance_above_account'
  | 'balance_below_account'
  // Savings goal fields
  | 'goal_reached_percentage'
  | 'goal_reached_amount'
  // Cash flow fields
  | 'cf_net_savings_below'
  | 'cf_net_savings_above'
  | 'cf_savings_rate_below'
  | 'cf_savings_rate_above';

export interface AlertCondition {
  field: AlertConditionField;
  value: string | number;           // Threshold, keyword, or account/goal ID
  compareAccountId?: string;        // For balance_*_account conditions
  goalId?: string;                  // For goal conditions
  consecutiveMonths?: number;       // For cash flow conditions
}

// Recursive condition tree node for mixed AND/OR expressions
export interface ConditionTreeNode {
  operator: ConditionOperator;
  conditions: AlertCondition[];
  subGroups?: ConditionTreeNode[];
}

// Legacy criteria type for backward compatibility with existing rules
export interface LegacyCriteria {
  accountId?: string;
  amountMin?: number;
  amountMax?: number;
  keyword?: string;
  operator?: 'less_than' | 'greater_than' | 'reached_percentage' | 'reached_amount';
  compareType?: 'value' | 'account';
  value?: number;
  compareAccountId?: string;
  goalId?: string;
  metric?: 'net_savings' | 'savings_rate';
  consecutiveMonths?: number;
}

// ── Custom Alert Rules ────────────────────────────────────────────────────────
// User-defined alerts with custom criteria (transactions, account balances, savings goals, cash flow)
export const customAlertRules = pgTable('custom_alert_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  isEnabled: boolean('is_enabled').notNull().default(true),
  triggerType: text('trigger_type').notNull(), // 'transaction' | 'account_balance' | 'savings_goal' | 'cash_flow'
  // Legacy single-criteria field (kept for backward compatibility with existing rules)
  criteria: jsonb('criteria').notNull().default({}).$type<LegacyCriteria>(),
  // New multi-condition fields
  conditionOperator: text('condition_operator').$type<ConditionOperator>().default('AND'),
  conditionTree: jsonb('condition_tree').$type<ConditionTreeNode | null>(),
  conditions: jsonb('conditions').$type<AlertCondition[]>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
