import { getDb } from '@/lib/db';
import { pushSubscriptions, sentNotifications, budgets, categories, transactions, transactionTags, userSettings, netWorthSnapshots, customAlertRules, accounts, monthlyCashFlow, userNotifications, simplifinConnections, plaidConnections } from '@/lib/db/schema';
import { eq, and, or, isNull, gte, lt, inArray, sql, desc } from 'drizzle-orm';
import { decryptField } from '@/lib/crypto';
import { calculateWealthFlow } from '@/lib/services/wealth-flow';
import { logger } from '@/lib/logger';
import { getShareGroupUserIds, resolveDataUserId } from '@/lib/sharing';
import webpush from 'web-push';

// Initialize web-push if VAPID keys are available in process.env
const cleanEnv = (val?: string) => {
  if (!val) return val;
  const trimmed = val.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
};

let isInitialized = false;

function ensureVapidInitialized(): boolean {
  if (isInitialized) return true;
  const publicKey = cleanEnv(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
  const privateKey = cleanEnv(process.env.VAPID_PRIVATE_KEY);
  const subject = cleanEnv(process.env.VAPID_SUBJECT) || 'mailto:admin@example.com';

  if (publicKey && privateKey) {
    try {
      webpush.setVapidDetails(subject, publicKey, privateKey);
      isInitialized = true;
      logger.info('[notifications-service] VAPID details initialized successfully');
    } catch (err) {
      logger.error('[notifications-service] Failed to set VAPID details:', err);
    }
  }
  return isInitialized;
}

export type PushResult = { sent: boolean; reason?: string };

/**
 * Notification types that warrant high-urgency push delivery.
 * Explicit set instead of string-matching so new types are opt-in (fixes F3.8).
 */
const URGENT_PUSH_TYPES = new Set([
  'budget_alert',
  'sync_error',
  'large_transaction',
  'custom_balance_alert',
]);

/**
 * Inserts a row into the in-app notification inbox. Returns the new row's id,
 * or undefined if the insert failed.
 */
async function insertInboxNotification(
  userId: string,
  title: string,
  body: string,
  urlPath: string | undefined,
  type: string
): Promise<string | undefined> {
  try {
    const db = getDb();
    const [newNotif] = await db
      .insert(userNotifications)
      .values({
        userId,
        title,
        body,
        urlPath: urlPath || '/',
        type,
      })
      .returning({ id: userNotifications.id });
    return newNotif?.id;
  } catch (dbErr) {
    logger.error('[notifications-service] Failed to save in-app notification to DB:', dbErr);
    return undefined;
  }
}

export async function sendPushNotification(
  userId: string,
  title: string,
  body: string,
  urlPath?: string,
  type: string = 'generic',
  key?: string
): Promise<PushResult> {
  const db = getDb();

  const finalKey = key || `generic:${Date.now()}:${Math.random().toString(36).substring(2, 7)}`;

  // 1. Atomic rate-limit + dedup insert (fixes F3.1 TOCTOU race).
  //    A single conditional INSERT ... SELECT ... WHERE count < max makes the
  //    sliding-window limiter race-free: concurrent sends can no longer both
  //    read "under the cap" and both insert. The ON CONFLICT clause preserves
  //    the permanent (user_id, key) dedup semantics.
  //    Test pushes (type === 'test') are exempt from the limiter (R5) and are
  //    also excluded from the window count so they never consume real quota.
  let maxNotifications = 5;
  let periodMinutes = 60;

  try {
    const [settings] = await db
      .select({
        maxNotificationsPerPeriod: userSettings.maxNotificationsPerPeriod,
        notificationLimiterPeriodMinutes: userSettings.notificationLimiterPeriodMinutes,
      })
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);

    maxNotifications = settings?.maxNotificationsPerPeriod ?? 5;
    periodMinutes = settings?.notificationLimiterPeriodMinutes ?? 60;
    const limiterExempt = type === 'test';

    const limiterClause = limiterExempt
      ? sql`true`
      : sql`(SELECT count(*) FROM sent_notifications
             WHERE user_id = ${userId}
               AND type <> 'test'
               AND sent_at > now() - make_interval(mins => ${periodMinutes})) < ${maxNotifications}`;

    const result: any = await db.execute(
      sql`INSERT INTO sent_notifications (user_id, type, key)
          SELECT ${userId}, ${type}, ${finalKey}
          WHERE ${limiterClause}
          ON CONFLICT (user_id, key) DO NOTHING
          RETURNING id`
    );
    const insertedRows: Array<{ id: string }> = Array.isArray(result) ? result : (result?.rows ?? []);

    if (insertedRows.length === 0) {
      // No row inserted: either a dedup hit (key already sent) or the sliding
      // window is full. Disambiguate with a point lookup on the unique index.
      let isDedupHit = false;
      try {
        const [existing] = await db
          .select({ id: sentNotifications.id })
          .from(sentNotifications)
          .where(and(eq(sentNotifications.userId, userId), eq(sentNotifications.key, finalKey)))
          .limit(1);
        isDedupHit = !!existing;
      } catch (lookupErr) {
        logger.error('[notifications-service] Dedup disambiguation lookup failed:', lookupErr);
        isDedupHit = true; // conservative: don't create a duplicate inbox row
      }

      if (isDedupHit) {
        logger.debug('[notifications-service] Duplicate notification suppressed.', { key: finalKey });
        return { sent: false, reason: 'Duplicate notification suppressed.' };
      }

      // Rate-limited: suppress the push, but still save the in-app inbox row so
      // financial alerts are never silently lost — the user sees them in-app;
      // only the push is throttled (R2).
      logger.warn('[notifications-service] Rate limit exceeded. Push suppressed; saving in-app notification only.', {
        userId,
        maxNotifications,
        periodMinutes,
      });
      await insertInboxNotification(userId, title, body, urlPath, type);
      return { sent: false, reason: 'Rate limit exceeded.' };
    }
  } catch (err) {
    // Fail-open fallback: if the atomic statement fails (e.g. transient DB
    // blip), degrade to the legacy dedup-only insert so alerts still flow.
    // The limiter is skipped for this one notification.
    logger.error('[notifications-service] Atomic limiter insert failed, falling back to dedup-only insert:', err);
    try {
      const inserted = await db
        .insert(sentNotifications)
        .values({
          userId,
          type,
          key: finalKey,
        })
        .onConflictDoNothing({ target: [sentNotifications.userId, sentNotifications.key] })
        .returning({ id: sentNotifications.id });

      if (key && inserted.length === 0) {
        logger.debug('[notifications-service] Duplicate notification suppressed.', { key });
        return { sent: false, reason: 'Duplicate notification suppressed.' };
      }
    } catch (fallbackErr) {
      logger.error('[notifications-service] Error logging sent notification / dedup check:', fallbackErr);
      if (key) {
        return { sent: false, reason: 'Duplicate notification suppressed.' };
      }
    }
  }

  // 2. Save notification to userNotifications inbox table
  const dbNotificationId = await insertInboxNotification(userId, title, body, urlPath, type);

  // 4. Send push notification to all active devices (if configured)
  if (!ensureVapidInitialized()) {
    logger.warn('[notifications-service] VAPID keys missing. Saved in-app notification only.');
    return { sent: true, reason: 'VAPID keys not configured. Saved in-app only.' };
  }

  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));

  if (subs.length === 0) {
    logger.info('[notifications-service] No push subscriptions found. Saved in-app notification.');
    return { sent: true, reason: 'No registered push devices. Saved in-app only.' };
  }

  const payload = JSON.stringify({
    id: dbNotificationId,
    title,
    body,
    url: urlPath || '/',
    // Use the inbox row id as the tray tag so distinct alerts don't replace
    // each other (R11). Fall back to the type when no inbox row was created.
    tag: dbNotificationId || type,
  });

  const isUrgent = URGENT_PUSH_TYPES.has(type);
  const pushOptions = {
    TTL: 86400, // 24 hours
    urgency: isUrgent ? ('high' as const) : ('normal' as const),
  };

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

      const timeoutMs = 10000;
      const pushPromise = webpush.sendNotification(pushSubscription, payload, pushOptions);
      await Promise.race([
        pushPromise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Push notification timed out')), timeoutMs)
        ),
      ]);
      sentSuccessfully = true;
    } catch (err: any) {
      if (err.statusCode === 410 || err.statusCode === 404 || err.statusCode === 400 || err.statusCode === 403) {
        logger.info('[notifications-service] Deleting expired/invalid push subscription', {
          id: sub.id,
          endpoint: sub.endpoint,
          statusCode: err.statusCode,
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

  if (sentSuccessfully) {
    return { sent: true };
  }

  return { sent: true, reason: 'All push subscription endpoints failed/expired. Saved in-app only.' };
}


function parseNotificationPeriodRange(keyOrDate: string | null | undefined): { start: string; end: string } {
  if (!keyOrDate) {
    return { start: '1970-01-01', end: '9999-12-31' };
  }
  const s = keyOrDate.trim();
  if (s.includes('-Q')) {
    const [y, q] = s.split('-Q').map(Number);
    const startMonth = (q - 1) * 3 + 1;
    const endMonth = q * 3;
    const start = `${y}-${String(startMonth).padStart(2, '0')}-01`;
    const lastDay = new Date(Date.UTC(y, endMonth, 0)).getUTCDate();
    const end = `${y}-${String(endMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return { start, end };
  }
  if (/^\d{4}-\d{2}$/.test(s)) {
    const [y, m] = s.split('-').map(Number);
    const start = `${y}-${String(m).padStart(2, '0')}-01`;
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const end = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return { start, end };
  }
  if (/^\d{4}$/.test(s)) {
    const y = Number(s);
    return { start: `${y}-01-01`, end: `${y}-12-31` };
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return { start: s, end: s };
  }
  return { start: '1970-01-01', end: '9999-12-31' };
}

function getNotificationPeriodBounds(periodType: string, now: Date) {
  const y = now.getFullYear();
  const m = now.getMonth();
  let start: Date;
  let next: Date;
  let periodKey: string;

  if (periodType === 'quarterly') {
    const q = Math.floor(m / 3);
    start = new Date(Date.UTC(y, q * 3, 1));
    next = new Date(Date.UTC(y, (q + 1) * 3, 1));
    periodKey = `${y}-Q${q + 1}`;
  } else if (periodType === 'yearly') {
    start = new Date(Date.UTC(y, 0, 1));
    next = new Date(Date.UTC(y + 1, 0, 1));
    periodKey = String(y);
  } else {
    // monthly
    start = new Date(Date.UTC(y, m, 1));
    next = new Date(Date.UTC(y, m + 1, 1));
    periodKey = `${y}-${String(m + 1).padStart(2, '0')}`;
  }

  return {
    periodKey,
    startDate: start.toISOString().split('T')[0],
    endDate: next.toISOString().split('T')[0],
  };
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

    // Fetch all user budgets where category is not excluded from reports
    const budgetRows = await db
      .select({
        id: budgets.id,
        categoryId: budgets.categoryId,
        amount: budgets.amount,
        periodType: budgets.periodType,
        isRecurring: budgets.isRecurring,
        yearMonth: budgets.yearMonth,
        periodKey: budgets.periodKey,
        effectiveFrom: budgets.effectiveFrom,
        effectiveTo: budgets.effectiveTo,
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
          or(eq(categories.excludeFromReports, false), isNull(categories.excludeFromReports))
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

    // Fetch all categories for hierarchy mapping
    const allCategories = await db
      .select({
        id: categories.id,
        name: categories.name,
        parentId: categories.parentId,
        isIncome: categories.isIncome,
      })
      .from(categories)
      .where(eq(categories.userId, userId));

    // Exclusions
    const budgetExclusions = (settings.budgetExclusions as { categoryIds?: string[]; tagIds?: string[] }) || {};
    const excludedCategoryIds = new Set(budgetExclusions.categoryIds || []);
    const excludedTagIds = new Set(budgetExclusions.tagIds || []);

    const excludedTransactionIds = new Set<string>();
    if (excludedTagIds.size > 0) {
      const taggedRows = await db
        .select({ transactionId: transactionTags.transactionId })
        .from(transactionTags)
        .where(inArray(transactionTags.tagId, Array.from(excludedTagIds)));
      for (const r of taggedRows) {
        if (r.transactionId) excludedTransactionIds.add(r.transactionId);
      }
    }

    const userAccounts = await db
      .select({
        id: accounts.id,
        isHidden: accounts.isHidden,
        isExcludedFromNetWorth: accounts.isExcludedFromNetWorth,
      })
      .from(accounts)
      .where(eq(accounts.userId, userId));

    const excludedAccountIds = new Set(
      userAccounts.filter((a) => a.isHidden || a.isExcludedFromNetWorth).map((a) => a.id)
    );

    // Group budgets by periodType (monthly, quarterly, yearly)
    const periodTypes = ['monthly', 'quarterly', 'yearly'] as const;

    for (const pType of periodTypes) {
      const bounds = getNotificationPeriodBounds(pType, now);
      const targetPeriodRange = parseNotificationPeriodRange(bounds.periodKey);

      // Filter active budgets for this periodType and active time window
      const activeForPeriod = decryptedBudgets.filter((b) => {
        if ((b.periodType || 'monthly') !== pType) return false;
        if (b.isIncome && b.categoryType !== 'compound') return false;
        if (!b.categoryId) return false;

        if (b.isRecurring) {
          const fromDate = b.effectiveFrom ? parseNotificationPeriodRange(b.effectiveFrom).start : '1970-01-01';
          const toDate = b.effectiveTo ? parseNotificationPeriodRange(b.effectiveTo).end : '9999-12-31';
          return fromDate <= targetPeriodRange.end && toDate >= targetPeriodRange.start;
        } else {
          const oneOffKey = b.yearMonth || b.periodKey || b.effectiveFrom;
          if (oneOffKey) {
            const oneOffRange = parseNotificationPeriodRange(oneOffKey);
            return oneOffRange.start <= targetPeriodRange.end && oneOffRange.end >= targetPeriodRange.start;
          }
          return false;
        }
      });

      if (activeForPeriod.length === 0) continue;

      // Set of category IDs that have direct budget items in this active period
      const directBudgetedCategoryIds = new Set(activeForPeriod.map((b) => b.categoryId));

      // Descendants rollup: only roll child categories into parent if child DOES NOT have its own direct budget
      const getCoveredDescendantIds = (catId: string): string[] => {
        const children = allCategories.filter((c) => c.parentId === catId && !directBudgetedCategoryIds.has(c.id));
        return [catId, ...children.flatMap((c) => getCoveredDescendantIds(c.id))];
      };

      for (const budget of activeForPeriod) {
        const budgetCatId = budget.categoryId!;
        if (excludedCategoryIds.has(budgetCatId)) continue;

        const coveredCatIds = getCoveredDescendantIds(budgetCatId).filter((id) => !excludedCategoryIds.has(id));
        const coveredSet = new Set(coveredCatIds);

        // Fetch non-deleted, non-ignored transactions
        const txRows = await db
          .select({
            id: transactions.id,
            amount: transactions.amount,
            accountId: transactions.accountId,
            categoryId: transactions.categoryId,
          })
          .from(transactions)
          .where(
            and(
              eq(transactions.userId, userId),
              inArray(transactions.categoryId, coveredCatIds),
              gte(transactions.date, bounds.startDate),
              lt(transactions.date, bounds.endDate),
              eq(transactions.deleted, false)
            )
          );

        let actualSpent = 0;
        for (const tx of txRows) {
          if (tx.accountId && excludedAccountIds.has(tx.accountId)) continue;
          if (excludedTransactionIds.has(tx.id)) continue;
          if (tx.categoryId && excludedCategoryIds.has(tx.categoryId)) continue;
          if (tx.categoryId && !coveredSet.has(tx.categoryId)) continue;

          const decAmount = parseFloat(await decryptField(String(tx.amount), dek));
          if (!isNaN(decAmount)) {
            actualSpent += decAmount;
          }
        }
        actualSpent = Math.abs(actualSpent);

        const threshold = settings.budgetAlertThreshold ?? 80;
        const warningThresholdAmount = budget.amount * (threshold / 100);
        const escalationThresholdAmount = budget.amount * 1.25;

        if (actualSpent >= escalationThresholdAmount) {
          const escalationKey = `budget:${bounds.periodKey}:${budgetCatId}:125`;
          const roundedActual = Math.round(actualSpent);
          const roundedBudget = Math.round(budget.amount);
          const actualPercentage = Math.round((actualSpent / budget.amount) * 100);
          await sendPushNotification(
            userId,
            `Budget Significantly Over: ${budget.categoryName}`,
            `You've spent $${roundedActual} (${actualPercentage}%) of your $${roundedBudget} budget for ${budget.categoryName}.`,
            `/budgets?categoryId=${encodeURIComponent(budgetCatId)}`,
            'budget_alert',
            escalationKey
          );
        } else if (actualSpent > budget.amount) {
          const exceededKey = `budget:${bounds.periodKey}:${budgetCatId}:100`;
          const roundedActual = Math.round(actualSpent);
          const roundedBudget = Math.round(budget.amount);
          await sendPushNotification(
            userId,
            `Budget Exceeded: ${budget.categoryName}`,
            `You've spent $${roundedActual} of your $${roundedBudget} budget for ${budget.categoryName}.`,
            `/budgets?categoryId=${encodeURIComponent(budgetCatId)}`,
            'budget_alert',
            exceededKey
          );
        } else if (actualSpent >= warningThresholdAmount) {
          const warningKey = `budget:${bounds.periodKey}:${budgetCatId}:threshold`;
          const roundedActual = Math.round(actualSpent);
          const roundedBudget = Math.round(budget.amount);
          const actualPercentage = Math.round((actualSpent / budget.amount) * 100);
          await sendPushNotification(
            userId,
            `Budget Warning: ${budget.categoryName}`,
            `You've spent $${roundedActual} (${actualPercentage}%) of your $${roundedBudget} budget for ${budget.categoryName}.`,
            `/budgets?categoryId=${encodeURIComponent(budgetCatId)}`,
            'budget_alert',
            warningKey
          );
        }
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
        '/',
        'net_worth_milestone',
        key
      );
    }
  } catch (err) {
    logger.error('[notifications-service] Error checking net worth milestones:', err);
  }
}

