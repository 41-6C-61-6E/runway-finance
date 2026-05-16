import { getDb } from '@/lib/db';
import { simplifinConnections, accounts, transactions, syncLogs, netWorthSnapshots, accountSnapshots, monthlyCashFlow, categorySpendingSummary, categoryIncomeSummary, categories } from '@/lib/db/schema';
import { generateHistoricalAccountSnapshots, getEarliestTransactionDate } from '@/lib/services/account-history';
import { applyRulesToTransactions } from '@/lib/services/rules-engine';
import { eq, and, inArray, isNull } from 'drizzle-orm';
import { decryptField, encryptField, encryptRow, decryptRow, decryptRows } from '@/lib/crypto';
import { getSessionDEK, getServerDEK } from '@/lib/crypto-context';
import { fetchAccounts, SimpleFINError } from '@/lib/simplefin';
import { logger } from '@/lib/logger';
import { isAssetAccount, isLiabilityAccount } from '@/lib/utils/account-scope';

const LOG_TAG = '[sync]';

function ms(start: number): number {
  return Date.now() - start;
}

export type SyncResult = {
  status: 'success' | 'error';
  accountsSynced: number;
  transactionsFetched: number;
  transactionsNew: number;
  transactionsUpdated: number;
  errorMessage?: string;
};

export async function createNetWorthSnapshot(userId: string, dek: Uint8Array, snapshotDate: string) {
  const userAccounts = await getDb()
    .select()
    .from(accounts)
    .where(and(
      eq(accounts.userId, userId),
      eq(accounts.isHidden, false),
      eq(accounts.isExcludedFromNetWorth, false)
    ));

  const decrypted = await decryptRows('accounts', userAccounts, dek);

  let totalAssets = 0;
  let totalLiabilities = 0;
  const breakdown: Record<string, { count: number; value: number }> = {};

  for (const acc of decrypted) {
    if (acc.isExcludedFromNetWorth) {
      continue;
    }

    const balance = acc.balance ? parseFloat(acc.balance) : 0;
    const accountType = acc.type.toLowerCase();

    if (isAssetAccount(accountType)) {
      totalAssets += balance;
    } else if (isLiabilityAccount(accountType)) {
      totalLiabilities += Math.abs(balance);
    }

    if (!breakdown[accountType]) {
      breakdown[accountType] = { count: 0, value: 0 };
    }
    breakdown[accountType].count++;
    breakdown[accountType].value += balance;
  }

  const netWorth = totalAssets - totalLiabilities;

  await getDb()
    .insert(netWorthSnapshots)
    .values({
      userId,
      snapshotDate,
      totalAssets: await encryptField(String(totalAssets), dek),
      totalLiabilities: await encryptField(String(totalLiabilities), dek),
      netWorth: await encryptField(String(netWorth), dek),
      breakdown,
    })
    .onConflictDoUpdate({
      target: [netWorthSnapshots.userId, netWorthSnapshots.snapshotDate],
      set: {
        totalAssets: await encryptField(String(totalAssets), dek),
        totalLiabilities: await encryptField(String(totalLiabilities), dek),
        netWorth: await encryptField(String(netWorth), dek),
        breakdown,
      },
    });
}

export async function createAccountSnapshots(userId: string, dek: Uint8Array, snapshotDate: string) {
  const userAccounts = await getDb()
    .select()
    .from(accounts)
    .where(and(
      eq(accounts.userId, userId),
      eq(accounts.isHidden, false),
      eq(accounts.isExcludedFromNetWorth, false)
    ));

  const decrypted = await decryptRows('accounts', userAccounts, dek);

  for (const acc of decrypted) {
    await getDb()
      .insert(accountSnapshots)
      .values({
        userId,
        accountId: acc.id,
        snapshotDate,
        balance: acc.balance,
        isSynthetic: false,
      })
      .onConflictDoUpdate({
        target: [accountSnapshots.userId, accountSnapshots.accountId, accountSnapshots.snapshotDate],
        set: {
          balance: acc.balance,
          isSynthetic: false,
        },
      });
  }
}

