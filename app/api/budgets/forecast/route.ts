import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { accounts, budgets, categories, transactions, userSettings, accountSnapshots } from '@/lib/db/schema';
import { eq, and, sql, inArray, desc } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptField, decryptRow, decryptRows } from '@/lib/crypto';

function normalizeToMonthly(amount: number, periodType: string): number {
  if (periodType === 'quarterly') return amount / 3;
  if (periodType === 'yearly') return amount / 12;
  return amount;
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const userId = session.user.id;
  const dek = await getSessionDEK();
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

    const decryptedAccounts = await decryptRows('accounts', userAccounts, dek);

    const accountType = searchParams.get('accountType') || 'banking';
    const accountIdsParam = searchParams.get('accountIds');

    let fundingAccounts = decryptedAccounts;
    if (accountIdsParam) {
      const ids = accountIdsParam.split(',').filter(Boolean);
      fundingAccounts = fundingAccounts.filter((a: any) => ids.includes(a.id));
    } else if (accountType === 'banking') {
      fundingAccounts = fundingAccounts.filter((a: any) => ['checking', 'savings'].includes(a.type));
    } else if (accountType === 'cash') {
      fundingAccounts = fundingAccounts.filter((a: any) => ['checking', 'savings'].includes(a.type));
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

    // Decrypt budget amounts
    const decryptedBudgetRows = await Promise.all(budgetRows.map(async (b) => ({
      ...b,
      amount: await decryptField(b.amount, dek),
    })));

    // ── Fetch transactions for historical analysis ─────────────────────
    const fundingAccountIds = fundingAccounts.map((a: any) => a.id);
    const allTxns = await db
      .select({ amount: transactions.amount, accountId: transactions.accountId, categoryId: transactions.categoryId })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          sql`${transactions.date} >= CURRENT_DATE - make_interval(months => ${lookbackMonths})`,
          inArray(transactions.accountId, fundingAccountIds),
        )
      );

    // Decrypt all transaction amounts and categorize
    const incomeByAccount = new Map<string, number[]>();
    const expenseByAccount = new Map<string, number[]>();
    const expenseByAccountAndCategory = new Map<string, Map<string, number[]>>();

    for (const txn of allTxns) {
      const amount = parseFloat(await decryptField(txn.amount, dek));
      const accId = txn.accountId;

      if (amount > 0) {
        if (!incomeByAccount.has(accId)) incomeByAccount.set(accId, []);
        incomeByAccount.get(accId)!.push(amount);
      } else {
        const absAmt = Math.abs(amount);
        if (!expenseByAccount.has(accId)) expenseByAccount.set(accId, []);
        expenseByAccount.get(accId)!.push(absAmt);

        if (txn.categoryId) {
          if (!expenseByAccountAndCategory.has(accId)) expenseByAccountAndCategory.set(accId, new Map());
          if (!expenseByAccountAndCategory.get(accId)!.has(txn.categoryId)) {
            expenseByAccountAndCategory.get(accId)!.set(txn.categoryId, []);
          }
          expenseByAccountAndCategory.get(accId)!.get(txn.categoryId)!.push(absAmt);
        }
      }
    }

    const avgMonthlyIncome = new Map<string, number>();
    for (const [accId, amounts] of incomeByAccount) {
      const total = amounts.reduce((s, a) => s + a, 0);
      avgMonthlyIncome.set(accId, total / lookbackMonths);
    }

    const avgMonthlyExpense = new Map<string, number>();
    for (const [accId, amounts] of expenseByAccount) {
      const total = amounts.reduce((s, a) => s + a, 0);
      avgMonthlyExpense.set(accId, total / lookbackMonths);
    }

    const categoryExpenseByAccount = new Map<string, Map<string, number>>();
    for (const [accId, catMap] of expenseByAccountAndCategory) {
      const result = new Map<string, number>();
      for (const [catId, amounts] of catMap) {
        result.set(catId, amounts.reduce((s, a) => s + a, 0) / lookbackMonths);
      }
      categoryExpenseByAccount.set(accId, result);
    }

    const budgetedCategoriesByAccount = new Map<string, Set<string>>();
    for (const b of decryptedBudgetRows) {
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

      const accountProjections = fundingAccounts.map((acc: any) => {
        let estInflows: number;
        let budgetedOutflows: number;

        if (forecastMode === 'historical') {
          estInflows = avgMonthlyIncome.get(acc.id) || 0;
          budgetedOutflows = avgMonthlyExpense.get(acc.id) || 0;
        } else if (forecastMode === 'budget') {
          estInflows = decryptedBudgetRows
            .filter((b: any) => b.fundingAccountId === acc.id && b.isIncome)
            .reduce((sum: number, b: any) => sum + normalizeToMonthly(parseFloat(b.amount), b.periodType), 0);
          budgetedOutflows = decryptedBudgetRows
            .filter((b: any) => b.fundingAccountId === acc.id && !b.isIncome)
            .reduce((sum: number, b: any) => sum + normalizeToMonthly(parseFloat(b.amount), b.periodType), 0);
        } else {
          estInflows = avgMonthlyIncome.get(acc.id) || 0;

          const budgetedCats = budgetedCategoriesByAccount.get(acc.id) || new Set();
          const historicalCats = categoryExpenseByAccount.get(acc.id) || new Map();

          const budgetedPart = decryptedBudgetRows
            .filter((b: any) => b.fundingAccountId === acc.id && !b.isIncome)
            .reduce((sum: number, b: any) => sum + normalizeToMonthly(parseFloat(b.amount), b.periodType), 0);

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
          ? parseFloat(fundingAccounts.find((a: any) => a.id === proj.accountId)?.balance || '0')
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
          inArray(accountSnapshots.accountId, fundingAccountIds),
        )
      )
      .orderBy(accountSnapshots.snapshotDate);

    // Decrypt snapshot balances
    const decryptedSnapshots = await Promise.all(snapshotRows.map(async (snap) => ({
      ...snap,
      balance: parseFloat(await decryptField(snap.balance, dek)),
    })));

    // Group snapshots by account and month (take last snapshot per month)
    const historicalByMonth = new Map<string, Map<string, number>>();
    for (const snap of decryptedSnapshots) {
      const ym = snap.snapshotDate.substring(0, 7);
      if (!historicalByMonth.has(snap.accountId)) {
        historicalByMonth.set(snap.accountId, new Map());
      }
      historicalByMonth.get(snap.accountId)!.set(ym, snap.balance);
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
      accounts: fundingAccounts.map((a: any) => ({
        id: a.id,
        name: a.name,
        balance: parseFloat(a.balance),
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