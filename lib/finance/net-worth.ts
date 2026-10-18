import { getDb } from '@/lib/db';
import { netWorthSnapshots } from '@/lib/db/schema';
import { eq, and, gte, lte } from 'drizzle-orm';
import { decryptRows } from '@/lib/crypto';
import { computeNetWorthTotals, computeCategoryBreakdown } from '@/lib/utils/account-scope';
import { formatInTimezone } from '@/lib/utils/timeframe';
import type { FinanceContext } from './context';

export interface CurrentNetWorthResult {
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  breakdown: Record<string, { value: number; count: number }>;
  asOfDate: string;
  currency: string;
}

export interface NetWorthSeriesPoint {
  date: string;
  netWorth: number;
  totalAssets: number;
  totalLiabilities: number;
}

export async function getCurrentNetWorth(ctx: FinanceContext): Promise<CurrentNetWorthResult> {
  const accounts = await ctx.getAccounts();
  const userTz = ctx.settings?.timezone || 'America/New_York';
  const baseCurrency = ctx.settings?.currency || 'USD';
  const todayStr = formatInTimezone(ctx.now, userTz);

  const { totalAssets, totalLiabilities, netWorth } = computeNetWorthTotals(accounts, baseCurrency, todayStr);
  const breakdown = computeCategoryBreakdown(accounts, baseCurrency, todayStr);

  return {
    totalAssets,
    totalLiabilities,
    netWorth,
    breakdown,
    asOfDate: todayStr,
    currency: baseCurrency,
  };
}

export async function getNetWorthSeries(
  ctx: FinanceContext,
  options?: { months?: number }
): Promise<NetWorthSeriesPoint[]> {
  const db = getDb();
  const months = options?.months ?? 24;
  const now = ctx.now;
  const startDate = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);
  const startStr = startDate.toISOString().split('T')[0];
  const userTz = ctx.settings?.timezone || 'America/New_York';
  const todayStr = formatInTimezone(now, userTz);

  const snapshots = await db
    .select({
      snapshotDate: netWorthSnapshots.snapshotDate,
      totalAssets: netWorthSnapshots.totalAssets,
      totalLiabilities: netWorthSnapshots.totalLiabilities,
      netWorth: netWorthSnapshots.netWorth,
    })
    .from(netWorthSnapshots)
    .where(
      and(
        eq(netWorthSnapshots.userId, ctx.dataUserId),
        gte(netWorthSnapshots.snapshotDate, startStr),
        lte(netWorthSnapshots.snapshotDate, todayStr)
      )
    )
    .orderBy(netWorthSnapshots.snapshotDate);

  const decrypted = await decryptRows('net_worth_snapshots', snapshots, ctx.dek);

  const formattedData: NetWorthSeriesPoint[] = decrypted.map((s) => ({
    date: s.snapshotDate,
    netWorth: parseFloat(s.netWorth) || 0,
    totalAssets: parseFloat(s.totalAssets) || 0,
    totalLiabilities: parseFloat(s.totalLiabilities) || 0,
  }));

  // Append live net worth for today if in range
  if (todayStr >= startStr) {
    const live = await getCurrentNetWorth(ctx);
    const lastPoint = formattedData[formattedData.length - 1];
    if (lastPoint && lastPoint.date === todayStr) {
      lastPoint.netWorth = live.netWorth;
      lastPoint.totalAssets = live.totalAssets;
      lastPoint.totalLiabilities = live.totalLiabilities;
    } else if (!lastPoint || lastPoint.date < todayStr) {
      formattedData.push({
        date: todayStr,
        netWorth: live.netWorth,
        totalAssets: live.totalAssets,
        totalLiabilities: live.totalLiabilities,
      });
    }
  }

  return formattedData;
}
