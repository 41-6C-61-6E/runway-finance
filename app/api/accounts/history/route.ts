import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { accounts, accountSnapshots, userSettings } from '@/lib/db/schema';
import { eq, and, gte, lte, lt, desc, or } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { aggregateChartData, AggregatablePoint } from '@/lib/utils/chart-aggregation';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptField, decryptRows } from '@/lib/crypto';
import { filterReportableAccounts, isAssetAccount, isLiabilityAccount } from '@/lib/utils/account-scope';

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
  const startStr = startDate.toISOString().split('T')[0];
  const endStr = endDate.toISOString().split('T')[0];

  try {
    // 1. Get all user accounts with balance data
    const userAccounts = await getDb()
      .select()
      .from(accounts)
      .where(eq(accounts.userId, userId));

    // Decrypt account balances and other encrypted fields
    const decryptedAccounts = await decryptRows('accounts', userAccounts, dek);
    const reportableAccounts = filterReportableAccounts(decryptedAccounts);

    // Fetch user settings to respect synthetic/estimated data toggles
    const userSettingsList = await getDb()
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);

    const userSetting = userSettingsList[0];
    const rawShowSynthetic = userSetting?.showSyntheticData;
    const synthSettings = {
      global: true,
      netWorth: true,
      realEstate: true,
      cashFlowProjections: true,
      ...(typeof rawShowSynthetic === 'object' && rawShowSynthetic !== null ? rawShowSynthetic : {}),
    } as Record<string, boolean>;

    const rawShowImported = userSetting?.showImportedData;
    const importSettings = {
      global: true,
      netWorth: true,
      realEstate: true,
      cashFlowProjections: true,
      ...(typeof rawShowImported === 'object' && rawShowImported !== null ? rawShowImported : {}),
    } as Record<string, boolean>;

    const isGlobalEnabled = synthSettings.global !== false;
    const isNetWorthEnabled = isGlobalEnabled && synthSettings.netWorth !== false;
    const isRealEstateEnabled = isGlobalEnabled && synthSettings.realEstate !== false;
    const isImportNetWorthEnabled = importSettings.global !== false && importSettings.netWorth !== false;
    const isImportRealEstateEnabled = importSettings.global !== false && importSettings.realEstate !== false;

    // Filter reportable accounts based on settings
    let filteredAccounts = reportableAccounts;
    if (!isNetWorthEnabled) {
      filteredAccounts = filteredAccounts.filter(acc => {
        if (acc.connectionId !== null) return true;
        const isImported = acc.externalId?.startsWith('imported-');
        if (isImported && isImportNetWorthEnabled) return true;
        return false;
      });
    }
    const realEstateTypes = [
      'realestate',
      'primaryhome',
      'secondaryhome',
      'rentalproperty',
      'commercial',
      'land',
      'otherrealestate'
    ];
    if (!isRealEstateEnabled) {
      filteredAccounts = filteredAccounts.filter(acc => {
        const isRealEstate = realEstateTypes.includes(acc.type.toLowerCase());
        if (isRealEstate && acc.connectionId === null) {
          return false;
        }
        return true;
      });
    }

    const accountIds = filteredAccounts.map(acc => acc.id);

    if (accountIds.length === 0) {
      return NextResponse.json({
        data: [],
        accounts: [],
      });
    }

    // 2. Fetch snapshots before the range to establish the baseline balances
    const snapshotsConditionsBefore = [
      eq(accountSnapshots.userId, userId),
      lt(accountSnapshots.snapshotDate, startStr),
    ];
    if (!isNetWorthEnabled) {
      snapshotsConditionsBefore.push(or(eq(accountSnapshots.isSynthetic, false), eq(accountSnapshots.isImported, true)));
    }
    if (!isImportNetWorthEnabled) {
      snapshotsConditionsBefore.push(eq(accountSnapshots.isImported, false));
    }

    const snapshotsBefore = await getDb()
      .select({
        snapshotDate: accountSnapshots.snapshotDate,
        accountId: accountSnapshots.accountId,
        balance: accountSnapshots.balance,
        isSynthetic: accountSnapshots.isSynthetic,
      })
      .from(accountSnapshots)
      .where(and(...snapshotsConditionsBefore))
      .orderBy(desc(accountSnapshots.snapshotDate));

    // 3. Fetch snapshots in range
    const snapshotsConditionsInRange = [
      eq(accountSnapshots.userId, userId),
      gte(accountSnapshots.snapshotDate, startStr),
      lte(accountSnapshots.snapshotDate, endStr),
    ];
    if (!isNetWorthEnabled) {
      snapshotsConditionsInRange.push(or(eq(accountSnapshots.isSynthetic, false), eq(accountSnapshots.isImported, true)));
    }
    if (!isImportNetWorthEnabled) {
      snapshotsConditionsInRange.push(eq(accountSnapshots.isImported, false));
    }

    const snapshotsInRange = await getDb()
      .select({
        snapshotDate: accountSnapshots.snapshotDate,
        accountId: accountSnapshots.accountId,
        balance: accountSnapshots.balance,
        isSynthetic: accountSnapshots.isSynthetic,
      })
      .from(accountSnapshots)
      .where(and(...snapshotsConditionsInRange))
      .orderBy(accountSnapshots.snapshotDate);

    // Decrypt snapshot balances
    const decryptSnap = async (snap: typeof snapshotsInRange[number]) => {
      let balance = 0;
      try {
        const decrypted = await decryptField(snap.balance, dek);
        balance = parseFloat(decrypted);
        if (isNaN(balance)) balance = 0;
      } catch (error) {
        logger.error('Failed to decrypt snapshot balance', {
          accountId: snap.accountId,
          date: snap.snapshotDate,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return { ...snap, balance };
    };

    const decryptedBefore = await Promise.all(snapshotsBefore.map(decryptSnap));
    const decryptedInRange = await Promise.all(snapshotsInRange.map(decryptSnap));

    // 4. Initialize forward-fill state
    const latestByAccount = new Map<string, number>();

    // Seed latest balances from snapshots before the range
    for (const snap of decryptedBefore) {
      if (!latestByAccount.has(snap.accountId)) {
        latestByAccount.set(snap.accountId, snap.balance);
      }
    }

    // If any filtered account has no snapshots at all, seed with its current decrypted balance
    const accountsWithSnapshots = new Set<string>([
      ...decryptedBefore.map(s => s.accountId),
      ...decryptedInRange.map(s => s.accountId),
    ]);

    for (const account of filteredAccounts) {
      if (!accountsWithSnapshots.has(account.id)) {
        const currentBal = parseFloat(account.balance);
        latestByAccount.set(account.id, isNaN(currentBal) ? 0 : currentBal);
      }
    }

    // Group snapshots in range by date
    const snapshotsByDate = new Map<string, Array<{ accountId: string; balance: number }>>();
    for (const snap of decryptedInRange) {
      const d = String(snap.snapshotDate);
      if (!snapshotsByDate.has(d)) {
        snapshotsByDate.set(d, []);
      }
      snapshotsByDate.get(d)!.push({ accountId: snap.accountId, balance: snap.balance });
    }

    // Generate full list of dates in the range
    const datesInRange: string[] = [];
    const curr = new Date(startStr + 'T00:00:00Z');
    const stop = new Date(endStr + 'T00:00:00Z');
    while (curr <= stop) {
      datesInRange.push(curr.toISOString().split('T')[0]);
      curr.setUTCDate(curr.getUTCDate() + 1);
    }

    // 5. Build daily forward-filled points
    const formattedData: AggregatablePoint[] = [];
    for (const dateStr of datesInRange) {
      const daySnaps = snapshotsByDate.get(dateStr);
      if (daySnaps) {
        for (const snap of daySnaps) {
          latestByAccount.set(snap.accountId, snap.balance);
        }
      }

      const point: AggregatablePoint = { date: dateStr };
      let netWorth = 0;
      for (const account of filteredAccounts) {
        if (!latestByAccount.has(account.id)) {
          continue;
        }
        const bal = latestByAccount.get(account.id)!;

        const accountType = account.type.toLowerCase();
        if (isAssetAccount(accountType)) {
          // Assets: store as-is (positive balance = positive value)
          point[account.id] = bal;
          netWorth += bal;
        } else if (isLiabilityAccount(accountType)) {
          // Liabilities: always store as a positive absolute value.
          // Some financial data providers (e.g. SimpleFIN) return liabilities
          // as negative numbers. Normalising to Math.abs here ensures the
          // client-side negation (-val) always produces the correct downward
          // direction in charts, matching the net-worth chart API convention.
          const absBal = Math.abs(bal);
          point[account.id] = absBal;
          netWorth -= absBal;
        } else {
          // Unknown account type — store raw balance
          point[account.id] = bal;
        }
      }
      point.netWorth = netWorth;
      formattedData.push(point);
    }

    // 6. Downsample if timeframe warrants it
    const numericFields = ['netWorth', ...accountIds];
    const aggregated = aggregateChartData(formattedData, numericFields as any);

    return NextResponse.json({
      data: aggregated,
      accounts: filteredAccounts.map(acc => ({
        id: acc.id,
        name: acc.name,
        type: acc.type,
        currency: acc.currency,
        institution: acc.institution,
        balance: parseFloat(acc.balance),
        isHidden: acc.isHidden,
        isExcludedFromNetWorth: acc.isExcludedFromNetWorth,
        connectionId: acc.connectionId,
      })),
    });
  } catch (error) {
    logger.error('Error fetching accounts history chart data', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: 'internal_error', message: 'Failed to fetch accounts history data' },
      { status: 500 }
    );
  }
}
