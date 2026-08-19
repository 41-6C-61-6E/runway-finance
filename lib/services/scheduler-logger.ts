import { getDb } from '@/lib/db';
import { schedulerJobLogs } from '@/lib/db/schema';
import { eq, and, lt } from 'drizzle-orm';
import { logger } from '@/lib/logger';

/**
 * Coarse error classification for sync-failure dedup keys (R1).
 * The class is intentionally fuzzy — it only needs to be stable for the same
 * underlying problem so the alert fires once, and different when the user
 * needs to act differently (re-authorize vs. wait for network recovery).
 */
export type SyncErrorClass = 'expired_credentials' | 'auth' | 'decryption' | 'network' | 'other';

export function classifySyncError(errorMessage?: string | null): SyncErrorClass {
  const msg = (errorMessage || '').toLowerCase();
  if (
    msg.includes('decryption failed') ||
    msg.includes('decryption') ||
    msg.includes('decrypt')
  ) {
    return 'decryption';
  }
  if (
    msg.includes('expired') ||
    msg.includes('expired_token') ||
    msg.includes('revoked') ||
    msg.includes('re-auth') ||
    msg.includes('authorization is no longer valid')
  ) {
    return 'expired_credentials';
  }
  if (
    msg.includes('unauthorized') ||
    msg.includes('invalid_grant') ||
    msg.includes('invalid_access') ||
    msg.includes('access_denied') ||
    msg.includes('401') ||
    msg.includes('403') ||
    msg.includes('forbidden') ||
    msg.includes('permission') ||
    msg.includes('not found') ||
    msg.includes('no accounts')
  ) {
    return 'auth';
  }
  if (
    msg.includes('network') ||
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('fetch failed') ||
    msg.includes('econnreset') ||
    msg.includes('econnrefused') ||
    msg.includes('enotfound') ||
    msg.includes('socket') ||
    msg.includes('unreachable') ||
    msg.includes('rate limit') ||
    msg.includes('429') ||
    msg.includes('503') ||
    msg.includes('502') ||
    msg.includes('500')
  ) {
    return 'network';
  }
  return 'other';
}

function jobDisplayName(jobName: string): string {
  if (jobName === 'simplefin-sync') return 'bank connection';
  if (jobName === 'plaid-sync') return 'bank connection';
  if (jobName === 'manual-account-sync') return 'manual account';
  return jobName.replace(/-/g, ' ');
}

/**
 * Builds an actionable sync-failure alert message (R9). Maps known error
 * signatures to one-line guidance the user can act on, instead of surfacing
 * raw SDK error strings.
 */
export function buildSyncAlertMessage(
  jobName: string,
  errorMessage?: string | null,
  connectionId?: string,
  connectionDisplayName?: string | null
): { title: string; body: string } {
  const label = jobDisplayName(jobName);
  const errorClass = classifySyncError(errorMessage);

  let body: string;
  switch (errorClass) {
    case 'expired_credentials':
      body = `Your ${label} authorization has expired. Tap to re-authorize it so your data keeps updating.`;
      break;
    case 'auth':
      body = `We can't validate credentials for your ${label}. Tap to review and re-authorize the connection if needed.`;
      break;
    case 'decryption':
      body = `Your ${label} data couldn't be decrypted — the encryption key may have changed. Tap to review the connection settings.`;
      break;
    case 'network':
      body = `We couldn't reach your bank right now. We'll retry automatically in about 30 minutes — no action needed.`;
      break;
    default:
      body = `A background sync for your ${label} failed. Tap to review details — we'll retry automatically.`;
  }

  const suffix = connectionDisplayName ? `: ${connectionDisplayName}` : '';

  return {
    title: connectionId ? `Bank connection problem${suffix}` : `Sync problem${suffix}`,
    body,
  };
}

/**
 * Resolves a human-readable display name for a connection (R9). Checks Plaid
 * first (plaintext institution name), then SimpleFIN (account institution).
 * Returns null when unknown — the alert falls back to a generic title.
 */
export async function getConnectionDisplayName(connectionId: string): Promise<string | null> {
  try {
    const db = getDb();
    const { plaidConnections, simplifinConnections, accounts } = await import('@/lib/db/schema');
    const { and, or } = await import('drizzle-orm');

    const [plaid] = await db
      .select({ institutionName: plaidConnections.institutionName })
      .from(plaidConnections)
      .where(eq(plaidConnections.id, connectionId))
      .limit(1);
    if (plaid?.institutionName) return plaid.institutionName;

    const [sf] = await db
      .select({ userId: simplifinConnections.userId })
      .from(simplifinConnections)
      .where(eq(simplifinConnections.id, connectionId))
      .limit(1);
    if (sf) {
      const accountRows = await db
        .select({ institution: accounts.institution })
        .from(accounts)
        .where(
          and(
            or(
              eq(accounts.connectionId, connectionId),
              eq(accounts.plaidConnectionId, connectionId)
            )
          )
        )
        .limit(3);
      const institutions = Array.from(new Set(accountRows.map((a) => a.institution).filter(Boolean))) as string[];
      if (institutions.length === 1) return institutions[0];
      if (institutions.length > 1) return `${institutions.length} institutions`;
    }

    return null;
  } catch {
    return null;
  }
}

