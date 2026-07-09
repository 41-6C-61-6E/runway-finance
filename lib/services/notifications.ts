import { getDb } from '@/lib/db';
import { pushSubscriptions, sentNotifications, budgets, categories, transactions, userSettings, netWorthSnapshots, customAlertRules, accounts, monthlyCashFlow, userNotifications } from '@/lib/db/schema';
import { eq, and, or, isNull, gte, lt, inArray, sql, desc } from 'drizzle-orm';
import { decryptField } from '@/lib/crypto';
import { logger } from '@/lib/logger';
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

const publicKey = cleanEnv(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
const privateKey = cleanEnv(process.env.VAPID_PRIVATE_KEY);
const subject = cleanEnv(process.env.VAPID_SUBJECT) || 'mailto:admin@example.com';

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

export type PushResult = { sent: boolean; reason?: string };

export async function sendPushNotification(
  userId: string,
  title: string,
  body: string,
  urlPath?: string,
  type: string = 'generic',
  key?: string
): Promise<PushResult> {
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
        return { sent: false, reason: 'Duplicate notification suppressed.' };
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
      return { sent: false, reason: 'Rate limit exceeded.' };
    }
  } catch (err) {
    logger.error('[notifications-service] Error checking rate limit:', err);
  }

  // 3. Save notification to userNotifications inbox table
  let dbNotificationId: string | undefined = undefined;
  try {
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
    dbNotificationId = newNotif?.id;
  } catch (dbErr) {
    logger.error('[notifications-service] Failed to save in-app notification to DB:', dbErr);
  }

  // 4. Log to sentNotifications to enable deduplication for subsequent runs
  const finalKey = key || `generic:${Date.now()}:${Math.random().toString(36).substring(2, 7)}`;
  try {
    await db.insert(sentNotifications).values({
      userId,
      type,
      key: finalKey,
    });
  } catch (err) {
    logger.error('[notifications-service] Failed to record sent notification log:', err);
  }

  // 5. Send push notification to all active devices (if configured)
  if (!isInitialized) {
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

      const timeoutMs = 10000;
      const pushPromise = webpush.sendNotification(pushSubscription, payload);
      await Promise.race([
        pushPromise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Push notification timed out')), timeoutMs)
        ),
      ]);
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

  if (sentSuccessfully) {
    return { sent: true };
  }

  return { sent: true, reason: 'All push subscription endpoints failed/expired. Saved in-app only.' };
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

      if (actualSpent > budget.amount) {
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
        const actualPercentage = Math.round((actualSpent / budget.amount) * 100);
        await sendPushNotification(
          userId,
          `Budget Warning: ${budget.categoryName}`,
          `You've spent $${roundedActual} (${actualPercentage}%) of your $${roundedBudget} budget for ${budget.categoryName}.`,
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
        '/',
        'net_worth_milestone',
        key
      );
    }
  } catch (err) {
    logger.error('[notifications-service] Error checking net worth milestones:', err);
  }
}

export async function checkDailyNetWorthChangeAndNotify(userId: string, dek: Uint8Array) {
  try {
    const db = getDb();
    const [settings] = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);

    if (!settings || !settings.notifyDailyNetWorthChange) return;

    // Gate on the user's preferred alert time — skip if current time hasn't reached it yet.
    // The next sync after the alert time will trigger the notification (dedup key prevents duplicates).
    const alertTime = settings.dailyNetWorthAlertTime || '18:00';
    const userTz = settings.timezone || 'America/New_York';
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: userTz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = formatter.formatToParts(new Date());
    const hourStr = parts.find(p => p.type === 'hour')?.value || '0';
    const minStr = parts.find(p => p.type === 'minute')?.value || '0';
    const currentMinutes = parseInt(hourStr, 10) * 60 + parseInt(minStr, 10);
    const [alertHour, alertMinute] = alertTime.split(':').map(Number);
    const alertMinutes = alertHour * 60 + alertMinute;
    if (currentMinutes < alertMinutes) {
      logger.debug('[notifications-service] Skipping daily net worth change alert: before configured alert time', {
        userId,
        alertTime,
        currentTime: `${hourStr}:${minStr}`,
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

    // Enforce that the two snapshots are consecutive days (at most 2 days apart to handle timezone/DST offsets)
    const date0 = new Date(snapshots[0].snapshotDate);
    const date1 = new Date(snapshots[1].snapshotDate);
    const diffTime = Math.abs(date0.getTime() - date1.getTime());
    const diffDays = diffTime / (1000 * 60 * 60 * 24);
    if (diffDays > 2) {
      logger.info('[notifications-service] Skipping daily net worth change alert: snapshots are not consecutive', {
        userId,
        date0: snapshots[0].snapshotDate,
        date1: snapshots[1].snapshotDate,
        diffDays,
      });
      return;
    }

    const currentNetWorth = parseFloat(await decryptField(snapshots[0].netWorth, dek));
    const previousNetWorth = parseFloat(await decryptField(snapshots[1].netWorth, dek));

    if (isNaN(currentNetWorth) || isNaN(previousNetWorth)) return;

    const diff = currentNetWorth - previousNetWorth;
    // Use a 1-cent threshold to avoid floating-point noise producing "$0.00" alerts
    if (Math.abs(diff) < 0.01) return;

    const snapshotDateStr = snapshots[0].snapshotDate; // e.g. YYYY-MM-DD
    const key = `daily_net_worth_change:${snapshotDateStr}`;

    const formattedDiff = new Intl.NumberFormat(settings.locale || 'en-US', {
      style: 'currency',
      currency: settings.currency || 'USD',
    }).format(Math.abs(diff));

    const direction = diff > 0 ? 'increased' : 'decreased';
    const arrow = diff > 0 ? '📈' : '📉';

    const actualToday = new Date().toISOString().split('T')[0];
    const timePhrase = snapshotDateStr === actualToday ? 'in the last Day' : `on ${snapshotDateStr}`;

    await sendPushNotification(
      userId,
      `Daily Net Worth Alert ${arrow}`,
      `Your net worth ${direction} by ${formattedDiff} ${timePhrase}.`,
      '/flows?timeframe=1d',
      'daily_net_worth_change',
      key
    );
  } catch (err) {
    logger.error('[notifications-service] Error checking daily net worth changes:', err);
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

    const rules = await db
      .select()
      .from(customAlertRules)
      .where(
        and(
          eq(customAlertRules.userId, userId),
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
          userId,
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
    const rules = await db
      .select()
      .from(customAlertRules)
      .where(
        and(
          eq(customAlertRules.userId, userId),
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
          userId,
          `Balance Alert: ${rule.name}`,
          `Account "${accName}" balance ($${currentBalance.toFixed(2)}) ${compareDescription}.`,
          '/accounts',
          'custom_balance_alert',
          crossingKey
        );
      } else {
        // Condition recovered — clear the dedup key so the alert can re-arm
        try {
          await db.delete(sentNotifications).where(
            and(
              eq(sentNotifications.userId, userId),
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
    const rules = await db
      .select()
      .from(customAlertRules)
      .where(
        and(
          eq(customAlertRules.userId, userId),
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
          userId,
          `Goal Alert: ${rule.name}`,
          `Savings Goal "${goalName}" has ${reason} (current: $${allocatedAmount.toFixed(2)}).`,
          '/goals',
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
    const rules = await db
      .select()
      .from(customAlertRules)
      .where(
        and(
          eq(customAlertRules.userId, userId),
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
          userId,
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
