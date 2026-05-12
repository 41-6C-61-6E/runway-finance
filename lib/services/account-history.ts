import { getDb } from '@/lib/db';
import { accountSnapshots, transactions } from '@/lib/db/schema';
import { eq, and, lt, lte, gte, asc, desc, isNull } from 'drizzle-orm';
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
  onOrBeforeDate: string
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
  toDate: string
): Promise<{ syntheticCount: number; skippedRealCount: number }> {
  const startedAt = Date.now();

  const from = fromDate;
  const to = toDate;

  const latestReal = await getLatestRealSnapshot(accountId, userId, from);

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
      await getDb()
        .insert(accountSnapshots)
        .values({
          userId,
          accountId,
          snapshotDate: from,
          balance: String(runningBalance),
          isSynthetic: true,
        })
        .onConflictDoUpdate({
          target: [accountSnapshots.userId, accountSnapshots.accountId, accountSnapshots.snapshotDate],
          set: { balance: String(runningBalance), isSynthetic: true },
        });
      logger.debug(`${LOG_TAG} Single synthetic snapshot inserted`, { accountId, date: from, balance: runningBalance });
      return { syntheticCount: 1, skippedRealCount: 0 };
    }
    return { syntheticCount: 0, skippedRealCount: 0 };
  }

  const txByDate = new Map<string, number>();
  for (const tx of txs) {
    const txDate = String(tx.postedDate ?? tx.date);
    const existing = txByDate.get(txDate) ?? 0;
    txByDate.set(txDate, existing + parseFloat(tx.amount));
  }

  let current = new Date(effectiveFromDate);
  const end = new Date(to);
  let count = 0;
  let skippedReal = 0;

  while (current <= end) {
    const dateStr = current.toISOString().split('T')[0];

    const [realSnapshot] = await getDb()
      .select({ id: accountSnapshots.id })
      .from(accountSnapshots)
      .where(
        and(
          eq(accountSnapshots.accountId, accountId),
          eq(accountSnapshots.userId, userId),
          eq(accountSnapshots.snapshotDate, dateStr),
          eq(accountSnapshots.isSynthetic, false)
        )
      )
      .limit(1);

    if (realSnapshot) {
      const [realBal] = await getDb()
        .select({ balance: accountSnapshots.balance })
        .from(accountSnapshots)
        .where(
          and(
            eq(accountSnapshots.accountId, accountId),
            eq(accountSnapshots.userId, userId),
            eq(accountSnapshots.snapshotDate, dateStr),
            eq(accountSnapshots.isSynthetic, false)
          )
        )
        .limit(1);
      if (realBal) {
        runningBalance = parseFloat(realBal.balance);
      }
      skippedReal++;
    } else {
      const dailyChange = txByDate.get(dateStr) ?? 0;
      runningBalance += dailyChange;

      await getDb()
        .insert(accountSnapshots)
        .values({
          userId,
          accountId,
          snapshotDate: dateStr,
          balance: String(runningBalance),
          isSynthetic: true,
        })
        .onConflictDoUpdate({
          target: [accountSnapshots.userId, accountSnapshots.accountId, accountSnapshots.snapshotDate],
          set: { balance: String(runningBalance), isSynthetic: true },
        });
      count++;
    }

    current.setDate(current.getDate() + 1);
  }

  logger.debug(`${LOG_TAG} Backfill complete`, {
    accountId,
    range: { from: effectiveFromDate, to },
    syntheticCount: count,
    skippedRealCount: skippedReal,
    durationMs: Date.now() - startedAt,
  });

  return { syntheticCount: count, skippedRealCount: skippedReal };
}
