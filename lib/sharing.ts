/**
 * lib/sharing.ts
 *
 * Core helpers for the shared-account feature.
 *
 * Terminology:
 *   primary user  – the user who owns the data (User A)
 *   member user   – a user who has joined the primary's share group (User B, C, D)
 *
 * Data-access rule:
 *   All financial data is stored under the primary user's ID.
 *   When a member user is logged in, `getDataUserId` returns the primary's ID
 *   so existing queries automatically fetch the right rows.
 *
 * Personalization-access rule:
 *   user_settings, ai_providers, and similar personal tables always use the
 *   actual session user ID — never the data user ID.
 */

import { getDb } from './db';
import {
  accountShareMembers,
  accountSharingInvitations,
  userEncryptionKeys,
  simplifinConnections,
  plaidConnections,
  accounts,
  syncLogs,
} from './db/schema';
import { and, eq, or } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { logger } from './logger';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ShareGroupInfo {
  /** The user who owns the underlying data. */
  primaryUserId: string;
  /** All users in the group, including the primary. */
  allUserIds: string[];
  /** Active member rows (excludes primary). */
  members: Array<{
    id: string;
    memberUserId: string;
    joinedAt: Date;
  }>;
  /** Pending invitations created by this primary. */
  pendingInvitations: Array<{
    id: string;
    inviteeEmail: string;
    pin: string | null;
    createdAt: Date;
  }>;
}

// ── Constants ─────────────────────────────────────────────────────────────────

export const MAX_SHARE_GROUP_SIZE = 4; // including the primary

// ── Core Helpers ──────────────────────────────────────────────────────────────

/**
 * For a given logged-in user, return the user ID whose data should be queried.
 * - Standalone / primary users  →  their own ID (no-op)
 * - Secondary / member users    →  their primary's ID
 *
 * Cached-friendly: the auth layer embeds `dataUserId` directly in the JWT so
 * this function is only called during login, not on every request.
 */
export async function resolveDataUserId(userId: string): Promise<string> {
  const db = getDb();
  const [keyRow] = await db
    .select({ primaryUserId: userEncryptionKeys.primaryUserId })
    .from(userEncryptionKeys)
    .where(eq(userEncryptionKeys.userId, userId))
    .limit(1);

  if (keyRow?.primaryUserId) {
    return keyRow.primaryUserId;
  }
  return userId;
}

/**
 * Return the full share-group info for a given user (primary or member).
 * Returns null if the user is not in any share group.
 */
export async function getShareGroup(userId: string): Promise<ShareGroupInfo | null> {
  const db = getDb();

  // Determine if this user is the primary or a member
  const primaryUserId = await resolveDataUserId(userId);

  // Look up all active members of this primary's group
  const members = await db
    .select({
      id: accountShareMembers.id,
      memberUserId: accountShareMembers.memberUserId,
      joinedAt: accountShareMembers.joinedAt,
    })
    .from(accountShareMembers)
    .where(
      and(
        eq(accountShareMembers.primaryUserId, primaryUserId),
        eq(accountShareMembers.status, 'active')
      )
    );

  // Fetch pending invitations (only shown to the primary)
  const pendingInvitations =
    primaryUserId === userId
      ? await db
          .select({
            id: accountSharingInvitations.id,
            inviteeEmail: accountSharingInvitations.inviteeEmail,
            pin: accountSharingInvitations.pin,
            createdAt: accountSharingInvitations.createdAt,
          })
          .from(accountSharingInvitations)
          .where(
            and(
              eq(accountSharingInvitations.inviterUserId, primaryUserId),
              eq(accountSharingInvitations.status, 'pending')
            )
          )
      : [];

  // If no members, no pending invitations, and the user IS the primary, they are standalone (no share group yet)
  if (members.length === 0 && pendingInvitations.length === 0 && primaryUserId === userId) {
    return null;
  }

  return {
    primaryUserId,
    allUserIds: [primaryUserId, ...members.map((m) => m.memberUserId)],
    members,
    pendingInvitations,
  };
}

/**
 * Generate a cryptographically random 8-digit PIN as a zero-padded string.
 */
export function generateSharePin(): string {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  // Clamp to 8 digits: 00000000–99999999
  const pin = (array[0] % 100_000_000).toString().padStart(8, '0');
  return pin;
}

