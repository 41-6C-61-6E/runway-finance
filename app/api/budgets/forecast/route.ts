import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { accounts, budgets, categories, transactions, userSettings, accountSnapshots } from '@/lib/db/schema';
import { eq, and, sql, inArray, desc } from 'drizzle-orm';
import { logger } from '@/lib/logger';

function normalizeToMonthly(amount: number, periodType: string): number {
  if (periodType === 'quarterly') return amount / 3;
  if (periodType === 'yearly') return amount / 12;
  return amount;
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const userId = session.user.id;
  const { searchParams } = new URL(request.url);
  const months = parseInt(searchParams.get('months') || '6', 10);

  const db = getDb();

  try {
    // ── Fetch user settings for forecast mode ──────────────────────────
    const settingsRows = await db
      .select({ forecastMode: userSettings.forecastMode, forecastLookbackMonths: userSettings.forecastLookbackMonths })
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);

    // Allow query params to override settings
    const forecastMode = searchParams.get('forecastMode') || settingsRows[0]?.forecastMode || 'hybrid';
    const lookbackMonths = parseInt(searchParams.get('lookbackMonths') || String(settingsRows[0]?.forecastLookbackMonths || 3), 10);

    // ── Fetch accounts with filtering ──────────────────────────────────
    const userAccounts = await db
      .select()
      .from(accounts)
      .where(and(eq(accounts.userId, userId), eq(accounts.isHidden, false)));

    const accountType = searchParams.get('accountType') || 'banking';
    const accountIdsParam = searchParams.get('accountIds');

    let fundingAccounts = userAccounts;
    if (accountIdsParam) {
      const ids = accountIdsParam.split(',').filter(Boolean);
      fundingAccounts = fundingAccounts.filter((a) => ids.includes(a.id));
    } else if (accountType === 'banking') {
      fundingAccounts = fundingAccounts.filter((a) => ['checking', 'savings', 'credit'].includes(a.type));
    } else if (accountType === 'cash') {
      fundingAccounts = fundingAccounts.filter((a) => ['checking', 'savings'].includes(a.type));
    }

    if (fundingAccounts.length === 0) {
      return NextResponse.json({ forecast: [], accounts: [], historical: [] });
    }

    // ── Fetch recurring budgets with funding accounts ──────────────────
    const budgetRows = await db
      .select({
        id: budgets.id,
        amount: budgets.amount,
        periodType: budgets.periodType,
        isRecurring: budgets.isRecurring,
        fundingAccountId: budgets.fundingAccountId,
        categoryId: budgets.categoryId,
        categoryName: categories.name,
        isIncome: categories.isIncome,
      })
      .from(budgets)
      .leftJoin(categories, eq(budgets.categoryId, categories.id))
      .where(
        and(
          eq(budgets.userId, userId),
          sql`${budgets.fundingAccountId} IS NOT NULL`,
          eq(budgets.isRecurring, true),
        )
      );

    // ── Fetch historical income per account over lookback period ───
    const historicalIncomeRows = await db
      .select({
        accountId: transactions.accountId,
        total: sql<string>`SUM(${transactions.amount})`,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          sql`${transactions.date} >= CURRENT_DATE - make_interval(months => ${lookbackMonths})`,
          sql`${transactions.amount} > 0`,
          inArray(transactions.accountId, fundingAccounts.map((a) => a.id)),
        )
      )
      .groupBy(transactions.accountId);

    const avgMonthlyIncome = new Map<string, number>();
    for (const row of historicalIncomeRows) {
      avgMonthlyIncome.set(row.accountId, parseFloat(row.total.toString()) / lookbackMonths);
    }

    // ── Fetch historical expenses per account over lookback period ─────
    const historicalExpenseRows = await db
      .select({
        accountId: transactions.accountId,
        total: sql<string>`SUM(ABS(${transactions.amount}))`,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          sql`${transactions.date} >= CURRENT_DATE - make_interval(months => ${lookbackMonths})`,
          sql`${transactions.amount} < 0`,
          inArray(transactions.accountId, fundingAccounts.map((a) => a.id)),
        )
      )
      .groupBy(transactions.accountId);

    const avgMonthlyExpense = new Map<string, number>();
    for (const row of historicalExpenseRows) {
      avgMonthlyExpense.set(row.accountId, parseFloat(row.total.toString()) / lookbackMonths);
    }

    // ── Fetch historical expenses per category+account (for hybrid) ────
    const historicalCategoryExpenseRows = await db
      .select({
        accountId: transactions.accountId,
        categoryId: transactions.categoryId,
        total: sql<string>`SUM(ABS(${transactions.amount}))`,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          sql`${transactions.date} >= CURRENT_DATE - make_interval(months => ${lookbackMonths})`,
          sql`${transactions.amount} < 0`,
          sql`${transactions.categoryId} IS NOT NULL`,
          inArray(transactions.accountId, fundingAccounts.map((a) => a.id)),
        )
      )
      .groupBy(transactions.accountId, transactions.categoryId);

    const categoryExpenseByAccount = new Map<string, Map<string, number>>();
    for (const row of historicalCategoryExpenseRows) {
      const catId = row.categoryId;
      if (!catId) continue;
      if (!categoryExpenseByAccount.has(row.accountId)) {
        categoryExpenseByAccount.set(row.accountId, new Map());
      }
      categoryExpenseByAccount.get(row.accountId)!.set(catId, parseFloat(row.total.toString()) / lookbackMonths);
    }

    const budgetedCategoriesByAccount = new Map<string, Set<string>>();
    for (const b of budgetRows) {
      if (!b.fundingAccountId || !b.categoryId) continue;
      if (!budgetedCategoriesByAccount.has(b.fundingAccountId)) {
        budgetedCategoriesByAccount.set(b.fundingAccountId, new Set());
      }
      budgetedCategoriesByAccount.get(b.fundingAccountId)!.add(b.categoryId);
    }

    const now = new Date();

    // ── Forecast projections ───────────────────────────────────────────
    const forecastMonths: Array<{
      month: string;
      label: string;
      accounts: Array<{
        accountId: string;
        accountName: string;
        startingBalance: number;
        projectedBalance: number;
        inflows: number;
        outflows: number;
      }>;
    }> = [];

    for (let i = 0; i < months; i++) {
      const forecastDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const ym = `${forecastDate.getFullYear()}-${String(forecastDate.getMonth() + 1).padStart(2, '0')}`;
      const label = forecastDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

      const accountProjections = fundingAccounts.map((acc) => {
        let estInflows: number;
        let budgetedOutflows: number;

        if (forecastMode === 'historical') {
          estInflows = avgMonthlyIncome.get(acc.id) || 0;
          budgetedOutflows = avgMonthlyExpense.get(acc.id) || 0;
        } else if (forecastMode === 'budget') {
          estInflows = budgetRows
            .filter((b) => b.fundingAccountId === acc.id && b.isIncome)
            .reduce((sum, b) => sum + normalizeToMonthly(parseFloat(b.amount.toString()), b.periodType), 0);
          budgetedOutflows = budgetRows
            .filter((b) => b.fundingAccountId === acc.id && !b.isIncome)
            .reduce((sum, b) => sum + normalizeToMonthly(parseFloat(b.amount.toString()), b.periodType), 0);
        } else {
          // Hybrid: inflows from actuals, outflows from budget where exists, historical otherwise
          estInflows = avgMonthlyIncome.get(acc.id) || 0;

          const budgetedCats = budgetedCategoriesByAccount.get(acc.id) || new Set();
          const historicalCats = categoryExpenseByAccount.get(acc.id) || new Map();

          const budgetedPart = budgetRows
            .filter((b) => b.fundingAccountId === acc.id && !b.isIncome)
            .reduce((sum, b) => sum + normalizeToMonthly(parseFloat(b.amount.toString()), b.periodType), 0);

          const historicalPart = Array.from(historicalCats.entries())
            .filter(([catId]) => !budgetedCats.has(catId))
            .reduce((sum, [, avgAmt]) => sum + avgAmt, 0);

          const totalHistorical = avgMonthlyExpense.get(acc.id) || 0;
          const totalBudgetedHistorical = Array.from(historicalCats.entries())
            .filter(([catId]) => budgetedCats.has(catId))
            .reduce((sum, [, avgAmt]) => sum + avgAmt, 0);
          const uncategorizedHistorical = Math.max(0, totalHistorical - totalBudgetedHistorical);

          budgetedOutflows = budgetedPart + historicalPart + uncategorizedHistorical;
        }

        return {
          accountId: acc.id,
          accountName: acc.name,
          startingBalance: 0,
          projectedBalance: 0,
          inflows: estInflows,
          outflows: budgetedOutflows,
        };
      });

      for (const proj of accountProjections) {
        proj.startingBalance = i === 0
          ? parseFloat(fundingAccounts.find((a) => a.id === proj.accountId)?.balance.toString() || '0')
          : forecastMonths[i - 1].accounts.find((a) => a.accountId === proj.accountId)?.projectedBalance || 0;
        proj.projectedBalance = proj.startingBalance + proj.inflows - proj.outflows;
      }

      forecastMonths.push({
        month: ym,
        label,
        accounts: accountProjections,
      });
    }

    // ── Fetch historical snapshots for chart ────────────────────────────
    const snapshotStart = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    const snapshotStartStr = snapshotStart.toISOString().split('T')[0];
    const snapshotRows = await db
      .select()
      .from(accountSnapshots)
      .where(
        and(
          eq(accountSnapshots.userId, userId),
          sql`${accountSnapshots.snapshotDate} >= ${snapshotStartStr}`,
          inArray(accountSnapshots.accountId, fundingAccounts.map((a) => a.id)),
        )
      )
      .orderBy(accountSnapshots.snapshotDate);

    // Group snapshots by account and month (take last snapshot per month)
    const historicalByMonth = new Map<string, Map<string, number>>();
    for (const snap of snapshotRows) {
      const ym = snap.snapshotDate.substring(0, 7);
      if (!historicalByMonth.has(snap.accountId)) {
        historicalByMonth.set(snap.accountId, new Map());
      }
      historicalByMonth.get(snap.accountId)!.set(ym, parseFloat(snap.balance.toString()));
    }

    // Build chart data: historical (solid) + projected (dashed)
    const chartData: Array<{
      id: string;
      data: Array<{ x: string; y: number }>;
    }> = [];

    for (const acc of fundingAccounts) {
      const accountHistorical = historicalByMonth.get(acc.id) || new Map();
      const historicalPoints: Array<{ x: string; y: number }> = [];
      const projectedPoints: Array<{ x: string; y: number }> = [];

      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const bal = accountHistorical.get(ym);
        if (bal !== undefined) {
          historicalPoints.push({ x: ym, y: bal });
        }
      }

      for (const fm of forecastMonths) {
        const proj = fm.accounts.find((a) => a.accountId === acc.id);
        if (proj) {
          projectedPoints.push({ x: fm.month, y: proj.projectedBalance });
        }
      }

      if (historicalPoints.length > 0) {
        chartData.push({ id: `${acc.name} (Actual)`, data: historicalPoints });
      }
      if (projectedPoints.length > 0) {
        chartData.push({ id: `${acc.name} (Projected)`, data: projectedPoints });
      }
    }

    return NextResponse.json({
      forecast: forecastMonths,
      accounts: fundingAccounts.map((a) => ({
        id: a.id,
        name: a.name,
        balance: parseFloat(a.balance.toString()),
        type: a.type,
      })),
      historical: chartData,
      config: {
        forecastMode,
        lookbackMonths,
        accountType,
      },
    });
  } catch (error) {
    logger.error('Error generating forecast', { error });
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}