import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { logger } from '@/lib/logger';
import { monthlyCashFlow, accounts, categories, transactions, userSettings } from '@/lib/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptField } from '@/lib/crypto';

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const userId = session.user.id;
  const db = getDb();
  const dek = await getSessionDEK();
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previousMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;

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

    let income = 0;
    let expenses = 0;
    let prevIncome = 0;
    let prevExpenses = 0;

    if (isImportTransactionsEnabled) {
      const [current] = await db.select().from(monthlyCashFlow).where(
        and(eq(monthlyCashFlow.userId, userId), eq(monthlyCashFlow.yearMonth, currentMonth))
      );
      const [previous] = await db.select().from(monthlyCashFlow).where(
        and(eq(monthlyCashFlow.userId, userId), eq(monthlyCashFlow.yearMonth, previousMonth))
      );

      if (current) {
        try {
          const incomeStr = await decryptField(current.totalIncome, dek);
          income = parseFloat(incomeStr) || 0;
        } catch (error) {
          logger.warn('Failed to decrypt current income', { error: error instanceof Error ? error.message : String(error) });
        }
        try {
          const expenseStr = await decryptField(current.totalExpenses, dek);
          expenses = parseFloat(expenseStr) || 0;
        } catch (error) {
          logger.warn('Failed to decrypt current expenses', { error: error instanceof Error ? error.message : String(error) });
        }
      }

      if (previous) {
        try {
          const incomeStr = await decryptField(previous.totalIncome, dek);
          prevIncome = parseFloat(incomeStr) || 0;
        } catch (error) {
          logger.warn('Failed to decrypt previous income', { error: error instanceof Error ? error.message : String(error) });
        }
        try {
          const expenseStr = await decryptField(previous.totalExpenses, dek);
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

        const allTransactions = await db
          .select({
            date: transactions.date,
            amount: transactions.amount,
            categoryId: transactions.categoryId,
          })
          .from(transactions)
          .where(
            and(
              inArray(transactions.accountId, userAccounts.map(a => a.id)),
              eq(transactions.deleted, false),
              eq(transactions.pending, false),
              eq(transactions.ignored, false),
              eq(transactions.isImported, false)
            )
          );

        for (const tx of allTransactions) {
          const category = tx.categoryId ? catById.get(tx.categoryId.toString()) : undefined;
          let excluded = category?.excludeFromReports ?? false;
          if (!excluded && category?.parentId) {
            const parent = catById.get(category.parentId.toString());
            if (parent?.excludeFromReports) excluded = true;
          }
          if (excluded) continue;

          const dateObj = typeof tx.date === 'string' ? new Date(tx.date) : tx.date;
          const ym = dateObj.getFullYear() + '-' + String(dateObj.getMonth() + 1).padStart(2, '0');
          const amount = parseFloat(await decryptField(tx.amount, dek)) || 0;

          if (ym === currentMonth) {
            if (amount > 0) {
              if (category && !category.isIncome) expenses -= amount;
              else income += amount;
            } else if (amount < 0) {
              const absAmt = Math.abs(amount);
              if (category && category.isIncome) income -= absAmt;
              else expenses += absAmt;
            }
          } else if (ym === previousMonth) {
            if (amount > 0) {
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

    logger.info('GET /api/cash-flow/summary', { currentMonth, netIncome });
    return NextResponse.json({
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
    });
  } catch (error) {
    logger.error('Error fetching cash flow summary', { error });
    return NextResponse.json(
      { error: 'internal_error', message: 'Failed to fetch cash flow summary' },
      { status: 500 }
    );
  }
}
