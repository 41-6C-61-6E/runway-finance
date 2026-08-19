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

import { getDb, getPool } from './db';
import * as schema from './db/schema';
import {
  accountShareMembers,
  accountSharingInvitations,
  userEncryptionKeys,
  simplifinConnections,
  plaidConnections,
  accounts,
  syncLogs,
  dekVersions,
  dekVersionWraps,
} from './db/schema';
import { and, eq, ne, or } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { createHash, randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { logger } from './logger';
import { generateDEK, wrapKey, getServerKey } from './crypto';

// Drizzle instance type (without the concrete $client brand, so a db bound to
// a transactional PoolClient is also assignable).
type Db = Omit<ReturnType<typeof getDb>, '$client'>;

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
    role: string;
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

/** After this many failed PIN attempts a pending invitation is auto-revoked. */
export const MAX_INVITATION_ATTEMPTS = 20;

/** Pending invitations are valid for 7 days (evaluated lazily at validation). */
const INVITATION_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

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
 * Given a data user ID (the primary), return all user IDs in the share group
 * (primary + active members). Returns [dataUserId] if no share group exists.
 *
 * This is useful for the notification service: alert rules are stored per-user,
 * so we need to check rules from all group members during background evaluation.
 */
export async function getShareGroupUserIds(dataUserId: string): Promise<string[]> {
  const db = getDb();
  const members = await db
    .select({ memberUserId: accountShareMembers.memberUserId })
    .from(accountShareMembers)
    .where(
      and(
        eq(accountShareMembers.primaryUserId, dataUserId),
        eq(accountShareMembers.status, 'active')
      )
    );

  return [dataUserId, ...members.map((m) => m.memberUserId)];
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
      role: accountShareMembers.role,
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
 * Generate a cryptographically random 256-bit single-use join token
 * (43 chars in base64url).
 */
export function generateJoinToken(): string {
  return randomBytes(32).toString('base64url');
}

/** sha256 of a secret, as a lowercase hex digest (for at-rest storage). */
function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * Create a new sharing invitation.
 * Returns the invitation ID plus the plaintext PIN and join token
 * (each shown once to the user; only hashes are persisted).
 */
export async function createInvitation(
  inviterUserId: string,
  inviteeEmail: string
): Promise<{ invitationId: string; pin: string; token: string } | { error: string }> {
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
  const token = generateJoinToken();

  const [created] = await db
    .insert(accountSharingInvitations)
    .values({
      inviterUserId,
      inviteeEmail,
      pinHash,
      pin: null, // Never persist plaintext PIN
      joinTokenHash: sha256Hex(token), // Never persist the plaintext token
    })
    .returning({ id: accountSharingInvitations.id });

  logger.info('[sharing] Invitation created', { inviterUserId, inviteeEmail, invitationId: created.id });

  return { invitationId: created.id, pin, token };
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
    if (Date.now() - new Date(inv.createdAt).getTime() > INVITATION_EXPIRY_MS) {
      await db
        .update(accountSharingInvitations)
        .set({ status: 'expired', updatedAt: new Date() })
        .where(eq(accountSharingInvitations.id, inv.id));
      continue;
    }

    const match = await bcrypt.compare(pin, inv.pinHash);
    if (match) {
      return { valid: true, invitationId: inv.id, inviterUserId: inv.inviterUserId };
    }

    // Wrong PIN for a live invitation: record the attempt. (No increment when
    // no invitation exists for this email — that would enable enumeration.)
    const attempts = (inv.attempts ?? 0) + 1;
    if (attempts >= MAX_INVITATION_ATTEMPTS) {
      await db
        .update(accountSharingInvitations)
        .set({ attempts, status: 'revoked', updatedAt: new Date() })
        .where(eq(accountSharingInvitations.id, inv.id));
    } else {
      await db
        .update(accountSharingInvitations)
        .set({ attempts, updatedAt: new Date() })
        .where(eq(accountSharingInvitations.id, inv.id));
    }
  }

  return { valid: false, error: 'No matching invitation found for that email and PIN.' };
}

/**
 * Validate a one-time join token (the secret embedded in shareable join links).
 *
 * The token is 256-bit random and single-use — `acceptInvitation` flips the
 * invitation to 'accepted', consuming it — so failed attempts are NOT counted
 * here; brute force is handled by route-level rate limiting.
 *
 * The error is deliberately generic: an unknown token, an expired invitation,
 * and a consumed invitation all produce the same response (no oracle).
 */
export async function validateJoinToken(
  token: string,
  db: Db = getDb()
): Promise<
  | { valid: true; invitationId: string; inviterUserId: string; inviteeEmail: string }
  | { valid: false; error: string }
> {
  const tokenHash = sha256Hex(token);

  const [inv] = await db
    .select()
    .from(accountSharingInvitations)
    .where(eq(accountSharingInvitations.joinTokenHash, tokenHash))
    .limit(1);

  if (!inv || inv.status !== 'pending') {
    return { valid: false, error: 'Invalid or expired join link.' };
  }

  // Lazy expiry, mirroring the PIN path: persist 'expired' when encountered.
  if (Date.now() - new Date(inv.createdAt).getTime() > INVITATION_EXPIRY_MS) {
    await db
      .update(accountSharingInvitations)
      .set({ status: 'expired', updatedAt: new Date() })
      .where(eq(accountSharingInvitations.id, inv.id));
    return { valid: false, error: 'Invalid or expired join link.' };
  }

  return {
    valid: true,
    invitationId: inv.id,
    inviterUserId: inv.inviterUserId,
    inviteeEmail: inv.inviteeEmail,
  };
}

/**
 * Accept an invitation: mark it accepted and create the share-member record.
 *
 * Re-validates the invitation and re-checks the group size limit on the (possibly
 * transactional) db handle so a concurrent join cannot push the group past
 * MAX_SHARE_GROUP_SIZE between validation and acceptance.
 *
 * Returns `{ error }` on a re-check failure (before any writes) and `void` on
 * success.
 */
export async function acceptInvitation(
  invitationId: string,
  inviterUserId: string,
  newMemberUserId: string,
  db: Db = getDb()
): Promise<void | { error: string }> {
  // Re-select the invitation on the provided handle and assert it is still pending
  const [inv] = await db
    .select()
    .from(accountSharingInvitations)
    .where(eq(accountSharingInvitations.id, invitationId))
    .limit(1);

  if (!inv || inv.status !== 'pending') {
    return { error: 'Invitation is not pending.' };
  }

  // Re-check the group size limit the same way createInvitation does
  const activeMembers = await db
    .select({ memberUserId: accountShareMembers.memberUserId })
    .from(accountShareMembers)
    .where(
      and(
        eq(accountShareMembers.primaryUserId, inviterUserId),
        eq(accountShareMembers.status, 'active')
      )
    );

  const pendingInvites = await db
    .select({ id: accountSharingInvitations.id })
    .from(accountSharingInvitations)
    .where(
      and(
        eq(accountSharingInvitations.inviterUserId, inviterUserId),
        eq(accountSharingInvitations.status, 'pending')
      )
    );

  // After acceptance the group holds the primary + (activeMembers + 1) members
  // and (pendingInvites - 1) outstanding invitations (the one being accepted).
  const projectedSize = 1 + activeMembers.length + 1 + (pendingInvites.length - 1);
  if (projectedSize > MAX_SHARE_GROUP_SIZE) {
    return { error: `Share groups are limited to ${MAX_SHARE_GROUP_SIZE} users.` };
  }

    // Preserve the admin role if a previously REMOVED admin is re-invited.
    const [existingMember] = await db
      .select({ role: accountShareMembers.role, status: accountShareMembers.status })
      .from(accountShareMembers)
      .where(
        and(
          eq(accountShareMembers.primaryUserId, inviterUserId),
          eq(accountShareMembers.memberUserId, newMemberUserId)
        )
      )
      .limit(1);
    const existingAdmin = existingMember?.status !== 'active' && existingMember?.role === 'admin';

  await db
    .update(accountSharingInvitations)
    .set({ status: 'accepted', updatedAt: new Date() })
    .where(eq(accountSharingInvitations.id, invitationId));

  // Upsert on the permanent (primaryUserId, memberUserId) unique constraint so
  // re-inviting a previously REMOVED member reactivates the existing row
  // instead of failing with a unique-violation.
  await db
    .insert(accountShareMembers)
    .values({
      primaryUserId: inviterUserId,
      memberUserId: newMemberUserId,
      invitationId,
        role: existingAdmin ? 'admin' : 'member',
    })
    .onConflictDoUpdate({
      target: [accountShareMembers.primaryUserId, accountShareMembers.memberUserId],
      set: {
        status: 'active',
        invitationId,
        role: existingAdmin ? 'admin' : 'member',
        removedAt: null,
        removedBy: null,
        joinedAt: new Date(),
      },
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

  // The primary and the member themselves may always remove. Anyone else
  // (typically an admin) may remove a member only if they hold the admin role
  // AND the target is a plain member (admins cannot remove other admins).
  const isPrimary = requestingUserId === primaryUserId;
  const isSelf = requestingUserId === memberUserId;
  if (!isPrimary && !isSelf) {
    const requesterRole = await getShareMemberRole(primaryUserId, requestingUserId);
    const targetRole = await getShareMemberRole(primaryUserId, memberUserId);
    if (requesterRole !== 'admin' || targetRole === 'admin') {
      return { error: 'Only the owner or an admin can remove this member.' };
    }
  }

  // Run the whole mutation sequence in ONE transaction so a crash cannot leave
  // a "removed" member whose user_encryption_keys row still points at the
  // primary (the key row is the data-access gate).
  const client = await getPool().connect();
  let rotatedVersion: number | null = null;
  try {
    await client.query('BEGIN');
    const txDb = drizzle(client, { schema });

    // Mark the member record as removed
    await txDb
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

    // Rotate the household DEK: the leaver's key row wrapped this DEK, so move
    // the household to a fresh DEK they have no wrap for. Runs inside the same
    // transaction — a failed rotation rolls back the whole removal.
    const [primaryKeyRow] = await txDb
      .select()
      .from(userEncryptionKeys)
      .where(eq(userEncryptionKeys.userId, primaryUserId))
      .limit(1);

    if (!primaryKeyRow?.serverWrappedDek || !primaryKeyRow.serverWrappingIv) {
      logger.warn('[sharing] Primary key row missing server wrap; skipping DEK rotation', {
        primaryUserId,
        memberUserId,
      });
    } else {
      const versionRows = await txDb
        .select({ version: dekVersions.version })
        .from(dekVersions)
        .where(eq(dekVersions.primaryUserId, primaryUserId));
      const currentMaxVersion = versionRows.reduce((max, r) => Math.max(max, r.version ?? 0), 0);

      const newDek = generateDEK();
      const newWrap = await wrapKey(newDek, getServerKey());

      if (currentMaxVersion === 0) {
        // Anchor the pre-rotation DEK as version 1 so existing member wraps
        // of it remain decryptable through the chain.
        await txDb.insert(dekVersions).values({
          primaryUserId,
          version: 1,
          dekWrappedServer: primaryKeyRow.serverWrappedDek,
          wrappingIv: primaryKeyRow.serverWrappingIv,
          wrappingTag: primaryKeyRow.serverWrappingTag ?? '',
        });
      }

      rotatedVersion = currentMaxVersion === 0 ? 2 : currentMaxVersion + 1;
      await txDb.insert(dekVersions).values({
        primaryUserId,
        version: rotatedVersion,
        dekWrappedServer: newWrap.ciphertext,
        wrappingIv: newWrap.iv,
        wrappingTag: newWrap.tag,
      });

      // Re-wrap the new DEK for the primary and all remaining members
      await txDb
        .update(userEncryptionKeys)
        .set({
          serverWrappedDek: newWrap.ciphertext,
          serverWrappingIv: newWrap.iv,
          serverWrappingTag: newWrap.tag,
          updatedAt: new Date(),
        })
        .where(
          and(
            or(eq(userEncryptionKeys.userId, primaryUserId), eq(userEncryptionKeys.primaryUserId, primaryUserId)),
            ne(userEncryptionKeys.userId, memberUserId)
          )
        );

      // Cryptographic revocation: drop the leaver's per-version wraps
      await txDb.delete(dekVersionWraps).where(eq(dekVersionWraps.memberUserId, memberUserId));
    }

    // Detach the member's encryption key — clear primaryUserId and invalidate
    // their DEK wrapping so they can no longer decrypt the primary's data.
    // On next login they'll get a brand new DEK.
    await txDb
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
    const memberConnections = await txDb
      .select({ id: simplifinConnections.id })
      .from(simplifinConnections)
      .where(eq(simplifinConnections.userId, memberUserId));

    for (const conn of memberConnections) {
      // Disconnect accounts from this connection so they survive deletion for the primary user
      await txDb
        .update(accounts)
        .set({ connectionId: null })
        .where(eq(accounts.connectionId, conn.id));

      // Remove dependent sync logs
      await txDb.delete(syncLogs).where(eq(syncLogs.connectionId, conn.id));

      // Cancel any scheduled sync
      try {
        const { syncScheduler } = await import('@/lib/services/sync-scheduler');
        syncScheduler.cancel(conn.id);
      } catch (e) {
        logger.warn('[sharing] Failed to cancel sync scheduler for removed member connection', { connectionId: conn.id, error: e });
      }
    }

    if (memberConnections.length > 0) {
      await txDb
        .delete(simplifinConnections)
        .where(eq(simplifinConnections.userId, memberUserId));
    }

    // Delete the leaving member's Plaid connections from the shared group
    // but disconnect their accounts first so they are kept for the primary user.
    const memberPlaidConnections = await txDb
      .select({ id: plaidConnections.id })
      .from(plaidConnections)
      .where(eq(plaidConnections.userId, memberUserId));

    for (const conn of memberPlaidConnections) {
      // Disconnect accounts from this connection so they survive deletion for the primary user
      await txDb
        .update(accounts)
        .set({ plaidConnectionId: null })
        .where(eq(accounts.plaidConnectionId, conn.id));

      // Remove dependent sync logs
      await txDb.delete(syncLogs).where(eq(syncLogs.plaidConnectionId, conn.id));

      // Cancel any scheduled sync
      try {
        const { syncScheduler } = await import('@/lib/services/sync-scheduler');
        syncScheduler.cancel(conn.id);
      } catch (e) {
        logger.warn('[sharing] Failed to cancel sync scheduler for removed member Plaid connection', { connectionId: conn.id, error: e });
      }
    }

    if (memberPlaidConnections.length > 0) {
      await txDb
        .delete(plaidConnections)
        .where(eq(plaidConnections.userId, memberUserId));
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  if (rotatedVersion !== null) {
    // Deferred import: crypto-context transitively loads the auth module (and
    // next/server), which is unavailable in the unit-test runtime.
    try {
      const { invalidateUserDEKCache } = await import('./crypto-context');
      invalidateUserDEKCache();
    } catch (err) {
      logger.warn('[sharing] Failed to invalidate DEK cache after rotation', {
        primaryUserId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    logger.info('[sharing] Household DEK rotated after member removal', {
      primaryUserId,
      memberUserId,
      version: rotatedVersion,
    });
  }

  logger.info('[sharing] Member removed', { primaryUserId, memberUserId, removedBy: requestingUserId });

  return {};
}

  /**
   * Shared-group role for a user, resolved against the group they actually
   * belong to (via user_encryption_keys.primaryUserId). Returns 'member' when
   * the user is not an active admin — safe default for permission checks.
   */
  export async function getShareMemberRole(
    primaryUserId: string,
    userId: string
  ): Promise<'admin' | 'member'> {
    const db = getDb();
    const [row] = await db
      .select({ role: accountShareMembers.role })
      .from(accountShareMembers)
      .where(
        and(
          eq(accountShareMembers.primaryUserId, primaryUserId),
          eq(accountShareMembers.memberUserId, userId),
          eq(accountShareMembers.status, 'active')
        )
      )
      .limit(1);
    return row?.role === 'admin' ? 'admin' : 'member';
  }

  /**
   * Change a member's role between 'admin' and 'member'.
   * Only the primary or an existing admin may change roles, and a user can
   * never change their own role (prevents self-escalation).
   *
   * Returns `{ error }` on failure (auth, not found, self-change, no-op).
   */
  export async function updateMemberRole(
    memberUserId: string,
    newRole: 'admin' | 'member',
    requestingUserId: string
  ): Promise<{ error?: string }> {
    const db = getDb();

    // Resolve the requesting user's group (they must be primary or a member).
    const [keyRow] = await db
      .select({ primaryUserId: userEncryptionKeys.primaryUserId })
      .from(userEncryptionKeys)
      .where(eq(userEncryptionKeys.userId, requestingUserId))
      .limit(1);

    const groupPrimaryId = keyRow?.primaryUserId ?? requestingUserId;
    const isPrimary = groupPrimaryId === requestingUserId;
    const requesterRole = isPrimary ? 'admin' : await getShareMemberRole(groupPrimaryId, requestingUserId);
    if (!isPrimary && requesterRole !== 'admin') {
      return { error: 'Only the owner or an admin can change member roles.' };
    }

    if (requestingUserId === memberUserId) {
      return { error: 'You cannot change your own role.' };
    }

    const [target] = await db
      .select({ role: accountShareMembers.role, status: accountShareMembers.status })
      .from(accountShareMembers)
      .where(
        and(
          eq(accountShareMembers.primaryUserId, groupPrimaryId),
          eq(accountShareMembers.memberUserId, memberUserId),
          eq(accountShareMembers.status, 'active')
        )
      )
      .limit(1);

    if (!target) {
      return { error: 'Member not found.' };
    }

    if (target.role === newRole) {
      return { error: 'Member already has that role.' };
    }

    await db
      .update(accountShareMembers)
      .set({ role: newRole })
      .where(
        and(
          eq(accountShareMembers.primaryUserId, groupPrimaryId),
          eq(accountShareMembers.memberUserId, memberUserId),
          eq(accountShareMembers.status, 'active')
        )
      );

    logger.info('[sharing] Member role changed', {
      primaryUserId: groupPrimaryId,
      memberUserId,
      newRole,
      changedBy: requestingUserId,
    });

    return {};
  }
