import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import {
  customAlertRules,
  transactions,
  accounts,
  monthlyCashFlow,
} from '@/lib/db/schema';
import { eq, and, desc, gte, lt } from 'drizzle-orm';
import { decryptField } from '@/lib/crypto';
import { getSessionDEK } from '@/lib/crypto-context';
import {
  evaluateConditionTree,
} from '@/lib/services/notifications';
import type { AlertCondition, AlertConditionField, ConditionOperator, ConditionTreeNode } from '@/lib/db/schema/notifications';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// ── Helpers (mirrors evaluation engine, returns match details) ──────────────

interface TransactionMatch {
  id: string;
  date: string;
  description: string;
  payee: string | null;
  amount: number;
  accountName: string;
}

interface BalanceMatch {
  accountId: string;
  accountName: string;
  balance: number;
  description: string;
}

interface GoalMatch {
  goalName: string;
  currentPct: number;
  allocatedAmount: number;
  description: string;
}

interface CashFlowMatch {
  yearMonth: string;
  netCashFlow: number;
  savingsRate: number;
  description: string;
}

export interface PreviewResult {
  triggerType: string;
  matchCount: number;
  transactionMatches?: TransactionMatch[];
  balanceMatches?: BalanceMatch[];
  goalMatches?: GoalMatch[];
  cashFlowMatches?: CashFlowMatch[];
  notice?: string;
}

function evaluateTransactionCondition(cond: AlertCondition, ctx: { accountId: string; amount: number; descriptionLower: string; payeeLower: string; memoLower: string }): boolean {
  switch (cond.field) {
    case 'account': return ctx.accountId === String(cond.value);
    case 'amount_min': return ctx.amount >= Number(cond.value);
    case 'amount_max': return ctx.amount <= Number(cond.value);
    case 'keyword': {
      const kw = String(cond.value).toLowerCase();
      return ctx.descriptionLower.includes(kw) || ctx.payeeLower.includes(kw) || ctx.memoLower.includes(kw);
    }
    default: return false;
  }
}

function evaluateConditions<T>(conditions: AlertCondition[], operator: ConditionOperator, evaluator: (cond: AlertCondition, ctx: T) => boolean, ctx: T): boolean {
  if (conditions.length === 0) return false;
  return operator === 'AND' ? conditions.every(c => evaluator(c, ctx)) : conditions.some(c => evaluator(c, ctx));
}

