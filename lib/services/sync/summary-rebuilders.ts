import { getDb } from "@/lib/db";
import {
  transactions,
  monthlyCashFlow,
  categorySpendingSummary,
  categoryIncomeSummary,
  userSettings,
  categories,
  accounts,
} from "@/lib/db/schema";
import { eq, and, or, sql, desc, inArray, lt, lte, gte } from "drizzle-orm";
import { decryptRows, decryptField, encryptRow, encryptField } from "@/lib/crypto";
import { getUserTransactionsFromCache } from "@/lib/services/search-cache";
import { invalidateUserServerCache } from "@/lib/server-cache";
import { formatToCents } from "@/lib/utils/format";
import { toCashFlowAmount } from "@/lib/utils/account-scope";
import { logger } from "@/lib/logger";

const LOG_TAG = "[sync]";

const userRebuildQueues = new Map<string, NodeJS.Timeout>();
const userRebuildChains = new Map<string, Promise<void>>();
const userRebuildWaiters = new Map<string, Set<() => void>>();

function drainRebuildWaiters(userId: string): void {
  const waiters = userRebuildWaiters.get(userId);
  if (waiters) {
    userRebuildWaiters.delete(userId);
    for (const resolve of waiters) {
      resolve();
    }
  }
}

function executeSummariesRebuild(userId: string, dek: Uint8Array): Promise<void> {
  return Promise.all([
    updateCategorySpendingSummaries(userId, dek),
    updateCategoryIncomeSummaries(userId, dek),
    updateMonthlyCashFlowSummaries(userId, dek),
  ])
    .then(() => {
      invalidateUserServerCache(userId);
      logger.info('[sync] Coalesced summaries rebuild completed', { userId });
    })
    .catch((err) => {
      logger.error('[sync] Coalesced summaries rebuild failed', { userId, error: err });
    });
}

/**
 * Coalesces and debounces summary table rebuilds for a user.
 * Rapid consecutive mutations trigger a single consolidated rebuild after a quiet period.
 * If a rebuild is already in flight, a follow-up pass is chained after it so the
 * latest mutations are always picked up. The returned promise resolves once the
 * user's pending rebuild pass (and any in-flight pass ahead of it) has completed.
 */
export function triggerUserSummariesRebuild(userId: string, dek: Uint8Array, delayMs = 300): Promise<void> {
  const existingTimer = userRebuildQueues.get(userId);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  const timer = setTimeout(() => {
    userRebuildQueues.delete(userId);
    const previous = userRebuildChains.get(userId);
    const chained = previous
      ? (previous as Promise<void>).then(() => executeSummariesRebuild(userId, dek))
      : executeSummariesRebuild(userId, dek);
    const tracked = (chained as Promise<void>).finally(() => {
      if (userRebuildChains.get(userId) === (tracked as Promise<void>)) {
        userRebuildChains.delete(userId);
      }
    }) as Promise<void>;
    userRebuildChains.set(userId, tracked);
    void tracked.then(() => drainRebuildWaiters(userId));
  }, delayMs);

  userRebuildQueues.set(userId, timer);

  return new Promise<void>((resolve) => {
    const waiters = userRebuildWaiters.get(userId) ?? new Set<() => void>();
    waiters.add(resolve);
    userRebuildWaiters.set(userId, waiters);
  });
}

