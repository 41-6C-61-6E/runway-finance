import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { categories, transactions, budgets, categoryRules, categorySpendingSummary, categoryIncomeSummary } from '@/lib/db/schema';
import { eq, and, inArray, sql } from 'drizzle-orm';
import { DEFAULT_CATEGORIES, mergeDuplicateCategories } from '@/lib/db/seed-categories';
import { decryptRows } from '@/lib/crypto';
import { getSessionDEK } from '@/lib/crypto-context';
import { logger } from '@/lib/logger';

export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const userId = session.user.id;
  const dataUserId = (session.user as any).dataUserId ?? session.user.id;
  const db = getDb();
  const dek = await getSessionDEK();

  await mergeDuplicateCategories(userId, dek);

  // Collect all category IDs referenced by transactions, budgets, rules, and summaries
  const [txRefs, budgetRefs, ruleRefs, spendingRefs, incomeRefs] = await Promise.all([
    db
      .select({ categoryId: transactions.categoryId })
      .from(transactions)
      .where(and(eq(transactions.userId, dataUserId), sql`${transactions.categoryId} IS NOT NULL`)),
    db
      .select({ categoryId: budgets.categoryId })
      .from(budgets)
      .where(eq(budgets.userId, dataUserId)),
    db
      .select({ categoryId: categoryRules.setCategoryId })
      .from(categoryRules)
      .where(and(eq(categoryRules.userId, dataUserId), sql`${categoryRules.setCategoryId} IS NOT NULL`)),
    db
      .select({ categoryId: categorySpendingSummary.categoryId })
      .from(categorySpendingSummary)
      .where(eq(categorySpendingSummary.userId, dataUserId)),
    db
      .select({ categoryId: categoryIncomeSummary.categoryId })
      .from(categoryIncomeSummary)
      .where(eq(categoryIncomeSummary.userId, dataUserId)),
  ]);

  const referencedIds = new Set<string>();
  for (const r of txRefs.concat(budgetRefs, ruleRefs, spendingRefs, incomeRefs)) {
    if (r.categoryId) referencedIds.add(r.categoryId);
  }

  // Load all user categories and walk up parent chains so ancestors are preserved
  const allCatsRaw = await db
    .select({ id: categories.id, parentId: categories.parentId, name: categories.name, displayOrder: categories.displayOrder })
    .from(categories)
    .where(eq(categories.userId, dataUserId));
  const allCats = await decryptRows('categories', allCatsRaw, dek);

  const catById = new Map(allCats.map((c) => [c.id, c]));

  const stack = [...referencedIds];
  while (stack.length > 0) {
    const id = stack.pop()!;
    const cat = catById.get(id);
    if (cat?.parentId && !referencedIds.has(cat.parentId)) {
      referencedIds.add(cat.parentId);
      stack.push(cat.parentId);
    }
  }

  // Re-classify Transfers & Adjustments parent and children as transfer type
  const transferParent = allCats.find((c) => c.name === 'Transfers & Adjustments' && !c.parentId);
  if (transferParent) {
    await db
      .update(categories)
      .set({ categoryType: 'transfer' })
      .where(and(eq(categories.userId, dataUserId), eq(categories.id, transferParent.id)));

    await db
      .update(categories)
      .set({ categoryType: 'transfer' })
      .where(and(eq(categories.userId, dataUserId), eq(categories.parentId, transferParent.id)));
  }

  // Delete unreferenced categories
  const toDelete = allCats.filter((c) => !referencedIds.has(c.id)).map((c) => c.id);
  if (toDelete.length > 0) {
    await db.delete(categories).where(
      and(eq(categories.userId, dataUserId), inArray(categories.id, toDelete))
    );
  }

  // Determine which of the kept categories are parents and which are children
  const kept = allCats.filter((c) => referencedIds.has(c.id));

  // Seed missing default categories
  let order = allCats.length > 0 ? Math.max(...allCats.map((c) => c.displayOrder)) + 1 : 0;
  let createdCount = 0;

  for (const group of DEFAULT_CATEGORIES) {
    const existingParent = kept.find((c) => c.name === group.name);
    let parentId: string | null = existingParent?.id ?? null;

    if (!existingParent) {
      const [parent] = await db
        .insert(categories)
        .values({
          userId,
          name: group.name,
          color: group.color,
          isIncome: group.isIncome,
          categoryType: group.categoryType ?? 'standard',
          isSystem: true,
          excludeFromReports: group.excludeFromReports ?? false,
          displayOrder: order++,
        })
        .returning();
      parentId = parent.id;
      createdCount++;
    }

    if (group.children && parentId) {
      const keptChildren = kept.filter((c) => c.parentId === parentId);
      const keptChildNames = new Set(keptChildren.map((c) => c.name));

      for (const child of group.children) {
        if (!keptChildNames.has(child.name)) {
          await db.insert(categories).values({
            userId,
            parentId,
            name: child.name,
            color: child.color,
            isIncome: group.isIncome,
            categoryType: group.categoryType ?? 'standard',
            isSystem: true,
            excludeFromReports: child.excludeFromReports ?? false,
            displayOrder: order++,
          });
          createdCount++;
        }
      }
    }
  }

  logger.info('POST /api/categories/reset', { userId, kept: referencedIds.size, deleted: toDelete.length, created: createdCount });
  return NextResponse.json({ success: true, message: 'Categories reset to defaults', kept: referencedIds.size, deleted: toDelete.length, created: createdCount });
}
