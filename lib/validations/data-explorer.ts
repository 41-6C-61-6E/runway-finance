import { z } from 'zod';

export const DataExplorerFilterOp = z.enum([
  'eq', 'neq', 'gt', 'gte', 'lt', 'lte',
  'contains', 'isNull', 'isNotNull', 'in',
]);

export const DataExplorerFilterSchema = z.object({
  field: z.string().min(1).max(100),
  op: DataExplorerFilterOp,
  value: z.unknown().optional(),
});

export const DataExplorerQuerySchema = z.object({
  table: z.string().min(1).max(100),
  limit: z.coerce.number().int().min(1).max(1000).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
  search: z.string().max(500).optional(),
  filters: z.string().optional(),
});

export const ALLOWED_TABLES = [
  'accounts',
  'account_snapshots',
  'net_worth_snapshots',
  'transactions',
  'categories',
  'category_rules',
  'monthly_cash_flow',
  'category_spending_summary',
  'category_income_summary',
  'budgets',
  'financial_goals',
  'fire_scenarios',
  'retirement_projections',
  'sync_logs',
  'simplefin_connections',
  'user_settings',
] as const;

export type AllowedTable = (typeof ALLOWED_TABLES)[number];
