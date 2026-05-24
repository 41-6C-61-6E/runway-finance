import { getDb, getPool } from '@/lib/db';
import { accountSnapshots, transactions, accounts, netWorthSnapshots } from '@/lib/db/schema';
import { eq, and, lt, lte, gte, asc, desc, isNull, sql } from 'drizzle-orm';
import { decryptField, encryptField, encryptRow, decryptRows } from '@/lib/crypto';
import { isAssetAccount, isLiabilityAccount } from '@/lib/utils/account-scope';
import { logger } from '@/lib/logger';

const LOG_TAG = '[account-history]';

/**
 * Result of a single synthetic snapshot generation.
 */
export interface SyntheticSnapshotResult {
  accountId: string;
  date: string;
  balance: string;
  isSynthetic: true;
}

/**
 * Fetch the latest non-synthetic snapshot for an account on or before a given date.
 * Returns null if no real snapshot exists.
 */
export async function getLatestRealSnapshot(
  accountId: string,
  userId: string,
  onOrBeforeDate: string,
  dek?: Uint8Array
): Promise<{ date: string; balance: string } | null> {
  const [snapshot] = await getDb()
    .select({
      date: accountSnapshots.snapshotDate,
      balance: accountSnapshots.balance,
    })
    .from(accountSnapshots)
    .where(
      and(
        eq(accountSnapshots.accountId, accountId),
        eq(accountSnapshots.userId, userId),
        lte(accountSnapshots.snapshotDate, onOrBeforeDate),
        eq(accountSnapshots.isSynthetic, false)
      )
    )
    .orderBy(desc(accountSnapshots.snapshotDate))
    .limit(1);

  if (!snapshot) return null;

  // Decrypt balance if DEK is available (encrypted snapshots store JSON {ct, iv})
  let balanceStr = String(snapshot.balance);
  if (dek) {
    try {
      const decrypted = await decryptField(snapshot.balance, dek);
      // Only use decrypted value if it's non-empty (decryptField returns '' on failure)
      if (decrypted) balanceStr = decrypted;
      // If decryption returned empty and raw value looks like JSON, default to 0
      else if (balanceStr.startsWith('{')) balanceStr = '0';
    } catch {
      // Fallback: keep raw value if decryption fails
    }
  }

  return { date: String(snapshot.date), balance: balanceStr };
}

/**
 * Fetch the earliest transaction date for an account.
 */
export async function getEarliestTransactionDate(
  accountId: string
): Promise<string | null> {
  const [tx] = await getDb()
    .select({ date: transactions.date })
    .from(transactions)
    .where(eq(transactions.accountId, accountId))
    .orderBy(asc(transactions.date))
    .limit(1);

  return tx ? String(tx.date) : null;
}

/**
 * Fetch all posted (non-pending) transactions for an account within a date range.
 */
export async function getPostedTransactions(
  accountId: string,
  fromDate: string,
  toDate: string
): Promise<
  Array<{
    date: string;
    postedDate: string | null;
    amount: string;
  }>
> {
  return getDb()
    .select({
      date: transactions.date,
      postedDate: transactions.postedDate,
      amount: transactions.amount,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.accountId, accountId),
        gte(transactions.date, fromDate),
        lte(transactions.date, toDate),
        eq(transactions.pending, false)
      )
    )
    .orderBy(asc(transactions.date));
}

/**
 * Generate synthetic (calculated) account snapshots for an account between two dates.
 *
 * Logic:
 * 1. Find the latest real (non-synthetic) snapshot on or before `fromDate`.
 *    - If found, use its balance as the starting point.
 *    - If not found, use the earliest transaction date and assume balance = 0 before that.
 * 2. Fetch all posted transactions from `fromDate` to `toDate`.
 * 3. For each day in the range, if no real snapshot exists, calculate the balance
 *    by applying transactions up to and including that day.
 * 4. Insert synthetic snapshots with `is_synthetic = true`.
 *    Real snapshots (upserted later) will overwrite synthetic ones via onConflictDoUpdate.
 */
