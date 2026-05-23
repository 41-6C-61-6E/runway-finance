import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { accounts, netWorthSnapshots, accountSnapshots } from '@/lib/db/schema';
import { eq, and, gte, lte, lt, desc, sql } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { aggregateChartData, AggregatablePoint } from '@/lib/utils/chart-aggregation';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptField, decryptRows } from '@/lib/crypto';
import { filterReportableAccounts, isAssetAccount, isLiabilityAccount } from '@/lib/utils/account-scope';

type TimeFrame = '1m' | '3m' | '6m' | '1y' | '5y' | 'ytd' | 'all';

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
  const dek = await getSessionDEK();
  const { searchParams } = new URL(request.url);
  const timeframe = (searchParams.get('timeframe') as TimeFrame) || '1y';
  let [startDate, endDate] = getDateRange(timeframe);
  if (timeframe === 'all') {
    const earliestSnap = await getDb()
      .select({ snapshotDate: accountSnapshots.snapshotDate })
      .from(accountSnapshots)
      .where(eq(accountSnapshots.userId, userId))
      .orderBy(accountSnapshots.snapshotDate)
      .limit(1);
    if (earliestSnap.length > 0 && earliestSnap[0].snapshotDate) {
      startDate = new Date(earliestSnap[0].snapshotDate + 'T00:00:00Z');
    } else {
      startDate = new Date();
      startDate.setFullYear(startDate.getFullYear() - 1);
    }
  }

  try {
    // Get all user accounts with balance data
    const userAccounts = await getDb()
      .select()
      .from(accounts)
      .where(eq(accounts.userId, userId));

    // Decrypt account balances and other encrypted fields
    const decryptedAccounts = await decryptRows('accounts', userAccounts, dek);
    const reportableAccounts = filterReportableAccounts(decryptedAccounts);

    // Primary path: aggregate from account_snapshots (includes both real and synthetic)
    const accountSnapshotsInRange = await getDb()
      .select({
        snapshotDate: accountSnapshots.snapshotDate,
        accountId: accountSnapshots.accountId,
        balance: accountSnapshots.balance,
        isSynthetic: accountSnapshots.isSynthetic,
      })
      .from(accountSnapshots)
      .where(
        and(
          eq(accountSnapshots.userId, userId),
          gte(accountSnapshots.snapshotDate, startDate.toISOString().split('T')[0]),
          lte(accountSnapshots.snapshotDate, endDate.toISOString().split('T')[0])
        )
      )
      .orderBy(accountSnapshots.snapshotDate);

    // Decrypt snapshot balances with error handling
    const decryptedSnapshots = await Promise.all(accountSnapshotsInRange.map(async (snap) => {
      let balance = 0;
      try {
        // Handle both plaintext numbers and encrypted strings
        const decrypted = await decryptField(snap.balance, dek);
        balance = parseFloat(decrypted);
        if (isNaN(balance)) {
          logger.warn('Invalid balance value after decryption', { accountId: snap.accountId, decrypted, originalBalance: snap.balance });
          balance = 0;
        }
      } catch (error) {
        logger.error('Failed to decrypt snapshot balance', { 
          accountId: snap.accountId, 
          date: snap.snapshotDate,
          originalBalance: snap.balance,
          error: error instanceof Error ? error.message : String(error) 
        });
        balance = 0;
      }
      return { ...snap, balance };
    }));

    // Group snapshots by date for forward-fill
    const snapshotsByDate = new Map<string, Array<{ accountId: string; balance: number; isSynthetic: boolean }>>();
    for (const snap of decryptedSnapshots) {
      const dateStr = String(snap.snapshotDate);
      if (!snapshotsByDate.has(dateStr)) {
        snapshotsByDate.set(dateStr, []);
      }
      snapshotsByDate.get(dateStr)!.push({
        accountId: snap.accountId,
        balance: snap.balance,
        isSynthetic: snap.isSynthetic,
      });
    }

    // Forward-fill: carry forward latest known balance per account,
    // so sparse accounts (e.g. mortgage only snapshotted on the 7th)
    // still contribute to totals on intervening dates.
    const latestByAccount = new Map<string, { balance: number; isSynthetic: boolean }>();
    const balancesByDate = new Map<string, { assets: number; liabilities: number; isSynthetic: boolean; breakdown: Record<string, number> }>();

    const sortedDates = Array.from(snapshotsByDate.keys()).sort((a, b) => a.localeCompare(b));
    const allBreakdownCategories = new Set<string>();

    for (const dateStr of sortedDates) {
      for (const snap of snapshotsByDate.get(dateStr)!) {
        latestByAccount.set(snap.accountId, { balance: snap.balance, isSynthetic: snap.isSynthetic });
      }

      let assets = 0;
      let liabilities = 0;
      let allSynthetic = true;
      const breakdown: Record<string, number> = {};

      for (const account of reportableAccounts) {
        const latest = latestByAccount.get(account.id);
        if (!latest) continue;

        const accountType = account.type.toLowerCase();
        let categoryName = 'Other';

        if (isAssetAccount(accountType)) {
          categoryName = assetCategoryMap[accountType] || 'Other Investments';
          breakdown[categoryName] = (breakdown[categoryName] || 0) + latest.balance;
          assets += latest.balance;
          allBreakdownCategories.add(categoryName);
        } else if (isLiabilityAccount(accountType)) {
          categoryName = liabilityCategoryMap[accountType] || 'Other Debt';
          breakdown[categoryName] = (breakdown[categoryName] || 0) + Math.abs(latest.balance);
          liabilities += Math.abs(latest.balance);
          allBreakdownCategories.add(categoryName);
        }

        if (!latest.isSynthetic) {
          allSynthetic = false;
        }
      }

      balancesByDate.set(dateStr, { assets, liabilities, isSynthetic: allSynthetic, breakdown });
    }

    // Build formatted data
    const formattedData: AggregatablePoint[] = Array.from(balancesByDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, { assets, liabilities, isSynthetic, breakdown }]) => {
        const point: AggregatablePoint = {
          date,
          netWorth: assets - liabilities,
          totalAssets: assets,
          totalLiabilities: liabilities,
          isSynthetic,
        };
        for (const cat of allBreakdownCategories) {
          if (cat in breakdown) {
            point[cat] = breakdown[cat];
          }
        }
        return point;
      });

    if (formattedData.length === 0) {
      // Fallback: use current account balances
      let totalAssets = 0;
      let totalLiabilities = 0;
      const breakdown: Record<string, number> = {};

      for (const acc of reportableAccounts) {
        const balance = parseFloat(acc.balance);
        const accountType = acc.type.toLowerCase();
        let categoryName = 'Other';

        if (isAssetAccount(accountType)) {
          categoryName = assetCategoryMap[accountType] || 'Other Investments';
          breakdown[categoryName] = (breakdown[categoryName] || 0) + balance;
          totalAssets += balance;
          allBreakdownCategories.add(categoryName);
        } else if (isLiabilityAccount(accountType)) {
          categoryName = liabilityCategoryMap[accountType] || 'Other Debt';
          breakdown[categoryName] = (breakdown[categoryName] || 0) + Math.abs(balance);
          totalLiabilities += Math.abs(balance);
          allBreakdownCategories.add(categoryName);
        }
      }

      const netWorth = totalAssets - totalLiabilities;
      const currentSnapshot: Record<string, any> = {
        date: new Date().toISOString().split('T')[0],
        netWorth,
        totalAssets,
        totalLiabilities,
        isSynthetic: false,
      };
      for (const cat of allBreakdownCategories) {
        currentSnapshot[cat] = breakdown[cat] || 0;
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

    // Calculate summary stats from aggregated data
    const current = formattedData[formattedData.length - 1];
    const previous = formattedData.length > 1 ? formattedData[0] : current;
    const currentNetWorth = Number(current.netWorth);
    const previousNetWorth = Number(previous.netWorth);
    const change = currentNetWorth - previousNetWorth;
    const percentChange = previousNetWorth !== 0 ? (change / previousNetWorth) * 100 : 0;

    const numericFields = ['netWorth', 'totalAssets', 'totalLiabilities', ...Array.from(allBreakdownCategories)];
    const aggregated = aggregateChartData(formattedData, numericFields as any);

    return NextResponse.json({
      data: aggregated,
      categories: Array.from(allBreakdownCategories),
      summary: {
        current: currentNetWorth,
        previous: previousNetWorth,
        change,
        percentChange,
        includedAccounts: reportableAccounts.length,
        totalAccounts: decryptedAccounts.length,
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
