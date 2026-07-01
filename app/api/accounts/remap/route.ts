import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { accounts, transactions, accountSnapshots, simplifinConnections, plaidConnections } from '@/lib/db/schema';
import { eq, and, isNotNull, inArray } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptRow, encryptRow } from '@/lib/crypto';
import {
  createAccountSnapshots,
  createNetWorthSnapshot,
  updateCategoryIncomeSummaries,
  updateCategorySpendingSummaries,
  updateMonthlyCashFlowSummaries,
} from '@/lib/services/sync';
import { invalidateUserSearchCache } from '@/lib/services/search-cache';

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: 'unauthenticated', message: 'Authentication required' },
      { status: 401 }
    );
  }

  const userId = session.user.id;
  const dataUserId = (session.user as any).dataUserId ?? session.user.id;

  let body: { sourceAccountId?: string; targetAccountId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'validation_error', message: 'Invalid request body' },
      { status: 400 }
    );
  }

  const { sourceAccountId, targetAccountId } = body;

  if (!sourceAccountId || !targetAccountId) {
    return NextResponse.json(
      { error: 'validation_error', message: 'Both sourceAccountId and targetAccountId are required' },
      { status: 400 }
    );
  }

  if (sourceAccountId === targetAccountId) {
    return NextResponse.json(
      { error: 'validation_error', message: 'Source and target accounts must be different' },
      { status: 400 }
    );
  }

  logger.info('Starting account remapping', { userId, sourceAccountId, targetAccountId });

  try {
    const dek = await getSessionDEK();

    // Perform all DB operations in a single transaction
    await getDb().transaction(async (tx) => {
      // 1. Fetch and validate source account
      const [sourceAccount] = await tx
        .select()
        .from(accounts)
        .where(and(eq(accounts.id, sourceAccountId), eq(accounts.userId, dataUserId)))
        .limit(1);

      if (!sourceAccount) {
        throw new Error('Source account not found or unauthorized');
      }

      // 2. Fetch and validate target account
      const [targetAccount] = await tx
        .select()
        .from(accounts)
        .where(and(eq(accounts.id, targetAccountId), eq(accounts.userId, dataUserId)))
        .limit(1);

      if (!targetAccount) {
        throw new Error('Target account not found or unauthorized');
      }

      logger.info('Remapping source and target verified', {
        sourceName: sourceAccount.name,
        targetName: targetAccount.name,
      });

      // 2b. For any account that was connected to SimpleFIN or Plaid, add its old
      // externalId to that connection's disabledAccounts list so future syncs won't
      // auto-recreate it. This covers both directions:
      //   - SimpleFIN account remapped to Plaid  → disable old SF externalId
      //   - Plaid account remapped to SimpleFIN  → disable old Plaid externalId
      const sfToDisable: Array<{ connectionId: string; externalId: string }> = [];
      const plaidToDisable: Array<{ connectionId: string; externalId: string }> = [];

      if (sourceAccount.connectionId && sourceAccount.externalId) {
        sfToDisable.push({ connectionId: sourceAccount.connectionId, externalId: sourceAccount.externalId });
      }
      if (targetAccount.connectionId && targetAccount.externalId && targetAccount.connectionId !== sourceAccount.connectionId) {
        sfToDisable.push({ connectionId: targetAccount.connectionId, externalId: targetAccount.externalId });
      }
      if (sourceAccount.plaidConnectionId && sourceAccount.externalId) {
        plaidToDisable.push({ connectionId: sourceAccount.plaidConnectionId, externalId: sourceAccount.externalId });
      }
      if (targetAccount.plaidConnectionId && targetAccount.externalId && targetAccount.plaidConnectionId !== sourceAccount.plaidConnectionId) {
        plaidToDisable.push({ connectionId: targetAccount.plaidConnectionId, externalId: targetAccount.externalId });
      }

      for (const { connectionId, externalId } of sfToDisable) {
        const [conn] = await tx.select().from(simplifinConnections).where(eq(simplifinConnections.id, connectionId)).limit(1);
        if (conn) {
          const disabled = conn.disabledAccounts || [];
          if (!disabled.includes(externalId)) {
            await tx.update(simplifinConnections).set({ disabledAccounts: [...disabled, externalId] }).where(eq(simplifinConnections.id, conn.id));
            logger.info('Disabled SimpleFIN sync during remap', { connectionId: conn.id, externalId });
          }
        }
      }

      for (const { connectionId, externalId } of plaidToDisable) {
        const [conn] = await tx.select().from(plaidConnections).where(eq(plaidConnections.id, connectionId)).limit(1);
        if (conn) {
          const disabled = conn.disabledAccounts || [];
          if (!disabled.includes(externalId)) {
            await tx.update(plaidConnections).set({ disabledAccounts: [...disabled, externalId] }).where(eq(plaidConnections.id, conn.id));
            logger.info('Disabled Plaid sync during remap', { connectionId: conn.id, externalId });
          }
        }
      }

      // 3. Prevent duplicate account snapshots by deleting conflicting dates from source
      const targetSnapshots = await tx
        .select({ snapshotDate: accountSnapshots.snapshotDate })
        .from(accountSnapshots)
        .where(eq(accountSnapshots.accountId, targetAccountId));

      const targetDates = targetSnapshots.map((s) => s.snapshotDate);

      if (targetDates.length > 0) {
        logger.debug('Deleting conflicting account snapshots from source account', {
          dates: targetDates,
        });
        await tx
          .delete(accountSnapshots)
          .where(
            and(
              eq(accountSnapshots.accountId, sourceAccountId),
              inArray(accountSnapshots.snapshotDate, targetDates)
            )
          );
      }

      // 4. Move all target snapshots to source account
      await tx
        .update(accountSnapshots)
        .set({ accountId: sourceAccountId })
        .where(eq(accountSnapshots.accountId, targetAccountId));

      // 5. Prevent duplicate transactions by checking externalId collisions
      const sourceTxns = await tx
        .select({ externalId: transactions.externalId })
        .from(transactions)
        .where(
          and(
            eq(transactions.accountId, sourceAccountId),
            isNotNull(transactions.externalId)
          )
        );

      const sourceExtIds = sourceTxns.map((t) => t.externalId).filter(Boolean) as string[];

      if (sourceExtIds.length > 0) {
        logger.debug('Deleting conflicting transactions from target account', {
          count: sourceExtIds.length,
        });
        await tx
          .delete(transactions)
          .where(
            and(
              eq(transactions.accountId, targetAccountId),
              inArray(transactions.externalId, sourceExtIds)
            )
          );
      }

      // 6. Move all target transactions to source account
      await tx
        .update(transactions)
        .set({ accountId: sourceAccountId })
        .where(eq(transactions.accountId, targetAccountId));

      // 7. Temporarily clear target account's connection IDs and change its externalId
      // to avoid unique constraint conflicts when updating the source account.
      await tx
        .update(accounts)
        .set({
          connectionId: null,
          plaidConnectionId: null,
          externalId: `temp-remap-${targetAccountId}-${Date.now()}`,
        })
        .where(eq(accounts.id, targetAccountId));

      // 8. Update source account's credentials and metadata to target's values
      await tx
        .update(accounts)
        .set({
          connectionId: targetAccount.connectionId,
          plaidConnectionId: targetAccount.plaidConnectionId,
          externalId: targetAccount.externalId,
          balance: targetAccount.balance,
          balanceDate: targetAccount.balanceDate,
          institution: targetAccount.institution,
          updatedAt: new Date(),
        })
        .where(eq(accounts.id, sourceAccountId));

      // 9. Delete the target account record
      await tx
        .delete(accounts)
        .where(eq(accounts.id, targetAccountId));
    });

    logger.info('Account remapping completed successfully', {
      sourceAccountId,
      targetAccountId,
    });

    // 9. Recompute cache and snapshots in background
    const today = new Date().toISOString().split('T')[0];
    Promise.all([
      createAccountSnapshots(dataUserId, dek, today),
      createNetWorthSnapshot(dataUserId, dek, today, { skipNotifications: true }),
      updateMonthlyCashFlowSummaries(dataUserId, dek),
      updateCategorySpendingSummaries(dataUserId, dek),
      updateCategoryIncomeSummaries(dataUserId, dek),
    ]).catch((err) => {
      logger.error('Error in background sync/recalc after account remap', {
        userId,
        error: err instanceof Error ? err.message : String(err),
      });
    });

    invalidateUserSearchCache(dataUserId);
    return NextResponse.json({ success: true, message: 'Account remapped successfully' });
  } catch (error) {
    logger.error('Failed to remap accounts', {
      userId,
      sourceAccountId,
      targetAccountId,
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      {
        error: 'internal_error',
        message: error instanceof Error ? error.message : 'An unexpected error occurred during account remapping',
      },
      { status: 500 }
    );
  }
}
