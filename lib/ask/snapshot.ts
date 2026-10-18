import { getDb } from '@/lib/db';
import {
  budgets,
  financialGoals,
  plaidConnections,
  simplifinConnections,
  transactions,
} from '@/lib/db/schema';
import { eq, and, sql, isNull, gte } from 'drizzle-orm';
import { decryptRows } from '@/lib/crypto';
import { getCached, setCached } from '@/lib/server-cache';
import { getCurrentNetWorth, getNetWorthSeries } from '@/lib/finance/net-worth';
import { getMonthlyCashFlow } from '@/lib/finance/cash-flow';
import { getCategorySpending } from '@/lib/finance/categories';
import { getRecurringSummary } from '@/lib/services/recurring-detection';
import { loadEnginePlan } from '@/lib/services/retirement-plans';
import { runRetirementSimulation } from '@/lib/services/retirement-engine';
import { formatInTimezone } from '@/lib/utils/timeframe';
import { ASK_CONFIG, estimateTokens } from './config';
import { formatDollar, formatPercent } from './redact';
import type { FinanceContext } from '@/lib/finance/context';

export interface SnapshotData {
  asOfDate: string;
  currency: string;
  lastSyncAt: string | null;
  uncategorized90dCount: number;
  total90dCount: number;
  uncategorizedPct: number;
  netWorthNow: number;
  netWorth1mChange: number | null;
  netWorth3mChange: number | null;
  netWorth12mChange: number | null;
  totalAssets: number;
  totalLiabilities: number;
  assetBreakdown: Record<string, number>;
  liabilityBreakdown: Record<string, number>;
  lastFullMonth: {
    yearMonth: string;
    income: number;
    expenses: number;
    net: number;
    savingsRate: number;
  } | null;
  trailing3m: {
    incomeAvg: number;
    expensesAvg: number;
    netAvg: number;
    savingsRate: number;
  } | null;
  trailing12m: {
    incomeAvg: number;
    expensesAvg: number;
    netAvg: number;
    savingsRate: number;
  } | null;
  topCategories: Array<{
    name: string;
    avg12m: number;
    avg3m: number;
    delta3mVs12m: number;
  }>;
  recurring: {
    monthlyTotal: number;
    count: number;
  };
  emergencyFundMonths: number | null;
  goals: {
    count: number;
    totalTarget: number;
    totalCurrent: number;
    fundedPct: number;
  };
  fireHeadline: {
    planName: string;
    plannedRetirementAge: number;
    fiNumber: number;
    investableAssets: number;
    pctToFi: number;
    projectedFiAge: number | null;
    success: boolean;
    depletionAge: number | null;
    endingNetWorth: number;
  } | null;
  gaps: string[];
}

