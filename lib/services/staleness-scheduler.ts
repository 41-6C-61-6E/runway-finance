import { getDb } from '@/lib/db';
import { userSettings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getServerDEK } from '@/lib/crypto-context';
import { checkStaleConnectionsAndNotify, pruneSentNotifications } from '@/lib/services/notifications';
import { logger } from '@/lib/logger';

import { BaseScheduler } from '@/lib/services/base-scheduler';

const LOG_TAG = '[staleness-scheduler]';
// Check hourly. Date-keyed dedup (stale_sync:<account>:<status>:<yyyy-mm-dd>) means
// each account/state notifies at most once per day, so running more often than
// daily only improves how quickly a *new* problem is surfaced.
const CHECK_INTERVAL_MS = 60 * 60 * 1000;

/**
 * R10: daily (hourly cadence, date-keyed dedup) staleness push alerts.
 *
 * Iterates over every user with `notifySyncErrors` enabled, resolves their data
 * user, and runs the shared `getAccountsSyncStatus` rules (reused verbatim from
 * `sync-health.ts`). Accounts newly in a `warning`/`error` state get one
 * actionable push per day, deep-linking to the relevant connection settings.
 */
class StalenessScheduler extends BaseScheduler<string> {
  constructor() {
    super();
    this.logTag = LOG_TAG;
  }

  async init(): Promise<void> {
    if (this._isInitialized) return;
    this._lastInitAt = new Date();
    this._isRunning = true;
    this._isInitialized = true;
    logger.info(`${LOG_TAG} Staleness alert scheduler initialized`);
    this.scheduleCheck();
  }

  private scheduleCheck(): void {
    this.startTimer('main', () => this.execute(), CHECK_INTERVAL_MS);
  }

  private async execute(): Promise<void> {
    this.cancel('main');

    try {
      // R3 maintenance: prune old sent_notifications rows each run (cheap,
      // idempotent). Kept separate from the user loop so prune issues never
      // affect staleness alerts and vice-versa.
      try {
        await pruneSentNotifications(90);
      } catch (pruneErr) {
        logger.debug(`${LOG_TAG} sent_notifications prune failed (non-fatal):`, pruneErr);
      }

      const db = getDb();
      const settingsList = await db
        .select({
          userId: userSettings.userId,
        })
        .from(userSettings)
        .where(eq(userSettings.notifySyncErrors, true));

      for (const settings of settingsList) {
        try {
          const dek = await getServerDEK(settings.userId);
          await checkStaleConnectionsAndNotify(settings.userId, dek);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (!this.isDekUnavailableError(err)) {
            logger.error(`${LOG_TAG} Error checking stale connections for user ${settings.userId}:`, err);
          }
        }
      }
    } catch (err) {
      logger.error(`${LOG_TAG} Check cycle failed`, {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    this.scheduleCheck();
  }

  shutdown(): void {
    super.shutdown();
  }
}

export const stalenessScheduler = new StalenessScheduler();
