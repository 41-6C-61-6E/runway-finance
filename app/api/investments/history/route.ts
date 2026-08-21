import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { accounts, accountSnapshots, userSettings, transactions } from '@/lib/db/schema';
import { eq, and, gte, lte, lt, desc, inArray } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { aggregateChartData, AggregatablePoint } from '@/lib/utils/chart-aggregation';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptRows, decryptField } from '@/lib/crypto';
import { filterReportableAccounts, isInvestmentAccount } from '@/lib/utils/account-scope';
import { getDateRange, type TimeFrame } from '@/lib/utils/timeframe';

const LOG_TAG = '[api-investments-history]';

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

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: 'unauthenticated', message: 'Authentication required' },
      { status: 401 }
    );
  }

  const dataUserId = (session.user as any).dataUserId ?? session.user.id;
  const dek = await getSessionDEK();
  const { searchParams } = new URL(request.url);
  const timeframe = (searchParams.get('timeframe') as TimeFrame) || '1y';

  logger.info(`${LOG_TAG} Fetching historical investment balances and TWR`, { timeframe });

  try {
    // 1. Get all investment accounts for this user
    const userAccounts = await getDb()
      .select()
      .from(accounts)
      .where(eq(accounts.userId, dataUserId));

    const decryptedAccounts = await decryptRows('accounts', userAccounts, dek);
    const reportableAccounts = filterReportableAccounts(decryptedAccounts);
    const investmentAccounts = reportableAccounts.filter((acc) =>
      isInvestmentAccount(acc.type)
    );

    if (investmentAccounts.length === 0) {
      return NextResponse.json({
        data: [],
        summary: { current: 0, previous: 0, change: 0, percentChange: 0, twrPct: 0 },
      });
    }

    const accountIds = investmentAccounts.map((acc) => acc.id);

    const userId = session.user.id;
    const userSettingsList = await getDb()
      .select({ timezone: userSettings.timezone })
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);

    const userTz = userSettingsList[0]?.timezone || 'America/New_York';

    // 2. Establish start and end date boundaries
    let [startDate, endDate] = getDateRange(timeframe);
    let earliestSnap: any[] | undefined = undefined;
    if (timeframe === 'all') {
      earliestSnap = await getDb()
        .select({ snapshotDate: accountSnapshots.snapshotDate })
        .from(accountSnapshots)
        .where(
          and(
            eq(accountSnapshots.userId, dataUserId),
            inArray(accountSnapshots.accountId, accountIds)
          )
        )
        .orderBy(accountSnapshots.snapshotDate)
        .limit(1);

      if (earliestSnap.length > 0 && earliestSnap[0].snapshotDate) {
        startDate = new Date(earliestSnap[0].snapshotDate + 'T00:00:00Z');
      } else {
        startDate = new Date();
        startDate.setFullYear(startDate.getFullYear() - 1);
      }
    }

    const startStr = timeframe === 'all' && earliestSnap && earliestSnap.length > 0 && earliestSnap[0].snapshotDate
      ? earliestSnap[0].snapshotDate
      : formatInTimezone(startDate, userTz);
    const endStr = formatInTimezone(endDate, userTz);

    // 3. Fetch snapshots prior to date range to get baseline balances
    const snapshotsBefore = await getDb()
      .select({
        snapshotDate: accountSnapshots.snapshotDate,
        accountId: accountSnapshots.accountId,
        balance: accountSnapshots.balance,
      })
      .from(accountSnapshots)
      .where(
        and(
          eq(accountSnapshots.userId, dataUserId),
          inArray(accountSnapshots.accountId, accountIds),
          lt(accountSnapshots.snapshotDate, startStr)
        )
      )
      .orderBy(desc(accountSnapshots.snapshotDate));

    // 4. Fetch snapshots inside the date range
    const snapshotsInRange = await getDb()
      .select({
        snapshotDate: accountSnapshots.snapshotDate,
        accountId: accountSnapshots.accountId,
        balance: accountSnapshots.balance,
      })
      .from(accountSnapshots)
      .where(
        and(
          eq(accountSnapshots.userId, dataUserId),
          inArray(accountSnapshots.accountId, accountIds),
          gte(accountSnapshots.snapshotDate, startStr),
          lte(accountSnapshots.snapshotDate, endStr)
        )
      )
      .orderBy(accountSnapshots.snapshotDate);

    // 5. Fetch transactions in range to compute daily net cash flows for TWR
    const inRangeTransactions = await getDb()
      .select({
        date: transactions.date,
        amount: transactions.amount,
        accountId: transactions.accountId,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, dataUserId),
          inArray(transactions.accountId, accountIds),
          eq(transactions.deleted, false),
          gte(transactions.date, startStr),
          lte(transactions.date, endStr)
        )
      );

    const dailyCashFlows = new Map<string, number>();
    for (const tx of inRangeTransactions) {
      try {
        const decryptedAmt = await decryptField(tx.amount, dek);
        const amt = parseFloat(decryptedAmt);
        if (!isNaN(amt)) {
          const d = String(tx.date);
          dailyCashFlows.set(d, (dailyCashFlows.get(d) || 0) + amt);
        }
      } catch {
        // Skip individual decryption errors
      }
    }

    // Decrypt snapshot balances helper
    const decryptSnap = async (snap: typeof snapshotsInRange[number]) => {
      let balance = 0;
      try {
        const decrypted = await decryptField(snap.balance, dek);
        balance = parseFloat(decrypted);
        if (isNaN(balance)) balance = 0;
      } catch (err) {
        logger.error(`${LOG_TAG} Decryption failed for snapshot balance`, {
          accountId: snap.accountId,
          date: snap.snapshotDate,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      return { ...snap, balance };
    };

    const decryptedBefore = await Promise.all(snapshotsBefore.map(decryptSnap));
    const decryptedInRange = await Promise.all(snapshotsInRange.map(decryptSnap));

    // 6. Initialize forward-fill state
    const latestByAccount = new Map<string, number>();

    // Seed from historical balances prior to range
    for (const snap of decryptedBefore) {
      if (!latestByAccount.has(snap.accountId)) {
        latestByAccount.set(snap.accountId, snap.balance);
      }
    }

    // Seed any account lacking snapshots with its current active decrypted balance
    const accountsWithSnapshots = new Set<string>([
      ...decryptedBefore.map((s) => s.accountId),
      ...decryptedInRange.map((s) => s.accountId),
    ]);

    for (const acc of investmentAccounts) {
      if (!accountsWithSnapshots.has(acc.id)) {
        const currentBal = parseFloat(acc.balance);
        latestByAccount.set(acc.id, isNaN(currentBal) ? 0 : currentBal);
      }
    }

    // Group in-range snapshots by date
    const snapshotsByDate = new Map<string, Array<{ accountId: string; balance: number }>>();
    for (const snap of decryptedInRange) {
      const d = String(snap.snapshotDate);
      if (!snapshotsByDate.has(d)) {
        snapshotsByDate.set(d, []);
      }
      snapshotsByDate.get(d)!.push({ accountId: snap.accountId, balance: snap.balance });
    }

    // Generate daily dates array
    const datesInRange: string[] = [];
    const curr = new Date(startStr + 'T00:00:00Z');
    const todayStr = formatInTimezone(new Date(), userTz);
    const actualEndStr = endStr < todayStr ? endStr : todayStr;
    const stop = new Date(actualEndStr + 'T00:00:00Z');
    
    while (curr <= stop) {
      datesInRange.push(curr.toISOString().split('T')[0]);
      curr.setUTCDate(curr.getUTCDate() + 1);
    }

    // 7. Build daily forward-filled points and compute Time-Weighted Return (TWR)
    const dailyPoints: AggregatablePoint[] = [];
    let cumulativeTwrFactor = 1.0;
    let prevTotalValue = 0;

    for (let idx = 0; idx < datesInRange.length; idx++) {
      const dateStr = datesInRange[idx];
      const daySnaps = snapshotsByDate.get(dateStr);
      if (daySnaps) {
        for (const snap of daySnaps) {
          latestByAccount.set(snap.accountId, snap.balance);
        }
      }

      let totalValue = 0;
      for (const accountId of accountIds) {
        const bal = latestByAccount.get(accountId) || 0;
        totalValue += bal;
      }

      if (idx === 0) {
        prevTotalValue = totalValue;
        dailyPoints.push({
          date: dateStr,
          value: totalValue,
          twr: 0,
        });
      } else {
        const netCashFlow = dailyCashFlows.get(dateStr) || 0;
        if (prevTotalValue > 0) {
          // Single-period return removing the effect of external cash flows:
          // r_t = (Ending Value - Net Cash Flow) / Beginning Value - 1
          const r_t = (totalValue - netCashFlow) / prevTotalValue - 1;
          const factor = Math.max(0, 1 + r_t);
          cumulativeTwrFactor *= factor;
        }
        const currentTwrPct = (cumulativeTwrFactor - 1) * 100;
        prevTotalValue = totalValue;

        dailyPoints.push({
          date: dateStr,
          value: totalValue,
          twr: Math.round(currentTwrPct * 100) / 100,
        });
      }
    }

    if (dailyPoints.length === 0) {
      return NextResponse.json({
        data: [],
        summary: { current: 0, previous: 0, change: 0, percentChange: 0, twrPct: 0 },
      });
    }

    // Compute summary stats
    const currentPoint = dailyPoints[dailyPoints.length - 1];
    const previousPoint = dailyPoints[0];
    const currentVal = Number(currentPoint.value);
    const previousVal = Number(previousPoint.value);
    const change = currentVal - previousVal;
    const percentChange = previousVal !== 0 ? (change / previousVal) * 100 : 0;
    const twrPct = Math.round((cumulativeTwrFactor - 1) * 10000) / 100;

    // Aggregate down to a smaller dataset if timeframe is long
    const aggregated = aggregateChartData(dailyPoints, ['value', 'twr']);

    return NextResponse.json({
      data: aggregated,
      summary: {
        current: currentVal,
        previous: previousVal,
        change,
        percentChange,
        twrPct,
      },
    });
  } catch (error) {
    logger.error(`${LOG_TAG} Error fetching historical investments data`, {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: 'internal_error', message: 'Failed to fetch historical investments data' },
      { status: 500 }
    );
  }
}
