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
  } catch (err) {
    logger.error('[scheduler-logger] Failed to write job end log', { logId, status, error: String(err) });
  }
}
