import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { importLog, transactions, accountSnapshots, accounts } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { getSessionDEK } from '@/lib/crypto-context';
import { encryptField } from '@/lib/crypto';
import { logger } from '@/lib/logger';
import { generateHistoricalAccountSnapshots, getEarliestTransactionDate, recalculateNetWorthSnapshots } from '@/lib/services/account-history';
import { updateMonthlyCashFlowSummaries, updateCategorySpendingSummaries, updateCategoryIncomeSummaries } from '@/lib/services/sync';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;
  const { id } = await params;

  try {
    const db = getDb();
    const dek = await getSessionDEK();

    // Verify the import log belongs to this user
    const log = await db
      .select()
      .from(importLog)
      .where(and(eq(importLog.id, id), eq(importLog.userId, userId)))
      .limit(1);

    if (log.length === 0) {
      return NextResponse.json({ error: 'Import log not found' }, { status: 404 });
    }

    // Query affected account IDs before deleting
    const affectedAccounts = await db
      .select({ accountId: transactions.accountId })
      .from(transactions)
      .where(and(eq(transactions.importId, id), eq(transactions.userId, userId)));

    const affectedSnapshots = await db
      .select({ accountId: accountSnapshots.accountId })
      .from(accountSnapshots)
      .where(and(eq(accountSnapshots.importId, id), eq(accountSnapshots.userId, userId)));

    const affectedAccountIds = new Set<string>();
    for (const t of affectedAccounts) {
      if (t.accountId) affectedAccountIds.add(t.accountId);
    }
    for (const s of affectedSnapshots) {
      if (s.accountId) affectedAccountIds.add(s.accountId);
    }

    await db.transaction(async (tx) => {
      // Delete linked transactions
      await tx
        .delete(transactions)
        .where(and(eq(transactions.importId, id), eq(transactions.userId, userId)));

      // Delete linked account snapshots
      await tx
        .delete(accountSnapshots)
        .where(and(eq(accountSnapshots.importId, id), eq(accountSnapshots.userId, userId)));

      // Delete the import log
      await tx
        .delete(importLog)
        .where(and(eq(importLog.id, id), eq(importLog.userId, userId)));
    });

    // Step 5: Post-delete processing (recalculating snapshots & balances)
    const postWarnings: string[] = [];
    try {
      if (affectedAccountIds.size > 0) {
        const todayStr = new Date().toISOString().split('T')[0];
        for (const acctId of affectedAccountIds) {
          const earliestTx = await getEarliestTransactionDate(acctId);
          const fromDateStr = earliestTx || todayStr;
          await generateHistoricalAccountSnapshots(
            acctId,
            userId,
            fromDateStr,
            todayStr,
            dek
          );

          // Sync the main accounts table balance with the latest snapshot balance
          const [latestSnapshot] = await db
            .select({ balance: accountSnapshots.balance })
            .from(accountSnapshots)
            .where(
              and(
                eq(accountSnapshots.accountId, acctId),
                eq(accountSnapshots.userId, userId)
              )
            )
            .orderBy(desc(accountSnapshots.snapshotDate))
            .limit(1);

          if (latestSnapshot) {
            await db
              .update(accounts)
              .set({
                balance: latestSnapshot.balance,
                balanceDate: new Date(),
                updatedAt: new Date(),
              })
              .where(eq(accounts.id, acctId));
          } else {
            // Reset balance to encrypted '0' if no snapshots remain
            const encryptedZero = await encryptField('0', dek);
            await db
              .update(accounts)
              .set({
                balance: encryptedZero,
                balanceDate: new Date(),
                updatedAt: new Date(),
              })
              .where(eq(accounts.id, acctId));
          }
        }
      }

      // Historically recalculate the daily net worth snapshots table
      await recalculateNetWorthSnapshots(userId, dek);

      // Update cash flow, category spending, and category income summaries for charts
      await updateMonthlyCashFlowSummaries(userId, dek);
      await updateCategorySpendingSummaries(userId, dek);
      await updateCategoryIncomeSummaries(userId, dek);
    } catch (postError) {
      const msg = postError instanceof Error ? postError.message : String(postError);
      logger.error(`[import/logs] Error in post-delete snapshot/summary updates`, { error: msg });
      postWarnings.push(`Post-delete processing warning: ${msg}. Snapshots and summaries may be stale. You can recalculate them from Settings > Analytics > Data Sources.`);
    }

    return NextResponse.json({ success: true, warnings: postWarnings.length > 0 ? postWarnings : undefined });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to delete import', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
