import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { logger } from '@/lib/logger';
import { monthlyCashFlow } from '@/lib/db/schema';
import { eq, and, gte } from 'drizzle-orm';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptField } from '@/lib/crypto';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const dek = await getSessionDEK();
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

    const data = await Promise.all(rows.map(async (row) => ({
      yearMonth: row.yearMonth,
      income: parseFloat(await decryptField(row.totalIncome, dek)),
      expenses: parseFloat(await decryptField(row.totalExpenses, dek)),
      netCashFlow: parseFloat(await decryptField(row.netCashFlow, dek)),
    })));

    logger.info('GET /api/cash-flow/monthly', { months, count: data.length });
    return NextResponse.json(data);
  } catch (error) {
    logger.error('Error fetching monthly cash flow', { error });
    return NextResponse.json(
      { error: 'internal_error', message: 'Failed to fetch monthly cash flow data' },
      { status: 500 }
    );
  }
}
