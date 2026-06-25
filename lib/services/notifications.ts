import { getDb } from '@/lib/db';
import { pushSubscriptions, sentNotifications, budgets, categories, transactions, userSettings, netWorthSnapshots } from '@/lib/db/schema';
import { eq, and, or, isNull, gte, lt, inArray, sql, desc } from 'drizzle-orm';
import { decryptField } from '@/lib/crypto';
import { logger } from '@/lib/logger';
import webpush from 'web-push';

// Initialize web-push if VAPID keys are available in process.env
const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
const subject = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';

let isInitialized = false;
if (publicKey && privateKey) {
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    isInitialized = true;
    logger.info('[notifications-service] VAPID details initialized successfully');
  } catch (err) {
    logger.error('[notifications-service] Failed to set VAPID details:', err);
  }
} else {
  logger.warn('[notifications-service] Web Push VAPID keys are missing from environment. Notifications will be disabled.');
}

export async function sendPushNotification(
  userId: string,
  title: string,
  body: string,
  urlPath?: string,
  type: string = 'generic',
  key?: string
) {
  if (!isInitialized) {
    logger.warn('[notifications-service] Cannot send push notification: service not initialized (VAPID keys missing).');
    return;
  }

  const db = getDb();

  // 1. Deduplication check
  if (key) {
    try {
      const [existing] = await db
        .select({ id: sentNotifications.id })
        .from(sentNotifications)
        .where(
          and(
            eq(sentNotifications.userId, userId),
            eq(sentNotifications.key, key)
          )
        )
        .limit(1);
      if (existing) {
        logger.debug('[notifications-service] Notification already sent, skipping.', { key });
        return;
      }
    } catch (err) {
      logger.error('[notifications-service] Error checking duplicate notification:', err);
    }
  }

  // 2. Rate Limiting Check
  try {
    const [settings] = await db
      .select({
        maxNotificationsPerPeriod: userSettings.maxNotificationsPerPeriod,
        notificationLimiterPeriodMinutes: userSettings.notificationLimiterPeriodMinutes,
      })
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);

    const maxNotifications = settings?.maxNotificationsPerPeriod ?? 5;
    const periodMinutes = settings?.notificationLimiterPeriodMinutes ?? 60;

    const periodStart = new Date(Date.now() - periodMinutes * 60 * 1000);
    const [countRes] = await db
      .select({ count: sql<number>`count(*)` })
      .from(sentNotifications)
      .where(
        and(
          eq(sentNotifications.userId, userId),
          gte(sentNotifications.sentAt, periodStart)
        )
      );

    const sentCount = Number(countRes?.count ?? 0);
    if (sentCount >= maxNotifications) {
      logger.warn('[notifications-service] Rate limit exceeded. Suppressing push notification.', {
        userId,
        sentCount,
        maxNotifications,
        periodMinutes,
      });
      return;
    }
  } catch (err) {
    logger.error('[notifications-service] Error checking rate limit:', err);
  }

  // 3. Send notifications to all active subscriptions
  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));

  if (subs.length === 0) {
    logger.debug('[notifications-service] No push subscriptions found for user', { userId });
    return;
  }

  const payload = JSON.stringify({
    title,
    body,
    url: urlPath || '/',
  });

  let sentSuccessfully = false;

  const promises = subs.map(async (sub) => {
    try {
      const keys = sub.keys as { p256dh: string; auth: string };
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: keys.p256dh,
          auth: keys.auth,
        },
      };

      await webpush.sendNotification(pushSubscription, payload);
      sentSuccessfully = true;
    } catch (err: any) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        logger.info('[notifications-service] Deleting expired or invalid push subscription', {
          id: sub.id,
          endpoint: sub.endpoint,
        });
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
      } else {
        logger.error('[notifications-service] Error sending push notification', {
          endpoint: sub.endpoint,
          error: String(err),
        });
      }
    }
  });

  await Promise.all(promises);

  // 4. Log sent notification
  if (sentSuccessfully) {
    try {
      const finalKey = key || `generic:${Date.now()}:${Math.random().toString(36).substring(2, 7)}`;
      await db.insert(sentNotifications).values({
        userId,
        type,
        key: finalKey,
      });
    } catch (err) {
      logger.error('[notifications-service] Failed to record sent notification:', err);
    }
  }
}

