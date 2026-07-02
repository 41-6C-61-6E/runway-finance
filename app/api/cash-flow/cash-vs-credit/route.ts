import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { accounts, accountSnapshots, userSettings } from '@/lib/db/schema';
import { eq, and, gte, lte, lt, desc } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptField, decryptRows } from '@/lib/crypto';
import { filterReportableAccounts } from '@/lib/utils/account-scope';

type TimeFrame = '1m' | '3m' | '6m' | '1y' | '5y' | 'ytd' | 'all';

const CASH_TYPES = ['checking', 'savings', 'other'];
const CREDIT_TYPES = ['credit'];

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

  const userId = session.user.id;
  const dataUserId = (session.user as any).dataUserId ?? session.user.id;
  const dek = await getSessionDEK();
  const { searchParams } = new URL(request.url);
  const timeframe = (searchParams.get('timeframe') as TimeFrame) || '1y';
  const startMonth = searchParams.get('startMonth');
  const endMonth = searchParams.get('endMonth');
  let startDateParam = searchParams.get('startDate');
  let endDateParam = searchParams.get('endDate');
  const includeSavings = searchParams.get('includeSavings') !== 'false';

  const userSettingsList = await getDb()
    .select({ timezone: userSettings.timezone })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);

  const userTz = userSettingsList[0]?.timezone || 'America/New_York';

  let earliestSnap: any[] | undefined = undefined;

  let startStr = '';
  let endStr = '';

  if (startDateParam && endDateParam) {
    startStr = startDateParam;
    endStr = endDateParam;
  } else if (startMonth && endMonth) {
    startStr = `${startMonth}-01`;
    const [ey, em] = endMonth.split('-').map(Number);
    endStr = `${ey}-${String(em).padStart(2, '0')}-${String(new Date(ey, em, 0).getDate()).padStart(2, '0')}`;
  } else {
    const [s, e] = getDateRange(timeframe);
    let startDate = s;
    let endDate = e;
    if (timeframe === 'all') {
      earliestSnap = await getDb()
        .select({ snapshotDate: accountSnapshots.snapshotDate })
        .from(accountSnapshots)
        .where(eq(accountSnapshots.userId, dataUserId))
        .orderBy(accountSnapshots.snapshotDate)
        .limit(1);
      if (earliestSnap.length > 0 && earliestSnap[0].snapshotDate) {
        startDate = new Date(earliestSnap[0].snapshotDate + 'T00:00:00Z');
      } else {
        startDate = new Date();
        startDate.setFullYear(startDate.getFullYear() - 1);
      }
    }
    startStr = timeframe === 'all' && earliestSnap && earliestSnap.length > 0 && earliestSnap[0].snapshotDate
      ? earliestSnap[0].snapshotDate
      : formatInTimezone(startDate, userTz);
    endStr = formatInTimezone(endDate, userTz);
  }

  try {
    const userAccounts = await getDb()
      .select()
      .from(accounts)
      .where(eq(accounts.userId, dataUserId));

    const decryptedAccounts = await decryptRows('accounts', userAccounts, dek);
    const reportableAccounts = filterReportableAccounts(decryptedAccounts);

    const cashAccounts = reportableAccounts.filter(
      (a: any) => {
        const type = a.type.toLowerCase();
        if (type === 'savings') {
          return includeSavings;
        }
        return type === 'checking' || type === 'other';
      }
    );
    const creditAccounts = reportableAccounts.filter(
      (a: any) => CREDIT_TYPES.includes(a.type.toLowerCase())
    );

    const allRelevantAccounts = [...cashAccounts, ...creditAccounts];
    const accountIds = allRelevantAccounts.map((a: any) => a.id);

    if (accountIds.length === 0) {
      return NextResponse.json({
        current: { cashOnHand: 0, creditCardDebt: 0, netPosition: 0, coverageRatio: 0 },
        history: [],
        accounts: { cash: [], credit: [] },
      });
    }

    const latestByAccount = new Map<string, number>();
    const accountTypeMap = new Map<string, boolean>();
    for (const a of cashAccounts) {
      accountTypeMap.set(a.id, true);
      latestByAccount.set(a.id, parseFloat(a.balance) || 0);
    }
    for (const a of creditAccounts) {
      accountTypeMap.set(a.id, false);
      latestByAccount.set(a.id, Math.abs(parseFloat(a.balance) || 0));
    }

    const snapshotsConditionsBefore = [
      eq(accountSnapshots.userId, dataUserId),
      lt(accountSnapshots.snapshotDate, startStr),
    ];

    const snapshotsBefore = await getDb()
      .select({
        snapshotDate: accountSnapshots.snapshotDate,
        accountId: accountSnapshots.accountId,
        balance: accountSnapshots.balance,
      })
      .from(accountSnapshots)
      .where(and(...snapshotsConditionsBefore))
      .orderBy(desc(accountSnapshots.snapshotDate));

    const snapshotsInRangeConditions = [
      eq(accountSnapshots.userId, dataUserId),
      gte(accountSnapshots.snapshotDate, startStr),
      lte(accountSnapshots.snapshotDate, endStr),
    ];

    const snapshotsInRange = await getDb()
      .select({
        snapshotDate: accountSnapshots.snapshotDate,
        accountId: accountSnapshots.accountId,
        balance: accountSnapshots.balance,
      })
      .from(accountSnapshots)
      .where(and(...snapshotsInRangeConditions))
      .orderBy(accountSnapshots.snapshotDate);

    const decryptSnap = async (snap: typeof snapshotsInRange[number]) => {
      let balance = 0;
      try {
        const decrypted = await decryptField(snap.balance, dek);
        balance = parseFloat(decrypted);
        if (isNaN(balance)) balance = 0;
      } catch {
        // ignore
      }
      return { ...snap, balance };
    };

    const decryptedBefore = await Promise.all(snapshotsBefore.map(decryptSnap));
    const decryptedInRange = await Promise.all(snapshotsInRange.map(decryptSnap));

    for (const snap of decryptedBefore) {
      if (!latestByAccount.has(snap.accountId)) {
        const isCash = accountTypeMap.get(snap.accountId);
        latestByAccount.set(snap.accountId, isCash ? snap.balance : Math.abs(snap.balance));
      }
    }

    const accountsWithSnapshots = new Set<string>([
      ...decryptedBefore.map(s => s.accountId),
      ...decryptedInRange.map(s => s.accountId),
    ]);

    for (const account of allRelevantAccounts) {
      if (!accountsWithSnapshots.has(account.id)) {
        const bal = parseFloat(account.balance);
        latestByAccount.set(account.id, accountTypeMap.get(account.id) ? (isNaN(bal) ? 0 : bal) : Math.abs(isNaN(bal) ? 0 : bal));
      }
    }

    const snapshotsByDate = new Map<string, Array<{ accountId: string; balance: number }>>();
    for (const snap of decryptedInRange) {
      const d = String(snap.snapshotDate);
      if (!snapshotsByDate.has(d)) snapshotsByDate.set(d, []);
      snapshotsByDate.get(d)!.push({ accountId: snap.accountId, balance: snap.balance });
    }

    const datesInRange: string[] = [];
    const curr = new Date(startStr + 'T00:00:00Z');
    const todayStr = formatInTimezone(new Date(), userTz);
    const actualEndStr = endStr < todayStr ? endStr : todayStr;
    const stop = new Date(actualEndStr + 'T00:00:00Z');
    while (curr <= stop) {
      datesInRange.push(curr.toISOString().split('T')[0]);
      curr.setUTCDate(curr.getUTCDate() + 1);
    }

    const history: { date: string; cashOnHand: number; creditCardDebt: number; netPosition: number }[] = [];

    for (const dateStr of datesInRange) {
      const daySnaps = snapshotsByDate.get(dateStr);
      if (daySnaps) {
        for (const snap of daySnaps) {
          const isCash = accountTypeMap.get(snap.accountId);
          latestByAccount.set(snap.accountId, isCash ? snap.balance : Math.abs(snap.balance));
        }
      }

      let cashTotal = 0;
      let creditTotal = 0;

      for (const [accountId, balance] of latestByAccount) {
        const isCash = accountTypeMap.get(accountId);
        if (isCash === true) {
          cashTotal += balance;
        } else if (isCash === false) {
          creditTotal += balance;
        }
      }

      history.push({
        date: dateStr,
        cashOnHand: cashTotal,
        creditCardDebt: creditTotal,
        netPosition: cashTotal - creditTotal,
      });
    }

    const latest = history.length > 0
      ? history[history.length - 1]
      : { cashOnHand: 0, creditCardDebt: 0, netPosition: 0 };

    const coverageRatio = latest.creditCardDebt > 0
      ? latest.cashOnHand / latest.creditCardDebt
      : (latest.cashOnHand > 0 ? Infinity : 0);

    return NextResponse.json({
      current: {
        cashOnHand: latest.cashOnHand,
        creditCardDebt: latest.creditCardDebt,
        netPosition: latest.netPosition,
        coverageRatio,
      },
      history,
      accounts: {
        cash: cashAccounts.map((a: any) => ({
          id: a.id,
          name: a.name,
          balance: parseFloat(a.balance) || 0,
        })),
        credit: creditAccounts.map((a: any) => ({
          id: a.id,
          name: a.name,
          balance: Math.abs(parseFloat(a.balance) || 0),
        })),
      },
    });
  } catch (error) {
    logger.error('Error fetching cash vs credit data', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: 'internal_error', message: 'Failed to fetch cash vs credit data' },
      { status: 500 }
    );
  }
}