/**
 * Create a new sharing invitation.
 * Returns the invitation ID and the plaintext PIN (show once to the user).
 */
export async function createInvitation(
  inviterUserId: string,
  inviteeEmail: string
): Promise<{ invitationId: string; pin: string } | { error: string }> {
  const db = getDb();

  // Check group size limit
  const group = await getShareGroup(inviterUserId);
  const currentSize = group ? group.allUserIds.length : 1;
  const pendingCount = group?.pendingInvitations.length ?? 0;
  if (currentSize + pendingCount >= MAX_SHARE_GROUP_SIZE) {
    return { error: `Share groups are limited to ${MAX_SHARE_GROUP_SIZE} users.` };
  }

  // Prevent duplicate pending invitations for the same email
  const [existing] = await db
    .select({ id: accountSharingInvitations.id })
    .from(accountSharingInvitations)
    .where(
      and(
        eq(accountSharingInvitations.inviterUserId, inviterUserId),
        eq(accountSharingInvitations.inviteeEmail, inviteeEmail),
        eq(accountSharingInvitations.status, 'pending')
      )
    )
    .limit(1);

  if (existing) {
    return { error: 'A pending invitation already exists for that email address.' };
  }

  const pin = generateSharePin();
  const pinHash = await bcrypt.hash(pin, 12);

  const [created] = await db
    .insert(accountSharingInvitations)
    .values({
      inviterUserId,
      inviteeEmail,
      pinHash,
      pin,
    })
    .returning({ id: accountSharingInvitations.id });

  logger.info('[sharing] Invitation created', { inviterUserId, inviteeEmail, invitationId: created.id });

  return { invitationId: created.id, pin };
}

/**
 * Revoke a pending invitation. Only the inviter may revoke.
 */
export async function revokeInvitation(
  invitationId: string,
  requestingUserId: string
): Promise<{ error?: string }> {
  const db = getDb();
  const [inv] = await db
    .select()
    .from(accountSharingInvitations)
    .where(eq(accountSharingInvitations.id, invitationId))
    .limit(1);

  if (!inv) return { error: 'Invitation not found.' };
  if (inv.inviterUserId !== requestingUserId) return { error: 'Not authorised.' };
  if (inv.status !== 'pending') return { error: 'Invitation is not pending.' };

  await db
    .update(accountSharingInvitations)
    .set({ status: 'revoked', updatedAt: new Date() })
    .where(eq(accountSharingInvitations.id, invitationId));

  return {};
}

/**
 * Validate an invitation by email + PIN.
 * Returns the invitation row and the inviter's user ID on success.
 */
export async function validateInvitation(
  inviteeEmail: string,
  pin: string
): Promise<
  | { valid: true; invitationId: string; inviterUserId: string }
  | { valid: false; error: string }
> {
  const db = getDb();

  const invitations = await db
    .select()
    .from(accountSharingInvitations)
    .where(
      and(
        eq(accountSharingInvitations.inviteeEmail, inviteeEmail),
        eq(accountSharingInvitations.status, 'pending')
      )
    );

  for (const inv of invitations) {
    const match = await bcrypt.compare(pin, inv.pinHash);
    if (match) {
      return { valid: true, invitationId: inv.id, inviterUserId: inv.inviterUserId };
    }
  }

  return { valid: false, error: 'No matching invitation found for that email and PIN.' };
}

/**
 * Accept an invitation: mark it accepted and create the share-member record.
 */
export async function acceptInvitation(
  invitationId: string,
  inviterUserId: string,
  newMemberUserId: string
): Promise<void> {
  const db = getDb();

  await db
    .update(accountSharingInvitations)
    .set({ status: 'accepted', updatedAt: new Date() })
    .where(eq(accountSharingInvitations.id, invitationId));

  await db.insert(accountShareMembers).values({
    primaryUserId: inviterUserId,
    memberUserId: newMemberUserId,
    invitationId,
  });

  logger.info('[sharing] Invitation accepted', { inviterUserId, newMemberUserId, invitationId });
}

/**
 * Remove a member from a share group.
 * The primary user's data remains intact.
 * The removed member's encryption key is reset to a fresh standalone key
 * (they will have no data — they start fresh if they log in again).
 *
 * Either the primary or the member themselves may initiate removal.
 */
