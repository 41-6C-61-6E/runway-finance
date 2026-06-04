import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import {
  users,
  userSettings,
  userEncryptionKeys,
  aiProviders,
  simplifinConnections,
  accounts,
  categories,
  importLog,
  transactions,
  tags,
  categoryRules,
  netWorthSnapshots,
  accountSnapshots,
  monthlyCashFlow,
  categorySpendingSummary,
  categoryIncomeSummary,
  budgets,
  financialGoals,

  paystubs,
  paystubLineItems,
  paystubFieldMappings,
  paystubAutoGenerateSettings,
  aiProposals,
  accountShareMembers,
  accountSharingInvitations,
  syncLogs,
  user as nextAuthUser,
  session as nextAuthSession,
  account as nextAuthAccount,
} from '@/lib/db/schema';
import { eq, or, and, isNull } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getShareGroup } from '@/lib/sharing';
import { logger } from '@/lib/logger';
import { syncScheduler } from '@/lib/services/sync-scheduler';
import { manualAccountScheduler } from '@/lib/services/manual-account-scheduler';

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: 'Unauthorised' }, { status: 401 });
  }

  const userId = session.user.id;
  const db = getDb();

  try {
    // 1. Detect user role and sharing setup
    const group = await getShareGroup(userId);
    const isOwner = group && group.primaryUserId === userId;
    const isMember = group && group.primaryUserId !== userId;

    // 2. Fetch connections and accounts to cancel timers after the transaction
    const connectionsToCancel = await db
      .select({ id: simplifinConnections.id })
      .from(simplifinConnections)
      .where(eq(simplifinConnections.userId, userId));

    const accountsToCancel = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(
        and(
          eq(accounts.userId, userId),
          isNull(accounts.connectionId)
        )
      );

    // If Owner: we also collect active members' connection IDs to cancel their sync timers
    let memberConnectionsToCancel: string[] = [];
    if (isOwner && group.members.length > 0) {
      const memberUserIds = group.members.map((m) => m.memberUserId);
      const memberConnections = await db
        .select({ id: simplifinConnections.id })
        .from(simplifinConnections)
        .where(
          and(
            or(...memberUserIds.map((mid) => eq(simplifinConnections.userId, mid)))
          )
        );
      memberConnectionsToCancel = memberConnections.map((c) => c.id);
    }

    // 3. Execute database deletions in transaction
    await db.transaction(async (tx) => {
      // ── Handle Sharing Roles ───────────────────────────────────────────────
      if (isOwner) {
        logger.info('[delete-account] User is group owner. Unlinking all members.', { ownerUserId: userId });
        for (const member of group.members) {
          const memberUserId = member.memberUserId;

          // Mark member record as removed
          await tx
            .update(accountShareMembers)
            .set({
              status: 'removed',
              removedAt: new Date(),
              removedBy: userId,
            })
            .where(
              and(
                eq(accountShareMembers.primaryUserId, userId),
                eq(accountShareMembers.memberUserId, memberUserId),
                eq(accountShareMembers.status, 'active')
              )
            );

          // Reset member encryption keys
          await tx
            .update(userEncryptionKeys)
            .set({
              primaryUserId: null,
              wrappedDek: '',
              wrappingIv: '',
              wrappingTag: '',
              serverWrappedDek: null,
              serverWrappingIv: null,
              serverWrappingTag: null,
              updatedAt: new Date(),
            })
            .where(eq(userEncryptionKeys.userId, memberUserId));

          // Get connections for this member to decouple
          const memberConns = await tx
            .select({ id: simplifinConnections.id })
            .from(simplifinConnections)
            .where(eq(simplifinConnections.userId, memberUserId));

          for (const conn of memberConns) {
            // Decouple accounts so they remain under owner's shared financial data
            await tx
              .update(accounts)
              .set({ connectionId: null })
              .where(eq(accounts.connectionId, conn.id));

            // Delete sync logs & connection
            await tx.delete(syncLogs).where(eq(syncLogs.connectionId, conn.id));
          }

          if (memberConns.length > 0) {
            await tx
              .delete(simplifinConnections)
              .where(eq(simplifinConnections.userId, memberUserId));
          }
        }

        // Clean up owner's sharing invitations and members
        await tx.delete(accountSharingInvitations).where(eq(accountSharingInvitations.inviterUserId, userId));
        await tx.delete(accountShareMembers).where(eq(accountShareMembers.primaryUserId, userId));

      } else if (isMember) {
        logger.info('[delete-account] User is group member. Unlinking self.', { memberUserId: userId });
        const primaryUserId = group.primaryUserId;

        // Mark self as removed in members list
        await tx
          .update(accountShareMembers)
          .set({
            status: 'removed',
            removedAt: new Date(),
            removedBy: userId,
          })
          .where(
            and(
              eq(accountShareMembers.primaryUserId, primaryUserId),
              eq(accountShareMembers.memberUserId, userId),
              eq(accountShareMembers.status, 'active')
            )
          );

        // Reset our connection references
        const memberConns = await tx
          .select({ id: simplifinConnections.id })
          .from(simplifinConnections)
          .where(eq(simplifinConnections.userId, userId));

        for (const conn of memberConns) {
          await tx
            .update(accounts)
            .set({ connectionId: null })
            .where(eq(accounts.connectionId, conn.id));

          await tx.delete(syncLogs).where(eq(syncLogs.connectionId, conn.id));
        }

        if (memberConns.length > 0) {
          await tx
            .delete(simplifinConnections)
            .where(eq(simplifinConnections.userId, userId));
        }
      }

      // ── Clean Up Personal Configuration (All Users) ───────────────────────
      await tx.delete(userSettings).where(eq(userSettings.userId, userId));
      await tx.delete(aiProviders).where(eq(aiProviders.userId, userId));
      await tx.delete(nextAuthSession).where(eq(nextAuthSession.userId, userId));
      await tx.delete(nextAuthAccount).where(eq(nextAuthAccount.userId, userId));
      await tx.delete(nextAuthUser).where(eq(nextAuthUser.id, userId));
      await tx.delete(users).where(eq(users.username, userId));
      await tx.delete(userEncryptionKeys).where(eq(userEncryptionKeys.userId, userId));

      // ── Clean Up Financial Data (Only Standalone & Owners) ──────────────────
      const isDataOwner = !isMember;
      if (isDataOwner) {
        logger.info('[delete-account] Deleting financial data owned by user.', { userId });

        // Order is important to satisfy PostgreSQL foreign keys
        await tx.delete(syncLogs).where(eq(syncLogs.userId, userId));
        await tx.delete(simplifinConnections).where(eq(simplifinConnections.userId, userId));
        await tx.delete(monthlyCashFlow).where(eq(monthlyCashFlow.userId, userId));
        await tx.delete(categorySpendingSummary).where(eq(categorySpendingSummary.userId, userId));
        await tx.delete(categoryIncomeSummary).where(eq(categoryIncomeSummary.userId, userId));
        await tx.delete(accountSnapshots).where(eq(accountSnapshots.userId, userId));
        await tx.delete(transactions).where(eq(transactions.userId, userId));
        await tx.delete(accounts).where(eq(accounts.userId, userId));
        await tx.delete(budgets).where(eq(budgets.userId, userId));

        // Self-referencing FK on categories: set parentId = null first
        await tx.update(categories).set({ parentId: null }).where(eq(categories.userId, userId));
        await tx.delete(categories).where(eq(categories.userId, userId));

        await tx.delete(categoryRules).where(eq(categoryRules.userId, userId));
        await tx.delete(tags).where(eq(tags.userId, userId));
        await tx.delete(importLog).where(eq(importLog.userId, userId));
        await tx.delete(netWorthSnapshots).where(eq(netWorthSnapshots.userId, userId));
        await tx.delete(financialGoals).where(eq(financialGoals.userId, userId));

        await tx.delete(paystubLineItems).where(eq(paystubLineItems.userId, userId));
        await tx.delete(paystubAutoGenerateSettings).where(eq(paystubAutoGenerateSettings.userId, userId));
        await tx.delete(paystubs).where(eq(paystubs.userId, userId));
        await tx.delete(paystubFieldMappings).where(eq(paystubFieldMappings.userId, userId));
        await tx.delete(aiProposals).where(eq(aiProposals.userId, userId));
      }
    });

    // 4. Cancel active scheduler timers after transaction commits
    logger.info('[delete-account] Transaction committed. Canceling scheduler timers.', { userId });

    for (const conn of connectionsToCancel) {
      syncScheduler.cancel(conn.id);
    }
    for (const acc of accountsToCancel) {
      manualAccountScheduler.cancel(acc.id);
    }
    for (const connId of memberConnectionsToCancel) {
      syncScheduler.cancel(connId);
    }

    logger.info('[delete-account] Account deletion completed successfully.', { userId });
    return new NextResponse(null, { status: 204 });

  } catch (err) {
    logger.error('[delete-account] Failed to delete account', {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
