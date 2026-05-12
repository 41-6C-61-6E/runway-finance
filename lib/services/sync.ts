import { getDb } from '@/lib/db';
import { simplifinConnections, accounts, transactions, syncLogs, netWorthSnapshots, accountSnapshots, monthlyCashFlow, categorySpendingSummary, categories } from '@/lib/db/schema';
import { generateHistoricalAccountSnapshots, getEarliestTransactionDate } from '@/lib/services/account-history';
import { applyRulesToTransactions } from '@/lib/services/rules-engine';
import { eq, and, inArray, isNull } from 'drizzle-orm';
import { decrypt } from '@/lib/crypto';
import { fetchAccounts, SimpleFINError } from '@/lib/simplefin';
import { logger } from '@/lib/logger';

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

export async function createNetWorthSnapshot(userId: string, snapshotDate: string) {
  const userAccounts = await getDb()
    .select()
    .from(accounts)
    .where(eq(accounts.userId, userId));

  let totalAssets = 0;
  let totalLiabilities = 0;
  const breakdown: Record<string, { count: number; value: number }> = {};

  for (const acc of userAccounts) {
    if (acc.isExcludedFromNetWorth) {
      continue;
    }

    const balance = parseFloat(acc.balance.toString());
    const accountType = acc.type.toLowerCase();

    if (['checking', 'savings', 'investment', 'other', 'brokerage', 'retirement', 'realestate', 'vehicle', 'crypto', 'metals', 'otherAsset'].includes(accountType)) {
      totalAssets += balance;
    } else if (['credit', 'loan', 'mortgage'].includes(accountType)) {
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
      totalAssets: String(totalAssets),
      totalLiabilities: String(totalLiabilities),
      netWorth: String(netWorth),
      breakdown,
    })
    .onConflictDoUpdate({
      target: [netWorthSnapshots.userId, netWorthSnapshots.snapshotDate],
      set: {
        totalAssets: String(totalAssets),
        totalLiabilities: String(totalLiabilities),
        netWorth: String(netWorth),
        breakdown,
      },
    });
}

export async function createAccountSnapshots(userId: string, snapshotDate: string) {
  const userAccounts = await getDb()
    .select()
    .from(accounts)
    .where(eq(accounts.userId, userId));

  for (const acc of userAccounts) {
    await getDb()
      .insert(accountSnapshots)
      .values({
        userId,
        accountId: acc.id,
        snapshotDate,
        balance: acc.balance.toString(),
        isSynthetic: false,
      })
      .onConflictDoUpdate({
        target: [accountSnapshots.userId, accountSnapshots.accountId, accountSnapshots.snapshotDate],
        set: {
          balance: acc.balance.toString(),
          isSynthetic: false,
        },
      });
  }
}

