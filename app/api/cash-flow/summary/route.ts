import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { logger } from '@/lib/logger';
import { monthlyCashFlow } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptField } from '@/lib/crypto';

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const db = getDb();
  const dek = await getSessionDEK();
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

    let income = 0;
    let expenses = 0;
    if (current) {
      try {
        const incomeStr = await decryptField(current.totalIncome, dek);
        income = parseFloat(incomeStr) || 0;
      } catch (error) {
        logger.warn('Failed to decrypt current income', { error: error instanceof Error ? error.message : String(error) });
      }
      try {
        const expenseStr = await decryptField(current.totalExpenses, dek);
        expenses = parseFloat(expenseStr) || 0;
      } catch (error) {
        logger.warn('Failed to decrypt current expenses', { error: error instanceof Error ? error.message : String(error) });
      }
    }

    let prevIncome = 0;
    let prevExpenses = 0;
    if (previous) {
      try {
        const incomeStr = await decryptField(previous.totalIncome, dek);
        prevIncome = parseFloat(incomeStr) || 0;
      } catch (error) {
        logger.warn('Failed to decrypt previous income', { error: error instanceof Error ? error.message : String(error) });
      }
      try {
        const expenseStr = await decryptField(previous.totalExpenses, dek);
        prevExpenses = parseFloat(expenseStr) || 0;
      } catch (error) {
        logger.warn('Failed to decrypt previous expenses', { error: error instanceof Error ? error.message : String(error) });
      }
    }

    const netIncome = income - expenses;
    const savingsRate = income > 0 ? (netIncome / income) * 100 : 0;
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
