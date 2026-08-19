import { getDb } from './db';
import { shareAuditLog } from './db/schema';
import { logger } from './logger';

export const SHARE_AUDIT_ACTIONS = {
  ACCOUNT_DELETION_BLOCKED: 'ACCOUNT_DELETION_BLOCKED',
  INVITATION_CREATED: 'INVITATION_CREATED',
  INVITATION_REVOKED: 'INVITATION_REVOKED',
  MEMBER_JOINED: 'MEMBER_JOINED',
  MEMBER_REMOVED: 'MEMBER_REMOVED',
  MEMBER_ROLE_CHANGED: 'MEMBER_ROLE_CHANGED',
  OWNERSHIP_TRANSFERRED: 'OWNERSHIP_TRANSFERRED',
  CONNECTION_DELETED: 'CONNECTION_DELETED',
  ACCOUNT_DELETED: 'ACCOUNT_DELETED',
} as const;

export type ShareAuditAction = (typeof SHARE_AUDIT_ACTIONS)[keyof typeof SHARE_AUDIT_ACTIONS];

/**
 * Record a share-group mutation in share_audit_log.
 * Never throws: an audit failure must not break the mutation itself.
 */
export async function logShareAudit(
  dataUserId: string,
  actorUserId: string,
  action: ShareAuditAction,
  targetTable?: string,
  targetId?: string
): Promise<void> {
  try {
    const db = getDb();
    await db
      .insert(shareAuditLog)
      .values({
        dataUserId,
        actorUserId,
        action,
        targetTable: targetTable ?? null,
        targetId: targetId ?? null,
      });
  } catch (err) {
    logger.warn('[share-audit] Failed to write audit entry', {
      action,
      actorUserId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
