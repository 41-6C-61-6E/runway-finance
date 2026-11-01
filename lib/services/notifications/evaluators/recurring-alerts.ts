import 'server-only';
import { getDb } from '@/lib/db';
import { userSettings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { sendPushNotification } from '../transport';

/**
 * Checks for price changes (>5%) on detected recurring subscriptions and notifies the user.
 */
export async function checkRecurringPriceChangesAndNotify(userId: string, dek: Uint8Array) {
  const db = getDb();
  try {
    const [settings] = await db
      .select({ notifyRecurringPriceChanges: userSettings.notifyRecurringPriceChanges })
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);

    if (settings && settings.notifyRecurringPriceChanges === false) {
      return;
    }

    const { getRecurringTransactions } = await import('@/lib/services/recurring-detection');
    const recurringList = await getRecurringTransactions(userId, dek, {
      status: 'active',
      flowType: 'expense',
    });
    if (!Array.isArray(recurringList)) return;

    for (const item of recurringList) {
      if (item.occurrenceCount < 2 || item.averageAmount <= 0) continue;

      const n = item.occurrenceCount;
      const baseline = (item.averageAmount * n - item.lastAmount) / (n - 1);
      if (baseline <= 0) continue;

      const diff = item.lastAmount - baseline;
      const pctIncrease = (diff / baseline) * 100;

      if (pctIncrease >= 5 && diff >= 1.0) {
        const key = `recurring_price_change:${item.id}:${item.lastDate}:${Math.round(item.lastAmount * 100)}`;
        const title = `Price Increase: ${item.displayName}`;
        const body = `${item.displayName} increased from $${baseline.toFixed(2)} to $${item.lastAmount.toFixed(2)}/mo (+${pctIncrease.toFixed(0)}%).`;

        await sendPushNotification(
          userId,
          title,
          body,
          `/transactions?view=recurring&search=${encodeURIComponent(item.displayName)}`,
          'recurring_price_change',
          key
        );
      }
    }
  } catch (err) {
    logger.error('[notifications-service] Error checking recurring price changes:', err);
  }
}

/**
 * Checks for upcoming bills due within user lead days and notifies the user.
 */
export async function checkUpcomingBillsAndNotify(userId: string, dek: Uint8Array) {
  const db = getDb();
  try {
    const [settings] = await db
      .select({
        notifyUpcomingBills: userSettings.notifyUpcomingBills,
        upcomingBillsLeadDays: userSettings.upcomingBillsLeadDays,
      })
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);

    if (!settings || !settings.notifyUpcomingBills) {
      return;
    }

    const leadDays = settings.upcomingBillsLeadDays || 3;
    const { getUpcomingBills } = await import('@/lib/services/recurring-detection');
    const { bills } = await getUpcomingBills(userId, dek, leadDays, 'expense');

    for (const bill of bills) {
      if (bill.daysUntil >= 0 && bill.daysUntil <= leadDays && !bill.isOverdue) {
        const key = `bill_upcoming:${bill.recurringId}:${bill.expectedDate}`;
        const dueLabel = bill.daysUntil === 0 ? 'today' : bill.daysUntil === 1 ? 'tomorrow' : `in ${bill.daysUntil} days`;
        const title = `Bill Due Soon: ${bill.displayName}`;
        const body = `${bill.displayName} ($${bill.amount.toFixed(2)}) is due ${dueLabel} (${bill.expectedDate}).`;

        const searchParam = bill.recurringId
          ? `view=recurring&search=${encodeURIComponent(bill.displayName)}`
          : `view=calendar&search=${encodeURIComponent(bill.displayName)}`;
        await sendPushNotification(
          userId,
          title,
          body,
          `/transactions?${searchParam}`,
          'bill_upcoming',
          key
        );
      }
    }
  } catch (err) {
    logger.error('[notifications-service] Error checking upcoming bills:', err);
  }
}

