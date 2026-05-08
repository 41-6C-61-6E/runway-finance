import { getDb } from '@/lib/db';
import { simplifinConnections, accounts, transactions, syncLogs, netWorthSnapshots, accountSnapshots, monthlyCashFlow, categorySpendingSummary, categories } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { decrypt } from '@/lib/crypto';
import { fetchAccounts, SimpleFINError } from '@/lib/simplefin';

export type SyncResult = {
  status: 'success' | 'error';
  accountsSynced: number;
  transactionsFetched: number;
  transactionsNew: number;
  transactionsUpdated: number;
  errorMessage?: string;
};

// Helper: Create or update a net worth snapshot for a user on a given date
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

    // Categorize assets vs liabilities
    if (['checking', 'savings', 'investment', 'other', 'brokerage', 'retirement', 'realestate'].includes(accountType)) {
      totalAssets += balance;
    } else if (['credit', 'loan', 'mortgage'].includes(accountType)) {
      totalLiabilities += Math.abs(balance);
    }

    // Build breakdown
    if (!breakdown[accountType]) {
      breakdown[accountType] = { count: 0, value: 0 };
    }
    breakdown[accountType].count++;
    breakdown[accountType].value += balance;
  }

  const netWorth = totalAssets - totalLiabilities;

  // Upsert snapshot (replace if already exists for this date)
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

// Helper: Create account snapshots for all accounts on a given date
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
      })
      .onConflictDoUpdate({
        target: [accountSnapshots.userId, accountSnapshots.accountId, accountSnapshots.snapshotDate],
        set: {
          balance: acc.balance.toString(),
        },
      });
  }
}

// Helper: Generate or update monthly cash flow summaries for all months with new transactions
export async function updateMonthlyCashFlowSummaries(userId: string) {
  // Get all user accounts and their transactions
  const userAccounts = await getDb()
    .select()
    .from(accounts)
    .where(eq(accounts.userId, userId));

  if (userAccounts.length === 0) {
    return;
  }

  // Get all transactions for these accounts
  const txByAccountId = await Promise.all(
    userAccounts.map((acc) =>
      getDb()
        .select()
        .from(transactions)
        .where(eq(transactions.accountId, acc.id))
    )
  );

  const allTransactions = txByAccountId.flat();

  // Group transactions by year-month and calculate totals
  const monthlyData: Record<string, { income: number; expenses: number; count: number }> = {};

  for (const tx of allTransactions) {
    const dateObj = typeof tx.date === 'string' ? new Date(tx.date) : tx.date;
    const yearMonth = dateObj.getFullYear() + '-' + String(dateObj.getMonth() + 1).padStart(2, '0');
    const amount = parseFloat(tx.amount.toString());

    if (!monthlyData[yearMonth]) {
      monthlyData[yearMonth] = { income: 0, expenses: 0, count: 0 };
    }

    monthlyData[yearMonth].count++;
    if (amount > 0) {
      monthlyData[yearMonth].income += amount;
    } else {
      monthlyData[yearMonth].expenses += Math.abs(amount);
    }
  }

  // Upsert all monthly summaries
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

// Helper: Generate or update category spending summaries for all months with transactions
export async function updateCategorySpendingSummaries(userId: string) {
  // Get all user accounts
  const userAccounts = await getDb()
    .select()
    .from(accounts)
    .where(eq(accounts.userId, userId));

  if (userAccounts.length === 0) {
    return;
  }

  // Get all transactions for these accounts
  const txByAccountId = await Promise.all(
    userAccounts.map((acc) =>
      getDb()
        .select()
        .from(transactions)
        .where(eq(transactions.accountId, acc.id))
    )
  );

  const allTransactions = txByAccountId.flat();

  // Group by category and month (expenses only)
  const categoryByMonth: Record<
    string,
    Record<string, { amount: number; count: number; categoryId: string; yearMonth: string }>
  > = {};

  for (const tx of allTransactions) {
    // Skip income transactions and transactions without categories
    if (!tx.categoryId || parseFloat(tx.amount.toString()) >= 0) {
      continue;
    }

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

  // Upsert all category summaries
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
  // 1. INSERT sync_log row: status='running', startedAt=now()
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
    // 2. SELECT connection WHERE id AND userId
    const [connection] = await getDb()
      .select()
      .from(simplifinConnections)
      .where(eq(simplifinConnections.id, connectionId))
      .limit(1);

    if (!connection || connection.userId !== userId) {
      throw new Error('Connection not found or unauthorized');
    }

    // 3. Decrypt access URL
    const accessUrl = await decrypt({
      ciphertext: connection.accessUrlEncrypted,
      iv: connection.accessUrlIv,
      tag: connection.accessUrlTag,
    });

    // 4. Compute date range
    const now = new Date();
    const startDate = connection.lastSyncAt
      ? new Date(connection.lastSyncAt.getTime() - 24 * 60 * 60 * 1000)
      : new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    // 5. Fetch accounts + transactions from SimpleFIN
    const data = await fetchAccounts(accessUrl, startDate, now);

    let accountsSynced = 0;
    let transactionsNew = 0;
    let transactionsUpdated = 0;

    // 6. Upsert accounts
    for (const sfAccount of data.accounts) {
      const balanceNum = parseFloat(sfAccount.balance);
      const [upserted] = await getDb()
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
            name: sfAccount.name,
            institution: sfAccount.org.name,
            updatedAt: now,
          },
        })
        .returning();

      accountsSynced++;

      // 7. Upsert transactions
      if (sfAccount.transactions) {
        for (const sfTx of sfAccount.transactions) {
          const amountNum = parseFloat(sfTx.amount);
          const accountId = upserted.id;

          const txData = {
            userId,
            accountId,
            externalId: sfTx.id,
            date: new Date(sfTx.posted * 1000).toISOString().split('T')[0],
            postedDate: new Date(sfTx.posted * 1000).toISOString().split('T')[0],
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
                postedDate: new Date(sfTx.posted * 1000).toISOString().split('T')[0],
                updatedAt: now,
              },
            });

          // Track new vs updated via pre-check
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

    // 8. Update connection sync status
    await getDb()
      .update(simplifinConnections)
      .set({
        lastSyncAt: now,
        lastSyncStatus: 'ok',
        lastSyncError: null,
      })
      .where(eq(simplifinConnections.id, connectionId));

    // 9. Update sync log
    await getDb()
      .update(syncLogs)
      .set({
        status: 'success',
        completedAt: now,
        accountsSynced,
        transactionsFetched: data.accounts.reduce(
          (sum, a) => sum + (a.transactions?.length ?? 0),
          0
        ),
        transactionsNew,
        durationMs: Date.now() - log.startedAt.getTime(),
      })
      .where(eq(syncLogs.id, log.id));

    // 10. Create net worth snapshot for today
    const today = new Date().toISOString().split('T')[0];
    await createNetWorthSnapshot(userId, today);

    // 11. Create account snapshots for all accounts
    await createAccountSnapshots(userId, today);

    // 12. Update monthly cash flow and category spending summaries for reporting
    await updateMonthlyCashFlowSummaries(userId);
    await updateCategorySpendingSummaries(userId);

    return {
      status: 'success',
      accountsSynced,
      transactionsFetched: data.accounts.reduce(
        (sum, a) => sum + (a.transactions?.length ?? 0),
        0
      ),
      transactionsNew,
      transactionsUpdated,
    };
  } catch (err) {
    let errorMessage = err instanceof Error ? err.message : String(err);

    // Provide helpful guidance for decryption errors
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

    console.error('[sync] syncConnection failed:', err);

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
