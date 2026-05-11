import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
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
      .leftJoin(categories, eq(categorySpendingSummary.categoryId, categories.id))
      .where(
        and(
          eq(categorySpendingSummary.userId, session.user.id),
          eq(categorySpendingSummary.yearMonth, month)
        )
      );

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

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching category spending:', error);
    return NextResponse.json(
      { error: 'internal_error', message: 'Failed to fetch category spending data' },
      { status: 500 }
    );
  }
}