export async function removeMember(
  memberUserId: string,
  requestingUserId: string
): Promise<{ error?: string }> {
  const db = getDb();

  // Resolve the primary for this member
  const [keyRow] = await db
    .select({ primaryUserId: userEncryptionKeys.primaryUserId })
    .from(userEncryptionKeys)
    .where(eq(userEncryptionKeys.userId, memberUserId))
    .limit(1);

  if (!keyRow?.primaryUserId) {
    return { error: 'User is not a share member.' };
  }

  const primaryUserId = keyRow.primaryUserId;

  // Only the primary or the member themselves may remove
  if (requestingUserId !== primaryUserId && requestingUserId !== memberUserId) {
    return { error: 'Not authorised to remove this member.' };
  }

  // Mark the member record as removed
  await db
    .update(accountShareMembers)
    .set({
      status: 'removed',
      removedAt: new Date(),
      removedBy: requestingUserId,
    })
    .where(
      and(
        eq(accountShareMembers.primaryUserId, primaryUserId),
        eq(accountShareMembers.memberUserId, memberUserId),
        eq(accountShareMembers.status, 'active')
      )
    );

  // Detach the member's encryption key — clear primaryUserId and invalidate
  // their DEK wrapping so they can no longer decrypt the primary's data.
  // On next login they'll get a brand new DEK.
  await db
    .update(userEncryptionKeys)
    .set({
      primaryUserId: null,
      // Wipe the wrapped DEK so a new one must be generated on next login
      wrappedDek: '',
      wrappingIv: '',
      wrappingTag: '',
      serverWrappedDek: null,
      serverWrappingIv: null,
      serverWrappingTag: null,
      updatedAt: new Date(),
    })
    .where(eq(userEncryptionKeys.userId, memberUserId));

  // Delete the leaving member's connections from the shared group
  // but disconnect their accounts first so they are kept for the primary user.
  const memberConnections = await db
    .select({ id: simplifinConnections.id })
    .from(simplifinConnections)
    .where(eq(simplifinConnections.userId, memberUserId));

  for (const conn of memberConnections) {
    // Disconnect accounts from this connection so they survive deletion for the primary user
    await db
      .update(accounts)
      .set({ connectionId: null })
      .where(eq(accounts.connectionId, conn.id));

    // Remove dependent sync logs
    await db.delete(syncLogs).where(eq(syncLogs.connectionId, conn.id));
    
    // Cancel any scheduled sync
    try {
      const { syncScheduler } = await import('@/lib/services/sync-scheduler');
      syncScheduler.cancel(conn.id);
    } catch (e) {
      logger.warn('[sharing] Failed to cancel sync scheduler for removed member connection', { connectionId: conn.id, error: e });
    }
  }

  if (memberConnections.length > 0) {
    await db
      .delete(simplifinConnections)
      .where(eq(simplifinConnections.userId, memberUserId));
  }

  // Delete the leaving member's Plaid connections from the shared group
  // but disconnect their accounts first so they are kept for the primary user.
  const memberPlaidConnections = await db
    .select({ id: plaidConnections.id })
    .from(plaidConnections)
    .where(eq(plaidConnections.userId, memberUserId));

  for (const conn of memberPlaidConnections) {
    // Disconnect accounts from this connection so they survive deletion for the primary user
    await db
      .update(accounts)
      .set({ plaidConnectionId: null })
      .where(eq(accounts.plaidConnectionId, conn.id));

    // Remove dependent sync logs
    await db.delete(syncLogs).where(eq(syncLogs.plaidConnectionId, conn.id));

    // Cancel any scheduled sync
    try {
      const { syncScheduler } = await import('@/lib/services/sync-scheduler');
      syncScheduler.cancel(conn.id);
    } catch (e) {
      logger.warn('[sharing] Failed to cancel sync scheduler for removed member Plaid connection', { connectionId: conn.id, error: e });
    }
  }

  if (memberPlaidConnections.length > 0) {
    await db
      .delete(plaidConnections)
      .where(eq(plaidConnections.userId, memberUserId));
  }

  logger.info('[sharing] Member removed', { primaryUserId, memberUserId, removedBy: requestingUserId });

  return {};
}
