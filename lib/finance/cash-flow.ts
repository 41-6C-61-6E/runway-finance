import { getDb } from '@/lib/db';
import { monthlyCashFlow, accounts, categories, transactions } from '@/lib/db/schema';
import { eq, and, or, gte, inArray, ne } from 'drizzle-orm';
import { decryptField } from '@/lib/crypto';
import { toCashFlowAmount } from '@/lib/utils/account-scope';
import { logger } from '@/lib/logger';
import type { FinanceContext } from './context';

export interface CashFlowSummaryResult {
  totalIncome: number;
  totalExpenses: number;
  netIncome: number;
  savingsRate: number;
  currentMonth: string;
  previousMonth: string;
  change: {
    income: number;
    expenses: number;
    netIncome: number;
  };
}

export interface MonthlyCashFlowPoint {
  yearMonth: string;
  income: number;
  expenses: number;
  netCashFlow: number;
}

export async function getCashFlowSummary(ctx: FinanceContext): Promise<CashFlowSummaryResult> {
  const db = getDb();
  const now = ctx.now;
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previousMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;

  const rawShowImported = ctx.settings?.showImportedData;
  const importSettings = {
    global: true,
    netWorth: true,
    realEstate: true,
    cashFlowProjections: true,
    ...(typeof rawShowImported === 'object' && rawShowImported !== null ? rawShowImported : {}),
  } as Record<string, boolean>;

  const isImportTransactionsEnabled = importSettings.global !== false && importSettings.cashFlowProjections !== false;

  let income = 0;
  let expenses = 0;
  let prevIncome = 0;
  let prevExpenses = 0;

  if (isImportTransactionsEnabled) {
    const [current] = await db.select().from(monthlyCashFlow).where(
      and(eq(monthlyCashFlow.userId, ctx.userId), eq(monthlyCashFlow.yearMonth, currentMonth))
    );
    const [previous] = await db.select().from(monthlyCashFlow).where(
      and(eq(monthlyCashFlow.userId, ctx.userId), eq(monthlyCashFlow.yearMonth, previousMonth))
    );

    if (current) {
      try {
        const incomeStr = await decryptField(current.totalIncome, ctx.dek);
        income = parseFloat(incomeStr) || 0;
      } catch (error) {
        logger.warn('Failed to decrypt current income', { error: error instanceof Error ? error.message : String(error) });
      }
      try {
        const expenseStr = await decryptField(current.totalExpenses, ctx.dek);
        expenses = parseFloat(expenseStr) || 0;
      } catch (error) {
        logger.warn('Failed to decrypt current expenses', { error: error instanceof Error ? error.message : String(error) });
      }
    }

    if (previous) {
      try {
        const incomeStr = await decryptField(previous.totalIncome, ctx.dek);
        prevIncome = parseFloat(incomeStr) || 0;
      } catch (error) {
        logger.warn('Failed to decrypt previous income', { error: error instanceof Error ? error.message : String(error) });
      }
      try {
        const expenseStr = await decryptField(previous.totalExpenses, ctx.dek);
        prevExpenses = parseFloat(expenseStr) || 0;
      } catch (error) {
        logger.warn('Failed to decrypt previous expenses', { error: error instanceof Error ? error.message : String(error) });
      }
    }
  } else {
    // In-Memory Fallback path: Bypass summaries and aggregate raw non-imported transactions for current and previous months
    const userAccounts = await db
      .select()
      .from(accounts)
      .where(and(
        eq(accounts.userId, ctx.userId),
        eq(accounts.isHidden, false),
        eq(accounts.isExcludedFromNetWorth, false)
      ));

    const accountTypeById = new Map<string, string>(userAccounts.map(a => [a.id, String(a.type ?? '')]));

    if (userAccounts.length > 0) {
      const allCategories = await db
        .select()
        .from(categories)
        .where(eq(categories.userId, ctx.userId));
      const catById = new Map(allCategories.map(cat => [cat.id.toString(), cat]));

      const allTransactions = await db
        .select({
          date: transactions.date,
          amount: transactions.amount,
          categoryId: transactions.categoryId,
          accountId: transactions.accountId,
        })
        .from(transactions)
        .where(
          and(
            inArray(transactions.accountId, userAccounts.map(a => a.id)),
            eq(transactions.deleted, false),
            eq(transactions.pending, false),
            eq(transactions.ignored, false),
            eq(transactions.isImported, false),
            gte(transactions.date, `${previousMonth}-01`)
          )
        );

      const CHUNK_SIZE = 100;
      const decryptedAmounts: number[] = new Array(allTransactions.length);
      for (let i = 0; i < allTransactions.length; i += CHUNK_SIZE) {
        const chunk = allTransactions.slice(i, i + CHUNK_SIZE);
        const chunkDecrypted = await Promise.all(
          chunk.map(async (tx) => parseFloat(await decryptField(tx.amount, ctx.dek)) || 0)
        );
        for (let j = 0; j < chunkDecrypted.length; j++) {
          decryptedAmounts[i + j] = chunkDecrypted[j];
        }
      }

      for (let i = 0; i < allTransactions.length; i++) {
        const tx = allTransactions[i];
        const rawAmount = decryptedAmounts[i];
        const category = tx.categoryId ? catById.get(tx.categoryId.toString()) : undefined;
        let excluded = category?.excludeFromReports ?? false;
        if (!excluded && category?.parentId) {
          const parent = catById.get(category.parentId.toString());
          if (parent?.excludeFromReports) excluded = true;
        }
        if (excluded) continue;

        const parsedDate = tx.date ? (typeof tx.date === 'string' ? new Date(tx.date) : tx.date) : new Date();
        const dateObj = isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
        const ym = dateObj.getFullYear() + '-' + String(dateObj.getMonth() + 1).padStart(2, '0');
        const amount = toCashFlowAmount(rawAmount, accountTypeById.get(tx.accountId.toString()));

        if (category?.categoryType === 'transfer') continue;
        const isCompound = category?.categoryType === 'compound';

        if (ym === currentMonth) {
          if (isCompound) {
            const absAmt = Math.abs(amount);
            income += absAmt;
            expenses += absAmt;
          } else if (amount > 0) {
            if (category && !category.isIncome) expenses -= amount;
            else income += amount;
          } else if (amount < 0) {
            const absAmt = Math.abs(amount);
            if (category && category.isIncome) income -= absAmt;
            else expenses += absAmt;
          }
        } else if (ym === previousMonth) {
          if (isCompound) {
            const absAmt = Math.abs(amount);
            prevIncome += absAmt;
            prevExpenses += absAmt;
          } else if (amount > 0) {
            if (category && !category.isIncome) prevExpenses -= amount;
            else prevIncome += amount;
          } else if (amount < 0) {
            const absAmt = Math.abs(amount);
            if (category && category.isIncome) prevIncome -= absAmt;
            else prevExpenses += absAmt;
          }
        }
      }
    }
  }

  const netIncome = income - expenses;
  const savingsRate = income > 0 ? (netIncome / income) * 100 : 0;
  const prevNet = prevIncome - prevExpenses;

  return {
    totalIncome: income,
    totalExpenses: expenses,
    netIncome,
    savingsRate,
    currentMonth,
    previousMonth,
    change: {
      income: prevIncome > 0 ? ((income - prevIncome) / prevIncome) * 100 : 0,
      expenses: prevExpenses > 0 ? ((expenses - prevExpenses) / prevExpenses) * 100 : 0,
      netIncome: prevNet !== 0 ? ((netIncome - prevNet) / prevNet) * 100 : 0,
    },
  };
}

