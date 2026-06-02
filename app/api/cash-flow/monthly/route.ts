import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { logger } from '@/lib/logger';
import { monthlyCashFlow, accounts, categories, transactions, userSettings } from '@/lib/db/schema';
import { eq, and, gte, inArray, ne } from 'drizzle-orm';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptField } from '@/lib/crypto';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const userId = session.user.id;
  const dek = await getSessionDEK();
  const { searchParams } = new URL(request.url);
  const months = parseInt(searchParams.get('months') || '12', 10);

  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);
  const startYearMonth = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`;

  const db = getDb();

  try {
    // Fetch user settings to respect imported data toggles
    const userSettingsList = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);

    const userSetting = userSettingsList[0];
    const rawShowImported = userSetting?.showImportedData;
    const importSettings = {
      global: true,
      netWorth: true,
      realEstate: true,
      cashFlowProjections: true,
      ...(typeof rawShowImported === 'object' && rawShowImported !== null ? rawShowImported : {}),
    } as Record<string, boolean>;

    const isImportTransactionsEnabled = importSettings.global !== false && importSettings.cashFlowProjections !== false;
    const isPaystubEnabled = userSetting?.paystubEnabled ?? false;

    let data: Array<{ yearMonth: string; income: number; expenses: number; netCashFlow: number }> = [];

    if (isImportTransactionsEnabled) {
      // Primary path: Use pre-computed monthly summaries from the database
      const rows = await db
        .select()
        .from(monthlyCashFlow)
        .where(
          and(
            eq(monthlyCashFlow.userId, userId),
            gte(monthlyCashFlow.yearMonth, startYearMonth)
          )
        )
        .orderBy(monthlyCashFlow.yearMonth);

      data = await Promise.all(rows.map(async (row) => ({
        yearMonth: row.yearMonth,
        income: parseFloat(await decryptField(row.totalIncome, dek)),
        expenses: parseFloat(await decryptField(row.totalExpenses, dek)),
        netCashFlow: parseFloat(await decryptField(row.netCashFlow, dek)),
      })));
    } else {
      // In-Memory Fallback path: Bypass summaries and aggregate raw non-imported transactions in the range
      const userAccounts = await db
        .select()
        .from(accounts)
        .where(and(
          eq(accounts.userId, userId),
          eq(accounts.isHidden, false),
          eq(accounts.isExcludedFromNetWorth, false)
        ));

      if (userAccounts.length > 0) {
        const allCategories = await db
          .select()
          .from(categories)
          .where(eq(categories.userId, userId));
        const catById = new Map(allCategories.map(cat => [cat.id.toString(), cat]));

        const conditions = [
              inArray(transactions.accountId, userAccounts.map(a => a.id)),
              eq(transactions.deleted, false),
              eq(transactions.pending, false),
              eq(transactions.ignored, false),
              eq(transactions.isImported, false),
            ];
        if (!isPaystubEnabled) {
          conditions.push(ne(transactions.source, 'paystub'));
        }

        const allTransactions = await db
          .select({
            date: transactions.date,
            amount: transactions.amount,
            categoryId: transactions.categoryId,
          })
          .from(transactions)
          .where(and(...conditions));

        const monthlyData: Record<string, { income: number; expenses: number }> = {};

        for (const tx of allTransactions) {
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
          const amount = parseFloat(await decryptField(tx.amount, dek)) || 0;

          if (!monthlyData[ym]) {
            monthlyData[ym] = { income: 0, expenses: 0 };
          }

          // Skip transfer categories entirely
          if (category?.categoryType === 'transfer') continue;
          // Compound categories count on both sides
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

    logger.info('GET /api/cash-flow/monthly', { months, count: data.length });
    return NextResponse.json(data);
  } catch (error) {
    logger.error('Error fetching monthly cash flow', { error });
    return NextResponse.json(
      { error: 'internal_error', message: 'Failed to fetch monthly cash flow data' },
      { status: 500 }
    );
  }
}
