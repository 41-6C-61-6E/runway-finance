import { getDb } from '@/lib/db';
import { simplifinConnections, accounts, transactions, syncLogs } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
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
    const accessUrl = decrypt({
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
    const errorMessage = err instanceof Error ? err.message : String(err);

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
