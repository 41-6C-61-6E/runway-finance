import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { accounts, accountSnapshots, userSettings, accountTags, tags } from '@/lib/db/schema';
import { eq, and, gte, lte, lt, desc, or, inArray } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { aggregateChartData, AggregatablePoint } from '@/lib/utils/chart-aggregation';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptField, decryptRows } from '@/lib/crypto';
import { filterReportableAccounts, isAssetAccount, isLiabilityAccount, isInvestmentAccount } from '@/lib/utils/account-scope';

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

  const userSettingsList = await getDb()
    .select({ timezone: userSettings.timezone })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);

  const userTz = userSettingsList[0]?.timezone || 'America/New_York';

  let [startDate, endDate] = getDateRange(timeframe);
  if (timeframe === 'all') {
    const earliestSnap = await getDb()
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
  
  const startStr = timeframe === 'all' && earliestSnap && earliestSnap.length > 0 && earliestSnap[0].snapshotDate
    ? earliestSnap[0].snapshotDate
    : formatInTimezone(startDate, userTz);
  const endStr = formatInTimezone(endDate, userTz);

  try {
    // 1. Get all user accounts with balance data
    const userAccounts = await getDb()
      .select()
      .from(accounts)
      .where(eq(accounts.userId, dataUserId));

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
      investments: true,
      realEstate: true,
      cashFlowProjections: true,
      ...(typeof rawShowSynthetic === 'object' && rawShowSynthetic !== null ? rawShowSynthetic : {}),
    } as Record<string, boolean>;

    const rawShowImported = userSetting?.showImportedData;
    const importSettings = {
      global: true,
      netWorth: true,
      investments: true,
      realEstate: true,
      cashFlowProjections: true,
      ...(typeof rawShowImported === 'object' && rawShowImported !== null ? rawShowImported : {}),
    } as Record<string, boolean>;

    const isGlobalEnabled = synthSettings.global !== false;
    const isNetWorthEnabled = isGlobalEnabled && synthSettings.netWorth !== false;
    const isInvestmentsEnabled = isGlobalEnabled && synthSettings.investments !== false;
    const isRealEstateEnabled = isGlobalEnabled && synthSettings.realEstate !== false;
    const isImportNetWorthEnabled = importSettings.global !== false && importSettings.netWorth !== false;
    const isImportInvestmentsEnabled = importSettings.global !== false && importSettings.investments !== false;
    const isImportRealEstateEnabled = importSettings.global !== false && importSettings.realEstate !== false;

    // Filter reportable accounts based on settings
    let filteredAccounts = reportableAccounts;
    if (!isImportNetWorthEnabled) {
      filteredAccounts = filteredAccounts.filter(acc => !(acc.externalId?.startsWith('imported-') && !isInvestmentAccount(acc.type)));
    }
    if (!isImportInvestmentsEnabled) {
      filteredAccounts = filteredAccounts.filter(acc => !(acc.externalId?.startsWith('imported-') && isInvestmentAccount(acc.type)));
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

    // Batch fetch tags for these accounts
    const tagRows = accountIds.length > 0
      ? await getDb()
          .select({
            accountId: accountTags.accountId,
            tagId: tags.id,
            tagName: tags.name,
            tagColor: tags.color,
          })
          .from(accountTags)
          .leftJoin(tags, eq(accountTags.tagId, tags.id))
          .where(inArray(accountTags.accountId, accountIds))
      : [];

    const tagsByAccountId = new Map<string, any[]>();
    for (const row of tagRows) {
      const name = row.tagName ? await decryptField(row.tagName, dek) : '';
      const tag = { id: row.tagId, name, color: row.tagColor };
      const existing = tagsByAccountId.get(row.accountId) ?? [];
      existing.push(tag);
      tagsByAccountId.set(row.accountId, existing);
    }

    const accountsWithTags = filteredAccounts.map((acc: any) => ({
      ...acc,
      tags: tagsByAccountId.get(acc.id) ?? [],
    }));

    if (accountIds.length === 0) {
      return NextResponse.json({
        data: [],
        accounts: [],
      });
    }

    // 2. Fetch snapshots before the range to establish the baseline balances
    const snapshotsConditionsBefore = [
      eq(accountSnapshots.userId, dataUserId),
      lt(accountSnapshots.snapshotDate, startStr),
    ];

    const snapshotsBefore = await getDb()
      .select({
        snapshotDate: accountSnapshots.snapshotDate,
        accountId: accountSnapshots.accountId,
        balance: accountSnapshots.balance,
        isSynthetic: accountSnapshots.isSynthetic,
        isImported: accountSnapshots.isImported,
      })
      .from(accountSnapshots)
      .where(and(...snapshotsConditionsBefore))
      .orderBy(desc(accountSnapshots.snapshotDate));

    // 3. Fetch snapshots in range
    const snapshotsConditionsInRange = [
      eq(accountSnapshots.userId, dataUserId),
      gte(accountSnapshots.snapshotDate, startStr),
      lte(accountSnapshots.snapshotDate, endStr),
    ];

    const snapshotsInRange = await getDb()
      .select({
        snapshotDate: accountSnapshots.snapshotDate,
        accountId: accountSnapshots.accountId,
        balance: accountSnapshots.balance,
        isSynthetic: accountSnapshots.isSynthetic,
        isImported: accountSnapshots.isImported,
      })
      .from(accountSnapshots)
      .where(and(...snapshotsConditionsInRange))
      .orderBy(accountSnapshots.snapshotDate);

    // Decrypt snapshot balances
    const decryptSnap = async (snap: any) => {
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

    const decryptedBeforeRaw = await Promise.all(snapshotsBefore.map(decryptSnap));
    const decryptedInRangeRaw = await Promise.all(snapshotsInRange.map(decryptSnap));

    const accountsById = new Map<string, typeof filteredAccounts[number]>();
    for (const acc of filteredAccounts) {
      accountsById.set(acc.id, acc);
    }

    const filterSyntheticSnaps = (snap: any) => {
      const acc = accountsById.get(snap.accountId);
      if (!acc) return false;
      
      if (snap.isImported) {
        if (isInvestmentAccount(acc.type)) {
          return isImportInvestmentsEnabled;
        }
        return isImportNetWorthEnabled;
      }

      if (snap.isSynthetic) {
        if (isInvestmentAccount(acc.type)) {
          return isInvestmentsEnabled;
        }
        if (realEstateTypes.includes(acc.type.toLowerCase())) {
          return isRealEstateEnabled;
        }
        return isNetWorthEnabled;
      }
      return true;
    };

    const decryptedBefore = decryptedBeforeRaw.filter(filterSyntheticSnaps);
    const decryptedInRange = decryptedInRangeRaw.filter(filterSyntheticSnaps);

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
    const todayStr = formatInTimezone(new Date(), userTz);
    const actualEndStr = endStr < todayStr ? endStr : todayStr;
    const stop = new Date(actualEndStr + 'T00:00:00Z');
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

        const accountType = account.type.toLowerCase();
        let endEventDateStr: string | undefined = undefined;
        if (accountType === 'mortgage' && account.metadata) {
          try {
            const meta = typeof account.metadata === 'string' ? JSON.parse(account.metadata) : account.metadata;
            if (meta) {
              const status = meta.mortgageStatus as string | undefined;
              endEventDateStr = status === 'paid_off' ? (meta.payoffDate as string | undefined) : (status === 'refinanced' ? (meta.refinanceDate as string | undefined) : undefined);
            }
          } catch (err) {
            // Ignore parse errors
          }
        }

        if (endEventDateStr && dateStr >= endEventDateStr) {
          continue;
        }

        const bal = latestByAccount.get(account.id)!;

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

    // Return daily data directly (client-side handles downsampling to 100 points for larger views)
    const aggregated = formattedData;

    return NextResponse.json({
      data: aggregated,
      accounts: accountsWithTags.map(acc => ({
        id: acc.id,
        name: acc.name,
        type: acc.type,
        currency: acc.currency,
        institution: acc.institution,
        balance: parseFloat(acc.balance),
        isHidden: acc.isHidden,
        isExcludedFromNetWorth: acc.isExcludedFromNetWorth,
        connectionId: acc.connectionId,
        tags: acc.tags,
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
