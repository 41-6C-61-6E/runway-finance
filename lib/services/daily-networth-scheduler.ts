import { getDb } from '@/lib/db';
import { userSettings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getServerDEK } from '@/lib/crypto-context';
import { checkDailyNetWorthChangeAndNotify } from '@/lib/services/notifications';
import { logger } from '@/lib/logger';

const LOG_TAG = '[daily-networth-scheduler]';
const CHECK_INTERVAL_MS = 5 * 60 * 1000; // Check every 5 minutes

class DailyNetWorthScheduler {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private _isRunning = false;

  get isRunning(): boolean {
    return this._isRunning;
  }

  async init(): Promise<void> {
    this._isRunning = true;
    logger.info(`${LOG_TAG} Daily Net Worth Alert Scheduler initialized`);
    this.scheduleCheck();
  }

  private scheduleCheck(): void {
    this.timer = setTimeout(() => this.execute(), CHECK_INTERVAL_MS);
  }

  private async execute(): Promise<void> {
    this.timer = null;

    try {
      const db = getDb();
      const settingsList = await db
        .select({
          userId: userSettings.userId,
          timezone: userSettings.timezone,
          dailyNetWorthAlertTime: userSettings.dailyNetWorthAlertTime,
        })
        .from(userSettings)
        .where(eq(userSettings.notifyDailyNetWorthChange, true));

      for (const settings of settingsList) {
        try {
          const userTz = settings.timezone || 'America/New_York';
          const alertTime = settings.dailyNetWorthAlertTime || '18:00';
          const [alertHour, alertMinute] = alertTime.split(':').map(Number);

          const nowInUserTz = new Date(new Date().toLocaleString('en-US', { timeZone: userTz }));
          const currentMinutes = nowInUserTz.getHours() * 60 + nowInUserTz.getMinutes();
          const alertMinutes = alertHour * 60 + alertMinute;

          // If current time has reached or passed the alert time, run the alert check.
          // Database deduplication (sentNotifications table) prevents duplicate notifications.
          if (currentMinutes >= alertMinutes) {
            const dek = await getServerDEK(settings.userId);
            await checkDailyNetWorthChangeAndNotify(settings.userId, dek);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (!msg.includes('No server-wrapped') && !msg.includes('No encryption keys')) {
            logger.error(`${LOG_TAG} Error checking daily net worth alert for user ${settings.userId}:`, err);
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
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this._isRunning = false;
    logger.info(`${LOG_TAG} Scheduler shut down`);
  }
}

export const dailyNetWorthScheduler = new DailyNetWorthScheduler();
