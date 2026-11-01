import 'server-only';
import { getDb } from '@/lib/db';
import { customAlertRules, accounts, sentNotifications, monthlyCashFlow } from '@/lib/db/schema';
import type { AlertCondition, ConditionOperator, ConditionTreeNode } from '@/lib/db/schema/notifications';
import { eq, and, desc } from 'drizzle-orm';
import { decryptField } from '@/lib/crypto';
import { logger } from '@/lib/logger';
import { sendPushNotification } from '../transport';

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
        const ctx: TransactionContext = {
          accountId: tx.accountId,
          amount: txAmount,
          descriptionLower: txDescLower,
          payeeLower: txPayeeLower,
          memoLower: txMemoLower,
        };
        matched = evaluateConditions(rule.conditions, rule.conditionOperator ?? 'AND', evaluateTransactionCondition, ctx);
      } else {
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
        if (rule.criteria?.accountId && rule.criteria.accountId !== accountId) continue;

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
        const ctx: GoalContext = {
          goalId,
          currentPct,
          prevPct,
          allocatedAmount,
          prevAllocatedAmount,
        };
        matched = evaluateConditions(rule.conditions, rule.conditionOperator ?? 'AND', evaluateGoalCondition, ctx);

        if (matched) {
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
        const ctx: CashFlowContext = {
          recentMonths: decryptedCashFlows,
        };
        matched = evaluateConditions(rule.conditions, rule.conditionOperator ?? 'AND', evaluateCashFlowCondition, ctx);

        if (matched) {
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

