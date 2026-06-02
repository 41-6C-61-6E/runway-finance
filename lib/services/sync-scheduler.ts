import { getDb } from '@/lib/db';
import { simplifinConnections, userEncryptionKeys } from '@/lib/db/schema';
import { syncConnection } from '@/lib/services/sync';
import { getServerDEK } from '@/lib/crypto-context';
import { eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';

const LOG_TAG = '[sync-scheduler]';

const SYNC_INTERVALS: Record<string, number> = {
  manual: 0,
  hourly: 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
};

const RETRY_DELAY_MS = 30 * 60 * 1000;

async function canSyncUser(userId: string): Promise<boolean> {
  try {
    await getServerDEK(userId);
    return true;
  } catch {
    return false;
  }
}

class SyncScheduler {
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private _isRunning = false;

  get isRunning(): boolean {
    return this._isRunning;
  }

  async init(): Promise<void> {
    const connections = await getDb()
      .select({
        id: simplifinConnections.id,
        userId: simplifinConnections.userId,
        syncFrequency: simplifinConnections.syncFrequency,
        lastSyncAt: simplifinConnections.lastSyncAt,
      })
      .from(simplifinConnections);

    let scheduled = 0;
    let skipped = 0;
    for (const conn of connections) {
      if (!(await canSyncUser(conn.userId))) {
        logger.warn(`${LOG_TAG} Skipping connection — server DEK unavailable`, {
          connectionId: conn.id,
          userId: conn.userId,
        });
        skipped++;
        continue;
      }
      if (this.schedule(conn.id, conn.syncFrequency, conn.lastSyncAt)) {
        scheduled++;
      }
    }

    this._isRunning = true;
    logger.info(`${LOG_TAG} Scheduler initialized`, { total: connections.length, scheduled, skipped });
  }

  schedule(
    id: string,
    syncFrequency: string,
    lastSyncAt: Date | null
  ): boolean {
    this.cancel(id);

    if (syncFrequency === 'manual') return false;

    const interval = SYNC_INTERVALS[syncFrequency];
    if (!interval) return false;

    const now = Date.now();
    const lastSyncTime = lastSyncAt ? lastSyncAt.getTime() : 0;
    const nextSyncTime = lastSyncTime + interval;
    const delay = Math.max(0, nextSyncTime - now);

    const timer = setTimeout(() => this.execute(id), delay);
    this.timers.set(id, timer);

    logger.info(`${LOG_TAG} Scheduled`, {
      connectionId: id,
      frequency: syncFrequency,
      delay: `${Math.round(delay / 1000 / 60)}m`,
    });

    return true;
  }

  cancel(id: string): void {
    const existing = this.timers.get(id);
    if (existing) {
      clearTimeout(existing);
      this.timers.delete(id);
    }
  }

  async scheduleForUser(userId: string): Promise<void> {
    const connections = await getDb()
      .select({
        id: simplifinConnections.id,
        syncFrequency: simplifinConnections.syncFrequency,
        lastSyncAt: simplifinConnections.lastSyncAt,
      })
      .from(simplifinConnections)
      .where(eq(simplifinConnections.userId, userId));

    for (const conn of connections) {
      this.schedule(conn.id, conn.syncFrequency, conn.lastSyncAt);
    }
  }

  private async execute(id: string): Promise<void> {
    this.timers.delete(id);

    let syncSuccess = false;
    let dekUnavailable = false;

    try {
      const [connection] = await getDb()
        .select({ userId: simplifinConnections.userId })
        .from(simplifinConnections)
        .where(eq(simplifinConnections.id, id))
        .limit(1);

      if (!connection) {
        logger.info(`${LOG_TAG} Connection deleted, skipping`, { connectionId: id });
        return;
      }

      const dek = await getServerDEK(connection.userId);
      const result = await syncConnection(id, connection.userId, dek);
      syncSuccess = result.status === 'success';

      if (syncSuccess) {
        logger.info(`${LOG_TAG} Auto-sync completed`, { connectionId: id });
      } else {
        logger.error(`${LOG_TAG} Auto-sync failed`, {
          connectionId: id,
          error: result.errorMessage,
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('server-wrapped') || msg.includes('Encryption key unavailable')) {
        dekUnavailable = true;
        logger.warn(`${LOG_TAG} Server DEK unavailable, will not retry`, {
          connectionId: id,
          error: msg,
        });
      } else {
        logger.error(`${LOG_TAG} Auto-sync error`, {
          connectionId: id,
          error: msg,
        });
      }
    }

    // Re-read current state to decide how to reschedule
    try {
      const [updated] = await getDb()
        .select({
          syncFrequency: simplifinConnections.syncFrequency,
          lastSyncAt: simplifinConnections.lastSyncAt,
        })
        .from(simplifinConnections)
        .where(eq(simplifinConnections.id, id))
        .limit(1);

      if (!updated || updated.syncFrequency === 'manual') return;

      if (dekUnavailable) return;

      if (syncSuccess) {
        this.schedule(id, updated.syncFrequency, updated.lastSyncAt);
      } else {
        const timer = setTimeout(() => this.execute(id), RETRY_DELAY_MS);
        this.timers.set(id, timer);
        logger.info(`${LOG_TAG} Retry scheduled in 30m`, { connectionId: id });
      }
    } catch (err) {
      logger.error(`${LOG_TAG} Failed to reschedule`, {
        connectionId: id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  shutdown(): void {
    for (const [id, timer] of this.timers) {
      clearTimeout(timer);
    }
    this.timers.clear();
    this._isRunning = false;
    logger.info(`${LOG_TAG} Scheduler shut down`);
  }
}

export const syncScheduler = new SyncScheduler();
