import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { logger } from '@/lib/logger';
import { categorySpendingSummary, categories, transactions, accounts, monthlyCashFlow } from '@/lib/db/schema';
import { eq, and, inArray, sql, gte, lte } from 'drizzle-orm';

function parsePeriod(period: string, timeframe: string): { startYearMonth: string; endYearMonth: string } {
  if (timeframe === 'monthly') {
    return { startYearMonth: period, endYearMonth: period };
  }
  if (timeframe === 'quarterly') {
    const match = period.match(/^(\d{4})-Q([1-4])$/);
    if (!match) throw new Error('Invalid quarterly period format (expected YYYY-Q1..Q4)');
    const year = parseInt(match[1]);
    const quarter = parseInt(match[2]);
    const startMonth = (quarter - 1) * 3 + 1;
    const endMonth = quarter * 3;
    const start = `${year}-${String(startMonth).padStart(2, '0')}`;
    const end = `${year}-${String(endMonth).padStart(2, '0')}`;
    return { startYearMonth: start, endYearMonth: end };
  }
  if (timeframe === 'yearly') {
    const match = period.match(/^(\d{4})$/);
    if (!match) throw new Error('Invalid yearly period format (expected YYYY)');
    const year = match[1];
    return { startYearMonth: `${year}-01`, endYearMonth: `${year}-12` };
  }
  throw new Error('Invalid timeframe');
}

function getLastDay(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function getEndDateString(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number);
  const lastDay = getLastDay(y, m);
  return `${yearMonth}-${String(lastDay).padStart(2, '0')}`;
}