export async function checkWeeklyNetWorthChangeAndNotify(userId: string, dek: Uint8Array) {
  try {
    const db = getDb();
    const [settings] = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);

    if (!settings || !settings.notifyWeeklyNetWorthChange) return;

    // Gate on the user's preferred alert day (default sunday)
    const alertDay = (settings.weeklyNetWorthAlertDay || 'sunday').toLowerCase();
    const userTz = settings.timezone || 'America/New_York';
    const currentDay = new Date().toLocaleDateString('en-US', {
      timeZone: userTz,
      weekday: 'long',
    }).toLowerCase();

    if (currentDay !== alertDay) {
      logger.debug('[notifications-service] Skipping weekly net worth change alert: not configured alert day', {
        userId,
        alertDay,
        currentDay,
      });
      return;
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

    // R14: cheap dedup check before the expensive wealth-flow computation.
    // The key is stable per snapshot date, so if we already alerted for this
    // snapshot we can skip the full flow calculation entirely.
    const weeklyKey = `weekly_net_worth_change:${snapshotDateStr}`;
    try {
      const [alreadySent] = await db
        .select({ id: sentNotifications.id })
        .from(sentNotifications)
        .where(and(eq(sentNotifications.userId, userId), eq(sentNotifications.key, weeklyKey)))
        .limit(1);
      if (alreadySent) {
        logger.debug('[notifications-service] Weekly net worth change already alerted for snapshot, skipping.', {
          userId,
          key: weeklyKey,
        });
        return;
      }
    } catch (dedupErr) {
      logger.debug('[notifications-service] Weekly dedup pre-check failed, continuing:', dedupErr);
    }

    const flowData = await calculateWealthFlow(userId, startDateStr, snapshotDateStr, dek, [], '7d_discrete');
    const diff = flowData.summary.netWorthChange;

    // Use a 1-cent threshold to avoid floating-point noise producing "$0.00" alerts
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

    const actualToday = new Date().toISOString().split('T')[0];
    const timePhrase = snapshotDateStr === actualToday ? 'in the last week' : `for week ending ${formattedDate}`;

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

// ── Custom Alert Rules Checks ──────────────────────────────────────────────────

import type { AlertCondition, ConditionOperator, ConditionTreeNode } from '@/lib/db/schema/notifications';

// ── Generic Multi-Condition Evaluator ─────────────────────────────────────────

interface TransactionContext {
  accountId: string;
  amount: number;
  descriptionLower: string;
  payeeLower: string;
  memoLower: string;
}

function evaluateTransactionCondition(cond: AlertCondition, ctx: TransactionContext): boolean {
  switch (cond.field) {
    case 'account':
      return ctx.accountId === String(cond.value);
    case 'amount_min':
      return ctx.amount >= Number(cond.value);
    case 'amount_max':
      return ctx.amount <= Number(cond.value);
    case 'keyword': {
      const kw = String(cond.value).toLowerCase();
      return ctx.descriptionLower.includes(kw) || ctx.payeeLower.includes(kw) || ctx.memoLower.includes(kw);
    }
    default:
      return false;
  }
}

interface BalanceContext {
  accountId: string;
  currentBalance: number;
  compareAccountBalances: Map<string, number>; // accountId -> balance
}

function evaluateBalanceCondition(cond: AlertCondition, ctx: BalanceContext): boolean {
  // All balance conditions require matching the target account
  // The accountId filter is checked at the rule level, not per-condition
  switch (cond.field) {
    case 'balance_below_value':
      return ctx.currentBalance < Number(cond.value);
    case 'balance_above_value':
      return ctx.currentBalance > Number(cond.value);
    case 'balance_below_account': {
      const compBalance = ctx.compareAccountBalances.get(String(cond.value));
      return compBalance !== undefined && ctx.currentBalance < compBalance;
    }
    case 'balance_above_account': {
      const compBalance = ctx.compareAccountBalances.get(String(cond.value));
      return compBalance !== undefined && ctx.currentBalance > compBalance;
    }
    default:
      return false;
  }
}

interface GoalContext {
  goalId: string;
  currentPct: number;    // 0-1 ratio
  prevPct: number;       // 0-1 ratio
  allocatedAmount: number;
  prevAllocatedAmount: number;
}

function evaluateGoalCondition(cond: AlertCondition, ctx: GoalContext): boolean {
  // goalId matching is optional — if goalId is specified on the condition, filter by it
  if (cond.goalId && cond.goalId !== ctx.goalId) return false;

  switch (cond.field) {
    case 'goal_reached_percentage': {
      const threshold = Number(cond.value) / 100;
      return ctx.currentPct >= threshold && ctx.prevPct < threshold;
    }
    case 'goal_reached_amount': {
      const threshold = Number(cond.value);
      return ctx.allocatedAmount >= threshold && ctx.prevAllocatedAmount < threshold;
    }
    default:
      return false;
  }
}

interface CashFlowContext {
  recentMonths: { netCashFlow: number; savingsRate: number }[];
}

function evaluateCashFlowCondition(cond: AlertCondition, ctx: CashFlowContext): boolean {
  const val = Number(cond.value);
  const consecMonths = cond.consecutiveMonths ?? 1;
  if (ctx.recentMonths.length < consecMonths) return false;

  for (let i = 0; i < consecMonths; i++) {
    const month = ctx.recentMonths[i];
    let metricValue: number;
    let comparison: 'below' | 'above';

    switch (cond.field) {
      case 'cf_net_savings_below':
        metricValue = month.netCashFlow; comparison = 'below'; break;
      case 'cf_net_savings_above':
        metricValue = month.netCashFlow; comparison = 'above'; break;
      case 'cf_savings_rate_below':
        metricValue = month.savingsRate; comparison = 'below'; break;
      case 'cf_savings_rate_above':
        metricValue = month.savingsRate; comparison = 'above'; break;
      default:
        return false;
    }

    if (comparison === 'below' && metricValue >= val) return false;
    if (comparison === 'above' && metricValue <= val) return false;
  }
  return true;
}

function evaluateConditions<T>(
  conditions: AlertCondition[],
  operator: ConditionOperator,
  evaluator: (cond: AlertCondition, ctx: T) => boolean,
  ctx: T
): boolean {
  if (conditions.length === 0) return false;
  if (operator === 'AND') {
    return conditions.every((c) => evaluator(c, ctx));
  }
  return conditions.some((c) => evaluator(c, ctx));
}

// ── Recursive Condition Tree Evaluator ─────────────────────────────────────────

export function evaluateConditionTree<T>(
  tree: ConditionTreeNode,
  evaluator: (cond: AlertCondition, ctx: T) => boolean,
  ctx: T
): boolean {
  const directResults = tree.conditions.map(c => evaluator(c, ctx));
  const nestedResults = (tree.subGroups || []).map(g => evaluateConditionTree(g, evaluator, ctx));
  const allResults = [...directResults, ...nestedResults];

  if (allResults.length === 0) return false;

  return tree.operator === 'AND' ? allResults.every(Boolean) : allResults.some(Boolean);
}

/** Collect all balance comparison account IDs from a condition tree (recursively). */
function collectBalanceAccountIds(tree: ConditionTreeNode): string[] {
  const ids: string[] = [];
  for (const cond of tree.conditions) {
    if ((cond.field === 'balance_below_account' || cond.field === 'balance_above_account') && cond.value) {
      ids.push(String(cond.value));
    }
  }
  for (const group of tree.subGroups || []) {
    ids.push(...collectBalanceAccountIds(group));
  }
  return ids;
}

/** Build a human-readable balance notification description from the first matching condition in a tree. */
function buildBalanceNotificationBody(tree: ConditionTreeNode, compareAccountBalances: Map<string, number>): string {
  for (const cond of tree.conditions) {
    if (cond.field === 'balance_below_value') {
      return `fell below $${cond.value}`;
    } else if (cond.field === 'balance_above_value') {
      return `rose above $${cond.value}`;
    } else if (cond.field === 'balance_below_account' || cond.field === 'balance_above_account') {
      const compBal = compareAccountBalances.get(String(cond.value));
      const direction = cond.field === 'balance_below_account' ? 'fell below' : 'rose above';
      return `${direction} compared account ($${compBal?.toFixed(2) ?? '?'})`;
    }
  }
  for (const group of tree.subGroups || []) {
    const result = buildBalanceNotificationBody(group, compareAccountBalances);
    if (result) return result;
  }
  return '';
}

/** Build notification reason string from first matching condition in a goal tree. */
function buildGoalNotificationBody(tree: ConditionTreeNode, ctx: GoalContext): string {
  for (const cond of tree.conditions) {
    if (cond.field === 'goal_reached_percentage') {
      return `reached ${cond.value}% of its target`;
    } else if (cond.field === 'goal_reached_amount') {
      return `reached $${cond.value}`;
    }
  }
  for (const group of tree.subGroups || []) {
    const result = buildGoalNotificationBody(group, ctx);
    if (result) return result;
  }
  return '';
}

/** Build a dedup key suffix from all leaf conditions in a goal tree. */
function buildGoalTreeDedupKey(tree: ConditionTreeNode): string {
  const parts: string[] = [];
  for (const cond of tree.conditions) {
    parts.push(`${cond.field}:${cond.value}`);
  }
  for (const group of tree.subGroups || []) {
    parts.push(buildGoalTreeDedupKey(group));
  }
  return parts.join('_');
}

/** Build notification body from first matching condition in a cash flow tree. */
function buildCashFlowNotificationBody(
  tree: ConditionTreeNode,
  ctx: CashFlowContext,
  decryptedCashFlows: { yearMonth: string; netCashFlow: number; savingsRate: number }[]
): string {
  for (const cond of tree.conditions) {
    const val = Number(cond.value);
    const consecMonths = cond.consecutiveMonths ?? 1;
    const consecStr = consecMonths > 1 ? ` for ${consecMonths} consecutive months` : '';
    const latest = decryptedCashFlows[0];

    if (cond.field.startsWith('cf_net_savings')) {
      const direction = cond.field.includes('below') ? 'below' : 'above';
      return `Net Cash Flow is ${direction} $${val}${consecStr} (latest: $${latest.netCashFlow.toFixed(2)}).`;
    } else {
      const direction = cond.field.includes('below') ? 'below' : 'above';
      return `Savings Rate is ${direction} ${val}%${consecStr} (latest: ${latest.savingsRate.toFixed(2)}%).`;
    }
  }
  for (const group of tree.subGroups || []) {
    const result = buildCashFlowNotificationBody(group, ctx, decryptedCashFlows);
    if (result) return result;
  }
  return '';
}

// ── Check Functions ───────────────────────────────────────────────────────────

export async function checkTransactionAlerts(
  userId: string,
  tx: { externalId: string; accountId: string; description: string; payee: string | null; memo: string | null; amount: string; date?: string }
) {
  try {
    const db = getDb();

    const [acct] = await db
      .select({ isHidden: accounts.isHidden, isExcludedFromNetWorth: accounts.isExcludedFromNetWorth })
      .from(accounts)
      .where(and(eq(accounts.userId, userId), eq(accounts.id, tx.accountId)))
      .limit(1);

    if (!acct || acct.isHidden || acct.isExcludedFromNetWorth) return;

    // Query alert rules for all share group members (not just the data owner)
    const groupUserIds = await getShareGroupUserIds(userId);
    const rules = await db
      .select()
      .from(customAlertRules)
      .where(
        and(
          inArray(customAlertRules.userId, groupUserIds),
          eq(customAlertRules.isEnabled, true),
          eq(customAlertRules.triggerType, 'transaction')
        )
      );

    if (rules.length === 0) return;

    const txAmount = Math.abs(parseFloat(tx.amount));
    const txDescLower = tx.description.toLowerCase();
    const txPayeeLower = tx.payee?.toLowerCase() ?? '';
    const txMemoLower = tx.memo?.toLowerCase() ?? '';

    for (const rule of rules) {
      let matched = false;

      if (rule.conditionTree) {
        const ctx: TransactionContext = {
          accountId: tx.accountId,
          amount: txAmount,
          descriptionLower: txDescLower,
          payeeLower: txPayeeLower,
          memoLower: txMemoLower,
        };
        matched = evaluateConditionTree(rule.conditionTree, evaluateTransactionCondition, ctx);
      } else if (rule.conditions && rule.conditions.length > 0) {
        // New multi-condition evaluation
        const ctx: TransactionContext = {
          accountId: tx.accountId,
          amount: txAmount,
          descriptionLower: txDescLower,
          payeeLower: txPayeeLower,
          memoLower: txMemoLower,
        };
        matched = evaluateConditions(rule.conditions, rule.conditionOperator ?? 'AND', evaluateTransactionCondition, ctx);
      } else {
        // Legacy single-criteria evaluation
        const crit = rule.criteria;
        let pass = true;
        if (crit.accountId && crit.accountId !== tx.accountId) pass = false;
        if (pass && crit.amountMin !== undefined && txAmount < crit.amountMin) pass = false;
        if (pass && crit.amountMax !== undefined && txAmount > crit.amountMax) pass = false;
        if (pass && crit.keyword) {
          const kw = crit.keyword.toLowerCase();
          if (!txDescLower.includes(kw) && !txPayeeLower.includes(kw) && !txMemoLower.includes(kw)) {
            pass = false;
          }
        }
        matched = pass;
      }

      if (matched) {
        const key = `custom_tx_alert:${rule.id}:${tx.externalId}`;
        const amountStr = txAmount.toFixed(2);
        const encodedDesc = encodeURIComponent(tx.description || '');
        const linkUrl = tx.date
          ? `/transactions?search=${encodedDesc}&startDate=${tx.date}&endDate=${tx.date}`
          : `/transactions?search=${encodedDesc}`;
        await sendPushNotification(
          rule.userId,
          `Transaction Alert: ${rule.name}`,
          `New transaction of $${amountStr} at ${tx.description} matched your alert criteria.`,
          linkUrl,
          'custom_transaction_alert',
          key
        );
      }
    }
  } catch (err) {
    logger.error('[notifications-service] Error checking transaction alerts:', err);
  }
}

export async function checkAccountBalanceAlerts(
  userId: string,
  accountId: string,
  currentBalance: number,
  dek: Uint8Array
) {
  try {
    const db = getDb();
    // Query alert rules for all share group members (not just the data owner)
    const groupUserIds = await getShareGroupUserIds(userId);
    const rules = await db
      .select()
      .from(customAlertRules)
      .where(
        and(
          inArray(customAlertRules.userId, groupUserIds),
          eq(customAlertRules.isEnabled, true),
          eq(customAlertRules.triggerType, 'account_balance')
        )
      );

    if (rules.length === 0) return;

    const [acc] = await db
      .select({ id: accounts.id, name: accounts.name, isHidden: accounts.isHidden, isExcludedFromNetWorth: accounts.isExcludedFromNetWorth })
      .from(accounts)
      .where(and(eq(accounts.userId, userId), eq(accounts.id, accountId)))
      .limit(1);

    if (!acc) return;
    if (acc.isHidden || acc.isExcludedFromNetWorth) return;
    const accName = await decryptField(acc.name, dek);

    for (const rule of rules) {
      let matched = false;
      let compareDescription = '';

      if (rule.conditionTree) {
        // Account scoping: if criteria.accountId is set, only evaluate for that account
        if (rule.criteria?.accountId && rule.criteria.accountId !== accountId) continue;

        const compareAccountBalances = new Map<string, number>();
        const balanceIds = collectBalanceAccountIds(rule.conditionTree);
        for (const compId of balanceIds) {
          if (!compareAccountBalances.has(compId)) {
            const [compAcc] = await db
              .select({ balance: accounts.balance, name: accounts.name })
              .from(accounts)
              .where(and(eq(accounts.userId, userId), eq(accounts.id, compId)))
              .limit(1);
            if (compAcc) {
              compareAccountBalances.set(compId, parseFloat(await decryptField(compAcc.balance, dek)) || 0);
            }
          }
        }

        const ctx: BalanceContext = {
          accountId,
          currentBalance,
          compareAccountBalances,
        };
        matched = evaluateConditionTree(rule.conditionTree, evaluateBalanceCondition, ctx);

        if (matched) {
          compareDescription = buildBalanceNotificationBody(rule.conditionTree, compareAccountBalances);
        }
      } else if (rule.conditions && rule.conditions.length > 0) {
        // Account scoping: if criteria.accountId is set, only evaluate for that account
        if (rule.criteria?.accountId && rule.criteria.accountId !== accountId) continue;

        // New multi-condition evaluation
        // Collect compare account balances needed by any condition
        const compareAccountBalances = new Map<string, number>();
        for (const cond of rule.conditions) {
          if ((cond.field === 'balance_below_account' || cond.field === 'balance_above_account') && cond.value) {
            const compId = String(cond.value);
            if (!compareAccountBalances.has(compId)) {
              const [compAcc] = await db
                .select({ balance: accounts.balance, name: accounts.name })
                .from(accounts)
                .where(and(eq(accounts.userId, userId), eq(accounts.id, compId)))
                .limit(1);
              if (compAcc) {
                compareAccountBalances.set(compId, parseFloat(await decryptField(compAcc.balance, dek)) || 0);
              }
            }
          }
        }

        const ctx: BalanceContext = {
          accountId,
          currentBalance,
          compareAccountBalances,
        };
        matched = evaluateConditions(rule.conditions, rule.conditionOperator ?? 'AND', evaluateBalanceCondition, ctx);

        if (matched) {
          // Build a description from the first matching condition for the notification body
          for (const cond of rule.conditions) {
            if (evaluateBalanceCondition(cond, ctx)) {
              if (cond.field === 'balance_below_value') {
                compareDescription = `fell below $${cond.value}`;
              } else if (cond.field === 'balance_above_value') {
                compareDescription = `rose above $${cond.value}`;
              } else if (cond.field === 'balance_below_account' || cond.field === 'balance_above_account') {
                const compBal = compareAccountBalances.get(String(cond.value));
                const direction = cond.field === 'balance_below_account' ? 'fell below' : 'rose above';
                compareDescription = `${direction} compared account ($${compBal?.toFixed(2) ?? '?'})`;
              }
              break;
            }
          }
        }
      } else {
        // Legacy single-criteria evaluation
        const crit = rule.criteria;
        if (crit.accountId !== accountId) continue;

        if (crit.compareType === 'value') {
          const val = crit.value ?? 0;
          if (crit.operator === 'less_than' && currentBalance < val) {
            matched = true;
            compareDescription = `fell below $${val}`;
          } else if (crit.operator === 'greater_than' && currentBalance > val) {
            matched = true;
            compareDescription = `rose above $${val}`;
          }
        } else if (crit.compareType === 'account' && crit.compareAccountId) {
          const [compAcc] = await db
            .select({ balance: accounts.balance, name: accounts.name })
            .from(accounts)
            .where(and(eq(accounts.userId, userId), eq(accounts.id, crit.compareAccountId)))
            .limit(1);

          if (compAcc) {
            const compBalance = parseFloat(await decryptField(compAcc.balance, dek)) || 0;
            const compName = await decryptField(compAcc.name, dek);

            if (crit.operator === 'less_than' && currentBalance < compBalance) {
              matched = true;
              compareDescription = `fell below ${compName} balance ($${compBalance.toFixed(2)})`;
            } else if (crit.operator === 'greater_than' && currentBalance > compBalance) {
              matched = true;
              compareDescription = `rose above ${compName} balance ($${compBalance.toFixed(2)})`;
            }
          }
        }
      }

      // Threshold-crossing dedup: use a stable key per rule+account (no date component).
      // The dedup key persists in sentNotifications while the condition is violated, preventing
      // re-firing every sync. When the condition recovers (matched=false), we delete the key so
      // the alert can fire again the next time the threshold is crossed.
      const crossingKey = `custom_balance_alert:${rule.id}:${accountId}:in_violation`;

      if (matched) {
        await sendPushNotification(
          rule.userId,
          `Balance Alert: ${rule.name}`,
          `Account "${accName}" balance ($${currentBalance.toFixed(2)}) ${compareDescription}.`,
          `/accounts?accountId=${encodeURIComponent(accountId)}`,
          'custom_balance_alert',
          crossingKey
        );
      } else {
        // Condition recovered — clear the dedup key so the alert can re-arm
        try {
          await db.delete(sentNotifications).where(
            and(
              eq(sentNotifications.userId, rule.userId),
              eq(sentNotifications.key, crossingKey)
            )
          );
        } catch (clearErr) {
          logger.debug('[notifications-service] Could not clear balance alert dedup key (non-critical)', { crossingKey });
        }
      }
    }
  } catch (err) {
    logger.error('[notifications-service] Error checking account balance alerts:', err);
  }
}

export async function checkSavingsGoalAlerts(
  userId: string,
  goalId: string,
  goalName: string,
  allocatedAmount: number,
  targetAmount: number,
  prevAllocatedAmount: number
) {
  try {
    const db = getDb();
    // Query alert rules for all share group members (not just the data owner)
    const groupUserIds = await getShareGroupUserIds(userId);
    const rules = await db
      .select()
      .from(customAlertRules)
      .where(
        and(
          inArray(customAlertRules.userId, groupUserIds),
          eq(customAlertRules.isEnabled, true),
          eq(customAlertRules.triggerType, 'savings_goal')
        )
      );

    if (rules.length === 0) return;

    const currentPct = targetAmount > 0 ? allocatedAmount / targetAmount : 0;
    const prevPct = targetAmount > 0 ? prevAllocatedAmount / targetAmount : 0;

    for (const rule of rules) {
      let matched = false;
      let reason = '';

      if (rule.conditionTree) {
        const ctx: GoalContext = {
          goalId,
          currentPct,
          prevPct,
          allocatedAmount,
          prevAllocatedAmount,
        };
        matched = evaluateConditionTree(rule.conditionTree, evaluateGoalCondition, ctx);

        if (matched) {
          reason = buildGoalNotificationBody(rule.conditionTree, ctx);
        }
      } else if (rule.conditions && rule.conditions.length > 0) {
        // New multi-condition evaluation
        const ctx: GoalContext = {
          goalId,
          currentPct,
          prevPct,
          allocatedAmount,
          prevAllocatedAmount,
        };
        matched = evaluateConditions(rule.conditions, rule.conditionOperator ?? 'AND', evaluateGoalCondition, ctx);

        if (matched) {
          // Build reason from first matching condition
          for (const cond of rule.conditions) {
            if (evaluateGoalCondition(cond, ctx)) {
              if (cond.field === 'goal_reached_percentage') {
                reason = `reached ${cond.value}% of its target`;
              } else if (cond.field === 'goal_reached_amount') {
                reason = `reached $${cond.value}`;
              }
              break;
            }
          }
        }
      } else {
        // Legacy single-criteria evaluation
        const crit = rule.criteria;
        if (crit.goalId && crit.goalId !== goalId) continue;

        if (crit.operator === 'reached_percentage') {
          const pctThreshold = (crit.value ?? 100) / 100;
          if (currentPct >= pctThreshold && prevPct < pctThreshold) {
            matched = true;
            reason = `reached ${crit.value}% of its target`;
          }
        } else if (crit.operator === 'reached_amount') {
          const amtThreshold = crit.value ?? 0;
          if (allocatedAmount >= amtThreshold && prevAllocatedAmount < amtThreshold) {
            matched = true;
            reason = `reached $${amtThreshold}`;
          }
        }
      }

      if (matched) {
        // Build a stable dedup key from the rule ID and the matched condition values
        let dedupSuffix: string;
        if (rule.conditionTree) {
          dedupSuffix = buildGoalTreeDedupKey(rule.conditionTree);
        } else if (rule.conditions && rule.conditions.length > 0) {
          dedupSuffix = rule.conditions.map((c) => `${c.field}:${c.value}`).join('_');
        } else {
          dedupSuffix = `criteria:${rule.criteria?.operator}:${rule.criteria?.value}`;
        }
        const key = `custom_goal_alert:${rule.id}:${dedupSuffix}`;
        await sendPushNotification(
          rule.userId,
          `Goal Alert: ${rule.name}`,
          `Savings Goal "${goalName}" has ${reason} (current: $${allocatedAmount.toFixed(2)}).`,
          `/goals?goalId=${encodeURIComponent(goalId)}`,
          'custom_goal_alert',
          key
        );
      }
    }
  } catch (err) {
    logger.error('[notifications-service] Error checking savings goal alerts:', err);
  }
}

export async function checkCashFlowAlerts(userId: string, dek: Uint8Array) {
  try {
    const db = getDb();
    // Query alert rules for all share group members (not just the data owner)
    const groupUserIds = await getShareGroupUserIds(userId);
    const rules = await db
      .select()
      .from(customAlertRules)
      .where(
        and(
          inArray(customAlertRules.userId, groupUserIds),
          eq(customAlertRules.isEnabled, true),
          eq(customAlertRules.triggerType, 'cash_flow')
        )
      );

    if (rules.length === 0) return;

    const recentCashFlows = await db
      .select()
      .from(monthlyCashFlow)
      .where(eq(monthlyCashFlow.userId, userId))
      .orderBy(desc(monthlyCashFlow.yearMonth))
      .limit(12);

    if (recentCashFlows.length === 0) {
      logger.info('[notifications-service] No monthly cash flow data found — cash flow alert rules will not be evaluated.', { userId });
      return;
    }

    const decryptedCashFlows = await Promise.all(
      recentCashFlows.map(async (cf) => {
        const netCashFlow = parseFloat(await decryptField(cf.netCashFlow, dek)) || 0;
        const totalIncome = parseFloat(await decryptField(cf.totalIncome, dek)) || 0;
        const totalExpenses = parseFloat(await decryptField(cf.totalExpenses, dek)) || 0;
        const savingsRate = totalIncome > 0 ? (netCashFlow / totalIncome) * 100 : 0;

        return {
          yearMonth: cf.yearMonth,
          netCashFlow,
          savingsRate,
        };
      })
    );

    for (const rule of rules) {
      let matched = false;
      let notificationBody = '';

      if (rule.conditionTree) {
        const ctx: CashFlowContext = {
          recentMonths: decryptedCashFlows,
        };
        matched = evaluateConditionTree(rule.conditionTree, evaluateCashFlowCondition, ctx);

        if (matched) {
          notificationBody = buildCashFlowNotificationBody(rule.conditionTree, ctx, decryptedCashFlows);
        }
      } else if (rule.conditions && rule.conditions.length > 0) {
        // New multi-condition evaluation
        const ctx: CashFlowContext = {
          recentMonths: decryptedCashFlows,
        };
        matched = evaluateConditions(rule.conditions, rule.conditionOperator ?? 'AND', evaluateCashFlowCondition, ctx);

        if (matched) {
          // Build notification body from first matching condition
          for (const cond of rule.conditions) {
            if (evaluateCashFlowCondition(cond, ctx)) {
              const val = Number(cond.value);
              const consecMonths = cond.consecutiveMonths ?? 1;
              const consecStr = consecMonths > 1 ? ` for ${consecMonths} consecutive months` : '';
              const latest = decryptedCashFlows[0];

              if (cond.field.startsWith('cf_net_savings')) {
                const direction = cond.field.includes('below') ? 'below' : 'above';
                notificationBody = `Net Cash Flow is ${direction} $${val}${consecStr} (latest: $${latest.netCashFlow.toFixed(2)}).`;
              } else {
                const direction = cond.field.includes('below') ? 'below' : 'above';
                notificationBody = `Savings Rate is ${direction} ${val}%${consecStr} (latest: ${latest.savingsRate.toFixed(2)}%).`;
              }
              break;
            }
          }
        }
      } else {
        // Legacy single-criteria evaluation
        const crit = rule.criteria;
        const metric = crit.metric ?? 'net_savings';
        const op = crit.operator ?? 'less_than';
        const val = crit.value ?? 0;
        const consecMonths = crit.consecutiveMonths ?? 1;

        if (decryptedCashFlows.length < consecMonths) continue;

        let allViolated = true;
        for (let i = 0; i < consecMonths; i++) {
          const cf = decryptedCashFlows[i];
          const metricValue = metric === 'net_savings' ? cf.netCashFlow : cf.savingsRate;

          if (op === 'less_than') {
            if (metricValue >= val) { allViolated = false; break; }
          } else if (op === 'greater_than') {
            if (metricValue <= val) { allViolated = false; break; }
          }
        }
        matched = allViolated;

        if (matched) {
          const metricName = metric === 'net_savings' ? 'Net Cash Flow' : 'Savings Rate';
          const formattedVal = metric === 'net_savings' ? `$${val}` : `${val}%`;
          const consecStr = consecMonths > 1 ? ` for ${consecMonths} consecutive months` : '';
          const latest = decryptedCashFlows[0];
          notificationBody = `${metricName} is ${op === 'less_than' ? 'below' : 'above'} ${formattedVal}${consecStr} (latest: ${metric === 'net_savings' ? '$' + latest.netCashFlow.toFixed(2) : latest.savingsRate.toFixed(2) + '%'}).`;
        }
      }

      if (matched) {
        const mostRecentMonth = decryptedCashFlows[0].yearMonth;
        const key = `custom_cash_flow_alert:${rule.id}:${mostRecentMonth}`;

        await sendPushNotification(
          rule.userId,
          `Cash Flow Alert: ${rule.name}`,
          notificationBody,
          '/flows',
          'custom_cash_flow_alert',
          key
        );
      }
    }
  } catch (err) {
    logger.error('[notifications-service] Error checking cash flow alerts:', err);
  }
}

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

      // Baseline = historical average excluding the latest charge
      const n = item.occurrenceCount;
      const baseline = (item.averageAmount * n - item.lastAmount) / (n - 1);
      if (baseline <= 0) continue;

      const diff = item.lastAmount - baseline;
      const pctIncrease = (diff / baseline) * 100;

      // Alert on price increase > 5% and > $1.00
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

// ── Sync Alert Healing (R1) ───────────────────────────────────────────────────

/**
 * Re-arms sync-failure alerts after a successful sync (R1).
 *
 * Sync failures are deduped with the stable key `sync_error:${connectionId}:${errorClass}`,
 * so a broken connection alerts once instead of spamming every retry. When the
 * connection syncs successfully again, we:
 *   1. Delete the `sync_error:${connectionId}:*` rows from sent_notifications so
 *      the alert can fire again if the connection breaks in the future (same
 *      re-arm pattern as balance alerts).
 *   2. Mark the connection's unread sync_error inbox rows as read so the
 *      resolved alert stops nagging in the in-app inbox.
 *
 * Safe to call on every successful sync — it's a no-op when no alert rows exist.
 */
export async function healSyncAlerts(userId: string, targetId: string): Promise<void> {
  try {
    const db = getDb();
    const syncKeyPrefix = `sync_error:${targetId}:`;
    const staleKeyPrefix = `stale_sync:${targetId}:`;

    await db
      .delete(sentNotifications)
      .where(
        and(
          eq(sentNotifications.userId, userId),
          or(
            sql`${sentNotifications.key} LIKE ${syncKeyPrefix + '%'}`,
            sql`${sentNotifications.key} LIKE ${staleKeyPrefix + '%'}`
          )
        )
      );

    await db
      .update(userNotifications)
      .set({ isRead: true, readAt: new Date() })
      .where(
        and(
          eq(userNotifications.userId, userId),
          or(
            eq(userNotifications.type, 'sync_error'),
            eq(userNotifications.type, 'stale_sync')
          ),
          or(
            sql`${userNotifications.urlPath} LIKE ${`%${targetId}%`}`,
            sql`${userNotifications.urlPath} LIKE ${`%connection=${targetId}`}`
          )
        )
      );
  } catch (err) {
    logger.debug('[notifications-service] Could not heal sync alerts (non-critical)', {
      userId,
      targetId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ── Monthly Cash Flow Summary (R12a) ──────────────────────────────────────────

/**
 * Sends a month-boundary cash flow summary when the user has
 * `notifyMonthlySummary` enabled (R12a). The summary for month M is sent on the
 * first sync after month M closes, and the stable key
 * `monthly_summary:${yearMonth}` guarantees it fires exactly once per month.
 */
export async function checkMonthlySummaryAndNotify(userId: string, dek: Uint8Array): Promise<void> {
  try {
    const db = getDb();
    const [settings] = await db
      .select({
        notifyMonthlySummary: userSettings.notifyMonthlySummary,
        locale: userSettings.locale,
        currency: userSettings.currency,
      })
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);

    if (!settings || !settings.notifyMonthlySummary) return;

    // The most recent *closed* month (we summarize the previous month, not the
    // in-progress one).
    const now = new Date();
    const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const yearMonth = `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}`;

    const [cf] = await db
      .select()
      .from(monthlyCashFlow)
      .where(and(eq(monthlyCashFlow.userId, userId), eq(monthlyCashFlow.yearMonth, yearMonth)))
      .limit(1);

    if (!cf) return;

    const totalIncome = parseFloat(await decryptField(cf.totalIncome, dek)) || 0;
    const totalExpenses = parseFloat(await decryptField(cf.totalExpenses, dek)) || 0;
    const netCashFlow = parseFloat(await decryptField(cf.netCashFlow, dek)) || 0;

    const fmt = (n: number) =>
      new Intl.NumberFormat(settings.locale || 'en-US', {
        style: 'currency',
        currency: settings.currency || 'USD',
        maximumFractionDigits: 0,
      }).format(n);

    const monthLabel = new Date(Date.UTC(prev.getUTCFullYear(), prev.getUTCMonth(), 1)).toLocaleDateString(
      settings.locale || 'en-US',
      { month: 'long', year: 'numeric', timeZone: 'UTC' }
    );

    const savingsRate = totalIncome > 0 ? Math.round((netCashFlow / totalIncome) * 100) : 0;
    const body =
      `${monthLabel}: income ${fmt(totalIncome)}, expenses ${fmt(totalExpenses)}, ` +
      `net ${netCashFlow >= 0 ? '+' : ''}${fmt(netCashFlow)} (savings rate ${savingsRate}%).`;

    await sendPushNotification(
      userId,
      `Monthly Summary: ${monthLabel}`,
      body,
      '/flows',
      'monthly_summary',
      `monthly_summary:${yearMonth}`
    );
  } catch (err) {
    logger.error('[notifications-service] Error checking monthly summary:', err);
  }
}

// ── Sent Notification Pruning (R3) ────────────────────────────────────────────

/**
 * Deletes sent_notifications rows older than the retention window (R3).
 *
 * Safe because dedup semantics only need a key to persist while its condition
 * could re-fire: milestone keys are permanent-by-design and are only ever
 * meaningful while un-sent, while condition-based keys (balance alerts) are
 * explicitly re-armed by deleting their key rows. The default 90-day window is
 * far longer than any sliding limiter window (max 1440 min).
 */
export async function pruneSentNotifications(retentionDays = 90): Promise<number> {
  try {
    const db = getDb();
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const result: any = await db.execute(
      sql`DELETE FROM sent_notifications WHERE sent_at < ${cutoff} RETURNING id`
    );
    const rows: Array<{ id: string }> = Array.isArray(result) ? result : (result?.rows ?? []);
    if (rows.length > 0) {
      logger.info('[notifications-service] Pruned old sent_notifications rows', {
        count: rows.length,
        retentionDays,
      });
    }
    return rows.length;
  } catch (err) {
    logger.error('[notifications-service] Error pruning sent notifications:', err);
    return 0;
  }
}

// ── Staleness Push Alerts (R10) ───────────────────────────────────────────────

/**
 * Sustained sync failure / staleness alerts.
 *
 * Requirements:
 * 1. Only alerts when a sync has been broken for at least 3 days (72 hours).
 * 2. Aggregates broken accounts by bank connection (1 notification per connection,
 *    not 1 per individual account) or standalone API manual account.
 * 3. Throttles repeat alerts to a 7-day cooldown (at most once every 7 days while
 *    broken), avoiding daily notification spam.
 * 4. Auto-healed on successful sync via healSyncAlerts.
 */
export async function checkStaleConnectionsAndNotify(userId: string, dek: Uint8Array): Promise<void> {
  try {
    const db = getDb();
    const [settings] = await db
      .select({
        notifySyncErrors: userSettings.notifySyncErrors,
        locale: userSettings.locale,
        currency: userSettings.currency,
      })
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);

    if (!settings || !settings.notifySyncErrors) return;

    // Dynamic imports avoid circular dependencies
    const { getAccountsSyncStatus } = await import('@/lib/services/sync-health');
    const { decryptRows } = await import('@/lib/crypto');
    const { getConnectionDisplayName } = await import('@/lib/services/scheduler-logger');

    const dataUserId = await resolveDataUserId(userId);
    const userAccounts = await db
      .select()
      .from(accounts)
      .where(
        and(
          eq(accounts.userId, dataUserId),
          eq(accounts.isHidden, false),
          eq(accounts.isExcludedFromNetWorth, false)
        )
      );

    const decrypted = await decryptRows('accounts', userAccounts, dek);
    const statuses = await getAccountsSyncStatus(userId, dataUserId, dek, decrypted);

    // Fetch user connections to check timestamps and labels
    const groupUserIds = await getShareGroupUserIds(userId);
    const sfConns = await db
      .select({
        id: simplifinConnections.id,
        label: simplifinConnections.label,
        lastSyncAt: simplifinConnections.lastSyncAt,
        lastSyncStatus: simplifinConnections.lastSyncStatus,
        lastSyncError: simplifinConnections.lastSyncError,
        createdAt: simplifinConnections.createdAt,
      })
      .from(simplifinConnections)
      .where(inArray(simplifinConnections.userId, groupUserIds));

    const pConns = await db
      .select({
        id: plaidConnections.id,
        label: plaidConnections.label,
        institutionName: plaidConnections.institutionName,
        lastSyncAt: plaidConnections.lastSyncAt,
        lastSyncStatus: plaidConnections.lastSyncStatus,
        lastSyncError: plaidConnections.lastSyncError,
        createdAt: plaidConnections.createdAt,
      })
      .from(plaidConnections)
      .where(inArray(plaidConnections.userId, groupUserIds));

    const connsMap = new Map<
      string,
      {
        id: string;
        label: string;
        institutionName?: string | null;
        lastSyncAt: Date | null;
        lastSyncStatus: string;
        lastSyncError: string | null;
        createdAt: Date;
      }
    >();
    for (const c of sfConns) connsMap.set(c.id, c);
    for (const c of pConns) connsMap.set(c.id, c);

    const now = Date.now();
    const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    const weekEpoch = Math.floor(now / SEVEN_DAYS_MS);

    // Group accounts with error status
    const brokenConnectionIds = new Set<string>();
    const brokenManualAccounts: any[] = [];

    for (const acc of decrypted) {
      const status = statuses[acc.id];
      if (!status || status.status !== 'error') continue;

      const connectionId = acc.connectionId || acc.plaidConnectionId;
      if (connectionId) {
        brokenConnectionIds.add(connectionId);
      } else {
        brokenManualAccounts.push(acc);
      }
    }

    // 1. Process broken bank connections (1 notification per connection)
    for (const connectionId of brokenConnectionIds) {
      const conn = connsMap.get(connectionId);
      const lastSuccessTime = conn?.lastSyncAt
        ? new Date(conn.lastSyncAt).getTime()
        : conn?.createdAt
          ? new Date(conn.createdAt).getTime()
          : 0;

      // Must be broken for at least 3 days (72 hours)
      if (now - lastSuccessTime < THREE_DAYS_MS) {
        continue;
      }

      // Check 7-day cooldown (no spam: at most once every 7 days while broken)
      const keyPrefix = `sync_error:${connectionId}:`;
      const recentAlerts = await db
        .select({ id: sentNotifications.id, sentAt: sentNotifications.sentAt })
        .from(sentNotifications)
        .where(
          and(
            eq(sentNotifications.userId, userId),
            sql`${sentNotifications.key} LIKE ${keyPrefix + '%'}`,
            gte(sentNotifications.sentAt, new Date(now - SEVEN_DAYS_MS))
          )
        )
        .limit(1);

      if (recentAlerts.length > 0) {
        // Already alerted within the last 7 days; skip
        continue;
      }

      const connectionDisplayName =
        (await getConnectionDisplayName(connectionId)) ||
        conn?.institutionName ||
        conn?.label ||
        null;

      const title = connectionDisplayName
        ? `Bank connection problem: ${connectionDisplayName}`
        : 'Bank connection problem';

      const daysBroken = Math.max(3, Math.round((now - lastSuccessTime) / (1000 * 60 * 60 * 24)));
      const body = `Your bank connection${connectionDisplayName ? ` to ${connectionDisplayName}` : ''} has not synced in ${daysBroken} days. Tap to review and re-authorize if needed.`;
      const urlPath = `/settings?tab=advanced&connection=${connectionId}`;
      const dedupKey = `sync_error:${connectionId}:w${weekEpoch}`;

      try {
        await sendPushNotification(
          userId,
          title,
          body,
          urlPath,
          'sync_error',
          dedupKey
        );
      } catch (err) {
        logger.debug('[notifications-service] Connection sync alert suppressed or failed (non-fatal):', err);
      }
    }

    // 2. Process broken standalone manual accounts (e.g. Redfin, crypto xpub, metals)
    for (const acc of brokenManualAccounts) {
      const lastSuccessTime = acc.balanceDate
        ? new Date(acc.balanceDate).getTime()
        : acc.createdAt
          ? new Date(acc.createdAt).getTime()
          : 0;

      // Must be broken for at least 3 days (72 hours)
      if (now - lastSuccessTime < THREE_DAYS_MS) {
        continue;
      }

      // Check 7-day cooldown
      const keyPrefix = `sync_error:${acc.id}:`;
      const recentAlerts = await db
        .select({ id: sentNotifications.id, sentAt: sentNotifications.sentAt })
        .from(sentNotifications)
        .where(
          and(
            eq(sentNotifications.userId, userId),
            sql`${sentNotifications.key} LIKE ${keyPrefix + '%'}`,
            gte(sentNotifications.sentAt, new Date(now - SEVEN_DAYS_MS))
          )
        )
        .limit(1);

      if (recentAlerts.length > 0) {
        continue;
      }

      const daysBroken = Math.max(3, Math.round((now - lastSuccessTime) / (1000 * 60 * 60 * 24)));
      const title = `Sync problem: ${acc.name}`;
      const body = `Account balance has not updated in ${daysBroken} days. Tap to review account settings.`;
      const urlPath = `/accounts?account=${acc.id}`;
      const dedupKey = `sync_error:${acc.id}:w${weekEpoch}`;

      try {
        await sendPushNotification(
          userId,
          title,
          body,
          urlPath,
          'sync_error',
          dedupKey
        );
      } catch (err) {
        logger.debug('[notifications-service] Manual account sync alert suppressed or failed (non-fatal):', err);
      }
    }
  } catch (err) {
    logger.error('[notifications-service] Error checking stale connections:', err);
  }
}

