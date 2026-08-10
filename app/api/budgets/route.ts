import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { accounts, budgets, categories, categorySpendingSummary, categoryIncomeSummary, transactions, userSettings } from '@/lib/db/schema';
import { eq, and, or, isNull, sql, inArray, gte, lt, lte } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptField, decryptRows, encryptRow } from '@/lib/crypto';
import { formatToCents } from '@/lib/services/account-history';
import { ensureCategoryDiscretionaryColumn } from '@/lib/db/seed-categories';

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
    endDate: next.toISOString().split('T')[0],
    label: yearMonth,
  };
}

function getPreviousPeriodKey(periodType: string, periodKey: string): string {
  if (periodType === 'monthly') {
    const [y, m] = periodKey.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 2, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  }
  if (periodType === 'quarterly') {
    const [y, q] = periodKey.split('-Q').map(Number);
    if (q === 1) return `${y - 1}-Q4`;
    return `${y}-Q${q - 1}`;
  }
  return String(Number(periodKey) - 1);
}

export async function GET(request: Request) {
  const session = await auth();
  const dataUserId = session?.user ? ((session.user as any).dataUserId ?? session.user.id) : undefined;
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const dek = await getSessionDEK();
  const { searchParams } = new URL(request.url);
  const now = new Date();
  const periodType = searchParams.get('periodType') || 'monthly';
  const periodKey = searchParams.get('periodKey');
  const includeCategories = searchParams.get('includeCategories') === 'true';

  const db = getDb();

  try {
    await ensureCategoryDiscretionaryColumn();
    const bounds = periodKey ? getPeriodBounds(periodType, periodKey, now) : getPeriodBounds(periodType, null, now);
    const targetPeriodKey = bounds.yearMonth;

    const allUserBudgets = await db
      .select({
        id: budgets.id,
        categoryId: budgets.categoryId,
        amount: budgets.amount,
        isRecurring: budgets.isRecurring,
        effectiveFrom: budgets.effectiveFrom,
        effectiveTo: budgets.effectiveTo,
        yearMonth: budgets.yearMonth,
        periodType: budgets.periodType,
        periodKey: budgets.periodKey,
        fundingAccountId: budgets.fundingAccountId,
        rollover: budgets.rollover,
        notes: budgets.notes,
        createdAt: budgets.createdAt,
        categoryName: categories.name,
        categoryColor: categories.color,
        isIncome: categories.isIncome,
        categoryType: categories.categoryType,
        isDiscretionary: categories.isDiscretionary,
      })
      .from(budgets)
      .leftJoin(categories, eq(budgets.categoryId, categories.id))
      .where(
        and(
          eq(budgets.userId, dataUserId),
          eq(categories.excludeFromReports, false),
        )
      );

    // Decrypt budget amounts and notes
    const decryptedBudgetRows = await Promise.all(allUserBudgets.map(async (row) => ({
      ...row,
      amount: await decryptField(row.amount, dek),
      categoryName: row.categoryName ? await decryptField(row.categoryName, dek) : 'Uncategorized',
      notes: row.notes ? await decryptField(row.notes, dek).catch(() => row.notes) : null,
    })));

    // Filter budget rows for current periodKey respecting effectiveFrom / effectiveTo date bounds
    const filteredBudgetRows: typeof decryptedBudgetRows = [];
    const categoryMap = new Map<string, typeof decryptedBudgetRows[0]>();

    for (const b of decryptedBudgetRows) {
      if (periodType && b.periodType && b.periodType !== periodType) {
        if (!(periodType === 'quarterly' || periodType === 'yearly') || b.periodType !== 'monthly') {
          // Keep compatible period types
        }
      }

      let matches = false;
      if (!b.isRecurring) {
        matches = b.yearMonth === targetPeriodKey || b.periodKey === targetPeriodKey || b.effectiveFrom === targetPeriodKey;
      } else {
        const fromOk = !b.effectiveFrom || b.effectiveFrom <= targetPeriodKey;
        const toOk = !b.effectiveTo || b.effectiveTo >= targetPeriodKey;
        matches = fromOk && toOk;
      }

      if (matches) {
        const existing = categoryMap.get(b.categoryId);
        if (!existing) {
          categoryMap.set(b.categoryId, b);
        } else {
          // If multiple match, prefer the one with effectiveFrom matching or latest
          const curFrom = b.effectiveFrom || '';
          const exFrom = existing.effectiveFrom || '';
          if (curFrom >= exFrom) {
            categoryMap.set(b.categoryId, b);
          }
        }
      }
    }

    const activeBudgetRows = Array.from(categoryMap.values());

    // Fetch all categories to handle sub-category roll-ups and unbudgeted breakouts
    const allCategories = await db
      .select({ 
        id: categories.id, 
        name: categories.name, 
        color: categories.color, 
        parentId: categories.parentId, 
        isIncome: categories.isIncome,
        isDiscretionary: categories.isDiscretionary,
      })
      .from(categories)
      .where(eq(categories.userId, dataUserId));

    const decryptedAllCategories = await Promise.all(allCategories.map(async (c) => ({
      ...c,
      name: c.name ? await decryptField(c.name, dek) : 'Uncategorized',
    })));

    const getDescendantIds = (catId: string): string[] => {
      const children = decryptedAllCategories.filter(c => c.parentId === catId);
      return [catId, ...children.flatMap(c => getDescendantIds(c.id))];
    };

    async function fetchActuals(catIds: string[]) {
      if (catIds.length === 0) return new Map<string, number>();

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

      const userSettingsList = await db
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, dataUserId))
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

      const userAccounts = await db
        .select({
          id: accounts.id,
          isHidden: accounts.isHidden,
          isExcludedFromNetWorth: accounts.isExcludedFromNetWorth,
        })
        .from(accounts)
        .where(eq(accounts.userId, dataUserId));

      const excludedAccountIds = new Set(
        userAccounts.filter((a) => a.isHidden || a.isExcludedFromNetWorth).map((a) => a.id)
      );

      const txConditions = [
        eq(transactions.userId, dataUserId),
        inArray(transactions.categoryId, allSearchIds),
        gte(transactions.date, bounds.startDate),
        lt(transactions.date, bounds.endDate),
        eq(transactions.deleted, false)
      ];
      if (!isImportTransactionsEnabled) {
        txConditions.push(eq(transactions.isImported, false));
      }

      const txRows = await db
        .select({
          categoryId: transactions.categoryId,
          amount: transactions.amount,
          accountId: transactions.accountId,
        })
        .from(transactions)
        .where(and(...txConditions));

      const totals = new Map<string, number>();
      for (const row of txRows) {
        if (!row.categoryId) continue;
        if (row.accountId && excludedAccountIds.has(row.accountId)) continue;
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

      for (const [catId, total] of totals.entries()) {
        totals.set(catId, Math.abs(total));
      }

      return totals;
    }

    // Fetch actuals for unbudgeted categories (for All Other breakout)
    const budgetedCategoryIds = new Set(activeBudgetRows.map((b) => b.categoryId));
    const unbudgetedCategories = decryptedAllCategories.filter(
      (c) => !c.isIncome && !budgetedCategoryIds.has(c.id)
    );
    const unbudgetedActualMap = await fetchActuals(unbudgetedCategories.map((c) => c.id));
    const allOtherBreakout = unbudgetedCategories
      .map((c) => ({
        categoryId: c.id,
        categoryName: c.name,
        actual: unbudgetedActualMap.get(c.id) || 0,
      }))
      .filter((c) => c.actual > 0);

    const incomeCategoryIds = activeBudgetRows.filter((b) => b.isIncome && b.categoryType !== 'compound' && b.categoryType !== 'transfer').map((b) => b.categoryId).filter(Boolean) as string[];
    const expenseCategoryIds = activeBudgetRows.filter((b) => (!b.isIncome || b.categoryType === 'compound') && b.categoryType !== 'transfer').map((b) => b.categoryId).filter(Boolean) as string[];

    const [expenseActualMap, incomeActualMap] = await Promise.all([
      fetchActuals(expenseCategoryIds),
      fetchActuals(incomeCategoryIds),
    ]);

    const data = activeBudgetRows.map((row) => {
      const nativeAmount = parseFloat(row.amount);
      let budgeted = nativeAmount;
      if (row.isRecurring && row.periodType === 'monthly') {
        if (periodType === 'quarterly') budgeted *= 3;
        else if (periodType === 'yearly') budgeted *= 12;
      }

      const isIncome = row.isIncome ?? false;
      const isCompound = row.categoryType === 'compound';
      const effectiveIsIncome = isIncome && !isCompound;
      let actual = (effectiveIsIncome ? incomeActualMap : expenseActualMap).get(row.categoryId) || 0;

      const isCatchAll = (row.categoryName || '').toLowerCase().includes('all other') || (row.categoryName || '').toLowerCase().includes('misc');
      let groupedBreakout: typeof allOtherBreakout | undefined = undefined;

      if (isCatchAll) {
        groupedBreakout = allOtherBreakout;
        const totalUnbudgetedActual = allOtherBreakout.reduce((s, c) => s + c.actual, 0);
        actual = Math.max(actual, totalUnbudgetedActual);
      }

      const remaining = effectiveIsIncome ? actual - budgeted : budgeted - actual;
      const percentUsed = budgeted > 0 ? (actual / budgeted) * 100 : 0;

      return {
        id: row.id,
        categoryId: row.categoryId,
        categoryName: row.categoryName,
        categoryColor: row.categoryColor || '#6366f1',
        periodType: row.periodType,
        periodKey: row.periodKey || row.yearMonth || null,
        yearMonth: row.yearMonth || null,
        effectiveFrom: row.effectiveFrom || null,
        effectiveTo: row.effectiveTo || null,
        isRecurring: row.isRecurring,
        fundingAccountId: row.fundingAccountId,
        rollover: row.rollover,
        notes: row.notes,
        monthlyAmount: nativeAmount,
        budgeted,
        actual,
        remaining,
        percentUsed,
        type: effectiveIsIncome ? 'income' : 'expense',
        isDiscretionary: row.isDiscretionary ?? true,
        isCatchAll,
        groupedBreakout,
      };
    });

    const result: Record<string, unknown> = { budgets: data, period: bounds };

    if (includeCategories) {
      result.categories = decryptedAllCategories.map((c) => ({
        id: c.id,
        name: c.name,
        color: c.color,
        isIncome: c.isIncome,
        parentId: c.parentId,
        isDiscretionary: c.isDiscretionary,
      }));
    }
    return NextResponse.json(result);
  } catch (error) {
    logger.error('Error fetching budgets', { error });
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await auth();
  const dataUserId = session?.user ? ((session.user as any).dataUserId ?? session.user.id) : undefined;
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
    const targetPeriodKey = (body.periodKey as string) ?? null;
    const targetPeriodType = (body.periodType as string) || 'monthly';
    const targetCategoryId = body.categoryId as string;
    const effectiveFrom = targetPeriodKey || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

    const [existing] = await db
      .select()
      .from(budgets)
      .where(
        and(
          eq(budgets.userId, dataUserId),
          eq(budgets.categoryId, targetCategoryId),
          eq(budgets.periodType, targetPeriodType),
          targetPeriodKey ? eq(budgets.yearMonth, targetPeriodKey) : isNull(budgets.yearMonth)
        )
      )
      .limit(1);

    if (existing) {
      return NextResponse.json(
        { error: 'duplicate_budget', message: 'A budget already exists for this category and period' },
        { status: 400 }
      );
    }

    const encryptedValues = await encryptRow('budgets', {
      userId: dataUserId,
      categoryId: targetCategoryId,
      periodType: targetPeriodType,
      yearMonth: body.isRecurring !== false ? null : targetPeriodKey,
      periodKey: body.isRecurring !== false ? null : targetPeriodKey,
      effectiveFrom: effectiveFrom,
      effectiveTo: null,
      amount: formatToCents(parseFloat(String(body.amount ?? 0)) || 0),
      isRecurring: body.isRecurring !== false,
      fundingAccountId: (body.fundingAccountId as string) ?? null,
      rollover: body.rollover === true,
      notes: (body.notes as string) ?? null,
    }, dek);

    if (typeof body.isDiscretionary === 'boolean') {
      await db
        .update(categories)
        .set({ isDiscretionary: body.isDiscretionary })
        .where(and(eq(categories.id, targetCategoryId), eq(categories.userId, dataUserId)));
    }

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

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const dataUserId = (session.user as any).dataUserId ?? session.user.id;
  const dek = await getSessionDEK();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const id = (searchParams.get('id') || body.id) as string;
  if (!id) {
    return NextResponse.json({ error: 'missing_id' }, { status: 400 });
  }

  const db = getDb();
  const [existing] = await db
    .select()
    .from(budgets)
    .where(and(eq(budgets.id, id), eq(budgets.userId, dataUserId)))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const targetCategoryId = (body.categoryId as string) || existing.categoryId;
  if (typeof body.isDiscretionary === 'boolean' && targetCategoryId) {
    await db
      .update(categories)
      .set({ isDiscretionary: body.isDiscretionary })
      .where(and(eq(categories.id, targetCategoryId), eq(categories.userId, dataUserId)));
  }

  const applyMode = (body.applyMode as string) || 'future'; // 'future' vs 'all'
  const currentPeriodKey = (body.periodKey as string) || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const periodType = (body.periodType as string) || existing.periodType;

  // Handle effective date splitting if updating an existing recurring budget from current period onward
  if (existing.isRecurring && applyMode === 'future' && body.amount !== undefined) {
    const existingFrom = existing.effectiveFrom || '1970-01';
    if (existingFrom < currentPeriodKey) {
      // 1. Close off previous recurring budget period
      const prevPeriod = getPreviousPeriodKey(periodType, currentPeriodKey);
      await db
        .update(budgets)
        .set({ effectiveTo: prevPeriod, updatedAt: new Date() })
        .where(eq(budgets.id, id));

      // 2. Insert new budget effective from currentPeriodKey onward
      const newEncryptedData = await encryptRow('budgets', {
        userId: dataUserId,
        categoryId: targetCategoryId,
        periodType: periodType,
        yearMonth: null,
        periodKey: null,
        effectiveFrom: currentPeriodKey,
        effectiveTo: null,
        amount: formatToCents(parseFloat(String(body.amount)) || 0),
        isRecurring: true,
        fundingAccountId: (body.fundingAccountId as string) ?? existing.fundingAccountId,
        rollover: body.rollover !== undefined ? body.rollover === true : existing.rollover,
        notes: (body.notes as string) ?? existing.notes,
      }, dek);

      const [newBudget] = await db.insert(budgets).values(newEncryptedData).returning();
      return NextResponse.json(newBudget);
    }
  }

  let updateData: Record<string, unknown> = {};
  if (body.categoryId !== undefined) updateData.categoryId = body.categoryId;
  if (body.periodType !== undefined) updateData.periodType = body.periodType;
  if (body.amount !== undefined) updateData.amount = formatToCents(parseFloat(String(body.amount)) || 0);
  if (body.isRecurring !== undefined) updateData.isRecurring = body.isRecurring;
  if (body.periodKey !== undefined) {
    updateData.yearMonth = body.isRecurring ? null : body.periodKey;
    updateData.periodKey = body.isRecurring ? null : body.periodKey;
  }
  if (body.effectiveFrom !== undefined) updateData.effectiveFrom = body.effectiveFrom;
  if (body.effectiveTo !== undefined) updateData.effectiveTo = body.effectiveTo;
  if (body.fundingAccountId !== undefined) updateData.fundingAccountId = body.fundingAccountId || null;
  if (body.rollover !== undefined) updateData.rollover = body.rollover;
  if (body.notes !== undefined) updateData.notes = body.notes || null;
  updateData.updatedAt = new Date();

  updateData = await encryptRow('budgets', updateData, dek);

  try {
    const [updated] = await db
      .update(budgets)
      .set(updateData)
      .where(eq(budgets.id, id))
      .returning();
    return NextResponse.json(updated);
  } catch (error) {
    logger.error('Error updating budget', { error });
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const session = await auth();
  const dataUserId = session?.user ? ((session.user as any).dataUserId ?? session.user.id) : undefined;
  if (!session?.user || !dataUserId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const periodKey = searchParams.get('periodKey') || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

  const db = getDb();

  try {
    if (action === 'reset') {
      // Erase ALL budgets for user
      await db.delete(budgets).where(eq(budgets.userId, dataUserId));
      return NextResponse.json({ success: true, message: 'All budgets reset' });
    }

    if (action === 'purge_history') {
      // Erase prior period budgets and reset effectiveFrom to current period
      await db
        .delete(budgets)
        .where(
          and(
            eq(budgets.userId, dataUserId),
            or(
              lt(budgets.effectiveTo, periodKey),
              lt(budgets.yearMonth, periodKey)
            )
          )
        );

      await db
        .update(budgets)
        .set({ effectiveFrom: periodKey, effectiveTo: null })
        .where(eq(budgets.userId, dataUserId));

      return NextResponse.json({ success: true, message: 'Budget history removed' });
    }

    return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
  } catch (error) {
    logger.error('Error in DELETE /api/budgets', { error });
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
