import { getDb, getPool } from '@/lib/db';
import { accountSnapshots, transactions } from '@/lib/db/schema';
import { eq, and, lt, lte, gte, asc, desc, isNull, sql } from 'drizzle-orm';
import { decryptField, encryptField } from '@/lib/crypto';
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

  // 7. Prepare synthetic snapshots ONLY for the requested range [fromDate, toDate]
  // and do not go further back than calculationStartDate (effectiveFromDate)
  const toInsert: Array<{ userId: string; accountId: string; snapshotDate: string; balance: string; isSynthetic: boolean }> = [];
  const insertStartDate = fromDate > effectiveFromDate ? fromDate : effectiveFromDate;
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
        params.push(row.userId, row.accountId, row.snapshotDate, balanceEncrypted, row.isSynthetic);
        valuePlaceholders.push(`($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4})`);
        paramIdx += 5;
      }

      const sqlText = `
        INSERT INTO "account_snapshots" ("user_id", "account_id", "snapshot_date", "balance", "is_synthetic")
        VALUES ${valuePlaceholders.join(', ')}
        ON CONFLICT ("user_id", "account_id", "snapshot_date") 
        DO UPDATE SET "balance" = EXCLUDED.balance, "is_synthetic" = EXCLUDED.is_synthetic
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
