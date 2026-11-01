import 'server-only';
import { getDb } from '@/lib/db';
import { userSettings, netWorthSnapshots, sentNotifications } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { decryptField } from '@/lib/crypto';
import { calculateWealthFlow } from '@/lib/services/wealth-flow';
import { logger } from '@/lib/logger';
import { sendPushNotification } from '../transport';

export async function checkNetWorthMilestonesAndNotify(userId: string, dek: Uint8Array) {
  try {
    const db = getDb();
    const [settings] = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);

    if (!settings || !settings.notifyNetWorthMilestones) return;

    // Fetch the 2 most recent snapshots
    const snapshots = await db
      .select({
        netWorth: netWorthSnapshots.netWorth,
        snapshotDate: netWorthSnapshots.snapshotDate,
      })
      .from(netWorthSnapshots)
      .where(eq(netWorthSnapshots.userId, userId))
      .orderBy(desc(netWorthSnapshots.snapshotDate))
      .limit(2);

    if (snapshots.length < 2) return;

    const currentNetWorth = parseFloat(await decryptField(snapshots[0].netWorth, dek));
    const previousNetWorth = parseFloat(await decryptField(snapshots[1].netWorth, dek));

    if (isNaN(currentNetWorth) || isNaN(previousNetWorth)) return;

    const interval = settings.netWorthMilestoneInterval ?? 100000;
    if (interval <= 0) return;

    const prevMilestoneIndex = Math.floor(previousNetWorth / interval);
    const currMilestoneIndex = Math.floor(currentNetWorth / interval);

    if (currMilestoneIndex > prevMilestoneIndex) {
      const milestoneValue = currMilestoneIndex * interval;
      const key = `net_worth_milestone:${milestoneValue}`;

      // format the milestone amount nicely
      const formattedAmount = new Intl.NumberFormat(settings.locale || 'en-US', {
        style: 'currency',
        currency: settings.currency || 'USD',
        maximumFractionDigits: 0,
      }).format(milestoneValue);

      await sendPushNotification(
        userId,
        `Net Worth Milestone Reached!`,
        `Congratulations, your net worth has crossed ${formattedAmount}!`,
        '/',
        'net_worth_milestone',
        key
      );
    }
  } catch (err) {
    logger.error('[notifications-service] Error checking net worth milestones:', err);
  }
}

export async function checkWeeklyNetWorthChangeAndNotify(userId: string, dek: Uint8Array, userTz?: string) {
  try {
    const db = getDb();
    const [settings] = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);

    if (!settings || !settings.notifyWeeklyNetWorthChange) return;

    // Use provided timezone or fall back to settings timezone
    const tz = userTz || (settings.timezone || 'America/New_York');

    // Gate on the user's preferred alert day (default sunday)
    const alertDay = (settings.weeklyNetWorthAlertDay || 'sunday').toLowerCase();
    const userTzDate = new Date();
    const currentDay = userTzDate.toLocaleDateString('en-US', { timeZone: tz, weekday: 'long' }).toLowerCase();

    if (currentDay !== alertDay) {
      logger.debug('[notifications-service] Skipping weekly net worth change alert: not configured alert day', {
        userId,
        alertDay,
        currentDay,
      });
      return;
    }

    const dateInTz = userTzDate.toLocaleDateString('en-CA', { timeZone: tz });
    const [yKey, mKey, dKey] = dateInTz.split('-').map(Number);
    const tzDate = new Date(Date.UTC(yKey, mKey - 1, dKey));
    tzDate.setUTCDate(tzDate.getUTCDate() + 4 - (tzDate.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(tzDate.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(((tzDate.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    const yearWeek = `${tzDate.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
    const weeklyKey = `weekly_net_worth_change:${alertDay}:${yearWeek}`;
    try {
      const [alreadySent] = await db
        .select({ id: sentNotifications.id })
        .from(sentNotifications)
        .where(and(eq(sentNotifications.userId, userId), eq(sentNotifications.key, weeklyKey)))
        .limit(1);
      if (alreadySent) {
        logger.debug('[notifications-service] Weekly net worth change already alerted for alert day, skipping.', {
          userId,
          key: weeklyKey,
        });
        return;
      }
    } catch (dedupErr) {
      logger.debug('[notifications-service] Weekly dedup pre-check failed, continuing:', dedupErr);
    }

    // Fetch the 2 most recent snapshots
    const snapshots = await db
      .select({
        netWorth: netWorthSnapshots.netWorth,
        snapshotDate: netWorthSnapshots.snapshotDate,
      })
      .from(netWorthSnapshots)
      .where(eq(netWorthSnapshots.userId, userId))
      .orderBy(desc(netWorthSnapshots.snapshotDate))
      .limit(2);

    if (snapshots.length < 2) return;

    const snapshotDateStr = snapshots[0].snapshotDate; // e.g. YYYY-MM-DD
    const snapshotDate = new Date(snapshotDateStr + 'T00:00:00Z');
    const startDateDate = new Date(snapshotDate.getTime() - 7 * 24 * 60 * 60 * 1000);
    const startDateStr = startDateDate.toISOString().split('T')[0];

    const flowData = await calculateWealthFlow(userId, startDateStr, snapshotDateStr, dek, [], '7d_discrete');
    const diff = flowData.summary.netWorthChange;

    if (isNaN(diff) || Math.abs(diff) < 0.01) return;

    const formattedDiff = new Intl.NumberFormat(settings.locale || 'en-US', {
      style: 'currency',
      currency: settings.currency || 'USD',
    }).format(Math.abs(diff));

    const direction = diff > 0 ? 'increased' : 'decreased';
    const arrow = diff > 0 ? '📈' : '📉';

    const [y, m, d] = snapshotDateStr.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    const formattedDate = dateObj.toLocaleDateString(settings.locale || 'en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    const timePhrase = `for the week ending ${formattedDate}`;

    await sendPushNotification(
      userId,
      `Weekly Net Worth Alert ${arrow}`,
      `Your net worth ${direction} by ${formattedDiff} ${timePhrase}.`,
      `/flows?timeframe=7d_discrete&date=${snapshotDateStr}`,
      'weekly_net_worth_change',
      weeklyKey
    );
  } catch (err) {
    logger.error('[notifications-service] Error checking weekly net worth changes:', err);
  }
}

