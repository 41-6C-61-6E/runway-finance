import { getDb } from '@/lib/db';
import { userSettings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getServerDEK } from '@/lib/crypto-context';
import { checkWeeklyNetWorthChangeAndNotify } from '@/lib/services/notifications';
import { logger } from '@/lib/logger';

import { BaseScheduler } from '@/lib/services/base-scheduler';

const LOG_TAG = '[weekly-networth-scheduler]';
const CHECK_INTERVAL_MS = 15 * 60 * 1000; // Check every 15 minutes

class WeeklyNetWorthScheduler extends BaseScheduler<string> {
  async init(): Promise<void> {
    if (this._isInitialized) return;
    this._lastInitAt = new Date();
    this._isRunning = true;
    this._isInitialized = true;
    logger.info(`${LOG_TAG} Weekly Net Worth Alert Scheduler initialized`);
    this.scheduleCheck();
  }

  private scheduleCheck(): void {
    this.startTimer('main', () => this.execute(), CHECK_INTERVAL_MS);
  }

  private async execute(): Promise<void> {
    this.cancel('main');

    try {
      const db = getDb();
      const settingsList = await db
        .select({
          userId: userSettings.userId,
          timezone: userSettings.timezone,
          weeklyNetWorthAlertDay: userSettings.weeklyNetWorthAlertDay,
        })
        .from(userSettings)
        .where(eq(userSettings.notifyWeeklyNetWorthChange, true));

      for (const settings of settingsList) {
        try {
          const userTz = settings.timezone || 'America/New_York';
          const alertDay = (settings.weeklyNetWorthAlertDay || 'sunday').toLowerCase();

          const currentDay = new Date().toLocaleDateString('en-US', {
            timeZone: userTz,
            weekday: 'long',
          }).toLowerCase();

          // If current day matches configured alert day (e.g. sunday), run the alert check.
          // Database deduplication (sentNotifications table) prevents duplicate notifications within the same period.
          if (currentDay === alertDay) {
            const dek = await getServerDEK(settings.userId);
            await checkWeeklyNetWorthChangeAndNotify(settings.userId, dek);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (!msg.includes('No server-wrapped') && !msg.includes('No encryption keys')) {
            logger.error(`${LOG_TAG} Error checking weekly net worth alert for user ${settings.userId}:`, err);
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

export const weeklyNetWorthScheduler = new WeeklyNetWorthScheduler();
