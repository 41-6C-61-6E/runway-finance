import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { logger } from '@/lib/logger';
import { budgets, categorySpendingSummary, categories } from '@/lib/db/schema';
import { eq, and, or, isNull, sql } from 'drizzle-orm';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const now = new Date();
  const month = searchParams.get('month') || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const db = getDb();

  try {
    const budgetRows = await db
      .select({
        budgetId: budgets.id,
        categoryId: budgets.categoryId,
        amount: budgets.amount,
        isRecurring: budgets.isRecurring,
        yearMonth: budgets.yearMonth,
        categoryName: categories.name,
        categoryColor: categories.color,
      })
      .from(budgets)
      .leftJoin(categories, eq(budgets.categoryId, categories.id))
      .where(
        and(
          eq(budgets.userId, session.user.id),
          or(
            eq(budgets.yearMonth, month),
            and(isNull(budgets.yearMonth), eq(budgets.isRecurring, true))
          )
        )
      );

    const categoryIds = budgetRows.map((b) => b.categoryId);
    let actualSpending: Array<{ categoryId: string; amount: string }> = [];
    if (categoryIds.length > 0) {
      const conditions = categoryIds.map((cid) =>
        and(
          eq(categorySpendingSummary.userId, session.user.id),
          eq(categorySpendingSummary.categoryId, cid),
          eq(categorySpendingSummary.yearMonth, month)
        )
      );
      actualSpending = await db
        .select({
          categoryId: categorySpendingSummary.categoryId,
          amount: categorySpendingSummary.amount,
        })
        .from(categorySpendingSummary)
        .where(and(eq(categorySpendingSummary.userId, session.user.id), ...conditions.length > 0 ? [conditions[0]] : []));
    }

    const actualMap = new Map<string, number>();
    for (const row of actualSpending) {
      actualMap.set(row.categoryId, parseFloat(row.amount.toString()));
    }

    const data = budgetRows.map((row) => {
      const budgeted = parseFloat(row.amount.toString());
      const actual = actualMap.get(row.categoryId) || 0;
      const remaining = budgeted - actual;
      const percentUsed = budgeted > 0 ? (actual / budgeted) * 100 : 0;

      return {
        categoryId: row.categoryId,
        categoryName: row.categoryName || 'Uncategorized',
        categoryColor: row.categoryColor || '#6366f1',
        budgeted,
        actual,
        remaining,
        percentUsed,
      };
    });

    logger.info('GET /api/cash-flow/budgets', { month, count: data.length });
    return NextResponse.json(data);
  } catch (error) {
    logger.error('Error fetching budgets', { error });
    return NextResponse.json(
      { error: 'internal_error', message: 'Failed to fetch budget data' },
      { status: 500 }
    );
  }
}
