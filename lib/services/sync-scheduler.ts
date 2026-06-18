import { getDb } from '@/lib/db';
import { simplifinConnections, plaidConnections } from '@/lib/db/schema';
import { syncConnection } from '@/lib/services/sync';
import { syncPlaidConnection } from '@/lib/services/plaid-sync';
import { getServerDEK } from '@/lib/crypto-context';
import { eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { logJobStart, logJobEnd } from '@/lib/services/scheduler-logger';

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
    // 1. Fetch SimpleFIN connections
    const sfConnections = await getDb()
      .select({
        id: simplifinConnections.id,
        userId: simplifinConnections.userId,
        syncFrequency: simplifinConnections.syncFrequency,
        lastSyncAt: simplifinConnections.lastSyncAt,
      })
      .from(simplifinConnections);

    // 2. Fetch Plaid connections
    const pConnections = await getDb()
      .select({
        id: plaidConnections.id,
        userId: plaidConnections.userId,
        syncFrequency: plaidConnections.syncFrequency,
        lastSyncAt: plaidConnections.lastSyncAt,
      })
      .from(plaidConnections);

    const allConnections = [
      ...sfConnections.map((c) => ({ ...c, type: 'simplefin' })),
      ...pConnections.map((c) => ({ ...c, type: 'plaid' })),
    ];

    let scheduled = 0;
    let skipped = 0;
    for (const conn of allConnections) {
      if (!(await canSyncUser(conn.userId))) {
        logger.warn(`${LOG_TAG} Skipping connection — server DEK unavailable`, {
          connectionId: conn.id,
          userId: conn.userId,
          type: conn.type,
        });
        skipped++;
        continue;
      }
      if (this.schedule(conn.id, conn.syncFrequency, conn.lastSyncAt)) {
        scheduled++;
      }
    }

    this._isRunning = true;
    logger.info(`${LOG_TAG} Scheduler initialized`, { total: allConnections.length, scheduled, skipped });
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
    const sfConnections = await getDb()
      .select({
        id: simplifinConnections.id,
        syncFrequency: simplifinConnections.syncFrequency,
        lastSyncAt: simplifinConnections.lastSyncAt,
      })
      .from(simplifinConnections)
      .where(eq(simplifinConnections.userId, userId));

    const pConnections = await getDb()
      .select({
        id: plaidConnections.id,
        syncFrequency: plaidConnections.syncFrequency,
        lastSyncAt: plaidConnections.lastSyncAt,
      })
      .from(plaidConnections)
      .where(eq(plaidConnections.userId, userId));

    const all = [...sfConnections, ...pConnections];

    for (const conn of all) {
      this.schedule(conn.id, conn.syncFrequency, conn.lastSyncAt);
    }
  }

  private async execute(id: string): Promise<void> {
    this.timers.delete(id);

    let syncSuccess = false;
    let dekUnavailable = false;
    let isSimplefin = true;
    let logId = '';

    try {
      // Find the connection type
      let [connection] = await getDb()
        .select({ userId: simplifinConnections.userId })
        .from(simplifinConnections)
        .where(eq(simplifinConnections.id, id))
        .limit(1);

      if (!connection) {
        isSimplefin = false;
        const [plaidConn] = await getDb()
          .select({ userId: plaidConnections.userId })
          .from(plaidConnections)
          .where(eq(plaidConnections.id, id))
          .limit(1);
        connection = plaidConn;
      }

      if (!connection) {
        logger.info(`${LOG_TAG} Connection deleted, skipping reschedule`, { connectionId: id });
        return;
      }

      logId = await logJobStart(
        isSimplefin ? 'simplefin-sync' : 'plaid-sync',
        connection.userId,
        { connectionId: id }
      );

      const dek = await getServerDEK(connection.userId);
      
      let result: any;
      if (isSimplefin) {
        result = await syncConnection(id, connection.userId, dek);
      } else {
        result = await syncPlaidConnection(id, connection.userId, dek);
      }
      syncSuccess = result.status === 'success';

      if (syncSuccess) {
        logger.info(`${LOG_TAG} Auto-sync completed`, { connectionId: id, isSimplefin });
        await logJobEnd(logId, 'success', undefined, { isSimplefin, connectionId: id });
      } else {
        logger.error(`${LOG_TAG} Auto-sync failed`, {
          connectionId: id,
          isSimplefin,
          error: result.errorMessage,
        });
        await logJobEnd(logId, 'failed', result.errorMessage, { isSimplefin, connectionId: id });
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
      if (logId) {
        await logJobEnd(logId, 'failed', msg, { isSimplefin, connectionId: id, dekUnavailable });
      }
    }

    // Re-read current state to reschedule
    try {
      let refreshed: any;
      if (isSimplefin) {
        [refreshed] = await getDb()
          .select({
            syncFrequency: simplifinConnections.syncFrequency,
            lastSyncAt: simplifinConnections.lastSyncAt,
          })
          .from(simplifinConnections)
          .where(eq(simplifinConnections.id, id))
          .limit(1);
      } else {
        [refreshed] = await getDb()
          .select({
            syncFrequency: plaidConnections.syncFrequency,
            lastSyncAt: plaidConnections.lastSyncAt,
          })
          .from(plaidConnections)
          .where(eq(plaidConnections.id, id))
          .limit(1);
      }

      if (!refreshed || refreshed.syncFrequency === 'manual') return;

      if (dekUnavailable) return;

      if (syncSuccess) {
        this.schedule(id, refreshed.syncFrequency, refreshed.lastSyncAt);
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
