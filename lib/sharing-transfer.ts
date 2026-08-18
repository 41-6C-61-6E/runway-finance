/**
 * lib/sharing-transfer.ts
 *
 * Ownership transfer for a shared household: the current primary hands the
 * group over to an active member.
 *
 * All household financial data is stored under the primary's user ID, so the
 * transfer must re-point every data row to the new primary, re-key the DEK
 * version chain, re-point member key rows, and detach the old primary (their
 * key row is wiped so they get a fresh standalone DEK on next login).
 *
 * The whole mutation runs in ONE transaction.
 */

import { getDb, getPool } from './db';
import * as schema from './db/schema';
import {
  userEncryptionKeys,
  accountShareMembers,
  accountSharingInvitations,
  dekVersions,
  dekVersionWraps,
  planFlows,
  planEvents,
  planAccounts,
  planLiabilities,
  planSettings,
  plans,
  retirementRules,
  customAlertRules,
  schedulerJobLogs,
  issues,
  goalAllocationHistory,
  syncLogs,
  simplifinConnections,
  plaidConnections,
  monthlyCashFlow,
  categorySpendingSummary,
  categoryIncomeSummary,
  accountSnapshots,
  holdings,
  holdingSnapshots,
  transactions,
  accounts,
  budgets,
  categories,
  categoryRules,
  tags,
  importLog,
  netWorthSnapshots,
  financialGoals,
  recurringTransactions,
  paystubLineItems,
  paystubAutoGenerateSettings,
  paystubs,
  paystubFieldMappings,
  aiProposals,
} from './db/schema';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { logger } from './logger';
import { invalidateUserDEKCache } from './crypto-context';

type Db = Omit<ReturnType<typeof getDb>, '$client'>;

// Every household data table keyed by user_id (mirrors the data-owner cleanup
// in DELETE /api/users/me, plus recurring_transactions).
const HOUSEHOLD_DATA_TABLES = [
  planFlows,
  planEvents,
  planAccounts,
  planLiabilities,
  planSettings,
  plans,
  retirementRules,
  customAlertRules,
  schedulerJobLogs,
  issues,
  goalAllocationHistory,
  syncLogs,
  simplifinConnections,
  plaidConnections,
  monthlyCashFlow,
  categorySpendingSummary,
  categoryIncomeSummary,
  accountSnapshots,
  holdings,
  holdingSnapshots,
  transactions,
  accounts,
  budgets,
  categories,
  categoryRules,
  tags,
  importLog,
  netWorthSnapshots,
  financialGoals,
  recurringTransactions,
  paystubLineItems,
  paystubAutoGenerateSettings,
  paystubs,
  paystubFieldMappings,
  aiProposals,
];

async function reassignTableUserId(
  txDb: Db,
  table: any,
  oldUserId: string,
  newUserId: string
): Promise<void> {
  await txDb.update(table).set({ userId: newUserId }).where(eq(table.userId, oldUserId));
}

/**
 * Transfer household ownership from oldPrimaryUserId to newPrimaryUserId.
 *
 * Pre-validation runs before any write; the full mutation runs in a single
 * transaction. Returns `{ error }` (no writes) on failure, `void` on success.
 */
export async function transferOwnership(
  oldPrimaryUserId: string,
  newPrimaryUserId: string,
  db: Db = getDb()
): Promise<void | { error: string }> {
  if (oldPrimaryUserId === newPrimaryUserId) {
    return { error: 'You are already the account owner.' };
  }

  // The requester must be the primary (owns their own data).
  const [oldKeyRow] = await db
    .select({ primaryUserId: userEncryptionKeys.primaryUserId })
    .from(userEncryptionKeys)
    .where(eq(userEncryptionKeys.userId, oldPrimaryUserId))
    .limit(1);

  if (!oldKeyRow || oldKeyRow.primaryUserId !== null) {
    return { error: 'Only the account owner can transfer ownership.' };
  }

  // The target must be an ACTIVE member of this primary's group.
  const [memberRow] = await db
    .select({ id: accountShareMembers.id, status: accountShareMembers.status })
    .from(accountShareMembers)
    .where(
      and(
        eq(accountShareMembers.primaryUserId, oldPrimaryUserId),
        eq(accountShareMembers.memberUserId, newPrimaryUserId)
      )
    )
    .limit(1);

  if (!memberRow || memberRow.status !== 'active') {
    return { error: 'That user is not an active member of your share group.' };
  }

  // The target must have a key row (they have signed in at least once),
  // otherwise the group DEK would have no wrap for the new primary.
  const [newKeyRow] = await db
    .select({ userId: userEncryptionKeys.userId })
    .from(userEncryptionKeys)
    .where(eq(userEncryptionKeys.userId, newPrimaryUserId))
    .limit(1);

  if (!newKeyRow) {
    return { error: 'That user has not signed in yet. Ask them to sign in once before transferring ownership.' };
  }

  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const txDb = drizzle(client, { schema });

    // 1. New primary becomes the data owner.
    await txDb
      .update(userEncryptionKeys)
      .set({ primaryUserId: null, updatedAt: new Date() })
      .where(eq(userEncryptionKeys.userId, newPrimaryUserId));

    // 2. Remaining members now resolve to the new primary.
    await txDb
      .update(userEncryptionKeys)
      .set({ primaryUserId: newPrimaryUserId, updatedAt: new Date() })
      .where(eq(userEncryptionKeys.primaryUserId, oldPrimaryUserId));

    // 3. Re-point the membership rows, then drop the new primary's own row
    //    (the primary has no membership row — it is implicit).
    await txDb
      .update(accountShareMembers)
      .set({ primaryUserId: newPrimaryUserId })
      .where(eq(accountShareMembers.primaryUserId, oldPrimaryUserId));

    await txDb
      .delete(accountShareMembers)
      .where(
        and(
          eq(accountShareMembers.primaryUserId, newPrimaryUserId),
          eq(accountShareMembers.memberUserId, newPrimaryUserId)
        )
      );

    // 4. Re-key the household DEK version chain to the new primary and drop
    //    the old primary's wraps.
    await txDb
      .update(dekVersions)
      .set({ primaryUserId: newPrimaryUserId })
      .where(eq(dekVersions.primaryUserId, oldPrimaryUserId));

    await txDb
      .delete(dekVersionWraps)
      .where(eq(dekVersionWraps.memberUserId, oldPrimaryUserId));

    // 5. Move every household data row from the old primary to the new one.
    for (const table of HOUSEHOLD_DATA_TABLES) {
      await reassignTableUserId(txDb, table, oldPrimaryUserId, newPrimaryUserId);
    }

    // 6. The old primary's outstanding invitations are no longer usable
    //    (their DEK row is about to be wiped), so revoke them.
    await txDb
      .update(accountSharingInvitations)
      .set({ status: 'revoked', updatedAt: new Date() })
      .where(
        and(
          eq(accountSharingInvitations.inviterUserId, oldPrimaryUserId),
          eq(accountSharingInvitations.status, 'pending')
        )
      );

    // 7. Detach the old primary: wipe their DEK wraps so their next login
    //    generates a fresh standalone DEK. primaryUserId stays null.
    await txDb
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
      .where(eq(userEncryptionKeys.userId, oldPrimaryUserId));

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // The group's DEK identity changed hands; drop any cached session DEKs so
  // no request keeps serving a stale mapping.
  await invalidateUserDEKCache();

  logger.info('[sharing-transfer] Ownership transferred', { oldPrimaryUserId, newPrimaryUserId });

  return;
}
