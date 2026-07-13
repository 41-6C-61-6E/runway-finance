import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { accounts, netWorthSnapshots, userSettings } from '@/lib/db/schema';
import { eq, and, gte, lte } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { aggregateChartData, AggregatablePoint } from '@/lib/utils/chart-aggregation';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptRows } from '@/lib/crypto';
import { filterReportableAccounts, isAssetAccount, isLiabilityAccount, isAccountActiveOnDate } from '@/lib/utils/account-scope';
import { convertCurrency } from '@/lib/services/account-history';

type TimeFrame = '1m' | '3m' | '6m' | '1y' | '5y' | 'ytd' | 'all';

function formatInTimezone(date: Date, tz: string): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find(p => p.type === 'year')?.value;
  const month = parts.find(p => p.type === 'month')?.value;
  const day = parts.find(p => p.type === 'day')?.value;
  return `${year}-${month}-${day}`;
}

const assetCategoryMap: Record<string, string> = {
  checking: 'Cash & Checking',
  savings: 'Savings',
  hsachecking: 'HSA (Checking)',
  investment: 'Taxable Brokerage',
  brokerage: 'Taxable Brokerage',
  otherinvestment: 'Other Investments',
  retirement: 'Retirement',
  rothira: 'Retirement',
  traditionalira: 'Retirement',
  '401k': 'Retirement',
  '403b': 'Retirement',
  sepira: 'Retirement',
  simpleira: 'Retirement',
  hsa: 'HSA (Investment)',
  health: 'HSA (Investment)',
  realestate: 'Real Estate',
  primaryhome: 'Real Estate',
  secondaryhome: 'Real Estate',
  rentalproperty: 'Real Estate',
  commercial: 'Real Estate',
  land: 'Real Estate',
  otherrealestate: 'Real Estate',
  vehicle: 'Vehicle',
  crypto: 'Other Investments',
  metals: 'Other Investments',
  '529': 'Other Investments',
  otherAsset: 'Other Investments',
  other: 'Other Investments',
};

const liabilityCategoryMap: Record<string, string> = {
  credit: 'Credit Cards',
  loan: 'Loans',
  mortgage: 'Mortgages',
  otherLiability: 'Other Debt',
  otherliability: 'Other Debt',
};

function getDateRange(timeframe: TimeFrame): [Date, Date] {
  const endDate = new Date();
  const startDate = new Date();

  switch (timeframe) {
    case '1m':
      startDate.setMonth(startDate.getMonth() - 1);
      break;
    case '3m':
      startDate.setMonth(startDate.getMonth() - 3);
      break;
    case '6m':
      startDate.setMonth(startDate.getMonth() - 6);
      break;
    case '1y':
      startDate.setFullYear(startDate.getFullYear() - 1);
      break;
    case '5y':
      startDate.setFullYear(startDate.getFullYear() - 5);
      break;
    case 'ytd': {
      const now = new Date();
      startDate.setFullYear(now.getFullYear(), 0, 1);
      break;
    }
    case 'all':
      startDate.setFullYear(1900);
      break;
  }

  return [startDate, endDate];
}

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
        .where(eq(accounts.userId, dataUserId));

      const decryptedAccounts = await decryptRows('accounts', userAccounts, dek);
      const reportableAccounts = filterReportableAccounts(decryptedAccounts);

      const roundToCents = (val: number) => Math.round(val * 100) / 100;

      let totalAssets = 0;
      let totalLiabilities = 0;
      const breakdown: Record<string, number> = {};
      const allBreakdownCategories = new Set<string>();

      for (const acc of reportableAccounts) {
        if (!isAccountActiveOnDate(acc, todayStr)) {
          continue;
        }
        const balance = parseFloat(acc.balance) || 0;
        const convertedBal = convertCurrency(balance, acc.currency || 'USD', baseCurrency);
        const accountType = acc.type.toLowerCase();
        let categoryName = 'Other';

        if (isAssetAccount(accountType)) {
          categoryName = assetCategoryMap[accountType] || 'Other Investments';
          breakdown[categoryName] = (breakdown[categoryName] || 0) + convertedBal;
          totalAssets += convertedBal;
          allBreakdownCategories.add(categoryName);
        } else if (isLiabilityAccount(accountType)) {
          categoryName = liabilityCategoryMap[accountType] || 'Other Debt';
          breakdown[categoryName] = (breakdown[categoryName] || 0) + Math.abs(convertedBal);
          totalLiabilities += Math.abs(convertedBal);
          allBreakdownCategories.add(categoryName);
        }
      }

      totalAssets = roundToCents(totalAssets);
      totalLiabilities = roundToCents(totalLiabilities);
      const netWorth = roundToCents(totalAssets - totalLiabilities);
      const currentSnapshot: Record<string, any> = {
        date: todayStr,
        netWorth,
        totalAssets,
        totalLiabilities,
        isSynthetic: false,
      };
      for (const cat of allBreakdownCategories) {
        currentSnapshot[cat] = roundToCents(breakdown[cat] || 0);
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
        .where(eq(accounts.userId, dataUserId));

      const decryptedAccounts = await decryptRows('accounts', userAccounts, dek);
      const reportableAccounts = filterReportableAccounts(decryptedAccounts);

      let liveAssets = 0;
      let liveLiabilities = 0;
      for (const acc of reportableAccounts) {
        if (!isAccountActiveOnDate(acc, todayStr)) {
          continue;
        }
        const balance = parseFloat(acc.balance) || 0;
        const convertedBal = convertCurrency(balance, acc.currency || 'USD', baseCurrency);
        const accountType = acc.type.toLowerCase();
        if (isAssetAccount(accountType)) {
          liveAssets += convertedBal;
        } else if (isLiabilityAccount(accountType)) {
          liveLiabilities += Math.abs(convertedBal);
        }
      }
      const roundToCents = (val: number) => Math.round(val * 100) / 100;
      const liveNetWorth = roundToCents(liveAssets - liveLiabilities);
      liveAssets = roundToCents(liveAssets);
      liveLiabilities = roundToCents(liveLiabilities);

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
