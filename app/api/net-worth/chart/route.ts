import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { accounts, netWorthSnapshots } from '@/lib/db/schema';
import { eq, and, gte, lte, desc } from 'drizzle-orm';

type TimeFrame = '1m' | '3m' | '6m' | '1y' | '5y' | 'ytd' | 'all';

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
  const { searchParams } = new URL(request.url);
  const timeframe = (searchParams.get('timeframe') as TimeFrame) || '1y';
  const includeExcluded = searchParams.get('includeExcluded') === 'true';

  const [startDate, endDate] = getDateRange(timeframe);

  try {
    // Get all user accounts with balance data
    const userAccounts = await getDb()
      .select()
      .from(accounts)
      .where(eq(accounts.userId, userId));

    // Build net worth snapshots query
    const whereConditions = [
      eq(netWorthSnapshots.userId, userId),
      gte(netWorthSnapshots.snapshotDate, startDate.toISOString().split('T')[0]),
      lte(netWorthSnapshots.snapshotDate, endDate.toISOString().split('T')[0]),
    ];

    const snapshots = await getDb()
      .select()
      .from(netWorthSnapshots)
      .where(and(...whereConditions))
      .orderBy(netWorthSnapshots.snapshotDate);

    // If no snapshots, generate from current account balances
    if (snapshots.length === 0) {
      let totalAssets = 0;
      let totalLiabilities = 0;

      for (const acc of userAccounts) {
        if (acc.isExcludedFromNetWorth && !includeExcluded) {
          continue;
        }

        const balance = parseFloat(acc.balance.toString());
        
        // Assets: checking, savings, investment, other, brokerage, retirement, real estate
        if (['checking', 'savings', 'investment', 'other', 'brokerage', 'retirement', 'realestate'].includes(acc.type.toLowerCase())) {
          totalAssets += balance;
        } 
        // Liabilities: credit, loan, mortgage
        else if (['credit', 'loan', 'mortgage'].includes(acc.type.toLowerCase())) {
          totalLiabilities += Math.abs(balance);
        }
      }

      const netWorth = totalAssets - totalLiabilities;
      const currentSnapshot = {
        date: new Date().toISOString().split('T')[0],
        netWorth,
        totalAssets,
        totalLiabilities,
      };

      const includedCount = userAccounts.filter(
        (a) => !a.isExcludedFromNetWorth || includeExcluded
      ).length;

      return NextResponse.json({
        data: [currentSnapshot],
        summary: {
          current: netWorth,
          previous: netWorth,
          change: 0,
          percentChange: 0,
          includedAccounts: includedCount,
          totalAccounts: userAccounts.length,
        },
      });
    }

    // Calculate summary stats
    const current = snapshots[snapshots.length - 1];
    const previous = snapshots.length > 1 ? snapshots[0] : current;
    const currentNetWorth = parseFloat(current.netWorth.toString());
    const previousNetWorth = parseFloat(previous.netWorth.toString());
    const change = currentNetWorth - previousNetWorth;
    const percentChange = previousNetWorth !== 0 ? (change / previousNetWorth) * 100 : 0;

    const formattedData = snapshots.map((snap) => ({
      date: snap.snapshotDate,
      netWorth: parseFloat(snap.netWorth.toString()),
      totalAssets: parseFloat(snap.totalAssets.toString()),
      totalLiabilities: parseFloat(snap.totalLiabilities.toString()),
    }));

    const includedCount = userAccounts.filter((a) => !a.isExcludedFromNetWorth).length;

    return NextResponse.json({
      data: formattedData,
      summary: {
        current: currentNetWorth,
        previous: previousNetWorth,
        change,
        percentChange,
        includedAccounts: includedCount,
        totalAccounts: userAccounts.length,
      },
    });
  } catch (error) {
    console.error('Error fetching net worth chart data:', error);
    return NextResponse.json(
      { error: 'internal_error', message: 'Failed to fetch net worth data' },
      { status: 500 }
    );
  }
}
