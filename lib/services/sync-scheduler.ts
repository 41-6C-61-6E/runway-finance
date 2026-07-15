import { getDb } from '@/lib/db';
import { simplifinConnections, plaidConnections, userSettings } from '@/lib/db/schema';
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

function getUtcTimestamp(year: number, month: number, day: number, hour: number, minute: number, tz: string): number {
  const utcDate = new Date(Date.UTC(year, month, day, hour, minute));
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  });
  const parts = formatter.formatToParts(utcDate);
  const formattedYear = parseInt(parts.find(p => p.type === 'year')!.value, 10);
  const formattedMonth = parseInt(parts.find(p => p.type === 'month')!.value, 10) - 1;
  const formattedDay = parseInt(parts.find(p => p.type === 'day')!.value, 10);
  const formattedHour = parseInt(parts.find(p => p.type === 'hour')!.value, 10);
  const formattedMinute = parseInt(parts.find(p => p.type === 'minute')!.value, 10);
  
  const hourVal = formattedHour === 24 ? 0 : formattedHour;
  const diffMs = Date.UTC(year, month, day, hour, minute) - Date.UTC(formattedYear, formattedMonth, formattedDay, hourVal, formattedMinute);
  return utcDate.getTime() + diffMs;
}

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
      if (await this.schedule(conn.id, conn.syncFrequency, conn.lastSyncAt, conn.userId)) {
        scheduled++;
      }
    }

    this._isRunning = true;
    logger.info(`${LOG_TAG} Scheduler initialized`, { total: allConnections.length, scheduled, skipped });
  }

  async schedule(
    id: string,
    syncFrequency: string,
    lastSyncAt: Date | null,
    userId?: string
  ): Promise<boolean> {
    this.cancel(id);

    if (syncFrequency === 'manual') return false;

    const interval = SYNC_INTERVALS[syncFrequency];
    if (!interval) return false;

    const now = Date.now();
    const lastSyncTime = lastSyncAt ? lastSyncAt.getTime() : 0;
    let delay = 0;

    if (syncFrequency === 'daily') {
      let finalUserId = userId;
      if (!finalUserId) {
        const db = getDb();
        const [sfConn] = await db
          .select({ userId: simplifinConnections.userId })
          .from(simplifinConnections)
          .where(eq(simplifinConnections.id, id))
          .limit(1);
        if (sfConn) {
          finalUserId = sfConn.userId;
        } else {
          const [pConn] = await db
            .select({ userId: plaidConnections.userId })
            .from(plaidConnections)
            .where(eq(plaidConnections.id, id))
            .limit(1);
          if (pConn) {
            finalUserId = pConn.userId;
          }
        }
      }

      if (finalUserId) {
        const db = getDb();
        const [settings] = await db
          .select({
            timezone: userSettings.timezone,
            dailyNetWorthAlertTime: userSettings.dailyNetWorthAlertTime,
          })
          .from(userSettings)
          .where(eq(userSettings.userId, finalUserId))
          .limit(1);

        const userTz = settings?.timezone || 'America/New_York';
        const alertTime = settings?.dailyNetWorthAlertTime || '18:00';
        const [alertHour, alertMinute] = alertTime.split(':').map(Number);

        // Target time is 1 hour before the alert time
        let targetHour = alertHour - 1;
        let targetMinute = alertMinute;
        if (targetHour < 0) {
          targetHour += 24;
        }

        // Determine current date in user's timezone
        const formatter = new Intl.DateTimeFormat('en-US', {
          timeZone: userTz,
          year: 'numeric',
          month: 'numeric',
          day: 'numeric',
          hour: 'numeric',
          minute: 'numeric',
          second: 'numeric',
          hour12: false,
        });
        const parts = formatter.formatToParts(new Date(now));
        const y = parseInt(parts.find(p => p.type === 'year')!.value, 10);
        const m = parseInt(parts.find(p => p.type === 'month')!.value, 10) - 1;
        const d = parseInt(parts.find(p => p.type === 'day')!.value, 10);

        const targetTimeToday = getUtcTimestamp(y, m, d, targetHour, targetMinute, userTz);
        let targetTime = targetTimeToday;

        // If target time has already passed today OR it is too close to the last sync (within 12 hours)
        if (targetTime <= now || (lastSyncTime > 0 && targetTime - lastSyncTime < 12 * 60 * 60 * 1000)) {
          // Schedule for tomorrow instead
          const tomorrow = new Date(now + 24 * 60 * 60 * 1000);
          const partsTomorrow = formatter.formatToParts(tomorrow);
          const yt = parseInt(partsTomorrow.find(p => p.type === 'year')!.value, 10);
          const mt = parseInt(partsTomorrow.find(p => p.type === 'month')!.value, 10) - 1;
          const dt = parseInt(partsTomorrow.find(p => p.type === 'day')!.value, 10);
          targetTime = getUtcTimestamp(yt, mt, dt, targetHour, targetMinute, userTz);
        }

        delay = Math.max(0, targetTime - now);
      } else {
        // Fallback if userId cannot be found
        const nextSyncTime = lastSyncTime + interval;
        delay = Math.max(0, nextSyncTime - now);
      }
    } else {
      // Non-daily intervals (hourly, weekly, monthly)
      const nextSyncTime = lastSyncTime + interval;
      delay = Math.max(0, nextSyncTime - now);
    }

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
      await this.schedule(conn.id, conn.syncFrequency, conn.lastSyncAt, userId);
    }
  }

  private async execute(id: string): Promise<void> {
    this.timers.delete(id);

    let syncSuccess = false;
    let dekUnavailable = false;
    let isSimplefin = true;
    let logId = '';
    let userId = '';

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

      userId = connection.userId;

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
        await this.schedule(id, refreshed.syncFrequency, refreshed.lastSyncAt, userId);
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