export async function updateMonthlyCashFlowSummaries(userId: string, dek: Uint8Array) {
  const userAccounts = await getDb()
    .select()
    .from(accounts)
    .where(and(
      eq(accounts.userId, userId),
      eq(accounts.isHidden, false),
      eq(accounts.isExcludedFromNetWorth, false)
    ));

  if (userAccounts.length === 0) {
    await getDb().delete(monthlyCashFlow).where(eq(monthlyCashFlow.userId, userId));
    return;
  }

  const allCategories = await getDb()
    .select()
    .from(categories)
    .where(eq(categories.userId, userId));

  const catById = new Map<string, typeof categories.$inferSelect>();
  for (const cat of allCategories) {
    catById.set(cat.id.toString(), cat);
  }

  const allTransactions = await getDb()
    .select()
    .from(transactions)
    .where(
      inArray(
        transactions.accountId,
        userAccounts.map((a) => a.id)
      )
    );

  const decryptedTxns = await decryptRows('transactions', allTransactions, dek);

  const monthlyData: Record<string, { income: number; expenses: number; count: number }> = {};

  for (const tx of decryptedTxns) {
    if (tx.ignored) continue;

    const category = tx.categoryId ? catById.get(tx.categoryId.toString()) : undefined;

    let excluded = category?.excludeFromReports ?? false;
    if (!excluded && category?.parentId) {
      const parent = catById.get(category.parentId.toString());
      if (parent?.excludeFromReports) excluded = true;
    }
    if (excluded) continue;

    const dateObj = typeof tx.date === 'string' ? new Date(tx.date) : tx.date;
    const yearMonth = dateObj.getFullYear() + '-' + String(dateObj.getMonth() + 1).padStart(2, '0');
    const amount = parseFloat(tx.amount);

    if (!monthlyData[yearMonth]) {
      monthlyData[yearMonth] = { income: 0, expenses: 0, count: 0 };
    }

    monthlyData[yearMonth].count++;
    if (amount > 0 && (!category || category.isIncome)) {
      monthlyData[yearMonth].income += amount;
    } else if (amount < 0 && (!category || !category.isIncome)) {
      monthlyData[yearMonth].expenses += Math.abs(amount);
    }
  }

  await getDb().delete(monthlyCashFlow).where(eq(monthlyCashFlow.userId, userId));

  for (const [yearMonth, data] of Object.entries(monthlyData)) {
    const netCashFlow = data.income - data.expenses;

    await getDb()
      .insert(monthlyCashFlow)
      .values({
        userId,
        yearMonth,
        totalIncome: await encryptField(String(data.income), dek),
        totalExpenses: await encryptField(String(data.expenses), dek),
        netCashFlow: await encryptField(String(netCashFlow), dek),
        transactionCount: await encryptField(String(data.count), dek),
      })
      .onConflictDoUpdate({
        target: [monthlyCashFlow.userId, monthlyCashFlow.yearMonth],
        set: {
          totalIncome: await encryptField(String(data.income), dek),
          totalExpenses: await encryptField(String(data.expenses), dek),
          netCashFlow: await encryptField(String(netCashFlow), dek),
          transactionCount: await encryptField(String(data.count), dek),
          updatedAt: new Date(),
        },
      });
  }
}

