import { z } from 'zod';

export const RecurringFilterSchema = z.object({
  flowType: z.enum(['all', 'expense', 'income']).default('all'),
  status: z.enum(['all', 'active', 'paused', 'dismissed', 'needs_review']).default('active'),
  includeDismissed: z.preprocess(
    (val) => val === 'true' || val === true,
    z.boolean().optional()
  ),
  search: z.string().max(200).optional(),
  accountId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
});

export const RecurringPatchSchema = z.object({
  id: z.string().uuid().optional(),
  merchantName: z.string().min(1).max(200).optional(),
  matchPattern: z.string().max(200).optional(),
  accountId: z.string().uuid().nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  frequency: z.enum(['weekly', 'biweekly', 'semi_monthly', 'monthly', 'quarterly', 'semi_annual', 'annual']).optional(),
  averageAmount: z.coerce.number().positive().finite().optional(),
  lastAmount: z.coerce.number().positive().finite().optional(),
  lastDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  nextExpectedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  flowType: z.enum(['expense', 'income']).optional(),
  isConfirmed: z.boolean().optional(),
  isDismissed: z.boolean().optional(),
  isPaused: z.boolean().optional(),
  customName: z.string().max(200).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

export const RecurringBulkPatchSchema = z.object({
  items: z.array(RecurringPatchSchema.required({ id: true })),
});

export const RecurringCreateSchema = z.object({
  merchantName: z.string().min(1).max(200),
  matchPattern: z.string().max(200).optional(),
  accountId: z.string().uuid().nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  frequency: z.enum(['weekly', 'biweekly', 'semi_monthly', 'monthly', 'quarterly', 'semi_annual', 'annual']).default('monthly'),
  amount: z.coerce.number().positive().finite(),
  lastDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  nextExpectedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  flowType: z.enum(['expense', 'income']).default('expense'),
  customName: z.string().max(200).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  isConfirmed: z.boolean().default(true),
});

export const RecurringUpcomingSchema = z.object({
  days: z.coerce.number().min(1).max(365).default(30),
  flowType: z.enum(['all', 'expense', 'income']).default('all'),
});

export const RecurringDetectSchema = z.object({
  lookbackMonths: z.coerce.number().min(1).max(36).default(12),
});

export const RecurringMergeSchema = z.object({
  targetId: z.string().uuid(),
  sourceIds: z.array(z.string().uuid()).min(1),
  customName: z.string().max(200).optional(),
});

export const RecurringBulkActionSchema = z.object({
  action: z.enum(['confirm', 'dismiss', 'undismiss', 'pause', 'resume', 'delete', 'dismiss_all_pending', 'reset_unconfirmed']),
  ids: z.array(z.string().uuid()).optional(),
});