function getCurrentPeriod(timeframe: string): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  if (timeframe === 'monthly') return `${y}-${String(m).padStart(2, '0')}`;
  if (timeframe === 'quarterly') return `${y}-Q${Math.ceil(m / 3)}`;
  if (timeframe === 'yearly') return `${y}`;
  return `${y}-${String(m).padStart(2, '0')}`;
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const timeframe = searchParams.get('timeframe') || 'monthly';
  const period = searchParams.get('period') || getCurrentPeriod(timeframe);
  const accountTypesParam = searchParams.get('accountTypes') || '';
  const accountTypeList = accountTypesParam ? accountTypesParam.split(',').filter(Boolean) : [];

  const db = getDb();

  try {
    const { startYearMonth, endYearMonth } = parsePeriod(period, timeframe);

    type CategoryRow = {
      categoryId: string;
      amount: string;
      transactionCount: number | null;
      categoryName: string | null;
      categoryColor: string | null;
      isIncome: boolean | null;
    };

    let rows: CategoryRow[];
    let totalIncome: number;
    let totalExpenses: number;

    if (accountTypeList.length > 0) {
      const aggRows = await db
        .select({
          categoryId: transactions.categoryId,
          categoryName: categories.name,
          categoryColor: categories.color,
          isIncome: categories.isIncome,
          amount: sql<string>`SUM(ABS(${transactions.amount}))`,
          transactionCount: sql<number>`COUNT(*)`,
        })
        .from(transactions)
        .innerJoin(accounts, eq(transactions.accountId, accounts.id))
        .innerJoin(categories, eq(transactions.categoryId, categories.id))
        .where(
          and(
            eq(transactions.userId, session.user.id),
            gte(transactions.date, `${startYearMonth}-01`),
            lte(transactions.date, getEndDateString(endYearMonth)),
            eq(categories.excludeFromReports, false),
            inArray(accounts.type, accountTypeList),
            eq(transactions.ignored, false),
          )
        )
        .groupBy(transactions.categoryId, categories.name, categories.color, categories.isIncome);

      rows = aggRows.map((r) => ({
        categoryId: r.categoryId ?? '',
        amount: typeof r.amount === 'string' ? r.amount : String(r.amount ?? '0'),
        transactionCount: typeof r.transactionCount === 'number' ? r.transactionCount : parseInt(String(r.transactionCount ?? '0'), 10),
        categoryName: r.categoryName,
        categoryColor: r.categoryColor,
        isIncome: r.isIncome,
      }));
    } else {
      const summaries = await db
        .select({
          categoryId: categorySpendingSummary.categoryId,
          amount: sql<string>`SUM(${categorySpendingSummary.amount})`,
          transactionCount: sql<number>`SUM(${categorySpendingSummary.transactionCount})`,
          categoryName: categories.name,
          categoryColor: categories.color,
          isIncome: categories.isIncome,
        })
        .from(categorySpendingSummary)
        .innerJoin(categories, eq(categorySpendingSummary.categoryId, categories.id))
        .where(
          and(
            eq(categorySpendingSummary.userId, session.user.id),
            gte(categorySpendingSummary.yearMonth, startYearMonth),
            lte(categorySpendingSummary.yearMonth, endYearMonth),
            eq(categories.excludeFromReports, false),
          )
        )
        .groupBy(categorySpendingSummary.categoryId, categories.name, categories.color, categories.isIncome);

      rows = summaries.map((r) => ({
        categoryId: r.categoryId,
        amount: typeof r.amount === 'string' ? r.amount : String(r.amount ?? '0'),
        transactionCount: typeof r.transactionCount === 'number' ? r.transactionCount : parseInt(String(r.transactionCount ?? '0'), 10),
        categoryName: r.categoryName,
        categoryColor: r.categoryColor,
        isIncome: r.isIncome,
      }));
    }

    const parsedRows = rows.map((r) => ({
      ...r,
      amount: parseFloat(r.amount),
    }));

    const incomeRows = parsedRows.filter((r) => r.isIncome && r.amount > 0);
    const expenseRows = parsedRows.filter((r) => !r.isIncome && r.amount > 0);

    totalIncome = incomeRows.reduce((s, r) => s + r.amount, 0);
    totalExpenses = expenseRows.reduce((s, r) => s + r.amount, 0);

    let usedFallback = false;

    if (totalIncome === 0 && totalExpenses === 0) {
      const summaryRows = await db
        .select({
          totalIncome: monthlyCashFlow.totalIncome,
          totalExpenses: monthlyCashFlow.totalExpenses,
        })
        .from(monthlyCashFlow)
        .where(
          and(
            eq(monthlyCashFlow.userId, session.user.id),
            gte(monthlyCashFlow.yearMonth, startYearMonth),
            lte(monthlyCashFlow.yearMonth, endYearMonth),
          )
        );

      if (summaryRows.length > 0) {
        totalIncome = summaryRows.reduce((s, r) => s + parseFloat(r.totalIncome.toString()), 0);
        totalExpenses = summaryRows.reduce((s, r) => s + parseFloat(r.totalExpenses.toString()), 0);
        usedFallback = true;
      }
    }

    const savings = Math.max(0, totalIncome - totalExpenses);
    const savingsRate = totalIncome > 0 ? (savings / totalIncome) * 100 : 0;

    const nodes: Array<{ id: string; nodeColor?: string }> = [];
    const links: Array<{ source: string; target: string; value: number }> = [];

    if (usedFallback) {
      if (totalIncome > 0) nodes.push({ id: 'Income', nodeColor: 'var(--color-chart-2)' });
      if (totalExpenses > 0) nodes.push({ id: 'Expenses', nodeColor: 'var(--color-chart-3)' });
      if (savings > 0) nodes.push({ id: 'Savings', nodeColor: 'var(--color-chart-1)' });
      if (totalExpenses > 0) links.push({ source: 'Income', target: 'Expenses', value: totalExpenses });
      if (savings > 0) links.push({ source: 'Income', target: 'Savings', value: savings });
    } else {
      for (const row of incomeRows) {
        nodes.push({ id: row.categoryName, nodeColor: row.categoryColor || undefined });
      }
      for (const row of expenseRows) {
        nodes.push({ id: row.categoryName, nodeColor: row.categoryColor || undefined });
      }
      if (savings > 0) {
        nodes.push({ id: 'Savings', nodeColor: 'var(--color-chart-1)' });
      }
      if (incomeRows.length > 0) {
        for (const source of incomeRows) {
          if (expenseRows.length > 0) {
            for (const target of expenseRows) {
              const proportion = target.amount / totalExpenses;
              const linkValue = source.amount * proportion;
              if (linkValue > 0) {
                links.push({ source: source.categoryName, target: target.categoryName, value: linkValue });
              }
            }
          }
          const sourceSavings = savings * (source.amount / totalIncome);
          if (sourceSavings > 0) {
            links.push({ source: source.categoryName, target: 'Savings', value: sourceSavings });
          }
        }
      }
    }

    logger.info('GET /api/cash-flow/sankey', { timeframe, period, accountTypes: accountTypeList, totalIncome, totalExpenses, nodes: nodes.length, links: links.length, usedFallback });

    return NextResponse.json({
      nodes,
      links,
      totalIncome,
      totalExpenses,
      savings,
      savingsRate: Math.round(savingsRate * 10) / 10,
    });
  } catch (error) {
    logger.error('Error fetching sankey data', { error });
    return NextResponse.json(
      { error: 'internal_error', message: 'Failed to fetch sankey data' },
      { status: 500 }
    );
  }
}