export async function generateHistoricalAccountSnapshots(
  accountId: string,
  userId: string,
  fromDate: string,
  toDate: string,
  dek?: Uint8Array
): Promise<{ syntheticCount: number; skippedRealCount: number }> {
  const startedAt = Date.now();

  // Fetch account to see if it is imported
  const [account] = await getDb()
    .select({ externalId: accounts.externalId })
    .from(accounts)
    .where(
      and(
        eq(accounts.id, accountId),
        eq(accounts.userId, userId)
      )
    )
    .limit(1);

  const isAccountImported = account?.externalId?.startsWith('imported-') ?? false;

  // 1. Fetch all real snapshots for this account
  const realSnapshots = await getDb()
    .select({
      date: accountSnapshots.snapshotDate,
      balance: accountSnapshots.balance,
    })
    .from(accountSnapshots)
    .where(
      and(
        eq(accountSnapshots.accountId, accountId),
        eq(accountSnapshots.userId, userId),
        eq(accountSnapshots.isSynthetic, false)
      )
    )
    .orderBy(asc(accountSnapshots.snapshotDate));

  // Decrypt real snapshot balances
  const decryptedRealSnapshots = await Promise.all(
    realSnapshots.map(async (s) => {
      let balanceStr = String(s.balance);
      if (dek) {
        try {
          const decrypted = await decryptField(s.balance, dek);
          if (decrypted) balanceStr = decrypted;
          else if (balanceStr.startsWith('{')) balanceStr = '0';
        } catch {
          // Keep raw value
        }
      }
      return { date: String(s.date), balance: balanceStr };
    })
  );

  const realByDate = new Map<string, number>();
  for (const r of decryptedRealSnapshots) {
    const parsed = parseFloat(r.balance);
    if (!isNaN(parsed)) {
      realByDate.set(r.date, parsed);
    }
  }

  // 2. Fetch the earliest transaction date
  const earliestTxDate = await getEarliestTransactionDate(accountId);

  // 3. Determine the earliest date we have any data (real snapshot or transaction)
  const firstReal = decryptedRealSnapshots[0];
  const firstRealDate = firstReal ? firstReal.date : null;

  const calculationStartDate = [earliestTxDate, firstRealDate]
    .filter((d): d is string => !!d)
    .sort()[0];

  // Delete all existing synthetic snapshots for this account to start with a clean slate
  await getDb()
    .delete(accountSnapshots)
    .where(
      and(
        eq(accountSnapshots.accountId, accountId),
        eq(accountSnapshots.userId, userId),
        eq(accountSnapshots.isSynthetic, true)
      )
    );

  if (!calculationStartDate || calculationStartDate > toDate) {
    logger.debug(`${LOG_TAG} No data within range to backfill for account`, { accountId, from: fromDate, to: toDate });
    return { syntheticCount: 0, skippedRealCount: 0 };
  }

  // We only query transactions and calculate balances starting from calculationStartDate
  const effectiveFromDate = calculationStartDate;

  // 4. Fetch all posted transactions in the range [effectiveFromDate, Math.max(toDate, firstRealDate)]
  const effectiveToDate = firstRealDate && firstRealDate > toDate ? firstRealDate : toDate;
  const txs = await getPostedTransactions(accountId, effectiveFromDate, effectiveToDate);

  const txByDate = new Map<string, number>();
  for (const tx of txs) {
    const txDate = tx.date;
    const existing = txByDate.get(txDate) ?? 0;
    let amountStr = tx.amount;
    if (dek) {
      try {
        const decrypted = await decryptField(tx.amount, dek);
        if (decrypted) amountStr = decrypted;
      } catch {
        // Fallback: keep raw value
      }
    }
    const amount = parseFloat(amountStr);
    txByDate.set(txDate, existing + amount);
  }

  const balanceByDate = new Map<string, number>();

  if (firstRealDate && firstReal) {
    // 5. Two-pass backward/forward calculation anchored to the earliest real snapshot
    const firstRealBalance = parseFloat(firstReal.balance);
    const anchorBalance = isNaN(firstRealBalance) ? 0 : firstRealBalance;
    balanceByDate.set(firstRealDate, anchorBalance);

    // Backward Pass: Calculate daily balances backward from firstRealDate to effectiveFromDate (calculationStartDate)
    let current = new Date(firstRealDate + 'T00:00:00Z');
    const startLimit = new Date(effectiveFromDate + 'T00:00:00Z');
    let runningBalance = anchorBalance;

    while (current > startLimit) {
      const dateStr = current.toISOString().split('T')[0];
      const dailyChange = txByDate.get(dateStr) ?? 0;
      runningBalance -= dailyChange;

      current.setUTCDate(current.getUTCDate() - 1);
      const prevDateStr = current.toISOString().split('T')[0];
      balanceByDate.set(prevDateStr, runningBalance);
    }

    // Forward Pass: Calculate daily balances forward from firstRealDate to toDate
    current = new Date(firstRealDate + 'T00:00:00Z');
    const endLimit = new Date(toDate + 'T00:00:00Z');
    runningBalance = anchorBalance;

    while (current < endLimit) {
      current.setUTCDate(current.getUTCDate() + 1);
      const dateStr = current.toISOString().split('T')[0];

      const realBal = realByDate.get(dateStr);
      if (realBal !== undefined) {
        runningBalance = realBal;
      } else {
        const dailyChange = txByDate.get(dateStr) ?? 0;
        runningBalance += dailyChange;
      }
      balanceByDate.set(dateStr, runningBalance);
    }
  } else if (earliestTxDate) {
    // 6. Fallback (no real snapshots): Calculate forward from 0 starting at earliestTxDate
    let current = new Date(earliestTxDate + 'T00:00:00Z');
    const endLimit = new Date(toDate + 'T00:00:00Z');
    let runningBalance = txByDate.get(earliestTxDate) ?? 0;
    balanceByDate.set(earliestTxDate, runningBalance);

    while (current < endLimit) {
      current.setUTCDate(current.getUTCDate() + 1);
      const dateStr = current.toISOString().split('T')[0];
      const dailyChange = txByDate.get(dateStr) ?? 0;
      runningBalance += dailyChange;
      balanceByDate.set(dateStr, runningBalance);
    }
  }

  // 7. Prepare synthetic snapshots starting from the earliest data date (effectiveFromDate)
  // to ensure a full daily history is rebuilt after the slate was cleared.
  const toInsert: Array<{ userId: string; accountId: string; snapshotDate: string; balance: string; isSynthetic: boolean; isImported: boolean }> = [];
  const insertStartDate = effectiveFromDate;
  const start = new Date(insertStartDate + 'T00:00:00Z');
  const end = new Date(toDate + 'T00:00:00Z');
  let current = new Date(start);
  let skippedReal = 0;

  while (current <= end) {
    const dateStr = current.toISOString().split('T')[0];
    if (realByDate.has(dateStr)) {
      skippedReal++;
    } else {
      const bal = balanceByDate.get(dateStr);
      if (bal !== undefined && !isNaN(bal)) {
        toInsert.push({
          userId,
          accountId,
          snapshotDate: dateStr,
          balance: String(bal),
          isSynthetic: true,
          isImported: isAccountImported,
        });
      }
    }
    current.setUTCDate(current.getUTCDate() + 1);
  }

  // 8. Batch insert all synthetic snapshots
  const BATCH_SIZE = 100;
  let syntheticCount = 0;
  if (toInsert.length > 0) {
    const pool = getPool();
    for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
      const chunk = toInsert.slice(i, i + BATCH_SIZE);

      const params: any[] = [];
      const valuePlaceholders: string[] = [];
      let paramIdx = 1;

      for (const row of chunk) {
        const balanceEncrypted = dek ? await encryptField(row.balance, dek) : row.balance;
        params.push(row.userId, row.accountId, row.snapshotDate, balanceEncrypted, row.isSynthetic, row.isImported);
        valuePlaceholders.push(`($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4}, $${paramIdx + 5})`);
        paramIdx += 6;
      }

      const sqlText = `
        INSERT INTO "account_snapshots" ("user_id", "account_id", "snapshot_date", "balance", "is_synthetic", "is_imported")
        VALUES ${valuePlaceholders.join(', ')}
        ON CONFLICT ("user_id", "account_id", "snapshot_date") 
        DO UPDATE SET "balance" = EXCLUDED.balance, "is_synthetic" = EXCLUDED.is_synthetic, "is_imported" = EXCLUDED.is_imported
        RETURNING "id"
      `;

      try {
        const result = await pool.query(sqlText, params);
        syntheticCount += result.rows.length;
      } catch (err) {
        logger.error(`${LOG_TAG} Batch insert failed`, { error: err instanceof Error ? err.message : String(err), chunkSize: chunk.length });
        throw err;
      }
    }
  }

  logger.debug(`${LOG_TAG} Backfill complete`, {
    accountId,
    range: { from: fromDate, to: toDate },
    syntheticCount,
    skippedRealCount: skippedReal,
    durationMs: Date.now() - startedAt,
  });

  return { syntheticCount, skippedRealCount: skippedReal };
}

