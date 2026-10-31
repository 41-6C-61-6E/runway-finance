import { getDb } from '@/lib/db';
import { transactions, accounts, categories } from '@/lib/db/schema';
import { eq, and, or, gte, lte, inArray, ne } from 'drizzle-orm';
import { decryptField, decryptRows } from '@/lib/crypto';
import { roundToCents } from '@/lib/utils/format';
import { getSearchMatchingTransactionIds } from '@/lib/services/search-cache';
import {
  classifyCashFlowAmount,
  isExcludedFromReports,
  type ClassifiableCategory,
} from './cash-flow-classify';
import type { FinanceContext } from './context';

export interface DailyTopItem {
  id: string;
  name: string;
  amount: number;
  categoryColor: string | null;
  pending: boolean;
}

export interface DailyCategorySlice {
  categoryId: string | null;
  name: string;
  color: string | null;
  amount: number;
}

export interface DailyCashFlowDay {
  date: string;
  income: number;
  expenses: number;
  net: number;
  transactionCount: number;
  pendingCount: number;
  topItems: DailyTopItem[];
  topCategories: DailyCategorySlice[];
}

export interface DailyCashFlowResult {
  startDate: string;
  endDate: string;
  days: DailyCashFlowDay[];
}

export interface DecryptedCategoryInfo extends ClassifiableCategory {
  id: string;
  name: string;
  color?: string | null;
}

export interface AggregationRow {
  id: string;
  date: string;
  amount: number;
  categoryId: string | null;
  pending: boolean;
  nameResolver: () => Promise<string>;
}

/**
 * Pure aggregation function for daily cash flow transactions.
 */