export async function updateMonthlyCashFlowSummaries(userId: string, dek: Uint8Array): Promise<{ monthsUpdated: number; transactionsProcessed: number }> {
  const userAccounts = await getDb()
    .select()
    .from(accounts)
    .where(and(
      eq(accounts.userId, userId),
      or(
        and(
          eq(accounts.isHidden, false),
          eq(accounts.isExcludedFromNetWorth, false)
        ),
        eq(accounts.type, 'paystub')
      )
    ));

  if (userAccounts.length === 0) {
    await getDb().delete(monthlyCashFlow).where(eq(monthlyCashFlow.userId, userId));
    return { monthsUpdated: 0, transactionsProcessed: 0 };
  }

  const allCategories = await getDb()
    .select()
    .from(categories)
    .where(eq(categories.userId, userId));

  const catById = new Map<string, typeof categories.$inferSelect>();
  for (const cat of allCategories) {
    catById.set(cat.id.toString(), cat);
  }

  // Map account id → type so liability accounts (payments stored as
  // POSITIVE amounts) can be normalized before the income split.
  const accountTypeById = new Map<string, string>();
  for (const acc of userAccounts) {
    accountTypeById.set(acc.id.toString(), String(acc.type ?? ''));
  }

  const decryptedTxns = await getUserTransactionsFromCache(userId, dek);

  const [settings] = await getDb()
    .select({ paystubEnabled: userSettings.paystubEnabled })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);
  const isPaystubEnabled = settings?.paystubEnabled ?? false;

  const monthlyData: Record<string, { income: number; expenses: number; count: number }> = {};
  let transactionsProcessed = 0;

  for (const tx of decryptedTxns) {
    if (tx.ignored || tx.pending) continue;
    if (!isPaystubEnabled && tx.source === 'paystub') continue;
    if (!tx.accountId) continue;

    const category = tx.categoryId ? catById.get(tx.categoryId.toString()) : undefined;

    let excluded = category?.excludeFromReports ?? false;
    if (!excluded && category?.parentId) {
      const parent = catById.get(category.parentId.toString());
      if (parent?.excludeFromReports) excluded = true;
    }
    if (excluded) continue;

    const dateStr = String(tx.date || '');
    const yearMonth = /^\d{4}-\d{2}/.test(dateStr)
      ? dateStr.substring(0, 7)
      : new Date().toISOString().substring(0, 7);
    const rawAmount = parseFloat(tx.amount);
    if (isNaN(rawAmount)) continue;

    if (!monthlyData[yearMonth]) {
      monthlyData[yearMonth] = { income: 0, expenses: 0, count: 0 };
    }

    monthlyData[yearMonth].count++;
    transactionsProcessed++;
    if (category?.categoryType === 'transfer') continue;
    if (category?.categoryType === 'compound') {
      const absAmt = Math.abs(rawAmount);
      monthlyData[yearMonth].income += absAmt;
      monthlyData[yearMonth].expenses += absAmt;
    } else if (rawAmount > 0) {
      if (category && !category.isIncome) {
        monthlyData[yearMonth].expenses -= rawAmount;
      } else {
        monthlyData[yearMonth].income += rawAmount;
      }
    } else if (rawAmount < 0) {
      const absAmt = Math.abs(rawAmount);
      if (category && category.isIncome) {
        monthlyData[yearMonth].income -= absAmt;
      } else {
        monthlyData[yearMonth].expenses += absAmt;
      }
    }
  }

  const insertValues = [];
  for (const [yearMonth, data] of Object.entries(monthlyData)) {
    const netCashFlow = data.income - data.expenses;
    insertValues.push({
      userId,
      yearMonth,
      totalIncome: formatToCents(data.income),
      totalExpenses: formatToCents(data.expenses),
      netCashFlow: formatToCents(netCashFlow),
      transactionCount: String(data.count),
    });
  }

  const encryptedValues = insertValues.length > 0
    ? await Promise.all(insertValues.map((row) => encryptRow('monthly_cash_flow', row, dek)))
    : [];

  await getDb().transaction(async (tx) => {
    await tx.delete(monthlyCashFlow).where(eq(monthlyCashFlow.userId, userId));
    if (encryptedValues.length > 0) {
      await tx
        .insert(monthlyCashFlow)
        .values(encryptedValues)
        .onConflictDoUpdate({
          target: [monthlyCashFlow.userId, monthlyCashFlow.yearMonth],
          set: {
            totalIncome: sql`excluded.total_income`,
            totalExpenses: sql`excluded.total_expenses`,
            netCashFlow: sql`excluded.net_cash_flow`,
            transactionCount: sql`excluded.transaction_count`,
            updatedAt: new Date(),
          },
        });
    }
  });

  return { monthsUpdated: insertValues.length, transactionsProcessed };
}

