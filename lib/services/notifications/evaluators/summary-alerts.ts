import 'server-only';
import { getDb } from '@/lib/db';
import { userSettings, monthlyCashFlow, sentNotifications } from '@/lib/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { decryptField } from '@/lib/crypto';
import { calculateWealthFlow } from '@/lib/services/wealth-flow';
import { formatCurrency } from '@/lib/utils/format';
import { logger } from '@/lib/logger';
import { sendPushNotification } from '../transport';

/**
 * Sends a month-boundary cash flow summary when the user has
 * `notifyMonthlySummary` enabled (R12a). The summary for month M is sent on the
 * first day of month M+1 in the user's configured timezone, and the stable key
 * `monthly_summary:${yearMonth}` guarantees it fires exactly once per month.
 */
export async function checkMonthlySummaryAndNotify(
  userId: string,
  dek: Uint8Array,
  options?: { userTz?: string; force?: boolean; asOfDate?: Date }
): Promise<void> {
  try {
    const db = getDb();
    const [settings] = await db
      .select({
        notifyMonthlySummary: userSettings.notifyMonthlySummary,
        locale: userSettings.locale,
        currency: userSettings.currency,
        timezone: userSettings.timezone,
      })
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);

    if (!settings || !settings.notifyMonthlySummary) return;

    // Use user's configured timezone (default America/New_York)
    const userTz = options?.userTz || settings.timezone || 'America/New_York';
    const now = options?.asOfDate || new Date();

    // Determine current date in user's timezone (YYYY-MM-DD)
    const dateInTz = now.toLocaleDateString('en-CA', { timeZone: userTz });
    const [curYear, curMonth, curDay] = dateInTz.split('-').map(Number);

    // Monthly summary must ONLY trigger on the first day of the next month (day 1)
    // in the user's local timezone, guaranteeing that the previous month has completely
    // closed and all end-of-month transactions are accounted for.
    if (!options?.force && curDay !== 1) {
      logger.debug('[notifications-service] Skipping monthly summary: not the 1st day of month in user timezone', {
        userId,
        curDay,
        userTz,
        dateInTz,
      });
      return;
    }

    // The most recent closed month is the month immediately preceding curMonth
    // (using UTC date math to avoid DST/local offset quirks).
    const closedDate = new Date(Date.UTC(curYear, curMonth - 2, 1));
    const yearMonth = `${closedDate.getUTCFullYear()}-${String(closedDate.getUTCMonth() + 1).padStart(2, '0')}`;

    // If an earlier premature notification was sent before day 1 in the user's timezone,
    // clear the dedup entry so the real, final monthly summary can fire now.
    try {
      const day1StartUtc = new Date(Date.UTC(curYear, curMonth - 1, 1));
      await db.delete(sentNotifications).where(
        and(
          eq(sentNotifications.userId, userId),
          eq(sentNotifications.key, `monthly_summary:${yearMonth}`),
          sql`${sentNotifications.sentAt} < ${day1StartUtc}`
        )
      );
    } catch (_) {
      // Non-fatal cleanup
    }

    const [cf] = await db
      .select()
      .from(monthlyCashFlow)
      .where(and(eq(monthlyCashFlow.userId, userId), eq(monthlyCashFlow.yearMonth, yearMonth)))
      .limit(1);

    const totalIncome = cf ? parseFloat(await decryptField(cf.totalIncome, dek)) || 0 : 0;
    const totalExpenses = cf ? parseFloat(await decryptField(cf.totalExpenses, dek)) || 0 : 0;
    const netCashFlow = cf ? parseFloat(await decryptField(cf.netCashFlow, dek)) || 0 : 0;

    const [fy, fm] = yearMonth.split('-').map(Number);
    const flowStart = yearMonth + '-01';
    const flowEnd = yearMonth + '-' + String(new Date(Date.UTC(fy, fm, 0)).getUTCDate()).padStart(2, '0');
    const flow = await calculateWealthFlow(userId, flowStart, flowEnd, dek, [], '1m');
    const netWorthChange = flow.summary.netWorthChange;

    const fmt = (n: number) =>
      new Intl.NumberFormat(settings.locale || 'en-US', {
        style: 'currency',
        currency: settings.currency || 'USD',
        maximumFractionDigits: 0,
      }).format(n);

    const monthLabel = closedDate.toLocaleDateString(
      settings.locale || 'en-US',
      { month: 'long', year: 'numeric', timeZone: 'UTC' }
    );

    const hasNetWorth = !isNaN(netWorthChange) && Math.abs(netWorthChange) >= 0.01;
    if (!cf && !hasNetWorth) return;

    const fmtNW = (n: number) =>
      formatCurrency(n, settings.currency || 'USD', settings.locale || 'en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

    const netWorthPhrase = hasNetWorth
      ? `net worth ${netWorthChange > 0 ? 'increased' : 'decreased'} by ${fmtNW(Math.abs(netWorthChange))}`
      : '';
    const cashFlowPhrase = cf
      ? `cash flow: income ${fmt(totalIncome)}, expenses ${fmt(totalExpenses)}, ` +
        `net ${netCashFlow >= 0 ? '+' : ''}${fmt(netCashFlow)}` +
        (totalIncome > 0 ? ` (savings rate ${Math.round((netCashFlow / totalIncome) * 100)}%)` : '')
      : '';

    const body =
      cf && hasNetWorth
        ? monthLabel + ': ' + netWorthPhrase + '; ' + cashFlowPhrase + '.'
        : monthLabel + ': ' + (netWorthPhrase || cashFlowPhrase) + '.';

    await sendPushNotification(
      userId,
      `Monthly Summary: ${monthLabel}`,
      body,
      `/flows?timeframe=1m&date=${yearMonth}`,
      'monthly_summary',
      `monthly_summary:${yearMonth}`
    );
  } catch (err) {
    logger.error('[notifications-service] Error checking monthly summary:', err);
  }
}

