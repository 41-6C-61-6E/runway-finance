import { getDb, getPool } from '@/lib/db';
import { accountSnapshots, transactions, accounts, netWorthSnapshots } from '@/lib/db/schema';
import { eq, and, lt, lte, gte, asc, desc, isNull, sql, inArray } from 'drizzle-orm';
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
    } catch (err) {
      // Fallback: keep raw value if decryption fails
      logger.warn(`${LOG_TAG} Failed to decrypt real snapshot balance`, {
        accountId,
        error: err instanceof Error ? err.message : String(err),
      });
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
    .where(and(eq(transactions.accountId, accountId), eq(transactions.deleted, false)))
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
    description: string;
  }>
> {
  return getDb()
    .select({
      date: transactions.date,
      postedDate: transactions.postedDate,
      amount: transactions.amount,
      description: transactions.description,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.accountId, accountId),
        gte(transactions.date, fromDate),
        lte(transactions.date, toDate),
        eq(transactions.pending, false),
        eq(transactions.deleted, false)
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
/**
 * Retroactively clean up any transient zero-balance snapshots before recalculation.
 * Deletes real snapshots that have balance of 0 if they represent a brief dropout
 * (i.e. surrounded by non-zero balances within 5 days).
 */
export async function cleanupTransientZeroSnapshots(
  accountId: string,
  userId: string,
  dek?: Uint8Array
) {
  const db = getDb();
  
  const realSnapshots = await db
    .select({
      id: accountSnapshots.id,
      snapshotDate: accountSnapshots.snapshotDate,
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

  if (realSnapshots.length < 3) return;

  const decryptedSnaps = await Promise.all(
    realSnapshots.map(async (s) => {
      let balanceStr = String(s.balance);
      if (dek) {
        try {
          const decrypted = await decryptField(s.balance, dek);
          if (decrypted) balanceStr = decrypted;
        } catch (err) {
          // Ignore
        }
      }
      return { id: s.id, date: s.snapshotDate, balance: parseFloat(balanceStr) || 0 };
    })
  );

  const idsToDelete: string[] = [];

  for (let i = 0; i < decryptedSnaps.length; i++) {
    const current = decryptedSnaps[i];
    if (current.balance === 0) {
      let prevIdx = i - 1;
      while (prevIdx >= 0 && decryptedSnaps[prevIdx].balance === 0) {
        prevIdx--;
      }
      
      let nextIdx = i + 1;
      while (nextIdx < decryptedSnaps.length && decryptedSnaps[nextIdx].balance === 0) {
        nextIdx++;
      }

      if (prevIdx >= 0 && nextIdx < decryptedSnaps.length) {
        const prev = decryptedSnaps[prevIdx];
        const next = decryptedSnaps[nextIdx];
        
        const prevDate = new Date(prev.date + 'T00:00:00Z');
        const nextDate = new Date(next.date + 'T00:00:00Z');
        const diffDays = (nextDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24);

        if (diffDays <= 5) {
          idsToDelete.push(current.id);
        }
      }
    }
  }

  if (idsToDelete.length > 0) {
    logger.info(`${LOG_TAG} Deleting transient zero-balance snapshots for account ${accountId}`, {
      count: idsToDelete.length,
      dates: decryptedSnaps.filter(s => idsToDelete.includes(s.id)).map(s => s.date),
    });
    await db
      .delete(accountSnapshots)
      .where(
        and(
          eq(accountSnapshots.accountId, accountId),
          eq(accountSnapshots.userId, userId),
          inArray(accountSnapshots.id, idsToDelete)
        )
      );
  }
}

export async function generateHistoricalAccountSnapshots(
  accountId: string,
  userId: string,
  fromDate: string,
  toDate: string,
  dek?: Uint8Array,
  watermarkDate?: string
): Promise<{ syntheticCount: number; skippedRealCount: number }> {
  const startedAt = Date.now();

  // Retroactively clean up transient zero-balance snapshots before recalculation
  await cleanupTransientZeroSnapshots(accountId, userId, dek);

  // Fetch account to see if it is a mortgage
  const [account] = await getDb()
    .select({
      externalId: accounts.externalId,
      type: accounts.type,
      metadata: accounts.metadata,
    })
    .from(accounts)
    .where(
      and(
        eq(accounts.id, accountId),
        eq(accounts.userId, userId)
      )
    )
    .limit(1);

  const isAccountImported = account?.externalId?.startsWith('imported-') ?? false;

  // Let's get the mortgage metadata if applicable
  let isMortgage = false;
  let interestRate = 0;
  let escrowAmount = 0;
  let expectedPayment = 0;
  let endEventDateStr: string | undefined = undefined;

  if (account?.type === 'mortgage' && account.metadata) {
    try {
      const decryptedMeta = dek ? await decryptField(account.metadata, dek) : account.metadata;
      if (decryptedMeta) {
        const meta = JSON.parse(decryptedMeta);
        interestRate = parseFloat(meta.interestRate) || 0;
        escrowAmount = parseFloat(meta.escrow) || parseFloat(meta.escrowAmount) || 0;
        const monthlyPayment = parseFloat(meta.monthlyPayment) || 0;
        expectedPayment = monthlyPayment + escrowAmount;
        isMortgage = true;

        const status = meta.mortgageStatus as string | undefined;
        endEventDateStr = status === 'paid_off' ? (meta.payoffDate as string | undefined) : (status === 'refinanced' ? (meta.refinanceDate as string | undefined) : undefined);
      }
    } catch (err) {
      logger.warn(`${LOG_TAG} Failed to decrypt metadata for mortgage account`, { accountId, err });
    }
  }

  const calculationToDate = endEventDateStr && endEventDateStr < toDate ? endEventDateStr : toDate;

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
        } catch (err) {
          // Keep raw value
          logger.warn(`${LOG_TAG} Failed to decrypt historical real snapshot balance`, {
            accountId,
            error: err instanceof Error ? err.message : String(err),
          });
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

  // Check if we can use a watermarked anchor snapshot
  let anchorDate: string | null = null;
  let anchorBalance = 0;
  let hasAnchor = false;

  if (watermarkDate) {
    // Find the latest snapshot (real or synthetic) strictly before watermarkDate
    const [latestSnap] = await getDb()
      .select({
        snapshotDate: accountSnapshots.snapshotDate,
        balance: accountSnapshots.balance,
      })
      .from(accountSnapshots)
      .where(
        and(
          eq(accountSnapshots.accountId, accountId),
          eq(accountSnapshots.userId, userId),
          lt(accountSnapshots.snapshotDate, watermarkDate)
        )
      )
      .orderBy(desc(accountSnapshots.snapshotDate))
      .limit(1);

    if (latestSnap) {
      anchorDate = latestSnap.snapshotDate;
      const decrypted = dek ? await decryptField(latestSnap.balance, dek) : latestSnap.balance;
      anchorBalance = parseFloat(decrypted) || 0;
      hasAnchor = true;
      logger.debug(`${LOG_TAG} Found anchor snapshot for watermarking`, { accountId, date: anchorDate, balance: anchorBalance });
    }
  }

  const balanceByDate = new Map<string, number>();
  let effectiveFromDate: string;
  let effectiveToDate: string;

  if (hasAnchor && anchorDate) {
    effectiveFromDate = anchorDate;
    effectiveToDate = calculationToDate;
    balanceByDate.set(anchorDate, anchorBalance);

    // Delete existing synthetic snapshots from anchorDate onwards
    await getDb()
      .delete(accountSnapshots)
      .where(
        and(
          eq(accountSnapshots.accountId, accountId),
          eq(accountSnapshots.userId, userId),
          eq(accountSnapshots.isSynthetic, true),
          gte(accountSnapshots.snapshotDate, anchorDate)
        )
      );
  } else {
    // Fall back to full history calculation
    // 2. Fetch the earliest transaction date
    const earliestTxDate = await getEarliestTransactionDate(accountId);

    // 3. Determine the earliest date we have any data (real snapshot or transaction)
    const firstReal = decryptedRealSnapshots[0];
    const firstRealDate = firstReal ? firstReal.date : null;

    const calculationStartDate = [earliestTxDate, firstRealDate]
      .filter((d): d is string => !!d)
      .sort()[0];

    // Delete existing synthetic snapshots from fromDate onwards
    await getDb()
      .delete(accountSnapshots)
      .where(
        and(
          eq(accountSnapshots.accountId, accountId),
          eq(accountSnapshots.userId, userId),
          eq(accountSnapshots.isSynthetic, true),
          gte(accountSnapshots.snapshotDate, fromDate)
        )
      );

    if (!calculationStartDate || calculationStartDate > calculationToDate) {
      logger.debug(`${LOG_TAG} No data within range to backfill for account`, { accountId, from: fromDate, to: calculationToDate });
      return { syntheticCount: 0, skippedRealCount: 0 };
    }

    effectiveFromDate = calculationStartDate;
    effectiveToDate = firstRealDate && firstRealDate > calculationToDate ? firstRealDate : calculationToDate;
  }

  // 4. Fetch posted transactions in the range [effectiveFromDate, effectiveToDate]
  const txs = await getPostedTransactions(accountId, effectiveFromDate, effectiveToDate);

  const txsByDate = new Map<string, Array<{ amount: number; description: string }>>();
  for (const tx of txs) {
    const txDate = tx.date;
    let amountStr = tx.amount;
    if (dek) {
      try {
        const decrypted = await decryptField(tx.amount, dek);
        if (decrypted) amountStr = decrypted;
      } catch (err) {
        logger.warn(`${LOG_TAG} Failed to decrypt transaction amount for snapshot calculations`, {
          accountId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    const amount = parseFloat(amountStr);

    let descriptionStr = '';
    if (tx.description) {
      try {
        descriptionStr = dek ? await decryptField(tx.description, dek) : tx.description;
      } catch (err) {
        // ignore
      }
    }

    if (!txsByDate.has(txDate)) {
      txsByDate.set(txDate, []);
    }
    txsByDate.get(txDate)!.push({ amount, description: descriptionStr });
  }

  const getDailyChange = (dateStr: string, currentBal: number): number => {
    const dayTxs = txsByDate.get(dateStr);
    if (!dayTxs || dayTxs.length === 0) return 0;

    let netChange = 0;
    for (const tx of dayTxs) {
      if (isMortgage) {
        const descLower = tx.description.toLowerCase();
        let isPymt = descLower.includes('monthly payment') || descLower.includes('mortgage payment') || descLower.includes('mortgage pymt');
        if (!isPymt && expectedPayment > 0) {
          const ratio = tx.amount / expectedPayment;
          if (ratio > 0.85 && ratio < 1.15 && !descLower.includes('additional') && !descLower.includes('extra') && !descLower.includes('payoff')) {
            isPymt = true;
          }
        }

        if (isPymt) {
          const monthlyRate = interestRate / 100 / 12;
          const interest = Math.abs(currentBal) * monthlyRate;
          const principalReduction = tx.amount - interest - escrowAmount;
          netChange += principalReduction;
        } else {
          netChange += tx.amount;
        }
      } else {
        netChange += tx.amount;
      }
    }
    return netChange;
  };

  // Perform daily snapshot balance computation
  if (hasAnchor && anchorDate) {
    // Only forward pass needed starting from anchorBalance at anchorDate
    let current = new Date(anchorDate + 'T00:00:00Z');
    const endLimit = new Date(calculationToDate + 'T00:00:00Z');
    let runningBalance = anchorBalance;

    while (current < endLimit) {
      current.setUTCDate(current.getUTCDate() + 1);
      const dateStr = current.toISOString().split('T')[0];

      const realBal = realByDate.get(dateStr);
      if (realBal !== undefined) {
        runningBalance = realBal;
      } else {
        const dailyChange = getDailyChange(dateStr, runningBalance);
        runningBalance += dailyChange;
      }
      balanceByDate.set(dateStr, runningBalance);
    }
  } else {
    // Original two-pass logic or fallback for full history calculation
    const earliestTxDate = await getEarliestTransactionDate(accountId);
    const firstReal = decryptedRealSnapshots[0];
    const firstRealDate = firstReal ? firstReal.date : null;

    if (firstRealDate && firstReal) {
      const firstRealBalance = parseFloat(firstReal.balance);
      const anchorVal = isNaN(firstRealBalance) ? 0 : firstRealBalance;
      balanceByDate.set(firstRealDate, anchorVal);

      // Backward Pass
      let current = new Date(firstRealDate + 'T00:00:00Z');
      const startLimit = new Date(effectiveFromDate + 'T00:00:00Z');
      let runningBalance = anchorVal;

      while (current > startLimit) {
        const dateStr = current.toISOString().split('T')[0];
        const dailyChange = getDailyChange(dateStr, runningBalance);
        runningBalance -= dailyChange;

        current.setUTCDate(current.getUTCDate() - 1);
        const prevDateStr = current.toISOString().split('T')[0];
        balanceByDate.set(prevDateStr, runningBalance);
      }

      // Forward Pass
      current = new Date(firstRealDate + 'T00:00:00Z');
      const endLimit = new Date(calculationToDate + 'T00:00:00Z');
      runningBalance = anchorVal;

      while (current < endLimit) {
        current.setUTCDate(current.getUTCDate() + 1);
        const dateStr = current.toISOString().split('T')[0];

        const realBal = realByDate.get(dateStr);
        if (realBal !== undefined) {
          runningBalance = realBal;
        } else {
          const dailyChange = getDailyChange(dateStr, runningBalance);
          runningBalance += dailyChange;
        }
        balanceByDate.set(dateStr, runningBalance);
      }
    } else if (earliestTxDate) {
      let current = new Date(earliestTxDate + 'T00:00:00Z');
      const endLimit = new Date(calculationToDate + 'T00:00:00Z');
      let runningBalance = getDailyChange(earliestTxDate, 0);
      balanceByDate.set(earliestTxDate, runningBalance);

      while (current < endLimit) {
        current.setUTCDate(current.getUTCDate() + 1);
        const dateStr = current.toISOString().split('T')[0];
        const dailyChange = getDailyChange(dateStr, runningBalance);
        runningBalance += dailyChange;
        balanceByDate.set(dateStr, runningBalance);
      }
    }
  }

  // 7. Prepare synthetic snapshots starting from anchorDate or fromDate
  const toInsert: Array<{ userId: string; accountId: string; snapshotDate: string; balance: string; isSynthetic: boolean; isImported: boolean }> = [];
  const insertStartDate = hasAnchor && anchorDate ? anchorDate : (fromDate && fromDate > effectiveFromDate ? fromDate : effectiveFromDate);
  const start = new Date(insertStartDate + 'T00:00:00Z');
  const end = new Date(calculationToDate + 'T00:00:00Z');
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

  // 8. Batch insert
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
    range: { from: insertStartDate, to: toDate },
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
        } catch (err) {
          balance = 0;
          logger.warn(`${LOG_TAG} Failed to decrypt snapshot balance for net worth recalculation`, {
            accountId: s.accountId,
            userId,
            error: err instanceof Error ? err.message : String(err),
          });
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

      const accountType = acc.type.toLowerCase();
      let endEventDateStr: string | undefined = undefined;
      if (accountType === 'mortgage' && acc.metadata) {
        try {
          const meta = typeof acc.metadata === 'string' ? JSON.parse(acc.metadata) : acc.metadata;
          if (meta) {
            const status = meta.mortgageStatus as string | undefined;
            endEventDateStr = status === 'paid_off' ? (meta.payoffDate as string | undefined) : (status === 'refinanced' ? (meta.refinanceDate as string | undefined) : undefined);
          }
        } catch (err) {
          // Ignore parse errors
        }
      }

      if (endEventDateStr && dateStr > endEventDateStr) {
        continue;
      }

      const bal = latestByAccount.get(acc.id) ?? 0;

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
