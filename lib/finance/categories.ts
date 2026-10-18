import { getDb } from '@/lib/db';
import { categorySpendingSummary, categories } from '@/lib/db/schema';
import { eq, and, gte, lte } from 'drizzle-orm';
import { decryptField, decryptRows } from '@/lib/crypto';
import type { FinanceContext } from './context';

export interface CategorySpendingItem {
  categoryId: string;
  name: string;
  color?: string | null;
  amount: number;
  transactionCount: number;
  yearMonth?: string;
}

export async function getCategorySpending(
  ctx: FinanceContext,
  options: {
    startMonth: string;
    endMonth: string;
    groupBy?: 'total' | 'month';
    category?: string;
  }
): Promise<CategorySpendingItem[]> {
  const { startMonth, endMonth, groupBy = 'total', category } = options;
  const db = getDb();

  // Load and decrypt categories to get true names and report exclusion flags
  const allCategories = await db
    .select()
    .from(categories)
    .where(eq(categories.userId, ctx.dataUserId));
  const decCategories = await decryptRows('categories', allCategories, ctx.dek);
  const catMap = new Map(decCategories.map((c) => [c.id, c]));

  // Query spending summary rows
  const rows = await db
    .select({
      categoryId: categorySpendingSummary.categoryId,
      amount: categorySpendingSummary.amount,
      transactionCount: categorySpendingSummary.transactionCount,
      yearMonth: categorySpendingSummary.yearMonth,
      accountId: categorySpendingSummary.accountId,
    })
    .from(categorySpendingSummary)
    .where(
      and(
        eq(categorySpendingSummary.userId, ctx.dataUserId),
        gte(categorySpendingSummary.yearMonth, startMonth),
        lte(categorySpendingSummary.yearMonth, endMonth)
      )
    );

  const filterCategoryNorm = category ? category.trim().toLowerCase() : null;

  if (groupBy === 'month') {
    const monthCatMap = new Map<string, { categoryId: string; name: string; color?: string | null; amount: number; count: number; yearMonth: string }>();

    for (const row of rows) {
      if (row.accountId && ctx.hiddenAccountIds.has(row.accountId)) continue;

      const cat = catMap.get(row.categoryId);
      if (!cat || cat.excludeFromReports) continue;
      if (cat.parentId) {
        const parent = catMap.get(cat.parentId);
        if (parent?.excludeFromReports) continue;
      }

      if (filterCategoryNorm) {
        const matchName = cat.name.toLowerCase().includes(filterCategoryNorm);
        const matchId = cat.id.toLowerCase() === filterCategoryNorm;
        if (!matchName && !matchId) continue;
      }

      const amountVal = parseFloat(await decryptField(row.amount, ctx.dek)) || 0;
      const countVal = row.transactionCount ? parseInt(String(row.transactionCount), 10) || 0 : 0;
      const key = `${row.yearMonth}:${row.categoryId}`;

      const existing = monthCatMap.get(key);
      if (existing) {
        existing.amount += amountVal;
        existing.count += countVal;
      } else {
        monthCatMap.set(key, {
          categoryId: row.categoryId,
          name: cat.name,
          color: cat.color,
          amount: amountVal,
          count: countVal,
          yearMonth: row.yearMonth,
        });
      }
    }

    return Array.from(monthCatMap.values())
      .map((item) => ({
        categoryId: item.categoryId,
        name: item.name,
        color: item.color,
        amount: Math.round(item.amount * 100) / 100,
        transactionCount: item.count,
        yearMonth: item.yearMonth,
      }))
      .sort((a, b) => (a.yearMonth || '').localeCompare(b.yearMonth || '') || b.amount - a.amount);
  }

  // groupBy === 'total'
  const summaryMap = new Map<string, { categoryId: string; name: string; color?: string | null; amount: number; count: number }>();

  for (const row of rows) {
    if (row.accountId && ctx.hiddenAccountIds.has(row.accountId)) continue;

    const cat = catMap.get(row.categoryId);
    if (!cat || cat.excludeFromReports) continue;
    if (cat.parentId) {
      const parent = catMap.get(cat.parentId);
      if (parent?.excludeFromReports) continue;
    }

    if (filterCategoryNorm) {
      const matchName = cat.name.toLowerCase().includes(filterCategoryNorm);
      const matchId = cat.id.toLowerCase() === filterCategoryNorm;
      if (!matchName && !matchId) continue;
    }

    const amountVal = parseFloat(await decryptField(row.amount, ctx.dek)) || 0;
    const countVal = row.transactionCount ? parseInt(String(row.transactionCount), 10) || 0 : 0;

    const existing = summaryMap.get(row.categoryId);
    if (existing) {
      existing.amount += amountVal;
      existing.count += countVal;
    } else {
      summaryMap.set(row.categoryId, {
        categoryId: row.categoryId,
        name: cat.name,
        color: cat.color,
        amount: amountVal,
        count: countVal,
      });
    }
  }

  return Array.from(summaryMap.values())
    .map((item) => ({
      categoryId: item.categoryId,
      name: item.name,
      color: item.color,
      amount: Math.round(item.amount * 100) / 100,
      transactionCount: item.count,
    }))
    .sort((a, b) => b.amount - a.amount);
}
