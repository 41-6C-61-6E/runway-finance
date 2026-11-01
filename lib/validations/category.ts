import { z } from 'zod';

export const CreateCategorySchema = z.object({
  name: z.string().min(1).max(100),
  parentId: z.string().uuid().nullable().optional(),
  color: z.string().max(7).default('#6366f1'),
  isIncome: z.boolean().default(false),
  excludeFromReports: z.boolean().default(false),
  hideFromTransactions: z.boolean().default(false),
  displayOrder: z.number().int().default(0),
  categoryType: z.enum(['standard', 'compound', 'transfer']).default('standard'),
  expenseParentId: z.string().uuid().nullable().optional(),
  isDiscretionary: z.boolean().default(true),
});

export const UpdateCategorySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  parentId: z.string().uuid().nullable().optional(),
  color: z.string().max(7).optional(),
  isIncome: z.boolean().optional(),
  excludeFromReports: z.boolean().optional(),
  hideFromTransactions: z.boolean().optional(),
  displayOrder: z.number().int().optional(),
  categoryType: z.enum(['standard', 'compound', 'transfer']).optional(),
  expenseParentId: z.string().uuid().nullable().optional(),
  isDiscretionary: z.boolean().optional(),
});

export type CreateCategoryInput = z.infer<typeof CreateCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof UpdateCategorySchema>;

