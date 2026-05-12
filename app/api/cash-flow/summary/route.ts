import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { logger } from '@/lib/logger';
import { monthlyCashFlow } from '@/lib/db/schema';
import { eq, desc, and } from 'drizzle-orm';

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const db = getDb();
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previousMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;

  try {
    const [current] = await db.select().from(monthlyCashFlow).where(
      and(eq(monthlyCashFlow.userId, session.user.id), eq(monthlyCashFlow.yearMonth, currentMonth))
    );
    const [previous] = await db.select().from(monthlyCashFlow).where(
      and(eq(monthlyCashFlow.userId, session.user.id), eq(monthlyCashFlow.yearMonth, previousMonth))
    );

    const income = current ? parseFloat(current.totalIncome.toString()) : 0;
    const expenses = current ? parseFloat(current.totalExpenses.toString()) : 0;
    const netIncome = income - expenses;
    const savingsRate = income > 0 ? (netIncome / income) * 100 : 0;

    const prevIncome = previous ? parseFloat(previous.totalIncome.toString()) : 0;
    const prevExpenses = previous ? parseFloat(previous.totalExpenses.toString()) : 0;
    const prevNet = prevIncome - prevExpenses;

    logger.info('GET /api/cash-flow/summary', { currentMonth, netIncome });
    return NextResponse.json({
      totalIncome: income,
      totalExpenses: expenses,
      netIncome,
      savingsRate,
      currentMonth,
      previousMonth,
      change: {
        income: prevIncome > 0 ? ((income - prevIncome) / prevIncome) * 100 : 0,
        expenses: prevExpenses > 0 ? ((expenses - prevExpenses) / prevExpenses) * 100 : 0,
        netIncome: prevNet !== 0 ? ((netIncome - prevNet) / prevNet) * 100 : 0,
      },
    });
  } catch (error) {
    logger.error('Error fetching cash flow summary', { error });
    return NextResponse.json(
      { error: 'internal_error', message: 'Failed to fetch cash flow summary' },
      { status: 500 }
    );
  }
}
