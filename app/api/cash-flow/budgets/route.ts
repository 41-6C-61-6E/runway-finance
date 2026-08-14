import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { logger } from '@/lib/logger';
import { budgets, categorySpendingSummary, categoryIncomeSummary, categories } from '@/lib/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptField } from '@/lib/crypto';

function parsePeriodRange(keyOrDate: string | null | undefined): { start: string; end: string } {
  if (!keyOrDate) {
    return { start: '1970-01-01', end: '9999-12-31' };
  }
  const s = keyOrDate.trim();
  if (s.includes('-Q')) {
    const [y, q] = s.split('-Q').map(Number);
    const startMonth = (q - 1) * 3 + 1;
    const endMonth = q * 3;
    const start = `${y}-${String(startMonth).padStart(2, '0')}-01`;
    const lastDay = new Date(Date.UTC(y, endMonth, 0)).getUTCDate();
    const end = `${y}-${String(endMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return { start, end };
  }
  if (/^\d{4}-\d{2}$/.test(s)) {
    const [y, m] = s.split('-').map(Number);
    const start = `${y}-${String(m).padStart(2, '0')}-01`;
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const end = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return { start, end };
  }
  if (/^\d{4}$/.test(s)) {
    const y = Number(s);
    return { start: `${y}-01-01`, end: `${y}-12-31` };
  }
  return { start: '1970-01-01', end: '9999-12-31' };
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const dek = await getSessionDEK();
  const dataUserId = (session.user as any).dataUserId ?? session.user.id;
  const { searchParams } = new URL(request.url);
  const now = new Date();
  const month = searchParams.get('month') || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const targetRange = parsePeriodRange(month);

  const db = getDb();

  try {
    const allUserBudgets = await db
      .select({
        budgetId: budgets.id,
        categoryId: budgets.categoryId,
        amount: budgets.amount,
        periodType: budgets.periodType,
        isRecurring: budgets.isRecurring,
        yearMonth: budgets.yearMonth,
        effectiveFrom: budgets.effectiveFrom,
        effectiveTo: budgets.effectiveTo,
        categoryName: categories.name,
        categoryColor: categories.color,
        isIncome: categories.isIncome,
      })
      .from(budgets)
      .leftJoin(categories, eq(budgets.categoryId, categories.id))
      .where(
        and(
          eq(budgets.userId, dataUserId),
          eq(categories.excludeFromReports, false)
        )
      );

    const budgetRows = allUserBudgets.filter((b) => {
      if (!b.isRecurring) {
        const oneOff = b.yearMonth || b.effectiveFrom;
        if (!oneOff) return false;
        const oneOffRange = parsePeriodRange(oneOff);
        return oneOffRange.start <= targetRange.end && oneOffRange.end >= targetRange.start;
      }
      const fromDate = b.effectiveFrom ? parsePeriodRange(b.effectiveFrom).start : '1970-01-01';
      const toDate = b.effectiveTo ? parsePeriodRange(b.effectiveTo).end : '9999-12-31';
      return fromDate <= targetRange.end && toDate >= targetRange.start;
    });

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
            eq(table.userId, dataUserId),
            eq(table.yearMonth, month),
            inArray(idCol, catIds)
          )
        );
      const map = new Map<string, number>();
      for (const row of rows) {
        try {
          const decrypted = await decryptField(row.amount, dek);
          map.set(row.categoryId, parseFloat(decrypted));
        } catch { /* skip unparseable */ }
      }
      return map;
    }

    const [expenseActualMap, incomeActualMap] = await Promise.all([
      fetchActuals(categorySpendingSummary, expenseIds),
      fetchActuals(categoryIncomeSummary, incomeIds),
    ]);

    const data = await Promise.all(budgetRows.map(async (row) => {
      const rawBudgeted = parseFloat(await decryptField(row.amount, dek));
      const budgeted = row.periodType === 'quarterly'
        ? rawBudgeted / 3
        : row.periodType === 'yearly'
        ? rawBudgeted / 12
        : rawBudgeted;
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
    }));

    return NextResponse.json(data);
  } catch (error) {
    logger.error('Error fetching budgets for cash flow', { error });
    return NextResponse.json(
      { error: 'internal_error', message: 'Failed to fetch budget data' },
      { status: 500 }
    );
  }
}
