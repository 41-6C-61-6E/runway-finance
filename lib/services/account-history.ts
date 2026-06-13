import { getDb, getPool } from '@/lib/db';
import { accountSnapshots, transactions, accounts, netWorthSnapshots, userSettings, holdingSnapshots } from '@/lib/db/schema';
import { eq, and, lt, lte, gte, asc, desc, isNull, sql, inArray } from 'drizzle-orm';
import { decryptField, encryptField, encryptRow, decryptRows } from '@/lib/crypto';
import { isAssetAccount, isLiabilityAccount, isInvestmentAccount } from '@/lib/utils/account-scope';
import { logger } from '@/lib/logger';
import { getAccountCurrentBalance } from './asset-estimator';

const LOG_TAG = '[account-history]';

async function getLatestRealSnapshot(
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

async function getPostedTransactions(
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
      isImported: accountSnapshots.isImported,
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
      return { 
        id: s.id, 
        date: s.snapshotDate, 
        balance: parseFloat(balanceStr) || 0,
        isImported: s.isImported,
      };
    })
  );

  const idsToDelete: string[] = [];

  for (let i = 0; i < decryptedSnaps.length; i++) {
    const current = decryptedSnaps[i];
    
    // Explicitly preserve user-imported CSV snapshot records
    if (current.isImported) {
      continue;
    }

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

        // Synced accounts (isImported = false) can be safely deleted over a wider range (up to 45 days)
        if (diffDays <= 45) {
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

  // Fetch account to see if it is a mortgage or investment
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

  const isInvestment = account?.type && isInvestmentAccount(account.type);
  let ignoreSettlementTransactions = false;

  if (isInvestment) {
    // Check if investments synthetic data toggle is enabled and if market data estimation is enabled
    const [settings] = await getDb()
      .select({ 
        showSyntheticData: userSettings.showSyntheticData,
        useMarketDataForSnapshots: userSettings.useMarketDataForSnapshots,
      })
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);
    
    const showSynthetic = settings?.showSyntheticData as Record<string, boolean> | null;
    const isInvestmentsEnabled = showSynthetic?.global !== false && showSynthetic?.investments !== false;
    const useMarketData = settings?.useMarketDataForSnapshots === true;

    if (!isInvestmentsEnabled) {
      // Delete any existing synthetic snapshots for this account
      await getDb()
        .delete(accountSnapshots)
        .where(
          and(
            eq(accountSnapshots.accountId, accountId),
            eq(accountSnapshots.userId, userId),
            eq(accountSnapshots.isSynthetic, true)
          )
        );
      logger.debug(`${LOG_TAG} Skipping historical snapshot generation for investment account (disabled in settings)`, { accountId });
      return { syntheticCount: 0, skippedRealCount: 0 };
    }

    if (useMarketData) {
      const marketCount = await generateInvestmentMarketSnapshots(accountId, userId, fromDate, toDate, dek);
      if (marketCount !== null) {
        return { syntheticCount: marketCount, skippedRealCount: 0 };
      }
    }

    if (account.metadata) {
      try {
        const decryptedMeta = dek ? await decryptField(account.metadata, dek) : account.metadata;
        if (decryptedMeta) {
          const meta = JSON.parse(decryptedMeta);
          ignoreSettlementTransactions = !!meta.ignoreSettlementTransactions;
        }
      } catch (err) {
        logger.warn(`${LOG_TAG} Failed to decrypt metadata for investment account`, { accountId, err });
      }
    }
  }

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

  // Extract loan origination metadata for non-mortgage liability accounts (studentloan, loan, autoloan, otherloan)
  let loanOriginationAmount: number | undefined;
  let loanOriginationDate: string | undefined;
  if (account?.type && isLiabilityAccount(account.type) && account.type !== 'mortgage' && account.metadata) {
    try {
      const decryptedMeta = dek ? await decryptField(account.metadata, dek) : account.metadata;
      if (decryptedMeta) {
        const meta = JSON.parse(decryptedMeta);
        const rawAmount = meta.originalLoanAmount;
        if (rawAmount) {
          const parsed = parseFloat(rawAmount);
          if (!isNaN(parsed) && parsed > 0) {
            loanOriginationAmount = parsed;
            loanOriginationDate = meta.purchaseDate as string | undefined;
          }
        }
      }
    } catch (err) {
      logger.warn(`${LOG_TAG} Failed to decrypt metadata for loan account`, { accountId, err });
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

    const calculationStartDate = [earliestTxDate, firstRealDate, loanOriginationDate]
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

  if (ignoreSettlementTransactions) {
    for (const [dateStr, dayTxs] of txsByDate.entries()) {
      const ignoredIndexes = new Set<number>();
      for (let i = 0; i < dayTxs.length; i++) {
        if (ignoredIndexes.has(i)) continue;
        const txA = dayTxs[i];
        if (txA.amount > 0) {
          const targetAmount = -txA.amount;
          for (let j = 0; j < dayTxs.length; j++) {
            if (i === j || ignoredIndexes.has(j)) continue;
            const txB = dayTxs[j];
            if (Math.abs(txB.amount - targetAmount) < 0.005) {
              ignoredIndexes.add(j);
              break;
            }
          }
        }
      }
      if (ignoredIndexes.size > 0) {
        txsByDate.set(
          dateStr,
          dayTxs.filter((_, idx) => !ignoredIndexes.has(idx))
        );
      }
    }
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
      // Determine starting balance: use loan origination amount if available
      const startingBalance = (loanOriginationAmount !== undefined && loanOriginationDate !== undefined && loanOriginationDate <= earliestTxDate)
        ? loanOriginationAmount
        : (loanOriginationAmount !== undefined ? loanOriginationAmount : 0);

      // If anchored from loan origination data, pre-fill dates from origination to earliestTxDate
      if (loanOriginationAmount !== undefined && loanOriginationDate !== undefined && loanOriginationDate < earliestTxDate) {
        let fillDate = new Date(loanOriginationDate + 'T00:00:00Z');
        const txStartDate = new Date(earliestTxDate + 'T00:00:00Z');
        while (fillDate < txStartDate) {
          balanceByDate.set(fillDate.toISOString().split('T')[0], startingBalance);
          fillDate.setUTCDate(fillDate.getUTCDate() + 1);
        }
      }

      let current = new Date(earliestTxDate + 'T00:00:00Z');
      const endLimit = new Date(calculationToDate + 'T00:00:00Z');
      const dailyChange = getDailyChange(earliestTxDate, startingBalance);
      let runningBalance = startingBalance + dailyChange;
      balanceByDate.set(earliestTxDate, runningBalance);

      while (current < endLimit) {
        current.setUTCDate(current.getUTCDate() + 1);
        const dateStr = current.toISOString().split('T')[0];
        const realBal = realByDate.get(dateStr);
        if (realBal !== undefined) {
          runningBalance = realBal;
        } else {
          const nextDailyChange = getDailyChange(dateStr, runningBalance);
          runningBalance += nextDailyChange;
        }
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

    await db.insert(netWorthSnapshots).values(encryptedNw).onConflictDoUpdate({
      target: [netWorthSnapshots.userId, netWorthSnapshots.snapshotDate],
      set: encryptedNw,
    });
  }
}

function toDateString(d: any): string {
  if (d instanceof Date) {
    return d.toISOString().split('T')[0];
  }
  if (typeof d === 'string') {
    return d.split('T')[0];
  }
  return String(d);
}

const TICKER_MAPPINGS: Record<string, string> = {
  'LMCSTK': 'LMT',
  'LMCMBI': 'AGG',
  'LMSMPH': 'IWM',
  'LMMEPH': 'IJH',
};

const CONSTANT_PRICE_TICKERS = new Set(['SCHMMF', 'LMCSVF', 'SCHSEC']);

export async function generateInvestmentMarketSnapshots(
  accountId: string,
  userId: string,
  fromDate: string,
  toDate: string,
  dek?: Uint8Array
): Promise<number | null> {
  const db = getDb();
  
  // 1. Get all holding snapshots for this account
  const dbSnapshots = await db
    .select()
    .from(holdingSnapshots)
    .where(
      and(
        eq(holdingSnapshots.accountId, accountId),
        eq(holdingSnapshots.userId, userId)
      )
    )
    .orderBy(asc(holdingSnapshots.snapshotDate));

  if (dbSnapshots.length === 0) {
    logger.debug(`${LOG_TAG} No holding snapshots available for investment account ${accountId}, falling back to transaction-based calculation`);
    return null;
  }

  // 2. Decrypt holding snapshots
  const decryptedSnaps = await decryptRows('holding_snapshots', dbSnapshots, dek);

  // Group snapshots by date
  const snapsByDate = new Map<string, typeof decryptedSnaps>();
  for (const s of decryptedSnaps) {
    const dateStr = toDateString(s.snapshotDate);
    if (!snapsByDate.has(dateStr)) {
      snapsByDate.set(dateStr, []);
    }
    snapsByDate.get(dateStr)!.push(s);
  }

  // Get all unique dates in sorted order
  const sortedSnapshotDates = Array.from(snapsByDate.keys()).sort((a, b) => a.localeCompare(b));

  // Determine unique valid tickers
  const uniqueTickers = new Set<string>();
  const isValidTicker = (t: string) => {
    const clean = t.trim().toUpperCase();
    return clean.length > 0 && clean.length <= 10 && /^[A-Z0-9=\-\.]+$/.test(clean);
  };

  for (const s of decryptedSnaps) {
    if (s.ticker && isValidTicker(s.ticker)) {
      uniqueTickers.add(s.ticker.toUpperCase().trim());
    }
  }

  // Determine overall range of days to evaluate
  // We calculate daily valuations from the first holding snapshot date (or fromDate, whichever is earlier) to toDate
  const calculationStartDate = sortedSnapshotDates[0] < fromDate ? sortedSnapshotDates[0] : fromDate;
  const start = new Date(calculationStartDate + 'T00:00:00Z');
  const end = new Date(toDate + 'T00:00:00Z');
  const dailyDates: string[] = [];
  let curr = new Date(start);
  while (curr <= end) {
    dailyDates.push(curr.toISOString().split('T')[0]);
    curr.setUTCDate(curr.getUTCDate() + 1);
  }

  // 3. Fetch historical prices from Yahoo Finance for each unique ticker
  const tickerPrices = new Map<string, Map<string, number>>();
  
  // Pre-populate constant-price tickers with 1.00
  for (const ticker of uniqueTickers) {
    if (CONSTANT_PRICE_TICKERS.has(ticker)) {
      const priceMap = new Map<string, number>();
      for (const d of dailyDates) {
        priceMap.set(d, 1.00);
      }
      tickerPrices.set(ticker, priceMap);
    }
  }

  const fetchableTickers = Array.from(uniqueTickers).filter(t => !CONSTANT_PRICE_TICKERS.has(t));

  if (fetchableTickers.length > 0) {
    const startTs = Math.floor(new Date(fromDate + 'T00:00:00Z').getTime() / 1000);
    const endTs = Math.floor(new Date(toDate + 'T00:00:00Z').getTime() / 1000) + 86400; // include end date

    await Promise.all(
      fetchableTickers.map(async (ticker) => {
        try {
          const mappedTicker = TICKER_MAPPINGS[ticker] ?? ticker;
          const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(mappedTicker)}?period1=${startTs}&period2=${endTs}&interval=1d`;
          const res = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            signal: AbortSignal.timeout(8000),
          });
          if (!res.ok) {
            logger.warn(`${LOG_TAG} Yahoo Finance fetch failed for ticker ${ticker} (mapped to ${mappedTicker}): ${res.status}`);
            return;
          }
          const data = await res.json() as any;
          const timestamps = data?.chart?.result?.[0]?.timestamp;
          const closes = data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
          if (timestamps && closes) {
            const priceMap = new Map<string, number>();
            for (let i = 0; i < timestamps.length; i++) {
              const dateStr = new Date(timestamps[i] * 1000).toISOString().split('T')[0];
              const price = parseFloat(closes[i]);
              if (!isNaN(price)) {
                priceMap.set(dateStr, price);
              }
            }
            tickerPrices.set(ticker, priceMap); // Store under the original ticker
          }
        } catch (err) {
          logger.warn(`${LOG_TAG} Error fetching Yahoo Finance history for ticker ${ticker}:`, err);
        }
      })
    );
  }

  // 4. Generate daily raw holdings valuations V(t)
  const valuationByDate = new Map<string, number>();
  const activeHoldingsBySecurity = new Map<string, { ticker: string | null, name: string | null, quantity: number, price: number }>();

  // Walk forward day by day to compute daily V(t)
  for (const dateStr of dailyDates) {
    // If we have a snapshot on this date, update the active positions
    const daySnaps = snapsByDate.get(dateStr);
    if (daySnaps) {
      activeHoldingsBySecurity.clear();
      for (const s of daySnaps) {
        const securityId = s.securityId || s.ticker || s.name || '';
        if (securityId) {
          activeHoldingsBySecurity.set(securityId, {
            ticker: s.ticker,
            name: s.name,
            quantity: parseFloat(s.quantity) || 0,
            price: parseFloat(s.price) || 0,
          });
        }
      }
    }

    // Calculate total value V(t) for this day
    let dailyValuation = 0;
    for (const pos of activeHoldingsBySecurity.values()) {
      let price = pos.price; // fallback to last known price from snapshot
      if (pos.ticker) {
        const tickerUpper = pos.ticker.toUpperCase().trim();
        const priceMap = tickerPrices.get(tickerUpper);
        if (priceMap) {
          const yahooPrice = priceMap.get(dateStr);
          if (yahooPrice !== undefined) {
            price = yahooPrice;
          } else {
            // Weekend/holiday lookback: carry forward the most recent price from Yahoo Finance
            let lookbackDate = new Date(dateStr + 'T00:00:00Z');
            for (let d = 0; d < 10; d++) {
              lookbackDate.setUTCDate(lookbackDate.getUTCDate() - 1);
              const lookbackStr = lookbackDate.toISOString().split('T')[0];
              const prevPrice = priceMap.get(lookbackStr);
              if (prevPrice !== undefined) {
                price = prevPrice;
                break;
              }
            }
          }
        }
      }
      dailyValuation += pos.quantity * price;
    }
    valuationByDate.set(dateStr, dailyValuation);
  }

  // 5. Get all real (confirmed) snapshots of the account balance to anchor
  const realSnaps = await db
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

  const decryptedReal = await Promise.all(
    realSnaps.map(async (s) => {
      let balanceStr = String(s.balance);
      if (dek) {
        try {
          const decrypted = await decryptField(s.balance, dek);
          if (decrypted) balanceStr = decrypted;
        } catch {}
      }
      return { date: toDateString(s.date), balance: parseFloat(balanceStr) || 0 };
    })
  );

  // If there are no real snapshots, treat today as a real snapshot with currentBalance
  if (decryptedReal.length === 0) {
    const currentBalance = await getAccountCurrentBalance(accountId, dek);
    const todayStr = new Date().toISOString().split('T')[0];
    decryptedReal.push({ date: todayStr, balance: currentBalance });
  }

  // Group real snapshots by date for anchoring
  const realByDate = new Map<string, number>();
  for (const r of decryptedReal) {
    realByDate.set(r.date, r.balance);
  }

  const sortedRealDates = Array.from(realByDate.keys()).sort((a, b) => a.localeCompare(b));

  // Function to get discrepancy D(t) for a date
  const getDiscrepancy = (dateStr: string): number => {
    const realBal = realByDate.get(dateStr);
    if (realBal === undefined) return 0;
    const estVal = valuationByDate.get(dateStr) || 0;
    return realBal - estVal;
  };

  // Compute discrepancy D(t) on dates with real snapshots
  const realDiscrepancy = new Map<string, number>();
  for (const d of sortedRealDates) {
    realDiscrepancy.set(d, getDiscrepancy(d));
  }

  // 6. Calculate discrepancy D(t) for all dates in dailyDates by interpolation
  const interpolatedDiscrepancy = new Map<string, number>();
  for (const dateStr of dailyDates) {
    // Find surrounding real snapshots
    let prevRealDate: string | null = null;
    let nextRealDate: string | null = null;

    for (const d of sortedRealDates) {
      if (d <= dateStr) {
        prevRealDate = d;
      }
      if (d >= dateStr && nextRealDate === null) {
        nextRealDate = d;
      }
    }

    if (prevRealDate !== null && nextRealDate !== null) {
      if (prevRealDate === nextRealDate) {
        interpolatedDiscrepancy.set(dateStr, realDiscrepancy.get(prevRealDate)!);
      } else {
        const d1 = realDiscrepancy.get(prevRealDate)!;
        const d2 = realDiscrepancy.get(nextRealDate)!;
        const t1 = new Date(prevRealDate + 'T00:00:00Z').getTime();
        const t2 = new Date(nextRealDate + 'T00:00:00Z').getTime();
        const t = new Date(dateStr + 'T00:00:00Z').getTime();
        const fraction = (t - t1) / (t2 - t1);
        interpolatedDiscrepancy.set(dateStr, d1 + (d2 - d1) * fraction);
      }
    } else if (prevRealDate !== null) {
      interpolatedDiscrepancy.set(dateStr, realDiscrepancy.get(prevRealDate)!);
    } else if (nextRealDate !== null) {
      interpolatedDiscrepancy.set(dateStr, realDiscrepancy.get(nextRealDate)!);
    } else {
      interpolatedDiscrepancy.set(dateStr, 0);
    }
  }

  // 7. Calculate daily estimated balance B(t) = V(t) + D(t)
  const finalBalances = new Map<string, number>();
  for (const dateStr of dailyDates) {
    const v = valuationByDate.get(dateStr) || 0;
    const d = interpolatedDiscrepancy.get(dateStr) || 0;
    finalBalances.set(dateStr, v + d);
  }

  // 8. Delete existing synthetic snapshots for this account in the date range
  await db
    .delete(accountSnapshots)
    .where(
      and(
        eq(accountSnapshots.accountId, accountId),
        eq(accountSnapshots.userId, userId),
        eq(accountSnapshots.isSynthetic, true)
      )
    );

  // 9. Batch insert estimated snapshots
  const toInsert: Array<{ userId: string; accountId: string; snapshotDate: string; balance: string; isSynthetic: boolean; isImported: boolean }> = [];
  const [account] = await db
    .select({ externalId: accounts.externalId })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);
  const isAccountImported = account?.externalId?.startsWith('imported-') ?? false;

  for (const dateStr of dailyDates) {
    // Only insert for dates >= fromDate (to respect the requested range)
    if (dateStr < fromDate) continue;
    // Don't overwrite real snapshots
    if (realByDate.has(dateStr)) continue;

    const bal = finalBalances.get(dateStr);
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

  if (toInsert.length > 0) {
    const BATCH_SIZE = 100;
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
      `;

      try {
        await pool.query(sqlText, params);
      } catch (err) {
        logger.error(`${LOG_TAG} Investment market-based batch insert failed`, { error: err instanceof Error ? err.message : String(err) });
        return null;
      }
    }
  }

  logger.info(`${LOG_TAG} Generated ${toInsert.length} market-based synthetic snapshots for account ${accountId}`);
  return toInsert.length;
}