export async function POST(request: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const db = getDb();

    // Load the rule
    const [rule] = await db
      .select()
      .from(customAlertRules)
      .where(and(eq(customAlertRules.id, id), eq(customAlertRules.userId, session.user.id)))
      .limit(1);

    if (!rule) {
      return Response.json({ error: 'Alert rule not found.' }, { status: 404 });
    }

    const dek = await getSessionDEK();
    if (!dek) {
      return Response.json({ error: 'Unable to decrypt data. Please re-authenticate.' }, { status: 500 });
    }

    const result: PreviewResult = { triggerType: rule.triggerType, matchCount: 0 };

    // ── Transaction preview ──────────────────────────────────────────────
    if (rule.triggerType === 'transaction') {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const startDate = thirtyDaysAgo.toISOString().split('T')[0];

      const txRows = await db
        .select({
          id: transactions.id,
          externalId: transactions.externalId,
          accountId: transactions.accountId,
          description: transactions.description,
          payee: transactions.payee,
          memo: transactions.memo,
          amount: transactions.amount,
          date: transactions.date,
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.userId, session.user.id),
            eq(transactions.deleted, false),
            gte(transactions.date, startDate)
          )
        )
        .orderBy(desc(transactions.date))
        .limit(200);

      // Build account name map (exclude hidden/excluded accounts)
      const accountRows = await db
        .select({ id: accounts.id, name: accounts.name, isHidden: accounts.isHidden, isExcludedFromNetWorth: accounts.isExcludedFromNetWorth })
        .from(accounts)
        .where(eq(accounts.userId, session.user.id));
      const visibleAccountIds = new Set(
        accountRows.filter(a => !a.isHidden && !a.isExcludedFromNetWorth).map(a => a.id)
      );
      const accountNameMap = new Map<string, string>();
      for (const acc of accountRows) {
        accountNameMap.set(acc.id, await decryptField(acc.name, dek));
      }

      const matches: TransactionMatch[] = [];
      for (const tx of txRows) {
        if (!visibleAccountIds.has(tx.accountId)) continue;
        const decDesc = await decryptField(tx.description, dek);
        const decPayee = tx.payee ? await decryptField(tx.payee, dek) : '';
        const decMemo = tx.memo ? await decryptField(tx.memo, dek) : '';
        const txAmount = Math.abs(parseFloat(await decryptField(tx.amount, dek)) || 0);

        const ctx = {
          accountId: tx.accountId,
          amount: txAmount,
          descriptionLower: decDesc.toLowerCase(),
          payeeLower: decPayee.toLowerCase(),
          memoLower: decMemo.toLowerCase(),
        };

        let matched = false;
        if (rule.conditionTree) {
          matched = evaluateConditionTree(rule.conditionTree, evaluateTransactionCondition, ctx);
        } else if (rule.conditions && rule.conditions.length > 0) {
          matched = evaluateConditions(rule.conditions, rule.conditionOperator ?? 'AND', evaluateTransactionCondition, ctx);
        } else {
          const crit = rule.criteria;
          let pass = true;
          if (crit.accountId && crit.accountId !== tx.accountId) pass = false;
          if (pass && crit.amountMin !== undefined && txAmount < crit.amountMin) pass = false;
          if (pass && crit.amountMax !== undefined && txAmount > crit.amountMax) pass = false;
          if (pass && crit.keyword) {
            const kw = crit.keyword.toLowerCase();
            if (!ctx.descriptionLower.includes(kw) && !ctx.payeeLower.includes(kw) && !ctx.memoLower.includes(kw)) pass = false;
          }
          matched = pass;
        }

        if (matched && matches.length < 20) {
          matches.push({
            id: tx.id,
            date: tx.date,
            description: decDesc,
            payee: decPayee || null,
            amount: txAmount,
            accountName: accountNameMap.get(tx.accountId) || 'Unknown Account',
          });
        }
      }

      result.transactionMatches = matches;
      result.matchCount = matches.length;
      if (matches.length === 0) {
        result.notice = 'No transactions in the last 30 days matched this rule.';
      } else if (matches.length === 20) {
        result.notice = 'Showing first 20 matches from the last 30 days.';
      } else {
        result.notice = `Found ${matches.length} matching transaction${matches.length === 1 ? '' : 's'} in the last 30 days.`;
      }
    }

    // ── Account Balance preview ──────────────────────────────────────────
    if (rule.triggerType === 'account_balance') {
      const accountRows = await db
        .select({ id: accounts.id, name: accounts.name, balance: accounts.balance, isHidden: accounts.isHidden, isExcludedFromNetWorth: accounts.isExcludedFromNetWorth })
        .from(accounts)
        .where(eq(accounts.userId, session.user.id));

      const decryptedAccounts = await Promise.all(
        accountRows.map(async (acc) => ({
          id: acc.id,
          name: await decryptField(acc.name, dek),
          balance: parseFloat(await decryptField(acc.balance, dek)) || 0,
          isHidden: acc.isHidden,
          isExcludedFromNetWorth: acc.isExcludedFromNetWorth,
        }))
      );

      const balanceMap = new Map(decryptedAccounts.map(a => [a.id, a.balance]));

      // Exclude hidden/excluded accounts
      const targetAccountId = rule.criteria?.accountId;
      const candidateAccounts = decryptedAccounts.filter(a =>
        !a.isHidden && !a.isExcludedFromNetWorth && (targetAccountId ? a.id === targetAccountId : true)
      );

      const matches: BalanceMatch[] = [];
      for (const acc of candidateAccounts) {
        const ctx = { accountId: acc.id, currentBalance: acc.balance, compareAccountBalances: balanceMap };

        let matched = false;
        let description = '';

        if (rule.conditionTree) {
          matched = evaluateConditionTree(rule.conditionTree, (cond, c) => {
            switch (cond.field) {
              case 'balance_below_value': return c.currentBalance < Number(cond.value);
              case 'balance_above_value': return c.currentBalance > Number(cond.value);
              case 'balance_below_account': { const cb = c.compareAccountBalances.get(String(cond.value)); return cb !== undefined && c.currentBalance < cb; }
              case 'balance_above_account': { const cb = c.compareAccountBalances.get(String(cond.value)); return cb !== undefined && c.currentBalance > cb; }
              default: return false;
            }
          }, ctx);
        } else if (rule.conditions && rule.conditions.length > 0) {
          matched = evaluateConditions(rule.conditions, rule.conditionOperator ?? 'AND', (cond, c) => {
            switch (cond.field) {
              case 'balance_below_value': return c.currentBalance < Number(cond.value); case 'balance_above_value': return c.currentBalance > Number(cond.value);
              case 'balance_below_account': { const cb = c.compareAccountBalances.get(String(cond.value)); return cb !== undefined && c.currentBalance < cb; }
              case 'balance_above_account': { const cb = c.compareAccountBalances.get(String(cond.value)); return cb !== undefined && c.currentBalance > cb; }
              default: return false;
            }
          }, ctx);
        }

        if (matched) {
          matches.push({ accountId: acc.id, accountName: acc.name, balance: acc.balance, description });
        }
      }

      result.balanceMatches = matches;
      result.matchCount = matches.length;
      result.notice = matches.length === 0
        ? 'No accounts currently meet this rule\'s conditions.'
        : `${matches.length} account${matches.length === 1 ? '' : 's'} currently meet${matches.length === 1 ? 's' : ''} this rule's conditions.`;
    }

    // ── Cash Flow preview ────────────────────────────────────────────────
    if (rule.triggerType === 'cash_flow') {
      const recentCashFlows = await db
        .select()
        .from(monthlyCashFlow)
        .where(eq(monthlyCashFlow.userId, session.user.id))
        .orderBy(desc(monthlyCashFlow.yearMonth))
        .limit(12);

      if (recentCashFlows.length === 0) {
        result.notice = 'No monthly cash flow data available yet. This rule will be evaluated once sync data is available.';
      } else {
        const decryptedFlows = await Promise.all(
          recentCashFlows.map(async (cf) => {
            const netCashFlow = parseFloat(await decryptField(cf.netCashFlow, dek)) || 0;
            const totalIncome = parseFloat(await decryptField(cf.totalIncome, dek)) || 0;
            const savingsRate = totalIncome > 0 ? (netCashFlow / totalIncome) * 100 : 0;
            return { yearMonth: cf.yearMonth, netCashFlow, savingsRate };
          })
        );

        const latest = decryptedFlows[0];
        const ctx = { recentMonths: decryptedFlows };

        let matched = false;
        if (rule.conditionTree) {
          matched = evaluateConditionTree(rule.conditionTree, (cond, c) => {
            const val = Number(cond.value);
            const n = cond.consecutiveMonths ?? 1;
            if (c.recentMonths.length < n) return false;
            for (let i = 0; i < n; i++) {
              const m = c.recentMonths[i];
              if (cond.field === 'cf_net_savings_below' && m.netCashFlow >= val) return false;
              if (cond.field === 'cf_net_savings_above' && m.netCashFlow <= val) return false;
              if (cond.field === 'cf_savings_rate_below' && m.savingsRate >= val) return false;
              if (cond.field === 'cf_savings_rate_above' && m.savingsRate <= val) return false;
            }
            return true;
          }, ctx);
        } else if (rule.conditions && rule.conditions.length > 0) {
          matched = evaluateConditions(rule.conditions, rule.conditionOperator ?? 'AND', (cond, c) => {
            const val = Number(cond.value);
            const n = cond.consecutiveMonths ?? 1;
            if (c.recentMonths.length < n) return false;
            for (let i = 0; i < n; i++) {
              const m = c.recentMonths[i];
              if (cond.field === 'cf_net_savings_below' && m.netCashFlow >= val) return false;
              if (cond.field === 'cf_net_savings_above' && m.netCashFlow <= val) return false;
              if (cond.field === 'cf_savings_rate_below' && m.savingsRate >= val) return false;
              if (cond.field === 'cf_savings_rate_above' && m.savingsRate <= val) return false;
            }
            return true;
          }, ctx);
        }

        result.cashFlowMatches = matched
          ? [{ yearMonth: latest.yearMonth, netCashFlow: latest.netCashFlow, savingsRate: latest.savingsRate, description: `Latest: Net $${latest.netCashFlow.toFixed(2)}, Rate ${latest.savingsRate.toFixed(1)}%` }]
          : [];
        result.matchCount = result.cashFlowMatches.length;
        result.notice = matched
          ? 'This rule would fire based on your current cash flow data.'
          : 'This rule would NOT fire based on your current cash flow data.';
      }
    }

    return Response.json(result);
  } catch (err: any) {
    console.error('[custom-alerts/preview] Error previewing rule:', err);
    return Response.json({ error: 'Failed to preview rule. Please try again.' }, { status: 500 });
  }
}
