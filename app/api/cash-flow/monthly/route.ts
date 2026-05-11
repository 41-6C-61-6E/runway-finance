import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { monthlyCashFlow } from '@/lib/db/schema';
import { eq, desc, and, gte, sql } from 'drizzle-orm';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const months = parseInt(searchParams.get('months') || '12', 10);

  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);
  const startYearMonth = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`;

  const db = getDb();

  try {
    const rows = await db
      .select()
      .from(monthlyCashFlow)
      .where(
        and(
          eq(monthlyCashFlow.userId, session.user.id),
          gte(monthlyCashFlow.yearMonth, startYearMonth)
        )
      )
      .orderBy(monthlyCashFlow.yearMonth);

    const data = rows.map((row) => ({
      yearMonth: row.yearMonth,
      income: parseFloat(row.totalIncome.toString()),
      expenses: parseFloat(row.totalExpenses.toString()),
      netCashFlow: parseFloat(row.netCashFlow.toString()),
    }));

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching monthly cash flow:', error);
    return NextResponse.json(
      { error: 'internal_error', message: 'Failed to fetch monthly cash flow data' },
      { status: 500 }
    );
  }
}
