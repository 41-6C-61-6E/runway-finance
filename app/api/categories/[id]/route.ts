import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { budgets, categoryIncomeSummary, categoryRules, categorySpendingSummary, categories, transactions } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptRow, decryptRows, encryptRow } from '@/lib/crypto';
import { mergeDuplicateCategories } from '@/lib/db/seed-categories';

function normalizeCategoryName(name: string) {
  return name.trim().toLowerCase();
}

const UpdateCategorySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  parentId: z.string().uuid().nullable().optional(),
  color: z.string().max(7).optional(),
  isIncome: z.boolean().optional(),
  excludeFromReports: z.boolean().optional(),
  displayOrder: z.number().int().optional(),
  categoryType: z.enum(['standard', 'compound', 'transfer']).optional(),
  expenseParentId: z.string().uuid().nullable().optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const userId = session.user.id;
  const dek = await getSessionDEK();
  const { id } = await params;

  const [existing] = await getDb()
    .select()
    .from(categories)
    .where(and(eq(categories.id, id), eq(categories.userId, userId)))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: 'not_found', message: 'Category not found' }, { status: 404 });
  }
  const decryptedExisting = await decryptRow('categories', existing, dek);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const parsed = UpdateCategorySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_error', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  await mergeDuplicateCategories(userId, dek);

  const allCategories = await getDb()
    .select()
    .from(categories)
    .where(eq(categories.userId, userId));

  const decryptedCategories = await decryptRows('categories', allCategories, dek);
  const nextName = parsed.data.name ?? decryptedExisting.name;
  const nextParentId = parsed.data.parentId !== undefined ? parsed.data.parentId : decryptedExisting.parentId;
  const duplicateTarget = decryptedCategories.find((cat) =>
    cat.id !== id &&
    normalizeCategoryName(cat.name) === normalizeCategoryName(nextName) &&
    (cat.parentId ?? null) === (nextParentId ?? null)
  );

  if (duplicateTarget) {
    const encryptedTarget = await encryptRow('categories', {
      name: parsed.data.name ?? duplicateTarget.name,
      parentId: parsed.data.parentId ?? duplicateTarget.parentId,
      color: parsed.data.color ?? duplicateTarget.color,
      isIncome: parsed.data.isIncome ?? duplicateTarget.isIncome,
      excludeFromReports: parsed.data.excludeFromReports ?? duplicateTarget.excludeFromReports,
      displayOrder: parsed.data.displayOrder ?? duplicateTarget.displayOrder,
      categoryType: parsed.data.categoryType ?? duplicateTarget.categoryType,
      expenseParentId: parsed.data.expenseParentId ?? duplicateTarget.expenseParentId,
    }, dek);

    await getDb().transaction(async (tx) => {
      await tx
        .update(categories)
        .set(encryptedTarget)
        .where(and(eq(categories.id, duplicateTarget.id), eq(categories.userId, userId)));

      await tx
        .update(transactions)
        .set({ categoryId: duplicateTarget.id })
        .where(and(eq(transactions.userId, userId), eq(transactions.categoryId, id)));

      await tx
        .update(budgets)
        .set({ categoryId: duplicateTarget.id })
        .where(and(eq(budgets.userId, userId), eq(budgets.categoryId, id)));

      await tx
        .update(categoryRules)
        .set({ setCategoryId: duplicateTarget.id })
        .where(and(eq(categoryRules.userId, userId), eq(categoryRules.setCategoryId, id)));

      await tx
        .update(categorySpendingSummary)
        .set({ categoryId: duplicateTarget.id })
        .where(and(eq(categorySpendingSummary.userId, userId), eq(categorySpendingSummary.categoryId, id)));

      await tx
        .update(categoryIncomeSummary)
        .set({ categoryId: duplicateTarget.id })
        .where(and(eq(categoryIncomeSummary.userId, userId), eq(categoryIncomeSummary.categoryId, id)));

      await tx
        .update(categories)
        .set({ parentId: duplicateTarget.id })
        .where(and(eq(categories.userId, userId), eq(categories.parentId, id)));

      await tx
        .update(categories)
        .set({ expenseParentId: duplicateTarget.id })
        .where(and(eq(categories.userId, userId), eq(categories.expenseParentId, id)));

      await tx.delete(categories).where(and(eq(categories.id, id), eq(categories.userId, userId)));
    });

    await mergeDuplicateCategories(userId, dek);

    const [merged] = await getDb()
      .select()
      .from(categories)
      .where(and(eq(categories.id, duplicateTarget.id), eq(categories.userId, userId)))
      .limit(1);

    const decrypted = merged ? await decryptRow('categories', merged, dek) : merged;
    logger.info('PATCH /api/categories/[id] - merged duplicate', { userId, id, mergedInto: duplicateTarget.id, updatedFields: Object.keys(parsed.data) });
    return NextResponse.json(decrypted);
  }

  const encrypted = await encryptRow('categories', { ...parsed.data }, dek);

  const [updated] = await getDb()
    .update(categories)
    .set(encrypted)
    .where(eq(categories.id, id))
    .returning();

  const decrypted = updated ? await decryptRow('categories', updated, dek) : updated;
  logger.info('PATCH /api/categories/[id]', { userId, id, updatedFields: Object.keys(parsed.data) });
  return NextResponse.json(decrypted);
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const userId = session.user.id;
  const { id } = await params;

  const [existing] = await getDb()
    .select()
    .from(categories)
    .where(and(eq(categories.id, id), eq(categories.userId, userId)))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: 'not_found', message: 'Category not found' }, { status: 404 });
  }

  await getDb().delete(categories).where(eq(categories.id, id));

  logger.info('DELETE /api/categories/[id]', { userId, id, name: existing.name });
  return NextResponse.json({ success: true });
}
