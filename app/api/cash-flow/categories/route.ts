import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { logger } from '@/lib/logger';
import { categorySpendingSummary, categories } from '@/lib/db/schema';
import { eq, and, sql } from 'drizzle-orm';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const now = new Date();
  const month = searchParams.get('month') || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const prevDate = new Date(parseInt(month.split('-')[0]), parseInt(month.split('-')[1]) - 2, 1);
  const previousMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;

  const db = getDb();

  try {
    const currentRows = await db
      .select({
        categoryId: categorySpendingSummary.categoryId,
        amount: categorySpendingSummary.amount,
        transactionCount: categorySpendingSummary.transactionCount,
        categoryName: categories.name,
        categoryColor: categories.color,
        isIncome: categories.isIncome,
      })
      .from(categorySpendingSummary)
      .innerJoin(categories, eq(categorySpendingSummary.categoryId, categories.id))
      .where(
        and(
          eq(categorySpendingSummary.userId, session.user.id),
          eq(categorySpendingSummary.yearMonth, month),
          eq(categories.excludeFromReports, false)
        )
      );

    // Fetch uncategorized transactions for current month
    const uncategorizedResult = await db.execute(
      sql`SELECT CAST(COUNT(*) AS INTEGER) as cnt, CAST(COALESCE(SUM(amount), 0) AS REAL) as total
          FROM transactions
          WHERE user_id = ${session.user.id}
            AND to_char(date, 'YYYY-MM') = ${month}
            AND category_id IS NULL
            AND pending = false
            AND amount != 0`
    );
    const uncatRow = uncategorizedResult.rows?.[0] as { cnt: unknown; total: unknown } | undefined;
    let uncategorizedAmount = 0;
    let uncategorizedCount = 0;
    let uncategorizedIsIncome = false;
    if (uncatRow) {
      const cnt = parseInt(String(uncatRow.cnt)) || 0;
      const rawTotal = parseFloat(String(uncatRow.total)) || 0;
      if (cnt > 0 && rawTotal !== 0) {
        uncategorizedAmount = Math.abs(rawTotal);
        uncategorizedCount = cnt;
        uncategorizedIsIncome = rawTotal > 0;
      }
    }

    // Fetch uncategorized transactions for previous month
    const prevUncategorizedResult = await db.execute(
      sql`SELECT CAST(COALESCE(SUM(amount), 0) AS REAL) as total
          FROM transactions
          WHERE user_id = ${session.user.id}
            AND to_char(date, 'YYYY-MM') = ${previousMonth}
            AND category_id IS NULL
            AND pending = false
            AND amount != 0`
    );
    const prevUncatRow = prevUncategorizedResult.rows?.[0] as { total: unknown } | undefined;
    const prevUncategorizedAmount = prevUncatRow ? Math.abs(parseFloat(String(prevUncatRow.total)) || 0) : 0;

    if (uncategorizedAmount !== 0) {
      currentRows.push({
        categoryId: 'uncategorized',
        amount: String(uncategorizedAmount),
        transactionCount: uncategorizedCount,
        categoryName: 'Uncategorized',
        categoryColor: '#94a3b8',
        isIncome: uncategorizedIsIncome,
      });
    }

    const previousRows = await db
      .select({
        categoryId: categorySpendingSummary.categoryId,
        amount: categorySpendingSummary.amount,
      })
      .from(categorySpendingSummary)
      .where(
        and(
          eq(categorySpendingSummary.userId, session.user.id),
          eq(categorySpendingSummary.yearMonth, previousMonth)
        )
      );

    const prevMap = new Map<string, number>();
    for (const row of previousRows) {
      prevMap.set(row.categoryId, parseFloat(row.amount.toString()));
    }
    // Add previous uncategorized amount to prevMap
    if (prevUncategorizedAmount !== 0) {
      prevMap.set('uncategorized', prevUncategorizedAmount);
    }

    const data = currentRows.map((row) => {
      const amount = parseFloat(row.amount.toString());
      const prevAmount = prevMap.get(row.categoryId) || 0;
      const prevAmountNum = prevAmount || 0;
      const change = amount - prevAmountNum;
      const percentChange = prevAmountNum > 0 ? ((amount - prevAmountNum) / prevAmountNum) * 100 : 0;

      return {
        categoryId: row.categoryId,
        categoryName: row.categoryName || 'Uncategorized',
        categoryColor: row.categoryColor || '#6366f1',
        isIncome: row.isIncome || false,
        amount,
        transactionCount: row.transactionCount,
        previousAmount: prevAmount,
        change,
        percentChange,
      };
    });

    logger.info('GET /api/cash-flow/categories', { month, count: data.length });
    return NextResponse.json(data);
  } catch (error) {
    logger.error('Error fetching category spending', { error });
    return NextResponse.json(
      { error: 'internal_error', message: 'Failed to fetch category spending data' },
      { status: 500 }
    );
  }
}
