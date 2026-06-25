import { getDb } from '@/lib/db';
import { schedulerJobLogs } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
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