export async function updateCategorySpendingSummaries(userId: string, dek: Uint8Array) {
  const userAccounts = await getDb()
    .select()
    .from(accounts)
    .where(and(
      eq(accounts.userId, userId),
      eq(accounts.isHidden, false),
      eq(accounts.isExcludedFromNetWorth, false)
    ));

  if (userAccounts.length === 0) {
    await getDb().delete(categorySpendingSummary).where(eq(categorySpendingSummary.userId, userId));
    return;
  }

  const allCategories = await getDb()
    .select()
    .from(categories)
    .where(eq(categories.userId, userId));

  const catById = new Map<string, typeof categories.$inferSelect>();
  for (const cat of allCategories) {
    catById.set(cat.id.toString(), cat);
  }

  const allTransactions = await getDb()
    .select()
    .from(transactions)
    .where(
      inArray(
        transactions.accountId,
        userAccounts.map((a) => a.id)
      )
    );

  const decryptedTxns = await decryptRows('transactions', allTransactions, dek);

  const categoryByMonth: Record<
    string,
    Record<string, { amount: number; count: number; categoryId: string; yearMonth: string }>
  > = {};

  for (const tx of decryptedTxns) {
    if (!tx.categoryId || parseFloat(tx.amount) >= 0 || tx.ignored) continue;

    const category = catById.get(tx.categoryId.toString());

    let excluded = category?.excludeFromReports ?? false;
    if (!excluded && category?.parentId) {
      const parent = catById.get(category.parentId.toString());
      if (parent?.excludeFromReports) excluded = true;
    }
    if (excluded) continue;

    const dateObj = typeof tx.date === 'string' ? new Date(tx.date) : tx.date;
    const yearMonth = dateObj.getFullYear() + '-' + String(dateObj.getMonth() + 1).padStart(2, '0');
    const catId = tx.categoryId.toString();

    if (!categoryByMonth[yearMonth]) {
      categoryByMonth[yearMonth] = {};
    }

    if (!categoryByMonth[yearMonth][catId]) {
      categoryByMonth[yearMonth][catId] = {
        amount: 0,
        count: 0,
        categoryId: catId,
        yearMonth,
      };
    }

    categoryByMonth[yearMonth][catId].amount += Math.abs(parseFloat(tx.amount));
    categoryByMonth[yearMonth][catId].count++;
  }

  await getDb().delete(categorySpendingSummary).where(eq(categorySpendingSummary.userId, userId));

  for (const monthData of Object.values(categoryByMonth)) {
    for (const catData of Object.values(monthData)) {
      await getDb()
        .insert(categorySpendingSummary)
        .values({
          userId,
          categoryId: catData.categoryId as any,
          yearMonth: catData.yearMonth,
          amount: await encryptField(String(catData.amount), dek),
          transactionCount: await encryptField(String(catData.count), dek),
        })
        .onConflictDoUpdate({
          target: [categorySpendingSummary.userId, categorySpendingSummary.categoryId, categorySpendingSummary.yearMonth],
          set: {
            amount: await encryptField(String(catData.amount), dek),
            transactionCount: await encryptField(String(catData.count), dek),
            updatedAt: new Date(),
          },
        });
    }
  }
}

export async function updateCategoryIncomeSummaries(userId: string, dek: Uint8Array) {
  const userAccounts = await getDb()
    .select()
    .from(accounts)
    .where(and(
      eq(accounts.userId, userId),
      eq(accounts.isHidden, false),
      eq(accounts.isExcludedFromNetWorth, false)
    ));

  if (userAccounts.length === 0) {
    await getDb().delete(categoryIncomeSummary).where(eq(categoryIncomeSummary.userId, userId));
    return;
  }

  const allCategories = await getDb()
    .select()
    .from(categories)
    .where(eq(categories.userId, userId));

  const catById = new Map<string, typeof categories.$inferSelect>();
  for (const cat of allCategories) {
    catById.set(cat.id.toString(), cat);
  }

  const allTransactions = await getDb()
    .select()
    .from(transactions)
    .where(
      inArray(
        transactions.accountId,
        userAccounts.map((a) => a.id)
      )
    );

  const decryptedTxns = await decryptRows('transactions', allTransactions, dek);

  const categoryByMonth: Record<
    string,
    Record<string, { amount: number; count: number; categoryId: string; yearMonth: string }>
  > = {};

  for (const tx of decryptedTxns) {
    if (!tx.categoryId || parseFloat(tx.amount) <= 0 || tx.ignored) continue;

    const category = catById.get(tx.categoryId.toString());
    if (!category || !category.isIncome) continue;

    let excluded = category.excludeFromReports;
    if (!excluded && category.parentId) {
      const parent = catById.get(category.parentId.toString());
      if (parent?.excludeFromReports) excluded = true;
    }
    if (excluded) continue;

    const dateObj = typeof tx.date === 'string' ? new Date(tx.date) : tx.date;
    const yearMonth = dateObj.getFullYear() + '-' + String(dateObj.getMonth() + 1).padStart(2, '0');
    const catId = tx.categoryId.toString();

    if (!categoryByMonth[yearMonth]) {
      categoryByMonth[yearMonth] = {};
    }
    if (!categoryByMonth[yearMonth][catId]) {
      categoryByMonth[yearMonth][catId] = {
        amount: 0,
        count: 0,
        categoryId: catId,
        yearMonth,
      };
    }

    categoryByMonth[yearMonth][catId].amount += parseFloat(tx.amount);
    categoryByMonth[yearMonth][catId].count++;
  }

  await getDb().delete(categoryIncomeSummary).where(eq(categoryIncomeSummary.userId, userId));

  for (const monthData of Object.values(categoryByMonth)) {
    for (const catData of Object.values(monthData)) {
      await getDb()
        .insert(categoryIncomeSummary)
        .values({
          userId,
          categoryId: catData.categoryId as any,
          yearMonth: catData.yearMonth,
          amount: await encryptField(String(catData.amount), dek),
          transactionCount: await encryptField(String(catData.count), dek),
        })
        .onConflictDoUpdate({
          target: [categoryIncomeSummary.userId, categoryIncomeSummary.categoryId, categoryIncomeSummary.yearMonth],
          set: {
            amount: await encryptField(String(catData.amount), dek),
            transactionCount: await encryptField(String(catData.count), dek),
            updatedAt: new Date(),
          },
        });
    }
  }
}

