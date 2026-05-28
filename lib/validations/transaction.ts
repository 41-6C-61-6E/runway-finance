import { z } from "zod";

export const TransactionFilterSchema = z.object({
  accountId: z.string().uuid().optional(),
  accountIds: z.string().optional(),
  accountTypes: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  categoryId: z
    .union([
      z.string().uuid(),
      z.literal("uncategorized"),
      z.literal("uncategorized_income"),
    ])
    .optional(),
  categoryIds: z.string().optional(),
  search: z.string().max(200).optional(),
  type: z.enum(["income", "expense"]).optional(),
  pending: z.preprocess(
    (val) => (val === "true" ? true : val === "false" ? false : undefined),
    z.boolean().optional(),
  ),
  reviewed: z.preprocess(
    (val) =>
      val === "true" || val === true
        ? true
        : val === "false" || val === false
          ? false
          : undefined,
    z.boolean().optional(),
  ),
  categorizedByAi: z.preprocess(
    (val) =>
      val === "true" || val === true
        ? true
        : val === "false" || val === false
          ? false
          : undefined,
    z.boolean().optional(),
  ),
  tagId: z.string().uuid().optional(),
  tagIds: z.string().optional(),
  minAmount: z.coerce.number().optional(),
  maxAmount: z.coerce.number().optional(),
  limit: z.coerce.number().min(1).max(200).default(50),
  offset: z.coerce.number().min(0).default(0),
  sort: z
    .enum([
      "date",
      "amount",
      "description",
      "account",
      "category",
      "postedDate",
      "ai",
    ])
    .default("date"),
  order: z.enum(["asc", "desc"]).default("desc"),
  totalAmountOnly: z.coerce.boolean().optional(),
  idsOnly: z.coerce.boolean().optional(),
});

export const PatchTransactionSchema = z.object({
  categoryId: z.string().uuid().nullable().optional(),
  tagIds: z.array(z.string().uuid()).optional(),
  payee: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
  memo: z.string().max(500).optional(),
  reviewed: z.boolean().optional(),
  ignored: z.boolean().optional(),
});

export const BulkPatchTransactionSchema = z.object({
  ids: z.array(z.string()).min(1).optional(),
  patch: z.object({
    categoryId: z.string().nullable().optional(),
    tagIds: z.array(z.string().uuid()).optional(),
    reviewed: z.boolean().optional(),
    ignored: z.boolean().optional(),
  }),
  selectAllMatching: z.boolean().optional(),
  search: z.string().max(200).optional(),
  type: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  accountId: z.string().optional(),
  accountIds: z.string().optional(),
  accountTypes: z.string().optional(),
  categoryId: z.string().optional(),
  categoryIds: z.string().optional(),
  tagId: z.string().optional(),
  tagIds: z.string().optional(),
  pending: z.string().optional(),
  reviewed: z.string().optional(),
  categorizedByAi: z.string().optional(),
  minAmount: z.string().optional(),
  maxAmount: z.string().optional(),
});

export const BulkDeleteTransactionSchema = z.object({
  ids: z.array(z.string()).min(1).optional(),
  selectAllMatching: z.boolean().optional(),
  search: z.string().max(200).optional(),
  type: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  accountId: z.string().optional(),
  accountIds: z.string().optional(),
  accountTypes: z.string().optional(),
  categoryId: z.string().optional(),
  categoryIds: z.string().optional(),
  pending: z.string().optional(),
  reviewed: z.string().optional(),
  categorizedByAi: z.string().optional(),
  minAmount: z.string().optional(),
  maxAmount: z.string().optional(),
});