export async function updateCategorySpendingSummaries(userId: string, dek: Uint8Array): Promise<{ categoryRows: number; categoriesCount: number }> {
  const userAccounts = await getDb()
    .select()
    .from(accounts)
    .where(and(
      eq(accounts.userId, userId),
      or(
        and(
          eq(accounts.isHidden, false),
          eq(accounts.isExcludedFromNetWorth, false)
        ),
        eq(accounts.type, 'paystub')
      )
    ));

  if (userAccounts.length === 0) {
    await getDb().delete(categorySpendingSummary).where(eq(categorySpendingSummary.userId, userId));
    return { categoryRows: 0, categoriesCount: 0 };
  }

  const allCategories = await getDb()
    .select()
    .from(categories)
    .where(eq(categories.userId, userId));

  const catById = new Map<string, typeof categories.$inferSelect>();
  for (const cat of allCategories) {
    catById.set(cat.id.toString(), cat);
  }

  // Map account id → type so liability accounts (payments stored as
  // POSITIVE amounts) can be normalized to the standard cash-flow sign.
  const accountTypeById = new Map<string, string>();
  for (const acc of userAccounts) {
    accountTypeById.set(acc.id.toString(), String(acc.type ?? ''));
  }

  const decryptedTxns = await getUserTransactionsFromCache(userId, dek);

  const [settings] = await getDb()
    .select({ paystubEnabled: userSettings.paystubEnabled })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);
  const isPaystubEnabled = settings?.paystubEnabled ?? false;

  const categoryByMonthAndAccount: Record<
    string,
    Record<
      string,
      Record<string, { amount: number; count: number; categoryId: string; accountId: string; yearMonth: string }>
    >
  > = {};
  const uniqueCategories = new Set<string>();

  for (const tx of decryptedTxns) {
    if (!tx.categoryId || tx.ignored || tx.pending) continue;
    if (!isPaystubEnabled && tx.source === 'paystub') continue;

    const category = catById.get(tx.categoryId.toString());
    if (!category) continue;
    if (category.categoryType === 'transfer') continue;
    if (category.isIncome && category.categoryType !== 'compound') continue;

    let excluded = category.excludeFromReports && category.categoryType !== 'compound';
    if (!excluded && category.parentId && category.categoryType !== 'compound') {
      const parent = catById.get(category.parentId.toString());
      if (parent?.excludeFromReports) excluded = true;
    }
    if (excluded) continue;

    const dateStr = String(tx.date || '');
    const yearMonth = /^\d{4}-\d{2}/.test(dateStr)
      ? dateStr.substring(0, 7)
      : new Date().toISOString().substring(0, 7);
    const catId = tx.categoryId.toString();
    const accountId = tx.accountId.toString();

    uniqueCategories.add(catId);

    if (!categoryByMonthAndAccount[yearMonth]) {
      categoryByMonthAndAccount[yearMonth] = {};
    }
    if (!categoryByMonthAndAccount[yearMonth][catId]) {
      categoryByMonthAndAccount[yearMonth][catId] = {};
    }
    if (!categoryByMonthAndAccount[yearMonth][catId][accountId]) {
      categoryByMonthAndAccount[yearMonth][catId][accountId] = {
        amount: 0,
        count: 0,
        categoryId: catId,
        accountId,
        yearMonth,
      };
    }
      const rawAmount = parseFloat(tx.amount);
      if (isNaN(rawAmount)) continue;
      const absVal = category.categoryType === 'compound'
        ? Math.abs(rawAmount)
        : -rawAmount;
    categoryByMonthAndAccount[yearMonth][catId][accountId].amount += absVal;
    categoryByMonthAndAccount[yearMonth][catId][accountId].count++;
  }

  const insertValues = [];
  for (const catMap of Object.values(categoryByMonthAndAccount)) {
    for (const accountMap of Object.values(catMap)) {
      for (const catData of Object.values(accountMap)) {
        insertValues.push({
          userId,
          categoryId: catData.categoryId as any,
          accountId: catData.accountId as any,
          yearMonth: catData.yearMonth,
          amount: formatToCents(catData.amount),
          transactionCount: String(catData.count),
        });
      }
    }
  }

  const encryptedValues = insertValues.length > 0
    ? await Promise.all(insertValues.map((row) => encryptRow('category_spending_summary', row, dek)))
    : [];

  await getDb().transaction(async (tx) => {
    await tx.delete(categorySpendingSummary).where(eq(categorySpendingSummary.userId, userId));
    if (encryptedValues.length > 0) {
      await tx
        .insert(categorySpendingSummary)
        .values(encryptedValues)
        .onConflictDoUpdate({
          target: [categorySpendingSummary.userId, categorySpendingSummary.categoryId, categorySpendingSummary.accountId, categorySpendingSummary.yearMonth],
          set: {
            amount: sql`excluded.amount`,
          },
        });
    }
  });

  // Trigger budget threshold notifications
  const { checkBudgetsAndNotify } = await import('@/lib/services/notifications');
  await checkBudgetsAndNotify(userId, dek).catch((e) => {
    logger.error('[sync] Failed to check budget notifications:', e);
  });

  return { categoryRows: insertValues.length, categoriesCount: uniqueCategories.size };
}

