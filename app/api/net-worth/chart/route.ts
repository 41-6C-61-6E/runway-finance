import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { accounts, netWorthSnapshots, userSettings } from '@/lib/db/schema';
import { eq, and, gte, lte, notInArray } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { getHiddenAccountIdsForUser } from '@/lib/data-visibility';
import { aggregateChartData, AggregatablePoint } from '@/lib/utils/chart-aggregation';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptRows } from '@/lib/crypto';
import { filterReportableAccounts, computeNetWorthTotals, computeCategoryBreakdown } from '@/lib/utils/account-scope';
import { getDateRange, type TimeFrame, formatInTimezone } from '@/lib/utils/timeframe';


export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: 'unauthenticated', message: 'Authentication required' },
      { status: 401 }
    );
  }

  const userId = session.user.id;
  const dataUserId = (session.user as any).dataUserId ?? session.user.id;
  const dek = await getSessionDEK();
  const { searchParams } = new URL(request.url);
  const timeframe = (searchParams.get('timeframe') as TimeFrame) || '1y';
  const explicitStart = searchParams.get('startDate');
  const explicitEnd = searchParams.get('endDate');

  const userSettingsList = await getDb()
    .select({ timezone: userSettings.timezone, currency: userSettings.currency })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);
  const userTz = userSettingsList[0]?.timezone || 'America/New_York';
  const baseCurrency = userSettingsList[0]?.currency || 'USD';

  // Sensitive accounts are excluded from live balance math for plain members.
  const hiddenAccountIds = await getHiddenAccountIdsForUser(userId, dataUserId);
  const accountsWhere = hiddenAccountIds.length > 0
    ? and(eq(accounts.userId, dataUserId), notInArray(accounts.id, hiddenAccountIds))
    : eq(accounts.userId, dataUserId);

  let [startDate, endDate] = getDateRange(timeframe);
  if (explicitStart && explicitEnd) {
    startDate = new Date(explicitStart + 'T00:00:00Z');
    endDate = new Date(explicitEnd + 'T00:00:00Z');
  } else if (timeframe === 'all') {
    const earliestSnap = await getDb()
      .select({ snapshotDate: netWorthSnapshots.snapshotDate })
      .from(netWorthSnapshots)
      .where(eq(netWorthSnapshots.userId, dataUserId))
      .orderBy(netWorthSnapshots.snapshotDate)
      .limit(1);
    if (earliestSnap.length > 0 && earliestSnap[0].snapshotDate) {
      startDate = new Date(earliestSnap[0].snapshotDate + 'T00:00:00Z');
    } else {
      startDate = new Date();
      startDate.setFullYear(startDate.getFullYear() - 1);
    }
  }

  try {
    // Query pre-computed net worth snapshots (single row per day, already aggregated)
    const snapshots = await getDb()
      .select({
        snapshotDate: netWorthSnapshots.snapshotDate,
        totalAssets: netWorthSnapshots.totalAssets,
        totalLiabilities: netWorthSnapshots.totalLiabilities,
        netWorth: netWorthSnapshots.netWorth,
      })
      .from(netWorthSnapshots)
      .where(
        and(
          eq(netWorthSnapshots.userId, dataUserId),
          gte(netWorthSnapshots.snapshotDate, startDate.toISOString().split('T')[0]),
          lte(netWorthSnapshots.snapshotDate, endDate.toISOString().split('T')[0])
        )
      )
      .orderBy(netWorthSnapshots.snapshotDate);

    if (snapshots.length === 0) {
      const startStr = startDate.toISOString().split('T')[0];
      const endStr = endDate.toISOString().split('T')[0];
      const todayStr = formatInTimezone(new Date(), userTz);

      if (!(todayStr >= startStr && todayStr <= endStr)) {
        return NextResponse.json({
          data: [],
          categories: [],
          summary: {
            current: 0,
            previous: 0,
            change: 0,
            percentChange: 0,
            includedAccounts: 0,
            totalAccounts: 0,
          },
        });
      }

      // Fallback: use current account balances
      const userAccounts = await getDb()
        .select()
        .from(accounts)
        .where(accountsWhere);

      const decryptedAccounts = await decryptRows('accounts', userAccounts, dek);
      const reportableAccounts = filterReportableAccounts(decryptedAccounts);

      const { totalAssets, totalLiabilities, netWorth } = computeNetWorthTotals(reportableAccounts, baseCurrency, todayStr);

      // Canonical per-type breakdown (same scope as the totals above)
      const breakdown = computeCategoryBreakdown(reportableAccounts, baseCurrency, todayStr);
      const allBreakdownCategories = new Set(Object.keys(breakdown));

      const currentSnapshot: Record<string, any> = {
        date: todayStr,
        netWorth,
        totalAssets,
        totalLiabilities,
        isSynthetic: false,
      };
      for (const cat of allBreakdownCategories) {
        currentSnapshot[cat] = breakdown[cat]?.value ?? 0;
      }

      return NextResponse.json({
        data: [currentSnapshot],
        categories: Array.from(allBreakdownCategories),
        summary: {
          current: netWorth,
          previous: netWorth,
          change: 0,
          percentChange: 0,
          includedAccounts: reportableAccounts.length,
          totalAccounts: userAccounts.length,
        },
      });
    }

    // Decrypt encrypted fields (totalAssets, totalLiabilities, netWorth)
    const decrypted = await decryptRows('net_worth_snapshots', snapshots, dek);

    const formattedData: AggregatablePoint[] = decrypted.map((s) => ({
      date: s.snapshotDate,
      netWorth: parseFloat(s.netWorth) || 0,
      totalAssets: parseFloat(s.totalAssets) || 0,
      totalLiabilities: parseFloat(s.totalLiabilities) || 0,
      isSynthetic: false,
      isImported: false,
    }));

    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];
    const todayStr = formatInTimezone(new Date(), userTz);

    if (todayStr >= startStr && todayStr <= endStr) {
      // Fetch live accounts to get today's balance
      const userAccounts = await getDb()
        .select()
        .from(accounts)
        .where(accountsWhere);

      const decryptedAccounts = await decryptRows('accounts', userAccounts, dek);
      const reportableAccounts = filterReportableAccounts(decryptedAccounts);

      const { totalAssets: liveAssets, totalLiabilities: liveLiabilities, netWorth: liveNetWorth } =
        computeNetWorthTotals(reportableAccounts, baseCurrency, todayStr);

      const lastPoint = formattedData[formattedData.length - 1];
      if (lastPoint && lastPoint.date === todayStr) {
        lastPoint.netWorth = liveNetWorth;
        lastPoint.totalAssets = liveAssets;
        lastPoint.totalLiabilities = liveLiabilities;
      } else if (!lastPoint || lastPoint.date < todayStr) {
        formattedData.push({
          date: todayStr,
          netWorth: liveNetWorth,
          totalAssets: liveAssets,
          totalLiabilities: liveLiabilities,
          isSynthetic: false,
          isImported: false,
        });
      }
    }

    // Calculate summary stats from aggregated data
    const current = formattedData[formattedData.length - 1];
    const previous = formattedData.length > 1 ? formattedData[0] : current;
    const currentNetWorth = Number(current.netWorth);
    const previousNetWorth = Number(previous.netWorth);
    const change = currentNetWorth - previousNetWorth;
    const percentChange = previousNetWorth !== 0 ? (change / previousNetWorth) * 100 : 0;

    const numericFields = ['netWorth', 'totalAssets', 'totalLiabilities'];
    const aggregated = aggregateChartData(formattedData, numericFields as any);

    return NextResponse.json({
      data: aggregated,
      categories: [],
      summary: {
        current: currentNetWorth,
        previous: previousNetWorth,
        change,
        percentChange,
        includedAccounts: 0,
        totalAccounts: 0,
      },
    });
  } catch (error) {
    logger.error('Error fetching net worth chart data', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: 'internal_error', message: 'Failed to fetch net worth data' },
      { status: 500 }
    );
  }
}