export async function checkBudgetsAndNotify(userId: string, dek: Uint8Array) {
  try {
    const db = getDb();
    const [settings] = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);

    if (!settings || !settings.notifyBudgetAlerts) return;

    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    
    // Calculate period bounds (monthly)
    const y = now.getFullYear();
    const m = now.getMonth();
    const start = new Date(Date.UTC(y, m, 1));
    const next = new Date(Date.UTC(y, m + 1, 1));
    const startDate = start.toISOString().split('T')[0];
    const endDate = next.toISOString().split('T')[0];

    // Fetch budgets and categories for the current month
    const budgetRows = await db
      .select({
        id: budgets.id,
        categoryId: budgets.categoryId,
        amount: budgets.amount,
        isRecurring: budgets.isRecurring,
        yearMonth: budgets.yearMonth,
        notes: budgets.notes,
        categoryName: categories.name,
        isIncome: categories.isIncome,
        categoryType: categories.categoryType,
      })
      .from(budgets)
      .leftJoin(categories, eq(budgets.categoryId, categories.id))
      .where(
        and(
          eq(budgets.userId, userId),
          or(
            eq(budgets.yearMonth, currentMonth),
            and(isNull(budgets.yearMonth), eq(budgets.isRecurring, true))
          ),
          eq(categories.excludeFromReports, false),
          eq(budgets.periodType, 'monthly')
        )
      );

    if (budgetRows.length === 0) return;

    // Decrypt budget categories & amounts
    const decryptedBudgets = await Promise.all(
      budgetRows.map(async (row) => ({
        ...row,
        amount: parseFloat(await decryptField(row.amount, dek)),
        categoryName: row.categoryName ? await decryptField(row.categoryName, dek) : 'Uncategorized',
      }))
    );

    // Fetch all categories for sub-category roll-ups
    const allCategories = await db
      .select({
        id: categories.id,
        name: categories.name,
        parentId: categories.parentId,
        isIncome: categories.isIncome,
      })
      .from(categories)
      .where(eq(categories.userId, userId));

    const getDescendantIds = (catId: string): string[] => {
      const children = allCategories.filter((c) => c.parentId === catId);
      return [catId, ...children.flatMap((c) => getDescendantIds(c.id))];
    };

    for (const budget of decryptedBudgets) {
      if (!budget.categoryId) continue;

      // We only alert for expense budgets (or compound income categories that act as savings targets)
      if (budget.isIncome && budget.categoryType !== 'compound') continue;

      const budgetCatId = budget.categoryId;
      const descendants = getDescendantIds(budgetCatId);

      // Fetch transactions
      const txRows = await db
        .select({
          amount: transactions.amount,
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.userId, userId),
            inArray(transactions.categoryId, descendants),
            gte(transactions.date, startDate),
            lt(transactions.date, endDate),
            eq(transactions.deleted, false)
          )
        );

      let actualSpent = 0;
      for (const tx of txRows) {
        const decAmount = parseFloat(await decryptField(String(tx.amount), dek));
        if (!isNaN(decAmount)) {
          actualSpent += decAmount;
        }
      }
      actualSpent = Math.abs(actualSpent);

      const threshold = settings.budgetAlertThreshold ?? 80;
      const warningThresholdAmount = budget.amount * (threshold / 100);

      if (actualSpent >= budget.amount) {
        const exceededKey = `budget:${currentMonth}:${budgetCatId}:100`;
        const roundedActual = Math.round(actualSpent);
        const roundedBudget = Math.round(budget.amount);
        await sendPushNotification(
          userId,
          `Budget Exceeded: ${budget.categoryName}`,
          `You've spent $${roundedActual} of your $${roundedBudget} budget for ${budget.categoryName}.`,
          '/budgets',
          'budget_alert',
          exceededKey
        );
      } else if (actualSpent >= warningThresholdAmount) {
        const warningKey = `budget:${currentMonth}:${budgetCatId}:threshold`;
        const roundedActual = Math.round(actualSpent);
        const roundedBudget = Math.round(budget.amount);
        await sendPushNotification(
          userId,
          `Budget Warning: ${budget.categoryName}`,
          `You've spent $${roundedActual} (${threshold}%) of your $${roundedBudget} budget for ${budget.categoryName}.`,
          '/budgets',
          'budget_alert',
          warningKey
        );
      }
    }
  } catch (err) {
    logger.error('[notifications-service] Error checking budget thresholds:', err);
  }
}

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
        '/net-worth',
        'net_worth_milestone',
        key
      );
    }
  } catch (err) {
    logger.error('[notifications-service] Error checking net worth milestones:', err);
  }
}
