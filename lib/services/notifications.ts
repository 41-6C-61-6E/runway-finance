import { getDb } from '@/lib/db';
import { pushSubscriptions, sentNotifications, budgets, categories, transactions, userSettings, netWorthSnapshots, customAlertRules, accounts, monthlyCashFlow } from '@/lib/db/schema';
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

// ── Custom Alert Rules Checks ──────────────────────────────────────────────────

export async function checkTransactionAlerts(
  userId: string,
  tx: { externalId: string; accountId: string; description: string; payee: string | null; memo: string | null; amount: string }
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
          eq(customAlertRules.triggerType, 'transaction')
        )
      );

    if (rules.length === 0) return;

    const txAmount = Math.abs(parseFloat(tx.amount));
    const txDescLower = tx.description.toLowerCase();
    const txPayeeLower = tx.payee?.toLowerCase() ?? '';
    const txMemoLower = tx.memo?.toLowerCase() ?? '';

    for (const rule of rules) {
      const crit = rule.criteria;
      
      // 1. Account match
      if (crit.accountId && crit.accountId !== tx.accountId) {
        continue;
      }
      // 2. Amount min
      if (crit.amountMin !== undefined && txAmount < crit.amountMin) {
        continue;
      }
      // 3. Amount max
      if (crit.amountMax !== undefined && txAmount > crit.amountMax) {
        continue;
      }
      // 4. Keyword match
      if (crit.keyword) {
        const kw = crit.keyword.toLowerCase();
        if (
          !txDescLower.includes(kw) &&
          !txPayeeLower.includes(kw) &&
          !txMemoLower.includes(kw)
        ) {
          continue;
        }
      }

      // If all matched criteria pass, send alert
      const key = `custom_tx_alert:${rule.id}:${tx.externalId}`;
      const amountStr = txAmount.toFixed(2);
      await sendPushNotification(
        userId,
        `Transaction Alert: ${rule.name}`,
        `New transaction of $${amountStr} at ${tx.description} matched your alert criteria.`,
        '/transactions',
        'custom_transaction_alert',
        key
      );
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
      .select({ id: accounts.id, name: accounts.name })
      .from(accounts)
      .where(and(eq(accounts.userId, userId), eq(accounts.id, accountId)))
      .limit(1);

    if (!acc) return;
    const accName = await decryptField(acc.name, dek);

    for (const rule of rules) {
      const crit = rule.criteria;
      if (crit.accountId !== accountId) continue;

      let trigger = false;
      let compareDescription = '';

      if (crit.compareType === 'value') {
        const val = crit.value ?? 0;
        if (crit.operator === 'less_than' && currentBalance < val) {
          trigger = true;
          compareDescription = `fell below $${val}`;
        } else if (crit.operator === 'greater_than' && currentBalance > val) {
          trigger = true;
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
            trigger = true;
            compareDescription = `fell below ${compName} balance ($${compBalance.toFixed(2)})`;
          } else if (crit.operator === 'greater_than' && currentBalance > compBalance) {
            trigger = true;
            compareDescription = `rose above ${compName} balance ($${compBalance.toFixed(2)})`;
          }
        }
      }

      if (trigger) {
        const todayStr = new Date().toISOString().split('T')[0];
        const key = `custom_balance_alert:${rule.id}:${todayStr}`;

        await sendPushNotification(
          userId,
          `Balance Alert: ${rule.name}`,
          `Account "${accName}" balance ($${currentBalance.toFixed(2)}) ${compareDescription}.`,
          '/accounts',
          'custom_balance_alert',
          key
        );
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

    for (const rule of rules) {
      const crit = rule.criteria;
      if (crit.goalId && crit.goalId !== goalId) continue;

      let trigger = false;
      let reason = '';

      if (crit.operator === 'reached_percentage') {
        const pctThreshold = (crit.value ?? 100) / 100;
        const currentPct = targetAmount > 0 ? allocatedAmount / targetAmount : 0;
        const prevPct = targetAmount > 0 ? prevAllocatedAmount / targetAmount : 0;

        if (currentPct >= pctThreshold && prevPct < pctThreshold) {
          trigger = true;
          reason = `reached ${crit.value}% of its target`;
        }
      } else if (crit.operator === 'reached_amount') {
        const amtThreshold = crit.value ?? 0;
        if (allocatedAmount >= amtThreshold && prevAllocatedAmount < amtThreshold) {
          trigger = true;
          reason = `reached $${amtThreshold}`;
        }
      }

      if (trigger) {
        const key = `custom_goal_alert:${rule.id}:${Math.floor(allocatedAmount)}`;
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

    if (recentCashFlows.length === 0) return;

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
          if (metricValue >= val) {
            allViolated = false;
            break;
          }
        } else if (op === 'greater_than') {
          if (metricValue <= val) {
            allViolated = false;
            break;
          }
        }
      }

      if (allViolated) {
        const mostRecentMonth = decryptedCashFlows[0].yearMonth;
        const key = `custom_cash_flow_alert:${rule.id}:${mostRecentMonth}`;

        const metricName = metric === 'net_savings' ? 'Net Cash Flow' : 'Savings Rate';
        const formattedVal = metric === 'net_savings' ? `$${val}` : `${val}%`;
        const consecStr = consecMonths > 1 ? ` for ${consecMonths} consecutive months` : '';

        await sendPushNotification(
          userId,
          `Cash Flow Alert: ${rule.name}`,
          `${metricName} is ${op === 'less_than' ? 'below' : 'above'} ${formattedVal}${consecStr} (latest: ${metric === 'net_savings' ? '$' + decryptedCashFlows[0].netCashFlow.toFixed(2) : decryptedCashFlows[0].savingsRate.toFixed(2) + '%'}).`,
          '/dashboard',
          'custom_cash_flow_alert',
          key
        );
      }
    }
  } catch (err) {
    logger.error('[notifications-service] Error checking cash flow alerts:', err);
  }
}