export async function getMonthlyCashFlow(ctx: FinanceContext, months: number = 12): Promise<MonthlyCashFlowPoint[]> {
  const db = getDb();
  const now = ctx.now;
  const startDate = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);
  const startYearMonth = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`;

  const rawShowImported = ctx.settings?.showImportedData;
  const importSettings = {
    global: true,
    netWorth: true,
    realEstate: true,
    cashFlowProjections: true,
    ...(typeof rawShowImported === 'object' && rawShowImported !== null ? rawShowImported : {}),
  } as Record<string, boolean>;

  const isImportTransactionsEnabled = importSettings.global !== false && importSettings.cashFlowProjections !== false;
  const isPaystubEnabled = ctx.settings?.paystubEnabled ?? false;

  let data: MonthlyCashFlowPoint[] = [];

  if (isImportTransactionsEnabled) {
    const rows = await db
      .select()
      .from(monthlyCashFlow)
      .where(
        and(
          eq(monthlyCashFlow.userId, ctx.userId),
          gte(monthlyCashFlow.yearMonth, startYearMonth)
        )
      )
      .orderBy(monthlyCashFlow.yearMonth);

    data = await Promise.all(rows.map(async (row) => ({
      yearMonth: row.yearMonth,
      income: parseFloat(await decryptField(row.totalIncome, ctx.dek)),
      expenses: parseFloat(await decryptField(row.totalExpenses, ctx.dek)),
      netCashFlow: parseFloat(await decryptField(row.netCashFlow, ctx.dek)),
    })));
  } else {
    // In-Memory Fallback path: Bypass summaries and aggregate raw non-imported transactions
    const userAccounts = await db
      .select()
      .from(accounts)
      .where(and(
        eq(accounts.userId, ctx.userId),
        or(
          and(
            eq(accounts.isHidden, false),
            eq(accounts.isExcludedFromNetWorth, false)
          ),
          eq(accounts.type, 'paystub')
        )
      ));

    const accountTypeById = new Map<string, string>(userAccounts.map(a => [a.id, String(a.type ?? '')]));

    if (userAccounts.length > 0) {
      const allCategories = await db
        .select()
        .from(categories)
        .where(eq(categories.userId, ctx.userId));
      const catById = new Map(allCategories.map(cat => [cat.id.toString(), cat]));

      const startDateStr = `${startYearMonth}-01`;
      const conditions = [
        inArray(transactions.accountId, userAccounts.map(a => a.id)),
        eq(transactions.deleted, false),
        eq(transactions.pending, false),
        eq(transactions.ignored, false),
        eq(transactions.isImported, false),
        gte(transactions.date, startDateStr),
      ];
      if (!isPaystubEnabled) {
        conditions.push(ne(transactions.source, 'paystub'));
      }

      const allTransactions = await db
        .select({
          date: transactions.date,
          amount: transactions.amount,
          categoryId: transactions.categoryId,
          accountId: transactions.accountId,
        })
        .from(transactions)
        .where(and(...conditions));

      const decryptedTxns = await Promise.all(
        allTransactions.map(async (tx) => {
          const amount = parseFloat(await decryptField(tx.amount, ctx.dek)) || 0;
          return {
            date: tx.date,
            amount,
            categoryId: tx.categoryId,
            accountId: tx.accountId,
          };
        })
      );

      const monthlyData: Record<string, { income: number; expenses: number }> = {};

      for (const tx of decryptedTxns) {
        const category = tx.categoryId ? catById.get(tx.categoryId.toString()) : undefined;
        let excluded = category?.excludeFromReports ?? false;
        if (!excluded && category?.parentId) {
          const parent = catById.get(category.parentId.toString());
          if (parent?.excludeFromReports) excluded = true;
        }
        if (excluded) continue;

        const parsedDate = tx.date ? (typeof tx.date === 'string' ? new Date(tx.date) : tx.date) : new Date();
        const dateObj = isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
        const ym = dateObj.getFullYear() + '-' + String(dateObj.getMonth() + 1).padStart(2, '0');
        const amount = toCashFlowAmount(tx.amount, accountTypeById.get(tx.accountId.toString()));

        if (!monthlyData[ym]) {
          monthlyData[ym] = { income: 0, expenses: 0 };
        }

        if (category?.categoryType === 'transfer') continue;
        if (category?.categoryType === 'compound') {
          const absAmt = Math.abs(amount);
          monthlyData[ym].income += absAmt;
          monthlyData[ym].expenses += absAmt;
        } else if (amount > 0) {
          if (category && !category.isIncome) {
            monthlyData[ym].expenses -= amount;
          } else {
            monthlyData[ym].income += amount;
          }
        } else if (amount < 0) {
          const absAmt = Math.abs(amount);
          if (category && category.isIncome) {
            monthlyData[ym].income -= absAmt;
          } else {
            monthlyData[ym].expenses += absAmt;
          }
        }
      }

      data = Object.entries(monthlyData)
        .filter(([ym]) => ym >= startYearMonth)
        .map(([yearMonth, val]) => ({
          yearMonth,
          income: val.income,
          expenses: val.expenses,
          netCashFlow: val.income - val.expenses,
        }))
        .sort((a, b) => a.yearMonth.localeCompare(b.yearMonth));
    }
  }

  return data;
}