/**
 * Regenerate the net_worth_snapshots table historically for a user.
 */
export async function recalculateNetWorthSnapshots(userId: string, dek?: Uint8Array) {
  const db = getDb();

  // 1. Get all accounts
  const userAccounts = await db
    .select()
    .from(accounts)
    .where(eq(accounts.userId, userId));

  if (userAccounts.length === 0) {
    await db.delete(netWorthSnapshots).where(eq(netWorthSnapshots.userId, userId));
    return;
  }

  // 2. Get all snapshots for this user
  const snaps = await db
    .select({
      accountId: accountSnapshots.accountId,
      snapshotDate: accountSnapshots.snapshotDate,
      balance: accountSnapshots.balance,
      isSynthetic: accountSnapshots.isSynthetic,
      isImported: accountSnapshots.isImported,
    })
    .from(accountSnapshots)
    .where(eq(accountSnapshots.userId, userId))
    .orderBy(asc(accountSnapshots.snapshotDate));

  if (snaps.length === 0) {
    await db.delete(netWorthSnapshots).where(eq(netWorthSnapshots.userId, userId));
    return;
  }

  // Decrypt snapshot balances
  const decryptedSnaps = await Promise.all(
    snaps.map(async (s) => {
      let balance = 0;
      if (dek) {
        try {
          const decrypted = await decryptField(s.balance, dek);
          balance = parseFloat(decrypted);
          if (isNaN(balance)) balance = 0;
        } catch {
          balance = 0;
        }
      } else {
        balance = parseFloat(s.balance);
        if (isNaN(balance)) balance = 0;
      }
      return { ...s, balance };
    })
  );

  // Group snapshots by date
  const snapsByDate = new Map<string, Array<{ accountId: string; balance: number }>>();
  for (const s of decryptedSnaps) {
    const d = s.snapshotDate;
    if (!snapsByDate.has(d)) {
      snapsByDate.set(d, []);
    }
    snapsByDate.get(d)!.push({ accountId: s.accountId, balance: s.balance });
  }

  // Get all unique dates in sorted order
  const sortedDates = Array.from(snapsByDate.keys()).sort((a, b) => a.localeCompare(b));

  // Decrypt account details to check types
  const decryptedAccounts = dek ? await decryptRows('accounts', userAccounts, dek) : userAccounts;

  const latestByAccount = new Map<string, number>();

  // Clear existing net worth snapshots
  await db.delete(netWorthSnapshots).where(eq(netWorthSnapshots.userId, userId));

  // Iterate dates and calculate net worth
  for (const dateStr of sortedDates) {
    // Update latest balances for the day
    for (const snap of snapsByDate.get(dateStr)!) {
      latestByAccount.set(snap.accountId, snap.balance);
    }

    let totalAssets = 0;
    let totalLiabilities = 0;
    const breakdown: Record<string, { count: number; value: number }> = {};

    for (const acc of decryptedAccounts) {
      if (acc.isExcludedFromNetWorth || acc.isHidden) continue;

      const bal = latestByAccount.get(acc.id) ?? 0;
      const accountType = acc.type.toLowerCase();

      if (isAssetAccount(accountType)) {
        totalAssets += bal;
      } else if (isLiabilityAccount(accountType)) {
        totalLiabilities += Math.abs(bal);
      }

      if (!breakdown[accountType]) {
        breakdown[accountType] = { count: 0, value: 0 };
      }
      breakdown[accountType].count++;
      breakdown[accountType].value += bal;
    }

    const netWorth = totalAssets - totalLiabilities;

    const nwValues = {
      userId,
      snapshotDate: dateStr,
      totalAssets: String(totalAssets),
      totalLiabilities: String(totalLiabilities),
      netWorth: String(netWorth),
      breakdown,
    };

    const encryptedNw = dek ? await encryptRow('net_worth_snapshots', nwValues, dek) : nwValues;

    await db.insert(netWorthSnapshots).values(encryptedNw);
  }
}
