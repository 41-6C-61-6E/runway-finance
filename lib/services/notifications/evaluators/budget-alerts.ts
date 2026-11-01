import 'server-only';
import { getDb } from '@/lib/db';
import { budgets, categories, transactions, transactionTags, userSettings, accounts } from '@/lib/db/schema';
import { eq, and, or, isNull, gte, lt, inArray } from 'drizzle-orm';
import { decryptField } from '@/lib/crypto';
import { logger } from '@/lib/logger';
import { sendPushNotification } from '../transport';

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

        const timeframeWord = pType === 'yearly'
          ? ' annual'
          : pType === 'quarterly'
            ? ' quarterly'
            : '';
        const isLumpyBudget = pType === 'quarterly' || pType === 'yearly';
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
            `You've spent $${roundedActual} (${actualPercentage}%) of your $${roundedBudget}${timeframeWord} budget for ${budget.categoryName}.`,
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
            `You've spent $${roundedActual} of your $${roundedBudget}${timeframeWord} budget for ${budget.categoryName}.`,
            `/budgets?categoryId=${encodeURIComponent(budgetCatId)}`,
            'budget_alert',
            exceededKey
          );
        } else if (!isLumpyBudget && actualSpent >= warningThresholdAmount) {
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