export async function aggregateDailyCashFlow(
  rows: AggregationRow[],
  catById: Map<string, DecryptedCategoryInfo>
): Promise<DailyCashFlowDay[]> {
  interface DayAccumulator {
    date: string;
    income: number;
    expenses: number;
    transactionCount: number;
    pendingCount: number;
    categoryExpenses: Map<string | null, { name: string; color: string | null; amount: number }>;
    candidateTopItems: {
      id: string;
      amount: number;
      absAmount: number;
      categoryColor: string | null;
      pending: boolean;
      nameResolver: () => Promise<string>;
    }[];
  }

  const dayMap = new Map<string, DayAccumulator>();

  for (const row of rows) {
    const cat = row.categoryId ? catById.get(row.categoryId.toString()) : undefined;
    if (isExcludedFromReports(cat, catById)) {
      continue;
    }

    const { income, expenses, isTransfer } = classifyCashFlowAmount(row.amount, cat);

    let acc = dayMap.get(row.date);
    if (!acc) {
      acc = {
        date: row.date,
        income: 0,
        expenses: 0,
        transactionCount: 0,
        pendingCount: 0,
        categoryExpenses: new Map(),
        candidateTopItems: [],
      };
      dayMap.set(row.date, acc);
    }

    acc.transactionCount += 1;
    if (row.pending) {
      acc.pendingCount += 1;
    }

    acc.income += income;
    acc.expenses += expenses;

    // Track category expenses for the stacked bar / breakdown (only positive expense impact)
    if (!isTransfer && expenses > 0) {
      const catKey = cat ? cat.id : null;
      const catName = cat ? cat.name : 'Uncategorized';
      const catColor = cat ? cat.color ?? null : null;

      const existingCat = acc.categoryExpenses.get(catKey);
      if (existingCat) {
        existingCat.amount += expenses;
      } else {
        acc.categoryExpenses.set(catKey, {
          name: catName,
          color: catColor,
          amount: expenses,
        });
      }
    }

    // Transfers are excluded from top item chips
    if (!isTransfer) {
      acc.candidateTopItems.push({
        id: row.id,
        amount: row.amount,
        absAmount: Math.abs(row.amount),
        categoryColor: cat?.color ?? null,
        pending: row.pending,
        nameResolver: row.nameResolver,
      });
    }
  }

  const resultDays: DailyCashFlowDay[] = [];

  for (const acc of dayMap.values()) {
    // Sort candidate top items by |amount| descending
    acc.candidateTopItems.sort((a, b) => b.absAmount - a.absAmount);
    const topCandidates = acc.candidateTopItems.slice(0, 3);

    // Resolve names for top items
    const topItems: DailyTopItem[] = await Promise.all(
      topCandidates.map(async (item) => ({
        id: item.id,
        name: await item.nameResolver(),
        amount: roundToCents(item.amount),
        categoryColor: item.categoryColor,
        pending: item.pending,
      }))
    );

    // Sort top categories by expense amount descending, take top 4
    const topCategories: DailyCategorySlice[] = Array.from(acc.categoryExpenses.entries())
      .map(([catId, val]) => ({
        categoryId: catId,
        name: val.name,
        color: val.color,
        amount: roundToCents(val.amount),
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 4);

    const net = roundToCents(acc.income - acc.expenses);

    resultDays.push({
      date: acc.date,
      income: roundToCents(acc.income),
      expenses: roundToCents(acc.expenses),
      net,
      transactionCount: acc.transactionCount,
      pendingCount: acc.pendingCount,
      topItems,
      topCategories,
    });
  }

  resultDays.sort((a, b) => a.date.localeCompare(b.date));
  return resultDays;
}

/**
 * Fetches and aggregates daily cash flow for a user within a date range.
 */
export async function getDailyCashFlow(
  ctx: FinanceContext,
  opts: { startDate: string; endDate: string; search?: string }
): Promise<DailyCashFlowResult> {
  const { startDate, endDate, search } = opts;
  const db = getDb();

  const rawShowImported = ctx.settings?.showImportedData;
  const importSettings = {
    global: true,
    netWorth: true,
    realEstate: true,
    cashFlowProjections: true,
    ...(typeof rawShowImported === 'object' && rawShowImported !== null ? rawShowImported : {}),
  } as Record<string, boolean>;

  const isImportTransactionsEnabled =
    importSettings.global !== false && importSettings.cashFlowProjections !== false;
  const isPaystubEnabled = ctx.settings?.paystubEnabled ?? false;

  // Reportable accounts query
  const reportableAccounts = await db
    .select()
    .from(accounts)
    .where(
      and(
        eq(accounts.userId, ctx.userId),
        or(
          and(eq(accounts.isHidden, false), eq(accounts.isExcludedFromNetWorth, false)),
          eq(accounts.type, 'paystub')
        )
      )
    );

  if (reportableAccounts.length === 0) {
    return { startDate, endDate, days: [] };
  }

  const accountIds = reportableAccounts.map((a) => a.id);

  // Search matching IDs filter
  let searchMatchingIds: Set<string> | null = null;
  if (search && search.trim()) {
    searchMatchingIds = await getSearchMatchingTransactionIds(ctx.userId, ctx.dek, search.trim());
    if (searchMatchingIds.size === 0) {
      return { startDate, endDate, days: [] };
    }
  }

  // Decrypt categories
  const allCategories = await db
    .select()
    .from(categories)
    .where(eq(categories.userId, ctx.userId));

  const decCategories = await decryptRows('categories', allCategories, ctx.dek);
  const catById = new Map<string, DecryptedCategoryInfo>();
  for (const c of decCategories) {
    catById.set(c.id, {
      id: c.id,
      name: c.name,
      color: c.color,
      categoryType: c.categoryType,
      isIncome: c.isIncome,
      excludeFromReports: c.excludeFromReports,
      parentId: c.parentId,
    });
  }

  // Build transaction query conditions
  const conditions = [
    inArray(transactions.accountId, accountIds),
    eq(transactions.deleted, false),
    eq(transactions.ignored, false),
    gte(transactions.date, startDate),
    lte(transactions.date, endDate),
  ];

  if (!isImportTransactionsEnabled) {
    conditions.push(eq(transactions.isImported, false));
  }
  if (!isPaystubEnabled) {
    conditions.push(ne(transactions.source, 'paystub'));
  }
  if (searchMatchingIds) {
    conditions.push(inArray(transactions.id, Array.from(searchMatchingIds)));
  }

  const rawRows = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      amount: transactions.amount,
      description: transactions.description,
      payee: transactions.payee,
      categoryId: transactions.categoryId,
      pending: transactions.pending,
    })
    .from(transactions)
    .where(and(...conditions));

  if (rawRows.length === 0) {
    return { startDate, endDate, days: [] };
  }

  // Decrypt amounts in chunks of 100
  const CHUNK_SIZE = 100;
  const decryptedAmounts: number[] = new Array(rawRows.length);
  for (let i = 0; i < rawRows.length; i += CHUNK_SIZE) {
    const chunk = rawRows.slice(i, i + CHUNK_SIZE);
    const chunkDecrypted = await Promise.all(
      chunk.map(async (row) => parseFloat(await decryptField(row.amount, ctx.dek)) || 0)
    );
    for (let j = 0; j < chunkDecrypted.length; j++) {
      decryptedAmounts[i + j] = chunkDecrypted[j];
    }
  }

  // Construct rows with lazy name decrypters (only decrypt top items)
  const rows: AggregationRow[] = rawRows.map((r, idx) => ({
    id: r.id,
    date: typeof r.date === 'string' ? r.date : (r.date as any)?.toISOString().split('T')[0],
    amount: decryptedAmounts[idx],
    categoryId: r.categoryId,
    pending: r.pending ?? false,
    nameResolver: async () => {
      if (r.payee) {
        const decPayee = await decryptField(r.payee, ctx.dek);
        if (decPayee && decPayee.trim()) return decPayee;
      }
      if (r.description) {
        return (await decryptField(r.description, ctx.dek)) || 'Transaction';
      }
      return 'Transaction';
    },
  }));

  const days = await aggregateDailyCashFlow(rows, catById);

  return {
    startDate,
    endDate,
    days,
  };
}