export async function logJobStart(jobName: string, userId: string, details?: any): Promise<string> {
  try {
    const db = getDb();
    const [inserted] = await db
      .insert(schedulerJobLogs)
      .values({
        jobName,
        userId,
        status: 'running',
        details: details || {},
      })
      .returning({ id: schedulerJobLogs.id });
    return inserted.id;
  } catch (err) {
    logger.error('[scheduler-logger] Failed to write job start log', { jobName, userId, error: String(err) });
    return '';
  }
}

export async function logJobEnd(
  logId: string,
  status: 'success' | 'failed',
  errorMessage?: string,
  details?: any
): Promise<void> {
  if (!logId) return;
  try {
    const db = getDb();
    await db
      .update(schedulerJobLogs)
      .set({
        completedAt: new Date(),
        status,
        errorMessage: errorMessage || null,
        details: details || {},
      })
      .where(eq(schedulerJobLogs.id, logId));

    if (status === 'failed') {
      const [logRow] = await db
        .select({
          userId: schedulerJobLogs.userId,
          jobName: schedulerJobLogs.jobName,
          details: schedulerJobLogs.details,
        })
        .from(schedulerJobLogs)
        .where(eq(schedulerJobLogs.id, logId))
        .limit(1);

      if (logRow) {
        const { sendPushNotification } = await import('@/lib/services/notifications');
        const { userSettings } = await import('@/lib/db/schema');
        const [settings] = await db
          .select({ notifySyncErrors: userSettings.notifySyncErrors })
          .from(userSettings)
          .where(eq(userSettings.userId, logRow.userId))
          .limit(1);

        if (settings?.notifySyncErrors) {
          // R1: stable, re-arming dedup key so a broken connection alerts once
          // per error class instead of spamming every 30-minute retry. The key
          // is deleted on the next successful sync (healSyncAlerts), which
          // re-arms the alert for future failures.
          const connectionId: string | undefined =
            (logRow.details as any)?.connectionId || details?.connectionId;
          // Manual (non-connected) accounts retry on the same 30m cadence; use
          // the stable account id as the dedup dimension so they also alert once.
          const accountId: string | undefined =
            logRow.jobName === 'manual-account-sync'
              ? (logRow.details as any)?.accountId || details?.accountId
              : undefined;
          const errorClass = classifySyncError(errorMessage);
          const stableId = connectionId || accountId;
          const key = stableId ? `sync_error:${stableId}:${errorClass}` : undefined;

          // R9: actionable, human-readable message with a deep link to the
          // specific connection instead of a raw SDK error string.
          const connectionDisplayName = connectionId
            ? await getConnectionDisplayName(connectionId)
            : null;
          const { title, body } = buildSyncAlertMessage(logRow.jobName, errorMessage, connectionId, connectionDisplayName);
          const urlPath = connectionId
            ? `/settings?tab=advanced&connection=${connectionId}`
            : accountId
              ? '/accounts'
              : '/settings?tab=advanced';

          await sendPushNotification(
            logRow.userId,
            title,
            body,
            urlPath,
            'sync_error',
            key
          );
        }
      }
    }
  } catch (err) {
    logger.error('[scheduler-logger] Failed to write job end log', { logId, status, error: String(err) });
  }
}

/**
 * Reconciles jobs that were left in 'running' status because of a server crash or unhandled shutdown.
 * Marks jobs started more than 2 hours ago as 'failed'.
 */
export async function reconcileStuckRunningJobs(): Promise<number> {
  try {
    const db = getDb();
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const updated = await db
      .update(schedulerJobLogs)
      .set({
        status: 'failed',
        errorMessage: 'Process terminated or timed out during execution',
        completedAt: new Date(),
      })
      .where(
        and(
          eq(schedulerJobLogs.status, 'running'),
          lt(schedulerJobLogs.startedAt, twoHoursAgo)
        )
      )
      .returning({ id: schedulerJobLogs.id });
    if (updated.length > 0) {
      logger.info(`[scheduler-logger] Reconciled ${updated.length} stuck running job(s)`);
    }
    return updated.length;
  } catch (err) {
    logger.error('[scheduler-logger] Failed to reconcile stuck running jobs', { error: String(err) });
    return 0;
  }
}

/**
 * Prunes scheduler job logs older than the retention threshold (default 30 days).
 */
export async function pruneOldJobLogs(retentionDays = 30): Promise<number> {
  try {
    const db = getDb();
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const deleted = await db
      .delete(schedulerJobLogs)
      .where(lt(schedulerJobLogs.startedAt, cutoff))
      .returning({ id: schedulerJobLogs.id });
    if (deleted.length > 0) {
      logger.info(`[scheduler-logger] Pruned ${deleted.length} old scheduler job log(s) older than ${retentionDays}d`);
    }
    return deleted.length;
  } catch (err) {
    logger.error('[scheduler-logger] Failed to prune old scheduler job logs', { error: String(err) });
    return 0;
  }
}