export async function buildSnapshotData(ctx: FinanceContext): Promise<SnapshotData> {
  const db = getDb();
  const userTz = ctx.settings?.timezone || 'America/New_York';
  const currency = ctx.settings?.currency || 'USD';
  const asOfDate = formatInTimezone(ctx.now, userTz);
  const gaps: string[] = [];

  // 1. Sync & Uncategorized count
  const [sConns, pConns] = await Promise.all([
    db
      .select({
        lastSyncAt: simplifinConnections.lastSyncAt,
        status: simplifinConnections.lastSyncStatus,
      })
      .from(simplifinConnections)
      .where(eq(simplifinConnections.userId, ctx.dataUserId)),
    db
      .select({
        lastSyncAt: plaidConnections.lastSyncAt,
        status: plaidConnections.lastSyncStatus,
      })
      .from(plaidConnections)
      .where(eq(plaidConnections.userId, ctx.dataUserId)),
  ]);

  const allSyncTimes = [...sConns, ...pConns]
    .map((c) => (c.lastSyncAt ? new Date(c.lastSyncAt).getTime() : 0))
    .filter((t) => t > 0);

  const lastSyncTimestamp = allSyncTimes.length > 0 ? Math.max(...allSyncTimes) : null;
  const lastSyncAt = lastSyncTimestamp ? new Date(lastSyncTimestamp).toISOString().split('T')[0] : null;

  if (sConns.length === 0 && pConns.length === 0) {
    gaps.push('No linked bank connections (Plaid/SimpleFIN)');
  }

  const ninetyDaysAgo = new Date(ctx.now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const ninetyDaysStr = ninetyDaysAgo.toISOString().split('T')[0];

  const [txCounts] = await db
    .select({
      total: sql<number>`count(*)`,
      uncategorized: sql<number>`count(*) filter (where ${isNull(transactions.categoryId)})`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, ctx.dataUserId),
        eq(transactions.deleted, false),
        gte(transactions.date, ninetyDaysStr)
      )
    );

  const total90dCount = Number(txCounts?.total ?? 0);
  const uncategorized90dCount = Number(txCounts?.uncategorized ?? 0);
  const uncategorizedPct = total90dCount > 0 ? (uncategorized90dCount / total90dCount) * 100 : 0;

  // 2. Net worth now and history
  const [liveNw, nwHistory] = await Promise.all([
    getCurrentNetWorth(ctx),
    getNetWorthSeries(ctx, { months: 14 }),
  ]);

  const assetBreakdown: Record<string, number> = {};
  const liabilityBreakdown: Record<string, number> = {};
  for (const [group, data] of Object.entries(liveNw.breakdown)) {
    if (data.value >= 0) {
      assetBreakdown[group] = data.value;
    } else {
      liabilityBreakdown[group] = Math.abs(data.value);
    }
  }

  // Calculate change over 1 / 3 / 12 months
  const curNw = liveNw.netWorth;
  const findNwMonthsAgo = (monthsAgo: number): number | null => {
    const targetDate = new Date(ctx.now.getFullYear(), ctx.now.getMonth() - monthsAgo, 1);
    const targetStr = targetDate.toISOString().split('T')[0].substring(0, 7);
    for (let i = nwHistory.length - 1; i >= 0; i--) {
      if (nwHistory[i].date.startsWith(targetStr)) {
        return nwHistory[i].netWorth;
      }
    }
    return null;
  };

  const nw1m = findNwMonthsAgo(1);
  const nw3m = findNwMonthsAgo(3);
  const nw12m = findNwMonthsAgo(12);

  const netWorth1mChange = nw1m !== null ? curNw - nw1m : null;
  const netWorth3mChange = nw3m !== null ? curNw - nw3m : null;
  const netWorth12mChange = nw12m !== null ? curNw - nw12m : null;

  // 3. Cash Flow (last full month + trailing 3m + trailing 12m)
  const currentYm = `${ctx.now.getFullYear()}-${String(ctx.now.getMonth() + 1).padStart(2, '0')}`;
  const monthlyFlows = await getMonthlyCashFlow(ctx, 14);
  // Exclude current incomplete month for trailing averages
  const completedFlows = monthlyFlows.filter((f) => f.yearMonth < currentYm);

  let lastFullMonth: SnapshotData['lastFullMonth'] = null;
  let trailing3m: SnapshotData['trailing3m'] = null;
  let trailing12m: SnapshotData['trailing12m'] = null;

  if (completedFlows.length > 0) {
    const last = completedFlows[completedFlows.length - 1];
    const sRate = last.income > 0 ? Math.max(0, (last.netCashFlow / last.income) * 100) : 0;
    lastFullMonth = {
      yearMonth: last.yearMonth,
      income: last.income,
      expenses: last.expenses,
      net: last.netCashFlow,
      savingsRate: sRate,
    };

    const last3 = completedFlows.slice(-3);
    const sumInc3 = last3.reduce((acc, f) => acc + f.income, 0);
    const sumExp3 = last3.reduce((acc, f) => acc + f.expenses, 0);
    const sumNet3 = last3.reduce((acc, f) => acc + f.netCashFlow, 0);
    const avgInc3 = sumInc3 / last3.length;
    const avgExp3 = sumExp3 / last3.length;
    const avgNet3 = sumNet3 / last3.length;
    trailing3m = {
      incomeAvg: avgInc3,
      expensesAvg: avgExp3,
      netAvg: avgNet3,
      savingsRate: avgInc3 > 0 ? Math.max(0, (avgNet3 / avgInc3) * 100) : 0,
    };

    const last12 = completedFlows.slice(-12);
    const sumInc12 = last12.reduce((acc, f) => acc + f.income, 0);
    const sumExp12 = last12.reduce((acc, f) => acc + f.expenses, 0);
    const sumNet12 = last12.reduce((acc, f) => acc + f.netCashFlow, 0);
    const avgInc12 = sumInc12 / last12.length;
    const avgExp12 = sumExp12 / last12.length;
    const avgNet12 = sumNet12 / last12.length;
    trailing12m = {
      incomeAvg: avgInc12,
      expensesAvg: avgExp12,
      netAvg: avgNet12,
      savingsRate: avgInc12 > 0 ? Math.max(0, (avgNet12 / avgInc12) * 100) : 0,
    };
  } else {
    gaps.push('No completed monthly cash flow history');
  }

  // 4. Top 5 expense categories (12m monthly average vs 3m average)
  let topCategories: SnapshotData['topCategories'] = [];
  if (completedFlows.length > 0) {
    const start12Date = new Date(ctx.now.getFullYear(), ctx.now.getMonth() - 12, 1);
    const start3Date = new Date(ctx.now.getFullYear(), ctx.now.getMonth() - 3, 1);
    const endLastDate = new Date(ctx.now.getFullYear(), ctx.now.getMonth(), 0);

    const start12Str = `${start12Date.getFullYear()}-${String(start12Date.getMonth() + 1).padStart(2, '0')}`;
    const start3Str = `${start3Date.getFullYear()}-${String(start3Date.getMonth() + 1).padStart(2, '0')}`;
    const endLastStr = `${endLastDate.getFullYear()}-${String(endLastDate.getMonth() + 1).padStart(2, '0')}`;

    const [spending12m, spending3m] = await Promise.all([
      getCategorySpending(ctx, { startMonth: start12Str, endMonth: endLastStr, groupBy: 'total' }),
      getCategorySpending(ctx, { startMonth: start3Str, endMonth: endLastStr, groupBy: 'total' }),
    ]);

    const spending3mMap = new Map(spending3m.map((c) => [c.categoryId, c.amount / 3]));
    const monthsCount = Math.min(12, Math.max(1, completedFlows.length));

    topCategories = spending12m.slice(0, 5).map((c) => {
      const avg12m = c.amount / monthsCount;
      const avg3m = spending3mMap.get(c.categoryId) ?? 0;
      return {
        name: c.name,
        avg12m,
        avg3m,
        delta3mVs12m: avg3m - avg12m,
      };
    });
  }

  // 5. Fixed obligations (recurring)
  let recurringData = { monthlyTotal: 0, count: 0 };
  try {
    const recSummary = await getRecurringSummary(ctx.dataUserId, ctx.dek);
    recurringData = {
      monthlyTotal: recSummary.monthlyExpenses,
      count: recSummary.expenseCount,
    };
  } catch {
    // If recurring service fails or table is empty
  }
  if (recurringData.count === 0) {
    gaps.push('No recurring subscriptions or obligations detected');
  }

  // 6. Emergency Fund Months
  const liquidCash = Object.entries(assetBreakdown)
    .filter(([group]) => {
      const g = group.toLowerCase();
      return g.includes('cash') || g.includes('checking') || g.includes('savings');
    })
    .reduce((sum, [, val]) => sum + val, 0);

  const avg3mExpenses = trailing3m?.expensesAvg ?? trailing12m?.expensesAvg ?? 0;
  const emergencyFundMonths = avg3mExpenses > 0 ? liquidCash / avg3mExpenses : null;

  // 7. Goals & Budgets
  const [goalsList, budgetRows] = await Promise.all([
    db.select().from(financialGoals).where(eq(financialGoals.userId, ctx.dataUserId)),
    db.select({ id: budgets.id }).from(budgets).where(eq(budgets.userId, ctx.dataUserId)).limit(1),
  ]);

  const decGoals = await decryptRows('financial_goals', goalsList, ctx.dek);
  const activeGoals = decGoals.filter((g) => g.status === 'active');
  const totalTarget = activeGoals.reduce((sum, g) => sum + (parseFloat(g.targetAmount) || 0), 0);
  const totalCurrent = activeGoals.reduce((sum, g) => sum + (parseFloat(g.currentAmount) || 0), 0);
  const goalsFundedPct = totalTarget > 0 ? (totalCurrent / totalTarget) * 100 : 0;

  const goalsData = {
    count: activeGoals.length,
    totalTarget,
    totalCurrent,
    fundedPct: goalsFundedPct,
  };

  if (activeGoals.length === 0) {
    gaps.push('No active savings goals configured');
  }
  if (budgetRows.length === 0) {
    gaps.push('No monthly budgets configured');
  }

  // 8. FIRE Headline (default plan, read-only without persisting migration)
  let fireHeadline: SnapshotData['fireHeadline'] = null;
  try {
    const loaded = await loadEnginePlan(ctx, undefined, { persistMigration: false });
    if (loaded?.enginePlan) {
      const { planMeta, enginePlan } = loaded;
      const sim = runRetirementSimulation(enginePlan);
      const plannedAnnualExpenses =
        sim.yearlyResults[0]?.livingExpenses || 60000;
      const fiMultiplier = planMeta.fiTargetMultiplier || 25;
      const fiNumber = fiMultiplier * plannedAnnualExpenses;

      const eligibleAccounts = (enginePlan.accounts || []).filter(
        (a: any) => a.isIncluded !== false
      );
      const investableAssets = eligibleAccounts.reduce(
        (sum: number, a: any) => sum + (a.balance || 0),
        0
      );
      const pctToFi = fiNumber > 0 ? (investableAssets / fiNumber) * 100 : 0;

      let projectedFiAge: number | null = null;
      for (const res of sim.yearlyResults) {
        if (res.liquidNetWorth >= fiNumber) {
          projectedFiAge = res.primaryAge;
          break;
        }
      }

      fireHeadline = {
        planName: planMeta.name || 'Default Plan',
        plannedRetirementAge: enginePlan.retirementAge,
        fiNumber,
        investableAssets,
        pctToFi,
        projectedFiAge,
        success: sim.success,
        depletionAge: sim.depletionAge ?? null,
        endingNetWorth: sim.endingNetWorth,
      };
    } else {
      gaps.push('No retirement / FIRE plan configured');
    }
  } catch {
    gaps.push('No retirement / FIRE plan configured');
  }

  return {
    asOfDate,
    currency,
    lastSyncAt,
    uncategorized90dCount,
    total90dCount,
    uncategorizedPct,
    netWorthNow: curNw,
    netWorth1mChange,
    netWorth3mChange,
    netWorth12mChange,
    totalAssets: liveNw.totalAssets,
    totalLiabilities: liveNw.totalLiabilities,
    assetBreakdown,
    liabilityBreakdown,
    lastFullMonth,
    trailing3m,
    trailing12m,
    topCategories,
    recurring: recurringData,
    emergencyFundMonths,
    goals: goalsData,
    fireHeadline,
    gaps,
  };
}

