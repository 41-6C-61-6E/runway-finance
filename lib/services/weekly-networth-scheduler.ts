import { getDb } from '@/lib/db';
import { userSettings } from '@/lib/db/schema';
import { eq, or } from 'drizzle-orm';
import { getServerDEK } from '@/lib/crypto-context';
import { checkWeeklyNetWorthChangeAndNotify, checkMonthlySummaryAndNotify } from '@/lib/services/notifications';
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
    logger.info(`${LOG_TAG} Weekly Net Worth & Monthly Summary Alert Scheduler initialized`);
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
          notifyWeeklyNetWorthChange: userSettings.notifyWeeklyNetWorthChange,
          notifyMonthlySummary: userSettings.notifyMonthlySummary,
        })
        .from(userSettings)
        .where(
          or(
            eq(userSettings.notifyWeeklyNetWorthChange, true),
            eq(userSettings.notifyMonthlySummary, true)
          )
        );

      for (const settings of settingsList) {
        try {
          const userTz = settings.timezone || 'America/New_York';
          const now = new Date();
          const dateInTz = now.toLocaleDateString('en-CA', { timeZone: userTz });
          const [, , curDay] = dateInTz.split('-').map(Number);

          // 1. Weekly Net Worth Alert Check
          if (settings.notifyWeeklyNetWorthChange) {
            const alertDay = (settings.weeklyNetWorthAlertDay || 'sunday').toLowerCase();
            const utcDay = now.toLocaleDateString('en-US', { timeZone: userTz, weekday: 'long' }).toLowerCase();

            // If current day matches configured alert day (e.g. sunday), run the alert check.
            if (utcDay === alertDay) {
              const dek = await getServerDEK(settings.userId);
              await checkWeeklyNetWorthChangeAndNotify(settings.userId, dek, userTz);
            }
          }

          // 2. Monthly Summary Alert Check (triggers on Day 1 of the new month in user timezone)
          if (settings.notifyMonthlySummary && curDay === 1) {
            const dek = await getServerDEK(settings.userId);
            await checkMonthlySummaryAndNotify(settings.userId, dek, { userTz });
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (!msg.includes('No server-wrapped') && !msg.includes('No encryption keys')) {
            logger.error(`${LOG_TAG} Error checking alerts for user ${settings.userId}:`, err);
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