export async function updateCategoryIncomeSummaries(userId: string, dek: Uint8Array): Promise<{ categoryRows: number; categoriesCount: number }> {
  const userAccounts = await getDb()
    .select()
    .from(accounts)
    .where(and(
      eq(accounts.userId, userId),
      or(
        and(
          eq(accounts.isHidden, false),
          eq(accounts.isExcludedFromNetWorth, false)
        ),
        eq(accounts.type, 'paystub')
      )
    ));

  if (userAccounts.length === 0) {
    await getDb().delete(categoryIncomeSummary).where(eq(categoryIncomeSummary.userId, userId));
    return { categoryRows: 0, categoriesCount: 0 };
  }

  const allCategories = await getDb()
    .select()
    .from(categories)
    .where(eq(categories.userId, userId));

  const catById = new Map<string, typeof categories.$inferSelect>();
  for (const cat of allCategories) {
    catById.set(cat.id.toString(), cat);
  }

  // Map account id → type so liability accounts (payments stored as
  // POSITIVE amounts) can be normalized to the standard cash-flow sign.
  const accountTypeById = new Map<string, string>();
  for (const acc of userAccounts) {
    accountTypeById.set(acc.id.toString(), String(acc.type ?? ''));
  }

  const decryptedTxns = await getUserTransactionsFromCache(userId, dek);

  const [settings] = await getDb()
    .select({ paystubEnabled: userSettings.paystubEnabled })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);
  const isPaystubEnabled = settings?.paystubEnabled ?? false;

  const categoryByMonthAndAccount: Record<string, Record<string, Record<string, { amount: number; count: number; categoryId: string; accountId: string; yearMonth: string }>>> = {};
  const uniqueCategories = new Set<string>();

  for (const tx of decryptedTxns) {
    if (tx.ignored || tx.pending) continue;
    if (!isPaystubEnabled && tx.source === 'paystub') continue;

    // categoryId / accountId columns are non-null uuids with FKs — skip
    // transactions whose category is missing or no longer exists.
    if (!tx.categoryId) continue;

    const category = tx.categoryId ? catById.get(tx.categoryId.toString()) : undefined;
    if (!category) continue;

    if (!tx.accountId) continue;

    let excluded = category?.excludeFromReports ?? false;
    if (category && category.isIncome === false) {
      excluded = true;
    }
    if (excluded) continue;

  const yearMonth = tx.date.substring(0, 7);
  const catId = tx.categoryId.toString();
  const accountId = tx.accountId.toString();

    const rawAmount = parseFloat(tx.amount);
    if (isNaN(rawAmount)) continue;
    if (category?.categoryType !== 'compound' && rawAmount <= 0) continue;

    uniqueCategories.add(catId);

    if (!categoryByMonthAndAccount[yearMonth]) {
      categoryByMonthAndAccount[yearMonth] = {};
    }
    if (!categoryByMonthAndAccount[yearMonth][catId]) {
      categoryByMonthAndAccount[yearMonth][catId] = {};
    }
    if (!categoryByMonthAndAccount[yearMonth][catId][accountId]) {
      categoryByMonthAndAccount[yearMonth][catId][accountId] = {
        amount: 0,
        count: 0,
        categoryId: catId,
        accountId,
        yearMonth,
      };
    }

    const incVal = category?.categoryType === 'compound'
      ? Math.abs(rawAmount)
      : rawAmount;
    categoryByMonthAndAccount[yearMonth][catId][accountId].amount += incVal;
    categoryByMonthAndAccount[yearMonth][catId][accountId].count++;
  }

  const insertIncomeValues = [];
  for (const catMap of Object.values(categoryByMonthAndAccount)) {
    for (const accountMap of Object.values(catMap)) {
      for (const catData of Object.values(accountMap)) {
        insertIncomeValues.push({
          userId,
          categoryId: catData.categoryId as any,
          accountId: catData.accountId as any,
          yearMonth: catData.yearMonth,
          amount: formatToCents(catData.amount),
          transactionCount: String(catData.count),
        });
      }
    }
  }

  const encryptedIncomeValues = insertIncomeValues.length > 0
    ? await Promise.all(insertIncomeValues.map((row) => encryptRow('category_income_summary', row, dek)))
    : [];

  await getDb().transaction(async (tx) => {
    await tx.delete(categoryIncomeSummary).where(eq(categoryIncomeSummary.userId, userId));
    if (encryptedIncomeValues.length > 0) {
      await tx
        .insert(categoryIncomeSummary)
        .values(encryptedIncomeValues)
        .onConflictDoUpdate({
          target: [categoryIncomeSummary.userId, categoryIncomeSummary.categoryId, categoryIncomeSummary.accountId, categoryIncomeSummary.yearMonth],
          set: {
            amount: sql`excluded.amount`,
            transactionCount: sql`excluded.transaction_count`,
            updatedAt: new Date(),
          },
        });
    }
  });

  return { categoryRows: insertIncomeValues.length, categoriesCount: uniqueCategories.size };
}