/**
 * Serializes the financial snapshot into compact markdown.
 */
export function formatSnapshotMarkdown(data: SnapshotData): string {
  const lines: string[] = [];

  // 1. Meta / Status
  lines.push(`## Snapshot (as of ${data.asOfDate}, Currency: ${data.currency})`);
  const syncStr = data.lastSyncAt ? `Last sync: ${data.lastSyncAt}` : 'No recent sync';
  let uncategorizedStr = `${data.uncategorized90dCount} uncategorized transactions (last 90d)`;
  if (data.uncategorizedPct > 5) {
    uncategorizedStr += ` ⚠️ ${formatPercent(data.uncategorizedPct)} of all 90d transactions are uncategorized`;
  }
  lines.push(`- Status: ${syncStr}; ${uncategorizedStr}`);

  // 2. Net Worth
  lines.push(`\n### Net Worth: ${formatDollar(data.netWorthNow)} (Assets: ${formatDollar(data.totalAssets)}, Liabilities: ${formatDollar(data.totalLiabilities)})`);
  const changes: string[] = [];
  if (data.netWorth1mChange !== null) changes.push(`1-mo: ${formatDollar(data.netWorth1mChange)}`);
  if (data.netWorth3mChange !== null) changes.push(`3-mo: ${formatDollar(data.netWorth3mChange)}`);
  if (data.netWorth12mChange !== null) changes.push(`12-mo: ${formatDollar(data.netWorth12mChange)}`);
  if (changes.length > 0) {
    lines.push(`- Change: ${changes.join(', ')}`);
  }

  const assetList = Object.entries(data.assetBreakdown)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${k}: ${formatDollar(v)}`)
    .join(' | ');
  if (assetList) lines.push(`- Assets: ${assetList}`);

  const liabilityList = Object.entries(data.liabilityBreakdown)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${k}: ${formatDollar(v)}`)
    .join(' | ');
  if (liabilityList) lines.push(`- Liabilities: ${liabilityList}`);

  // 3. Cash Flow
  lines.push('\n### Cash Flow');
  if (data.lastFullMonth) {
    lines.push(
      `- Last Month (${data.lastFullMonth.yearMonth}): Income ${formatDollar(data.lastFullMonth.income)}, Expenses ${formatDollar(data.lastFullMonth.expenses)}, Net ${formatDollar(data.lastFullMonth.net)}, Savings Rate ${formatPercent(data.lastFullMonth.savingsRate)}`
    );
  }
  if (data.trailing3m) {
    lines.push(
      `- Trailing 3-Mo Avg: Income ${formatDollar(data.trailing3m.incomeAvg)}/mo, Expenses ${formatDollar(data.trailing3m.expensesAvg)}/mo, Net ${formatDollar(data.trailing3m.netAvg)}/mo, Savings Rate ${formatPercent(data.trailing3m.savingsRate)}`
    );
  }
  if (data.trailing12m) {
    lines.push(
      `- Trailing 12-Mo Avg: Income ${formatDollar(data.trailing12m.incomeAvg)}/mo, Expenses ${formatDollar(data.trailing12m.expensesAvg)}/mo, Net ${formatDollar(data.trailing12m.netAvg)}/mo, Savings Rate ${formatPercent(data.trailing12m.savingsRate)}`
    );
  }

  // 4. Top 5 Categories
  if (data.topCategories.length > 0) {
    lines.push('\n### Top Spending Categories (12-Mo Monthly Avg)');
    for (const cat of data.topCategories) {
      const deltaSign = cat.delta3mVs12m >= 0 ? '+' : '';
      lines.push(
        `- ${cat.name}: ${formatDollar(cat.avg12m)}/mo (3-mo avg: ${formatDollar(cat.avg3m)}/mo, delta ${deltaSign}${formatDollar(cat.delta3mVs12m)})`
      );
    }
  }

  // 5. Obligations & Emergency Fund
  lines.push('\n### Obligations & Liquidity');
  const efStr = data.emergencyFundMonths !== null
    ? `${(Math.round(data.emergencyFundMonths * 10) / 10).toFixed(1)} months of expenses`
    : 'N/A';
  lines.push(`- Fixed Recurring Obligations: ${formatDollar(data.recurring.monthlyTotal)}/mo across ${data.recurring.count} items`);
  lines.push(`- Emergency Fund: ${efStr}`);

  // 6. Goals
  lines.push('\n### Goals');
  if (data.goals.count > 0) {
    lines.push(
      `- Active Goals: ${data.goals.count} total, ${formatDollar(data.goals.totalCurrent)} funded of ${formatDollar(data.goals.totalTarget)} (${formatPercent(data.goals.fundedPct)})`
    );
  } else {
    lines.push('- No active goals configured');
  }

  // 7. FIRE Headline
  lines.push('\n### FIRE / Retirement Headline');
  if (data.fireHeadline) {
    const fh = data.fireHeadline;
    const fiAgeStr = fh.projectedFiAge ? `Age ${fh.projectedFiAge}` : 'Not reached in plan';
    const depletionStr = fh.depletionAge ? `Depletion at age ${fh.depletionAge}` : 'No depletion';
    lines.push(`- Plan: ${fh.planName} (Retire at age ${fh.plannedRetirementAge})`);
    lines.push(`- FI Target: ${formatDollar(fh.fiNumber)} | Investable Assets: ${formatDollar(fh.investableAssets)} (${formatPercent(fh.pctToFi)} funded)`);
    lines.push(`- Projected FI Age: ${fiAgeStr}`);
    lines.push(`- Simulation: ${fh.success ? 'Success' : 'Shortfall detected'} (${depletionStr}, Ending NW: ${formatDollar(fh.endingNetWorth)})`);
  } else {
    lines.push('- No retirement plan configured');
  }

  // 8. Gaps
  if (data.gaps.length > 0) {
    lines.push('\n### Missing Data / Gaps');
    for (const gap of data.gaps) {
      lines.push(`- ${gap}`);
    }
  }

  return lines.join('\n');
}

/**
 * Returns the cached snapshot markdown (5-minute TTL per user).
 */
export async function getAskSnapshot(
  ctx: FinanceContext,
  options?: { forceRefresh?: boolean }
): Promise<string> {
  const cacheKey = `user:${ctx.dataUserId}:ask:snapshot:${ctx.userId}`;

  if (!options?.forceRefresh) {
    const cached = getCached<string>(cacheKey);
    if (cached) return cached;
  }

  const data = await buildSnapshotData(ctx);
  let text = formatSnapshotMarkdown(data);

  // Guard token budget
  if (estimateTokens(text) > ASK_CONFIG.SNAPSHOT_BUDGET) {
    // Truncate cleanly if oversized
    text = text.slice(0, ASK_CONFIG.SNAPSHOT_BUDGET * 4);
  }

  setCached(cacheKey, text, ASK_CONFIG.SNAPSHOT_CACHE_TTL_MS);
  return text;
}
