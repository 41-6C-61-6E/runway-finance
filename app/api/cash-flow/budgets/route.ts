import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { logger } from '@/lib/logger';
import { budgets, categorySpendingSummary, categoryIncomeSummary, categories } from '@/lib/db/schema';
import { eq, and, or, isNull } from 'drizzle-orm';

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
        isIncome: categories.isIncome,
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

    const expenseIds = budgetRows.filter((b) => !b.isIncome).map((b) => b.categoryId);
    const incomeIds = budgetRows.filter((b) => b.isIncome).map((b) => b.categoryId);

    async function fetchActuals(
      table: typeof categorySpendingSummary | typeof categoryIncomeSummary,
      catIds: string[],
    ) {
      if (catIds.length === 0) return new Map<string, number>();
      const idCol = 'categoryId' in table ? table.categoryId : categorySpendingSummary.categoryId;
      const rows = await db
        .select({
          categoryId: idCol,
          amount: table.amount,
        })
        .from(table)
        .where(
          and(
            eq(table.userId, session.user.id),
            eq(table.yearMonth, month),
            ...catIds.map((cid) => eq(idCol, cid))
          )
        );
      const map = new Map<string, number>();
      for (const row of rows) {
        map.set(row.categoryId, parseFloat(row.amount.toString()));
      }
      return map;
    }

    const [expenseActualMap, incomeActualMap] = await Promise.all([
      fetchActuals(categorySpendingSummary, expenseIds),
      fetchActuals(categoryIncomeSummary, incomeIds),
    ]);

    const data = budgetRows.map((row) => {
      const budgeted = parseFloat(row.amount.toString());
      const isIncome = row.isIncome ?? false;
      const actual = isIncome
        ? incomeActualMap.get(row.categoryId) || 0
        : expenseActualMap.get(row.categoryId) || 0;
      const remaining = isIncome ? actual - budgeted : budgeted - actual;
      const percentUsed = budgeted > 0 ? (actual / budgeted) * 100 : 0;

      return {
        categoryId: row.categoryId,
        categoryName: row.categoryName || 'Uncategorized',
        categoryColor: row.categoryColor || '#6366f1',
        budgeted,
        actual,
        remaining,
        percentUsed,
        type: isIncome ? 'income' : 'expense',
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