export async function updateMonthlyCashFlowSummaries(userId: string) {
  const userAccounts = await getDb()
    .select()
    .from(accounts)
    .where(eq(accounts.userId, userId));

  if (userAccounts.length === 0) {
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

  const monthlyData: Record<string, { income: number; expenses: number; count: number }> = {};

  for (const tx of allTransactions) {
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
    const amount = parseFloat(tx.amount.toString());

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

  for (const [yearMonth, data] of Object.entries(monthlyData)) {
    const netCashFlow = data.income - data.expenses;

    await getDb()
      .insert(monthlyCashFlow)
      .values({
        userId,
        yearMonth,
        totalIncome: String(data.income),
        totalExpenses: String(data.expenses),
        netCashFlow: String(netCashFlow),
        transactionCount: data.count,
      })
      .onConflictDoUpdate({
        target: [monthlyCashFlow.userId, monthlyCashFlow.yearMonth],
        set: {
          totalIncome: String(data.income),
          totalExpenses: String(data.expenses),
          netCashFlow: String(netCashFlow),
          transactionCount: data.count,
          updatedAt: new Date(),
        },
      });
  }
}

export async function updateCategorySpendingSummaries(userId: string) {
  const userAccounts = await getDb()
    .select()
    .from(accounts)
    .where(eq(accounts.userId, userId));

  if (userAccounts.length === 0) {
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

  const categoryByMonth: Record<
    string,
    Record<string, { amount: number; count: number; categoryId: string; yearMonth: string }>
  > = {};

  for (const tx of allTransactions) {
    if (!tx.categoryId || parseFloat(tx.amount.toString()) >= 0 || tx.ignored) continue;

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

    categoryByMonth[yearMonth][catId].amount += Math.abs(parseFloat(tx.amount.toString()));
    categoryByMonth[yearMonth][catId].count++;
  }

  for (const monthData of Object.values(categoryByMonth)) {
    for (const catData of Object.values(monthData)) {
      await getDb()
        .insert(categorySpendingSummary)
        .values({
          userId,
          categoryId: catData.categoryId as any,
          yearMonth: catData.yearMonth,
          amount: String(catData.amount),
          transactionCount: catData.count,
        })
        .onConflictDoUpdate({
          target: [categorySpendingSummary.userId, categorySpendingSummary.categoryId, categorySpendingSummary.yearMonth],
          set: {
            amount: String(catData.amount),
            transactionCount: catData.count,
            updatedAt: new Date(),
          },
        });
    }
  }
}

export async function syncConnection(connectionId: string, userId: string): Promise<SyncResult> {
  const startedAt = Date.now();

  logger.info(`${LOG_TAG} Sync started`, { connectionId, userId });

  const [log] = await getDb()
    .insert(syncLogs)
    .values({
      userId,
      connectionId,
      status: 'running',
      accountsSynced: 0,
      transactionsFetched: 0,
      transactionsNew: 0,
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

    const accessUrl = await decrypt({
      ciphertext: connection.accessUrlEncrypted,
      iv: connection.accessUrlIv,
      tag: connection.accessUrlTag,
    });

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
    const syncedTxData: { externalId: string; accountId: string; description: string; payee: string | null; memo: string | null; amount: string }[] = [];

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
            balance: String(balanceNum),
            balanceDate: new Date(sfAccount['balance-date'] * 1000),
            institution: sfAccount.org.name,
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
            name: sfAccount.name,
            currency: sfAccount.currency,
            balance: String(balanceNum),
            balanceDate: new Date(sfAccount['balance-date'] * 1000),
            type: inferAccountType(sfAccount),
            institution: sfAccount.org.name,
            isHidden: false,
            isExcludedFromNetWorth: false,
            displayOrder: 0,
          })
          .onConflictDoUpdate({
            target: [accounts.connectionId, accounts.externalId],
            set: {
              balance: String(balanceNum),
              balanceDate: new Date(sfAccount['balance-date'] * 1000),
              institution: sfAccount.org.name,
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

          const txData = {
            userId,
            accountId,
            externalId: sfTx.id,
            date: txDate,
            postedDate: txPostedDate,
            amount: String(amountNum),
            description: sfTx.description,
            payee: sfTx.payee ?? null,
            memo: sfTx.memo ?? null,
            pending: sfTx.pending ?? false,
          };

          await getDb()
            .insert(transactions)
            .values(txData)
            .onConflictDoUpdate({
              target: [transactions.accountId, transactions.externalId],
              set: {
                amount: String(amountNum),
                pending: sfTx.pending ?? false,
                description: sfTx.description,
                postedDate: txPostedDate,
                updatedAt: now,
              },
            });

          syncedTxData.push({
            externalId: sfTx.id,
            accountId: accountId,
            description: sfTx.description,
            payee: sfTx.payee ?? null,
            memo: sfTx.memo ?? null,
            amount: String(amountNum),
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

    if (syncedTxData.length > 0) {
      const syncedTxnsWithIds = await getDb()
        .select({
          id: transactions.id,
          description: transactions.description,
          payee: transactions.payee,
          memo: transactions.memo,
          amount: transactions.amount,
          categoryId: transactions.categoryId,
          externalId: transactions.externalId,
        })
        .from(transactions)
        .where(
          inArray(
            transactions.externalId,
            syncedTxData.map((t) => t.externalId)
          )
        );

      const uncategorized = syncedTxnsWithIds.filter((t) => !t.categoryId);
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
          if (action.payee) updateData.payee = action.payee;
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
        accountsSynced,
        transactionsFetched,
        transactionsNew,
        durationMs: Date.now() - log.startedAt.getTime(),
      })
      .where(eq(syncLogs.id, log.id));

    const today = new Date().toISOString().split('T')[0];
    await createNetWorthSnapshot(userId, today);
    logger.debug(`${LOG_TAG} Net worth snapshot created`, { userId, date: today, durationMs: ms(startedAt) });

    await createAccountSnapshots(userId, today);
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

    await updateMonthlyCashFlowSummaries(userId);
    await updateCategorySpendingSummaries(userId);

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
        durationMs: Date.now() - log.startedAt.getTime(),
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