export async function syncConnection(connectionId: string, userId: string, dekOverride?: Uint8Array): Promise<SyncResult> {
  const startedAt = Date.now();

  logger.info(`${LOG_TAG} Sync started`, { connectionId, userId });

  // Get DEK — either from override (cron) or from session (user request)
  let dek: Uint8Array;
  try {
    dek = dekOverride ?? await getSessionDEK();
  } catch (err) {
    return {
      status: 'error',
      accountsSynced: 0,
      transactionsFetched: 0,
      transactionsNew: 0,
      transactionsUpdated: 0,
      errorMessage: 'Encryption key unavailable — authentication required',
    };
  }

  const [log] = await getDb()
    .insert(syncLogs)
    .values({
      userId,
      connectionId,
      status: 'running',
      accountsSynced: '0',
      transactionsFetched: '0',
      transactionsNew: '0',
      startedAt: new Date(),
    })
    .returning();

  try {
    const [connection] = await getDb()
      .select()
      .from(simplifinConnections)
      .where(eq(simplifinConnections.id, connectionId))
      .limit(1);

    if (!connection || connection.userId !== userId) {
      throw new Error('Connection not found or unauthorized');
    }

    const accessUrl = await decryptField(
      connection.accessUrlEncrypted,
      dek,
    );

    const now = new Date();
    const startDate = connection.lastSyncAt
      ? new Date(connection.lastSyncAt.getTime() - 14 * 24 * 60 * 60 * 1000)
      : new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    logger.debug(`${LOG_TAG} Fetching SimpleFIN data`, {
      connectionId,
      dateRange: { from: startDate.toISOString(), to: now.toISOString() },
      firstSync: !connection.lastSyncAt,
    });

    const data = await fetchAccounts(accessUrl, startDate, now);

    let accountsSynced = 0;
    let transactionsNew = 0;
    let transactionsUpdated = 0;

    const externalIdToAccountId = new Map<string, string>();

    // Track plaintext transaction data for in-memory rule matching
    const rawTxData: Array<{
      externalId: string;
      accountId: string;
      description: string;
      payee: string | null;
      memo: string | null;
      amount: string;
    }> = [];

    logger.info(`${LOG_TAG} SimpleFIN data fetched`, {
      connectionId,
      accountsInResponse: data.accounts.length,
      totalTransactions: data.accounts.reduce((s, a) => s + (a.transactions?.length ?? 0), 0),
      durationMs: ms(startedAt),
    });

    for (const sfAccount of data.accounts) {
      const balanceNum = parseFloat(sfAccount.balance);

      const [orphanedAccount] = await getDb()
        .select({ id: accounts.id })
        .from(accounts)
        .where(
          and(
            eq(accounts.userId, userId),
            eq(accounts.externalId, sfAccount.id),
            isNull(accounts.connectionId)
          )
        )
        .limit(1);

      let upserted: typeof accounts.$inferSelect;

      if (orphanedAccount) {
        [upserted] = await getDb()
          .update(accounts)
          .set({
            connectionId,
            balance: await encryptField(sfAccount.balance, dek),
            balanceDate: new Date(sfAccount['balance-date'] * 1000),
            institution: await encryptField(sfAccount.org.name, dek),
            updatedAt: now,
          })
          .where(eq(accounts.id, orphanedAccount.id))
          .returning();
      } else {
        [upserted] = await getDb()
          .insert(accounts)
          .values({
            userId,
            connectionId,
            externalId: sfAccount.id,
            name: await encryptField(sfAccount.name, dek),
            currency: sfAccount.currency,
            balance: await encryptField(sfAccount.balance, dek),
            balanceDate: new Date(sfAccount['balance-date'] * 1000),
            type: inferAccountType(sfAccount),
            institution: await encryptField(sfAccount.org.name, dek),
            isHidden: false,
            isExcludedFromNetWorth: false,
            displayOrder: 0,
          })
          .onConflictDoUpdate({
            target: [accounts.connectionId, accounts.externalId],
            set: {
              balance: await encryptField(sfAccount.balance, dek),
              balanceDate: new Date(sfAccount['balance-date'] * 1000),
              institution: await encryptField(sfAccount.org.name, dek),
              updatedAt: now,
            },
          })
          .returning();
      }

      externalIdToAccountId.set(sfAccount.id, upserted.id);
      accountsSynced++;

      if (sfAccount.transactions) {
        for (const sfTx of sfAccount.transactions) {
          const amountNum = parseFloat(sfTx.amount);
          const accountId = upserted.id;

          const transactionTimestamp = sfTx.transacted_at ?? sfTx.posted;
          const dateMs = transactionTimestamp > 0 ? transactionTimestamp * 1000 : now.getTime();
          const txDate = new Date(dateMs).toISOString().split('T')[0];
          const txPostedDate = sfTx.posted > 0
            ? new Date(sfTx.posted * 1000).toISOString().split('T')[0]
            : null;

          // Encrypt sensitive fields before storing
          const txData = {
            userId,
            accountId,
            externalId: sfTx.id,
            date: txDate,
            postedDate: txPostedDate,
            amount: await encryptField(String(amountNum), dek),
            description: await encryptField(sfTx.description, dek),
            payee: sfTx.payee ? await encryptField(sfTx.payee, dek) : null,
            memo: sfTx.memo ? await encryptField(sfTx.memo, dek) : null,
            pending: sfTx.pending ?? false,
          };

          // Keep plaintext for rule matching
          rawTxData.push({
            externalId: sfTx.id,
            accountId,
            description: sfTx.description,
            payee: sfTx.payee ?? null,
            memo: sfTx.memo ?? null,
            amount: String(amountNum),
          });

          await getDb()
            .insert(transactions)
            .values(txData)
            .onConflictDoUpdate({
              target: [transactions.accountId, transactions.externalId],
              set: {
                amount: txData.amount,
                pending: sfTx.pending ?? false,
                description: txData.description,
                postedDate: txPostedDate,
                updatedAt: now,
              },
            });

          const existing = await getDb()
            .select({ id: transactions.id })
            .from(transactions)
            .where(eq(transactions.externalId, sfTx.id))
            .limit(1);

          if (existing.length === 0) {
            transactionsNew++;
          } else {
            transactionsUpdated++;
          }
        }
      }
    }

    logger.info(`${LOG_TAG} Accounts and transactions processed`, {
      connectionId,
      accountsSynced,
      transactionsNew,
      transactionsUpdated,
      durationMs: ms(startedAt),
    });

    // Apply categorization rules using in-memory plaintext data
    if (rawTxData.length > 0) {
      // Read back IDs and existing categoryIds from DB
      const syncedTxnsWithIds = await getDb()
        .select({
          id: transactions.id,
          externalId: transactions.externalId,
          categoryId: transactions.categoryId,
        })
        .from(transactions)
        .where(
          inArray(
            transactions.externalId,
            rawTxData.map((t) => t.externalId)
          )
        );

      // Merge plaintext descriptions back for rule matching
      const syncedWithPlaintext = syncedTxnsWithIds.map((dbTx) => {
        const raw = rawTxData.find((r) => r.externalId === dbTx.externalId);
        return {
          id: dbTx.id,
          description: raw?.description ?? '',
          payee: raw?.payee ?? null,
          memo: raw?.memo ?? null,
          amount: raw?.amount ?? '0',
          categoryId: dbTx.categoryId,
        };
      });

      const uncategorized = syncedWithPlaintext.filter((t) => !t.categoryId);
      if (uncategorized.length > 0) {
        const ruleResults = await applyRulesToTransactions(uncategorized, userId);
        logger.info(`${LOG_TAG} Categorization rules applied`, {
          connectionId,
          uncategorizedBefore: uncategorized.length,
          matchedByRules: ruleResults.size,
          durationMs: ms(startedAt),
        });
        for (const [txId, action] of ruleResults) {
          const updateData: Record<string, unknown> = { updatedAt: new Date() };
          if (action.categoryId) updateData.categoryId = action.categoryId;
          if (action.payee) {
            updateData.payee = await encryptField(action.payee, dek);
          }
          if (action.reviewed !== null) updateData.reviewed = action.reviewed;
          if (Object.keys(updateData).length > 1) {
            await getDb()
              .update(transactions)
              .set(updateData)
              .where(eq(transactions.id, txId));
          }
        }
      } else {
        logger.debug(`${LOG_TAG} No uncategorized transactions to apply rules to`, { connectionId });
      }
    }

    await getDb()
      .update(simplifinConnections)
      .set({
        lastSyncAt: now,
        lastSyncStatus: 'ok',
        lastSyncError: null,
      })
      .where(eq(simplifinConnections.id, connectionId));

    const transactionsFetched = data.accounts.reduce(
      (sum, a) => sum + (a.transactions?.length ?? 0),
      0
    );

    await getDb()
      .update(syncLogs)
      .set({
        status: 'success',
        completedAt: now,
        accountsSynced: await encryptField(String(accountsSynced), dek),
        transactionsFetched: await encryptField(String(transactionsFetched), dek),
        transactionsNew: await encryptField(String(transactionsNew), dek),
        durationMs: await encryptField(String(Date.now() - log.startedAt.getTime()), dek),
      })
      .where(eq(syncLogs.id, log.id));

    const today = new Date().toISOString().split('T')[0];
    await createNetWorthSnapshot(userId, dek, today);
    logger.debug(`${LOG_TAG} Net worth snapshot created`, { userId, date: today, durationMs: ms(startedAt) });

    await createAccountSnapshots(userId, dek, today);
    logger.debug(`${LOG_TAG} Account snapshots created`, { userId, date: today, durationMs: ms(startedAt) });

    for (const sfAccount of data.accounts) {
      const accountId = externalIdToAccountId.get(sfAccount.id);
      if (!accountId) continue;

      const earliestTx = await getEarliestTransactionDate(accountId);
      if (!earliestTx) continue;

      const toDate = new Date(now);
      toDate.setDate(toDate.getDate() - 1);
      const toDateStr = toDate.toISOString().split('T')[0];

      if (earliestTx < toDateStr) {
        const result = await generateHistoricalAccountSnapshots(
          accountId,
          userId,
          earliestTx,
          toDateStr
        );
        if (result.syntheticCount > 0) {
          logger.info(`${LOG_TAG} Backfilled synthetic snapshots`, {
            accountId,
            externalId: sfAccount.id,
            syntheticCount: result.syntheticCount,
            range: { from: earliestTx, to: toDateStr },
          });
        }
      }
    }

    await updateMonthlyCashFlowSummaries(userId, dek);
    await updateCategorySpendingSummaries(userId, dek);
    await updateCategoryIncomeSummaries(userId, dek);

    const totalDurationMs = Date.now() - startedAt;
    logger.info(`${LOG_TAG} Sync completed successfully`, {
      connectionId,
      accountsSynced,
      transactionsFetched,
      transactionsNew,
      transactionsUpdated,
      totalDurationMs,
    });

    return {
      status: 'success',
      accountsSynced,
      transactionsFetched,
      transactionsNew,
      transactionsUpdated,
    };
  } catch (err) {
    let errorMessage = err instanceof Error ? err.message : String(err);

    if (errorMessage.includes('Decryption failed')) {
      errorMessage =
        'SimpleFIN connection key mismatch. Please delete and reconnect using a new SimpleFIN Bridge API key.';
    }

    await getDb()
      .update(syncLogs)
      .set({
        status: 'error',
        completedAt: new Date(),
        errorMessage,
        durationMs: await encryptField(String(Date.now() - log.startedAt.getTime()), dekOverride ?? new Uint8Array(0)).catch(() => '0'),
      })
      .where(eq(syncLogs.id, log.id));

    await getDb()
      .update(simplifinConnections)
      .set({
        lastSyncStatus: 'error',
        lastSyncError: errorMessage,
      })
      .where(eq(simplifinConnections.id, connectionId));

    logger.error(`${LOG_TAG} Sync failed`, {
      connectionId,
      error: errorMessage,
      durationMs: ms(startedAt),
    });

    return {
      status: 'error',
      accountsSynced: 0,
      transactionsFetched: 0,
      transactionsNew: 0,
      transactionsUpdated: 0,
      errorMessage,
    };
  }
}

function inferAccountType(sfAccount: { name: string }): string {
  const name = sfAccount.name.toLowerCase();
  if (name.includes('credit') || name.includes('loan')) return 'credit';
  if (name.includes('savings') || name.includes('save')) return 'savings';
  if (name.includes('investment') || name.includes('brokerage')) return 'investment';
  if (name.includes('checking') || name.includes('deposit')) return 'checking';
  return 'other';
}
