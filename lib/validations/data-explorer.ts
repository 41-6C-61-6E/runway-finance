import { z } from 'zod';

export const DataExplorerFilterSchema = z.object({
  field: z.string().min(1).max(100),
  op: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'isNull', 'isNotNull', 'in']),
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


