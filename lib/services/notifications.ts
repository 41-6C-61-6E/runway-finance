import { getDb } from '@/lib/db';
import { pushSubscriptions, sentNotifications, budgets, categories, transactions, userSettings } from '@/lib/db/schema';
import { eq, and, or, isNull, gte, lt, inArray } from 'drizzle-orm';
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
  urlPath?: string
) {
  if (!isInitialized) {
    logger.warn('[notifications-service] Cannot send push notification: service not initialized (VAPID keys missing).');
    return;
  }

  const db = getDb();
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

  const promises = subs.map(async (sub) => {
    try {
      // Parse the keys from jsonb
      const keys = sub.keys as { p256dh: string; auth: string };
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: keys.p256dh,
          auth: keys.auth,
        },
      };

      await webpush.sendNotification(pushSubscription, payload);
    } catch (err: any) {
      // 404 (Not Found) or 410 (Gone) indicates the subscription has expired or been revoked
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

      if (actualSpent >= budget.amount) {
        // Check if alert already sent this month
        const notificationKey = `budget:${currentMonth}:${budgetCatId}`;
        const [existing] = await db
          .select()
          .from(sentNotifications)
          .where(
            and(
              eq(sentNotifications.userId, userId),
              eq(sentNotifications.type, 'budget_alert'),
              eq(sentNotifications.key, notificationKey)
            )
          )
          .limit(1);

        if (!existing) {
          // Record as sent
          await db.insert(sentNotifications).values({
            userId,
            type: 'budget_alert',
            key: notificationKey,
          });

          // Dispatch notification
          const roundedActual = Math.round(actualSpent);
          const roundedBudget = Math.round(budget.amount);
          await sendPushNotification(
            userId,
            `Budget Exceeded: ${budget.categoryName}`,
            `You've spent $${roundedActual} of your $${roundedBudget} budget for ${budget.categoryName}.`,
            '/budgets'
          );
        }
      }
    }
  } catch (err) {
    logger.error('[notifications-service] Error checking budget thresholds:', err);
  }
}
