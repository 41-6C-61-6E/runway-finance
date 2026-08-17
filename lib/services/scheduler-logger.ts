import { getDb } from '@/lib/db';
import { schedulerJobLogs } from '@/lib/db/schema';
import { eq, and, lt } from 'drizzle-orm';
import { logger } from '@/lib/logger';

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
        .select({ userId: schedulerJobLogs.userId, jobName: schedulerJobLogs.jobName })
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
          await sendPushNotification(
            logRow.userId,
            `Sync Failure: ${logRow.jobName}`,
            errorMessage || 'A background sync job failed. Tap to review details.',
            '/settings?tab=advanced'
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