export async function deleteOldPendingTransactions(userId: string): Promise<void> {
  const db = getDb();

  // Check if user enabled deletion of old pending transactions
  const [settings] = await db
    .select({ 
      deletePendingOlderThan30Days: userSettings.deletePendingOlderThan30Days,
      deletePendingDays: userSettings.deletePendingDays,
    })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);

  const isEnabled = settings?.deletePendingOlderThan30Days ?? true;
  if (!isEnabled) {
    logger.debug(`${LOG_TAG} deleteOldPendingTransactions: Feature disabled for user`, { userId });
    return;
  }

  const days = settings?.deletePendingDays ?? 10;
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const cutoffDateStr = cutoffDate.toISOString().split('T')[0];

  logger.info(`${LOG_TAG} deleteOldPendingTransactions: Cleaning up pending transactions older than ${cutoffDateStr}`, { userId });

  const deletedRows = await db
    .delete(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.pending, true),
        lt(transactions.date, cutoffDateStr)
      )
    )
    .returning({ id: transactions.id });

  if (deletedRows.length > 0) {
    logger.info(`${LOG_TAG} deleteOldPendingTransactions: Cleaned up ${deletedRows.length} old pending transactions`, {
      userId,
      deletedCount: deletedRows.length,
    });
  } else {
    logger.info(`${LOG_TAG} deleteOldPendingTransactions: No old pending transactions found to delete`, { userId });
  }
}

