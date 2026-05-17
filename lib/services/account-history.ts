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
  return { date: String(snapshot.date), balance: String(snapshot.balance) };
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
        gte(transactions.postedDate, fromDate),
        lte(transactions.postedDate, toDate),
        eq(transactions.pending, false)
      )
    )
    .orderBy(asc(transactions.postedDate));
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

  const from = fromDate;
  const to = toDate;

  const latestReal = await getLatestRealSnapshot(accountId, userId, from, dek);

  const earliestTxDate = await getEarliestTransactionDate(accountId);

  let effectiveFromDate: string;
  let runningBalance: number;

  if (latestReal) {
    effectiveFromDate = latestReal.date;
    runningBalance = parseFloat(latestReal.balance);
  } else if (earliestTxDate) {
    effectiveFromDate = earliestTxDate;
    runningBalance = 0;
  } else {
    logger.debug(`${LOG_TAG} No data to backfill for account`, { accountId, from, to });
    return { syntheticCount: 0, skippedRealCount: 0 };
  }

  const txs = await getPostedTransactions(accountId, effectiveFromDate, to);

  if (txs.length === 0) {
    if (effectiveFromDate === from) {
      const pool = getPool();
      await pool.query(
        `INSERT INTO "account_snapshots" ("user_id", "account_id", "snapshot_date", "balance", "is_synthetic")
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT ("user_id", "account_id", "snapshot_date") 
         DO UPDATE SET "balance" = EXCLUDED.balance, "is_synthetic" = EXCLUDED.is_synthetic`,
        [userId, accountId, from, String(runningBalance), true]
      );
      logger.debug(`${LOG_TAG} Single synthetic snapshot inserted`, { accountId, date: from, balance: runningBalance });
      return { syntheticCount: 1, skippedRealCount: 0 };
    }
    return { syntheticCount: 0, skippedRealCount: 0 };
  }

  const txByDate = new Map<string, number>();
  for (const tx of txs) {
    const txDate = String(tx.postedDate ?? tx.date);
    const existing = txByDate.get(txDate) ?? 0;
    const amount = parseFloat(tx.amount);
    txByDate.set(txDate, existing + amount);
  }

  // Batch-fetch all existing real snapshots for the full date range
  const existingReals = await getDb()
    .select({ snapshotDate: accountSnapshots.snapshotDate, balance: accountSnapshots.balance })
    .from(accountSnapshots)
    .where(
      and(
        eq(accountSnapshots.accountId, accountId),
        eq(accountSnapshots.userId, userId),
        gte(accountSnapshots.snapshotDate, effectiveFromDate),
        lte(accountSnapshots.snapshotDate, to),
        eq(accountSnapshots.isSynthetic, false)
      )
    );

  const realByDate = new Map<string, string>();
  for (const r of existingReals) {
    realByDate.set(String(r.snapshotDate), String(r.balance));
  }

  // Use UTC midnight for stable date iteration to avoid DST-related duplicates
  let current = new Date(effectiveFromDate + 'T00:00:00Z');
  const end = new Date(to + 'T00:00:00Z');
  const toInsert: Array<{ userId: string; accountId: string; snapshotDate: string; balance: string; isSynthetic: boolean }> = [];
  const seenDates = new Set<string>();
  let skippedReal = 0;

  while (current <= end) {
    const dateStr = current.toISOString().split('T')[0];
    if (seenDates.has(dateStr)) {
      current.setUTCDate(current.getUTCDate() + 1);
      continue;
    }
    seenDates.add(dateStr);

    const realBal = realByDate.get(dateStr);

    if (realBal !== undefined) {
      runningBalance = parseFloat(realBal);
      skippedReal++;
    } else {
      const dailyChange = txByDate.get(dateStr) ?? 0;
      runningBalance += dailyChange;
      toInsert.push({
        userId,
        accountId,
        snapshotDate: dateStr,
        balance: String(runningBalance),
        isSynthetic: true,
      });
    }

    current.setUTCDate(current.getUTCDate() + 1);
  }

  // Batch insert all synthetic snapshots in chunks to avoid PostgreSQL parameter limits
  const BATCH_SIZE = 100;
  let syntheticCount = 0;
  if (toInsert.length > 0) {
    const pool = getPool();
    for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
      const chunk = toInsert.slice(i, i + BATCH_SIZE);
      
      // Build parameterized SQL query with explicit TEXT cast for balance
      const params: any[] = [];
      const valuePlaceholders: string[] = [];
      let paramIdx = 1;
      
      for (const row of chunk) {
        params.push(row.userId, row.accountId, row.snapshotDate, row.balance, row.isSynthetic);
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
    range: { from: effectiveFromDate, to },
    syntheticCount,
    skippedRealCount: skippedReal,
    durationMs: Date.now() - startedAt,
  });

  return { syntheticCount, skippedRealCount: skippedReal };
}
