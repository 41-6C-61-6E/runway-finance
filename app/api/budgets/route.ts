import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { budgets, categories, categorySpendingSummary, categoryIncomeSummary, transactions, userSettings } from '@/lib/db/schema';
import { eq, and, or, isNull, sql, inArray, gte, lt } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptField, decryptRows, encryptRow } from '@/lib/crypto';

function getPeriodBounds(periodType: string, periodKey: string | null, now: Date) {
  let start: Date;
  let next: Date;
  let yearMonth: string;

  if (periodKey) {
    if (periodType === 'monthly') {
      const [y, m] = periodKey.split('-').map(Number);
      start = new Date(Date.UTC(y, m - 1, 1));
      next = new Date(Date.UTC(y, m, 1));
      yearMonth = periodKey;
    }
    else if (periodType === 'quarterly') {
      const [y, q] = periodKey.split('-Q').map(Number);
      start = new Date(Date.UTC(y, (q - 1) * 3, 1));
      next = new Date(Date.UTC(y, q * 3, 1));
      yearMonth = periodKey;
    }
    else { // yearly
      const y = Number(periodKey);
      start = new Date(Date.UTC(y, 0, 1));
      next = new Date(Date.UTC(y + 1, 0, 1));
      yearMonth = periodKey;
    }
  } else {
    const y = now.getFullYear();
    const m = now.getMonth();
    if (periodType === 'monthly') {
      start = new Date(Date.UTC(y, m, 1));
      next = new Date(Date.UTC(y, m + 1, 1));
      yearMonth = `${y}-${String(m + 1).padStart(2, '0')}`;
    } else if (periodType === 'quarterly') {
      const q = Math.floor(m / 3);
      start = new Date(Date.UTC(y, q * 3, 1));
      next = new Date(Date.UTC(y, (q + 1) * 3, 1));
      yearMonth = `${y}-Q${q + 1}`;
    } else { // yearly
      start = new Date(Date.UTC(y, 0, 1));
      next = new Date(Date.UTC(y + 1, 0, 1));
      yearMonth = String(y);
    }
  }

  return {
    yearMonth,
    startDate: start.toISOString().split('T')[0],
    endDate: next.toISOString().split('T')[0], // Exclusive end date for LT comparison
    label: yearMonth,
  };
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const dek = await getSessionDEK();
  const { searchParams } = new URL(request.url);
  const now = new Date();
  const periodType = searchParams.get('periodType') || 'monthly';
  const periodKey = searchParams.get('periodKey');
  const includeCategories = searchParams.get('includeCategories') === 'true';

  const db = getDb();

  try {
    const bounds = periodKey ? getPeriodBounds(periodType, periodKey, now) : getPeriodBounds(periodType, null, now);

    const budgetRows = await db
      .select({
        id: budgets.id,
        categoryId: budgets.categoryId,
        amount: budgets.amount,
        isRecurring: budgets.isRecurring,
        yearMonth: budgets.yearMonth,
        periodType: budgets.periodType,
        periodKey: budgets.periodKey,
        fundingAccountId: budgets.fundingAccountId,
        rollover: budgets.rollover,
        notes: budgets.notes,
        categoryName: categories.name,
        categoryColor: categories.color,
        isIncome: categories.isIncome,
      })
      .from(budgets)
      .leftJoin(categories, eq(budgets.categoryId, categories.id))
      .where(
        and(
          eq(budgets.userId, session.user.id),
          or(
            eq(budgets.yearMonth, bounds.yearMonth),
            and(isNull(budgets.yearMonth), eq(budgets.isRecurring, true))
          ),
          eq(categories.excludeFromReports, false),
          periodType ? eq(budgets.periodType, periodType) : undefined,
        )
      );

    // Decrypt budget amounts and notes
    const decryptedBudgetRows = await Promise.all(budgetRows.map(async (row) => ({
      ...row,
      amount: await decryptField(row.amount, dek),
      categoryName: row.categoryName ? await decryptField(row.categoryName, dek) : 'Uncategorized',
      notes: row.notes ? await decryptField(row.notes, dek).catch(() => row.notes) : null,
    })));

    // Fetch all categories to handle sub-category roll-ups and provide to frontend
    const allCategories = await db
      .select({ 
        id: categories.id, 
        name: categories.name, 
        color: categories.color, 
        parentId: categories.parentId, 
        isIncome: categories.isIncome 
      })
      .from(categories)
      .where(eq(categories.userId, session.user.id));

    // Helper to find all descendant IDs for a given category (recursive)
    const getDescendantIds = (catId: string): string[] => {
      const children = allCategories.filter(c => c.parentId === catId);
      return [catId, ...children.flatMap(c => getDescendantIds(c.id))];
    };

    async function fetchActuals(catIds: string[]) {
      if (catIds.length === 0) return new Map<string, number>();

      // Map of every searchable category ID to an array of budget category IDs it contributes to
      const catToBudgetsMap = new Map<string, string[]>();
      const allSearchIds: string[] = [];
      
      for (const budgetCatId of catIds) {
        const descendants = getDescendantIds(budgetCatId);
        descendants.forEach(id => {
          const budgets = catToBudgetsMap.get(id) || [];
          if (!budgets.includes(budgetCatId)) budgets.push(budgetCatId);
          catToBudgetsMap.set(id, budgets);
          if (!allSearchIds.includes(id)) allSearchIds.push(id);
        });
      }

      // Fetch user settings to respect imported data toggles
      const userSettingsList = await db
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, session.user.id))
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

      const txConditions = [
        eq(transactions.userId, session.user.id),
        inArray(transactions.categoryId, allSearchIds),
        gte(transactions.date, bounds.startDate),
        lt(transactions.date, bounds.endDate)
      ];
      if (!isImportTransactionsEnabled) {
        txConditions.push(eq(transactions.isImported, false));
      }

      // Use exclusive end date comparison to capture timestamps correctly
      // transactions.date < bounds.endDate captures up to 23:59:59.999 of the actual period end
      const txRows = await db
        .select({
          categoryId: transactions.categoryId,
          amount: transactions.amount,
        })
        .from(transactions)
        .where(and(...txConditions));

      // Decrypt and aggregate in memory
      const totals = new Map<string, number>();
      for (const row of txRows) {
        if (!row.categoryId) continue;
        const decrypted = await decryptField(String(row.amount), dek);
        const amount = parseFloat(decrypted);
        if (isNaN(amount)) continue;

        const budgetCatIds = catToBudgetsMap.get(row.categoryId);
        if (budgetCatIds) {
          for (const budgetCatId of budgetCatIds) {
            const prev = totals.get(budgetCatId) || 0;
            totals.set(budgetCatId, prev + amount);
          }
        }
      }

      // Final values for budgets should be positive (spending total or income total)
      for (const [catId, total] of totals.entries()) {
        totals.set(catId, Math.abs(total));
      }

      return totals;
    }

    const incomeCategoryIds = decryptedBudgetRows.filter((b) => b.isIncome).map((b) => b.categoryId).filter(Boolean) as string[];
    const expenseCategoryIds = decryptedBudgetRows.filter((b) => !b.isIncome).map((b) => b.categoryId).filter(Boolean) as string[];

    const [expenseActualMap, incomeActualMap] = await Promise.all([
      fetchActuals(expenseCategoryIds),
      fetchActuals(incomeCategoryIds),
    ]);

    const data = decryptedBudgetRows.map((row) => {
      const budgeted = parseFloat(row.amount);
      const isIncome = row.isIncome ?? false;
      const actual = (isIncome ? incomeActualMap : expenseActualMap).get(row.categoryId) || 0;
      const remaining = isIncome ? actual - budgeted : budgeted - actual;
      const percentUsed = budgeted > 0 ? (actual / budgeted) * 100 : 0;

      return {
        id: row.id,
        categoryId: row.categoryId,
        categoryName: row.categoryName,
        categoryColor: row.categoryColor || '#6366f1',
        periodType: row.periodType,
        isRecurring: row.isRecurring,
        fundingAccountId: row.fundingAccountId,
        rollover: row.rollover,
        notes: row.notes,
        budgeted,
        actual,
        remaining,
        percentUsed,
        type: isIncome ? 'income' : 'expense',
      };
    });

    const result: Record<string, unknown> = { budgets: data, period: bounds };

    if (includeCategories) {
      result.categories = await Promise.all(allCategories.map(async (c) => ({
        id: c.id,
        name: await decryptField(c.name || '', dek),
        color: c.color,
        isIncome: c.isIncome,
        parentId: c.parentId,
      })));
    }
    return NextResponse.json(result);
  } catch (error) {
    logger.error('Error fetching budgets', { error });
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const dek = await getSessionDEK();
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const db = getDb();
  try {
    const encryptedValues = await encryptRow('budgets', {
      userId: session.user.id,
      categoryId: body.categoryId as string,
      periodType: (body.periodType as string) || 'monthly',
      yearMonth: body.periodKey as string ?? null,
      periodKey: body.periodKey as string ?? null,
      amount: String(body.amount ?? 0),
      isRecurring: body.isRecurring !== false,
      fundingAccountId: (body.fundingAccountId as string) ?? null,
      rollover: body.rollover === true,
      notes: (body.notes as string) ?? null,
    }, dek);

    const [budget] = await db
      .insert(budgets)
      .values(encryptedValues)
      .returning();

    return NextResponse.json(budget, { status: 201 });
  } catch (error) {
    logger.error('Error creating budget', { error });
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
