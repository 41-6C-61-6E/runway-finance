import { z } from 'zod';

export const TransactionFilterSchema = z.object({
  accountId: z.string().uuid().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  categoryId: z.union([z.string().uuid(), z.literal('uncategorized')]).optional(),
  search: z.string().max(200).optional(),
  pending: z.coerce.boolean().optional(),
  reviewed: z.coerce.boolean().optional(),
  minAmount: z.coerce.number().optional(),
  maxAmount: z.coerce.number().optional(),
  limit: z.coerce.number().min(1).max(200).default(50),
  offset: z.coerce.number().min(0).default(0),
  sort: z.enum(['date', 'amount', 'description']).default('date'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export const PatchTransactionSchema = z.object({
  categoryId: z.string().uuid().nullable().optional(),
  payee: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
  reviewed: z.boolean().optional(),
  ignored: z.boolean().optional(),
});

export const BulkPatchTransactionSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
  patch: z.object({
    categoryId: z.string().uuid().nullable().optional(),
    reviewed: z.boolean().optional(),
    ignored: z.boolean().optional(),
  }),
});
