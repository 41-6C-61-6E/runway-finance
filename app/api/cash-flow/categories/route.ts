import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { logger } from '@/lib/logger';
import { categorySpendingSummary, categoryIncomeSummary, categories, transactions, accounts, userSettings } from '@/lib/db/schema';
import { eq, and, or, gte, lte, sql, inArray, isNull, ne } from 'drizzle-orm';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptField, decryptRows } from '@/lib/crypto';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const dek = await getSessionDEK();
  const userId = session.user.id;
  const dataUserId = (session.user as any).dataUserId ?? session.user.id;
  const { searchParams } = new URL(request.url);
  const now = new Date();
  const month = searchParams.get('month');
  const startMonth = searchParams.get('startMonth');
  const endMonth = searchParams.get('endMonth');
  const accountIdsParam = searchParams.get('accountIds') || '';
  const accountIdList = accountIdsParam ? accountIdsParam.split(',').filter(Boolean) : [];

  const isRange = startMonth && endMonth;

  const db = getDb();

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

  let prevExpenseMap = new Map<string, number>();
  let prevIncomeMap = new Map<string, number>();

  function expandCategoryRecord(row: any, previousAmount = 0) {
    const baseRecord = {
      sourceCategoryId: row.sourceCategoryId || row.categoryId,
      categoryName: row.categoryName,
      categoryColor: row.categoryColor,
      categoryType: row.categoryType || 'standard',
      expenseParentId: row.expenseParentId || null,
      previousAmount,
    };

    const buildMetrics = (amount: number, transactionCount: number, prev = previousAmount) => ({
      amount,
      transactionCount,
      change: amount - prev,
      percentChange: prev > 0 ? ((amount - prev) / prev) * 100 : 0,
    });

    if (row.categoryType !== 'compound') {
      return [
        {
          ...baseRecord,
          categoryId: row.categoryId,
          isIncome: row.isIncome,
          parentId: row.parentId || null,
          side: 'standard',
          ...buildMetrics(row.amount || 0, row.transactionCount || 0),
        },
      ];
    }

    const incomeAmount = Math.abs(row.compoundIncomeAmount ?? row.amount ?? 0);
    const expenseAmount = Math.abs(row.compoundExpenseAmount ?? row.amount ?? 0);
    const incomeCount = Math.abs(row.compoundIncomeCount ?? row.transactionCount ?? 0);
    const expenseCount = Math.abs(row.compoundExpenseCount ?? row.transactionCount ?? 0);
    const incomePreviousAmount = Math.abs(row.compoundIncomePreviousAmount ?? previousAmount ?? 0);
    const expensePreviousAmount = Math.abs(row.compoundExpensePreviousAmount ?? previousAmount ?? 0);

    return [
      {
        ...baseRecord,
        categoryId: `${row.categoryId}::income`,
        isIncome: true,
        parentId: row.parentId || null,
        side: 'income',
        ...buildMetrics(incomeAmount, incomeCount, incomePreviousAmount),
      },
      {
        ...baseRecord,
        categoryId: `${row.categoryId}::expense`,
        isIncome: false,
        parentId: row.expenseParentId || null,
        side: 'expense',
        ...buildMetrics(expenseAmount, expenseCount, expensePreviousAmount),
      },
    ];
  }

    async function fetchTransactionsAggregated(start: string, end: string, accountIds: string[], isIncome?: boolean): Promise<any[]> {
    const conditions = [
      eq(transactions.userId, dataUserId),
      gte(sql`to_char(${transactions.date}, 'YYYY-MM')`, start),
      lte(sql`to_char(${transactions.date}, 'YYYY-MM')`, end),
      eq(transactions.pending, false),
      eq(transactions.ignored, false),
      eq(transactions.deleted, false),
      eq(accounts.isHidden, false),
      eq(accounts.isExcludedFromNetWorth, false),
      or(
        isNull(transactions.categoryId),
        and(
          ne(categories.categoryType, 'transfer'),
          or(
            eq(categories.categoryType, 'compound'),
            and(
              sql`coalesce(${categories.excludeFromReports}, false) = false`,
              or(
                isNull(categories.parentId),
                sql`NOT EXISTS (SELECT 1 FROM categories pc WHERE pc.id = ${categories.parentId} AND pc.exclude_from_reports = true)`
              )
            )
          )
        )
      ),
    ];
    if (!isImportTransactionsEnabled) {
      conditions.push(eq(transactions.isImported, false));
    }
    if (!isPaystubEnabled) {
      conditions.push(ne(transactions.source, 'paystub'));
    }
    let whereClause = and(...conditions);
    if (accountIds.length > 0) {
      whereClause = and(whereClause, inArray(transactions.accountId, accountIds));
    }

    // Fetch all matching transactions (we need to decrypt amounts in memory since SQL aggregations won't work on encrypted data)
      const txRows = await db
      .select({
        amount: transactions.amount,
        categoryId: transactions.categoryId,
        parentId: categories.parentId,
        isIncome: categories.isIncome,
        categoryType: categories.categoryType,
        expenseParentId: categories.expenseParentId,
      })
      .from(transactions)
      .innerJoin(accounts, eq(transactions.accountId, accounts.id))
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(whereClause);

    // Decrypt and aggregate in memory
    const catTotals = new Map<string, number>();
    let catCounts = new Map<string, number>();
    for (const row of txRows) {
      if (!row.categoryId) continue;
      // Skip transfer categories entirely
      if (row.categoryType === 'transfer') continue;
      // Compound categories match BOTH income and expense requests
      if (row.categoryType !== 'compound' && row.isIncome !== isIncome) continue;

      const decrypted = parseFloat(await decryptField(row.amount, dek)) || 0;
      const val = isIncome ? decrypted : -decrypted;
      if (val === 0) continue;
      catTotals.set(row.categoryId, (catTotals.get(row.categoryId) || 0) + val);
      catCounts.set(row.categoryId, (catCounts.get(row.categoryId) || 0) + 1);
    }

    // Fetch category names/colors
    const catIds = Array.from(catTotals.keys());
    if (catIds.length === 0) return [];

    const cats = await db
      .select({
        id: categories.id,
        name: categories.name,
        color: categories.color,
        isIncome: categories.isIncome,
        parentId: categories.parentId,
        categoryType: categories.categoryType,
        expenseParentId: categories.expenseParentId,
      })
      .from(categories)
      .where(and(eq(categories.userId, dataUserId), inArray(categories.id, catIds)));

    const decryptedCats = await decryptRows('categories', cats, dek);
    const catInfo = new Map(decryptedCats.map((c: any) => [c.id, c]));

    return catIds.map((catId) => {
      const info = catInfo.get(catId);
      return {
        categoryId: catId,
        categoryName: info?.name || 'Uncategorized',
        categoryColor: info?.color || '#6366f1',
        isIncome: info?.isIncome || false,
        parentId: info?.parentId || null,
        categoryType: info?.categoryType || 'standard',
        expenseParentId: info?.expenseParentId || null,
        amount: catTotals.get(catId) || 0,
        transactionCount: catCounts.get(catId) || 0,
      };
    });
  }

  async function fetchUncategorizedTotals(start: string, end: string, accountIds: string[]): Promise<{
    spendingTotal: number;
    spendingCount: number;
    incomeTotal: number;
    incomeCount: number;
  }> {
    const conditions = [
      eq(transactions.userId, dataUserId),
      gte(sql`to_char(${transactions.date}, 'YYYY-MM')`, start),
      lte(sql`to_char(${transactions.date}, 'YYYY-MM')`, end),
      isNull(transactions.categoryId),
      eq(transactions.pending, false),
      eq(transactions.ignored, false),
      eq(transactions.deleted, false),
      eq(accounts.isHidden, false),
      eq(accounts.isExcludedFromNetWorth, false),
    ];
    if (!isImportTransactionsEnabled) {
      conditions.push(eq(transactions.isImported, false));
    }
    if (!isPaystubEnabled) {
      conditions.push(ne(transactions.source, 'paystub'));
    }
    let whereClause = and(...conditions);
    if (accountIds.length > 0) {
      whereClause = and(whereClause, inArray(transactions.accountId, accountIds));
    }

    const rows = await db
      .select({ amount: transactions.amount })
      .from(transactions)
      .innerJoin(accounts, eq(transactions.accountId, accounts.id))
      .where(whereClause);

    let spendingTotal = 0;
    let spendingCount = 0;
    let incomeTotal = 0;
    let incomeCount = 0;

    for (const row of rows) {
      const decrypted = parseFloat(await decryptField(row.amount, dek));
      if (decrypted < 0) {
        spendingTotal += Math.abs(decrypted);
        spendingCount++;
      } else if (decrypted > 0) {
        incomeTotal += decrypted;
        incomeCount++;
      }
    }
    return { spendingTotal, spendingCount, incomeTotal, incomeCount };
  }

  try {
    if (isRange) {
      let rows: any[];
      let incomeRows: any[];

      if (!isImportTransactionsEnabled) {
        const [spending, income] = await Promise.all([
          fetchTransactionsAggregated(startMonth!, endMonth!, accountIdList, false),
          fetchTransactionsAggregated(startMonth!, endMonth!, accountIdList, true),
        ]);
        rows = spending;
        incomeRows = income;
      } else {
        // Use summary tables (pre-computed, but encrypted)
        const spendingConditions = [
          eq(categorySpendingSummary.userId, dataUserId),
          gte(categorySpendingSummary.yearMonth, startMonth!),
          lte(categorySpendingSummary.yearMonth, endMonth!),
          eq(categories.excludeFromReports, false),
          // Also exclude children whose parent has excludeFromReports=true
          or(
            isNull(categories.parentId),
            sql`NOT EXISTS (SELECT 1 FROM categories pc WHERE pc.id = ${categories.parentId} AND pc.exclude_from_reports = true)`
          ),
        ];

        const incomeConditions = [
          eq(categoryIncomeSummary.userId, dataUserId),
          gte(categoryIncomeSummary.yearMonth, startMonth!),
          lte(categoryIncomeSummary.yearMonth, endMonth!),
          eq(categories.excludeFromReports, false),
          // Also exclude children whose parent has excludeFromReports=true
          or(
            isNull(categories.parentId),
            sql`NOT EXISTS (SELECT 1 FROM categories pc WHERE pc.id = ${categories.parentId} AND pc.exclude_from_reports = true)`
          ),
        ];

        if (accountIdList.length > 0) {
          spendingConditions.push(inArray(categorySpendingSummary.accountId, accountIdList));
          incomeConditions.push(inArray(categoryIncomeSummary.accountId, accountIdList));
        }

        rows = await db
          .select({
            categoryId: categorySpendingSummary.categoryId,
            amount: categorySpendingSummary.amount,
            transactionCount: categorySpendingSummary.transactionCount,
        categoryName: categories.name,
        categoryColor: categories.color,
        isIncome: categories.isIncome,
        parentId: categories.parentId,
        categoryType: categories.categoryType,
        expenseParentId: categories.expenseParentId,
      })
          .from(categorySpendingSummary)
          .innerJoin(categories, eq(categorySpendingSummary.categoryId, categories.id))
          .where(and(...spendingConditions));

        incomeRows = await db
          .select({
            categoryId: categoryIncomeSummary.categoryId,
            amount: categoryIncomeSummary.amount,
            transactionCount: categoryIncomeSummary.transactionCount,
            categoryName: categories.name,
            categoryColor: categories.color,
            isIncome: categories.isIncome,
            categoryType: categories.categoryType,
            expenseParentId: categories.expenseParentId,
          })
          .from(categoryIncomeSummary)
          .innerJoin(categories, eq(categoryIncomeSummary.categoryId, categories.id))
          .where(and(...incomeConditions));
      }

      const { spendingTotal, spendingCount, incomeTotal, incomeCount } = await fetchUncategorizedTotals(startMonth!, endMonth!, accountIdList);

      // Decrypt and aggregate by categoryId
      const categoryMap = new Map<string, any>();
      const allCurrentRows = [
        ...rows.map((r) => ({ ...r, isIncome: false, source: 'expense' as const })),
        ...incomeRows.map((r) => ({ ...r, isIncome: true, source: 'income' as const })),
      ];

      for (const r of allCurrentRows) {
        const decryptedAmt = isImportTransactionsEnabled ? await decryptField(r.amount, dek) : r.amount;
        const catId = r.categoryId ?? '';
        const amount = parseFloat(decryptedAmt);
        const transactionCount = isImportTransactionsEnabled
          ? (r.transactionCount ? parseInt(await decryptField(String(r.transactionCount), dek)) || 0 : 0)
          : (r.transactionCount || 0);
        const isCompound = r.categoryType === 'compound';
        const existing = categoryMap.get(catId);

        if (isCompound) {
          const sideAmount = Math.abs(amount);
          const sideCount = Math.abs(transactionCount);
          const sidePreviousIncomeAmount = Math.abs(prevIncomeMap.get(catId) || 0);
          const sidePreviousExpenseAmount = Math.abs(prevExpenseMap.get(catId) || 0);
          const amountKey = r.source === 'income' ? 'compoundIncomeAmount' : 'compoundExpenseAmount';
          const countKey = r.source === 'income' ? 'compoundIncomeCount' : 'compoundExpenseCount';
          const prevAmountKey = r.source === 'income' ? 'compoundIncomePreviousAmount' : 'compoundExpensePreviousAmount';

          if (existing) {
            existing[amountKey] = (existing[amountKey] || 0) + sideAmount;
            existing[countKey] = (existing[countKey] || 0) + sideCount;
            existing[prevAmountKey] = r.source === 'income' ? sidePreviousIncomeAmount : sidePreviousExpenseAmount;
            existing.amount = Math.max(existing.compoundIncomeAmount || 0, existing.compoundExpenseAmount || 0);
            existing.transactionCount = Math.max(existing.compoundIncomeCount || 0, existing.compoundExpenseCount || 0);
          } else {
            const categoryName = isImportTransactionsEnabled
              ? await decryptField(r.categoryName || 'Uncategorized', dek)
              : (r.categoryName || 'Uncategorized');
            categoryMap.set(catId, {
            categoryId: catId,
            categoryName,
            categoryColor: r.categoryColor || '#6366f1',
            isIncome: r.isIncome || false,
            parentId: r.parentId || null,
            categoryType: r.categoryType || 'compound',
            expenseParentId: r.expenseParentId || null,
              amount: sideAmount,
              transactionCount: sideCount,
              compoundIncomeAmount: r.source === 'income' ? sideAmount : 0,
              compoundExpenseAmount: r.source === 'expense' ? sideAmount : 0,
              compoundIncomeCount: r.source === 'income' ? sideCount : 0,
              compoundExpenseCount: r.source === 'expense' ? sideCount : 0,
              compoundIncomePreviousAmount: r.source === 'income' ? sidePreviousIncomeAmount : 0,
              compoundExpensePreviousAmount: r.source === 'expense' ? sidePreviousExpenseAmount : 0,
            });
          }
        } else if (existing) {
          existing.amount += amount;
          existing.transactionCount += transactionCount;
        } else {
          const categoryName = isImportTransactionsEnabled
            ? await decryptField(r.categoryName || 'Uncategorized', dek)
            : (r.categoryName || 'Uncategorized');
          categoryMap.set(catId, {
            categoryId: catId,
            categoryName,
            categoryColor: r.categoryColor || '#6366f1',
            isIncome: r.isIncome || false,
            parentId: r.parentId || null,
            categoryType: r.categoryType || 'standard',
            expenseParentId: r.expenseParentId || null,
            amount,
            transactionCount,
          });
        }
      }
      const data = Array.from(categoryMap.values());

      if (spendingTotal > 0) {
        data.push({
          categoryId: 'uncategorized',
          categoryName: 'Uncategorized',
          categoryColor: '#94a3b8',
          isIncome: false,
          amount: spendingTotal,
          transactionCount: spendingCount,
        });
      }
      if (incomeTotal > 0) {
        data.push({
          categoryId: 'uncategorized_income',
          categoryName: 'Uncategorized Income',
          categoryColor: '#94a3b8',
          isIncome: true,
          amount: incomeTotal,
          transactionCount: incomeCount,
        });
      }

      const expandedData = data.flatMap((row) => expandCategoryRecord(row));

      logger.info('GET /api/cash-flow/categories (range)', { startMonth, endMonth, accountIds: accountIdList, count: expandedData.length });
      return NextResponse.json(expandedData);
    }

    // ── Single-month mode ───────────────────────────────────────────────
    const resolvedMonth = month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const prevDate = new Date(parseInt(resolvedMonth.split('-')[0]), parseInt(resolvedMonth.split('-')[1]) - 2, 1);
    const previousMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;

    let currentRows: any[];
    let currentIncomeRows: any[];

    if (!isImportTransactionsEnabled) {
      const [spending, income] = await Promise.all([
        fetchTransactionsAggregated(resolvedMonth, resolvedMonth, accountIdList, false),
        fetchTransactionsAggregated(resolvedMonth, resolvedMonth, accountIdList, true),
      ]);
      currentRows = spending;
      currentIncomeRows = income;
    } else {
      const spendingConditions = [
        eq(categorySpendingSummary.userId, dataUserId),
        eq(categorySpendingSummary.yearMonth, resolvedMonth),
        eq(categories.excludeFromReports, false),
        // Also exclude children whose parent has excludeFromReports=true
        or(
          isNull(categories.parentId),
          sql`NOT EXISTS (SELECT 1 FROM categories pc WHERE pc.id = ${categories.parentId} AND pc.exclude_from_reports = true)`
        ),
      ];
      const incomeConditions = [
        eq(categoryIncomeSummary.userId, dataUserId),
        eq(categoryIncomeSummary.yearMonth, resolvedMonth),
        eq(categories.excludeFromReports, false),
        // Also exclude children whose parent has excludeFromReports=true
        or(
          isNull(categories.parentId),
          sql`NOT EXISTS (SELECT 1 FROM categories pc WHERE pc.id = ${categories.parentId} AND pc.exclude_from_reports = true)`
        ),
      ];

      if (accountIdList.length > 0) {
        spendingConditions.push(inArray(categorySpendingSummary.accountId, accountIdList));
        incomeConditions.push(inArray(categoryIncomeSummary.accountId, accountIdList));
      }

      currentRows = await db
        .select({
          categoryId: categorySpendingSummary.categoryId,
          amount: categorySpendingSummary.amount,
          transactionCount: categorySpendingSummary.transactionCount,
          categoryName: categories.name,
          categoryColor: categories.color,
          isIncome: categories.isIncome,
          categoryType: categories.categoryType,
          expenseParentId: categories.expenseParentId,
        })
        .from(categorySpendingSummary)
        .innerJoin(categories, eq(categorySpendingSummary.categoryId, categories.id))
        .where(and(...spendingConditions));

      currentIncomeRows = await db
        .select({
          categoryId: categoryIncomeSummary.categoryId,
          amount: categoryIncomeSummary.amount,
          transactionCount: categoryIncomeSummary.transactionCount,
          categoryName: categories.name,
          categoryColor: categories.color,
          isIncome: categories.isIncome,
          categoryType: categories.categoryType,
          expenseParentId: categories.expenseParentId,
        })
        .from(categoryIncomeSummary)
        .innerJoin(categories, eq(categoryIncomeSummary.categoryId, categories.id))
        .where(and(...incomeConditions));
    }

    const { spendingTotal, spendingCount, incomeTotal, incomeCount } = await fetchUncategorizedTotals(resolvedMonth, resolvedMonth, accountIdList);

    // Fetch previous month uncategorized
    const { spendingTotal: prevSpendingTotal, incomeTotal: prevIncomeTotal } = await fetchUncategorizedTotals(previousMonth, previousMonth, accountIdList);

    if (spendingTotal > 0) {
      currentRows.push({
        categoryId: 'uncategorized',
        amount: String(spendingTotal),
        transactionCount: spendingCount,
        categoryName: 'Uncategorized',
        categoryColor: '#94a3b8',
        isIncome: false,
      });
    }

    if (incomeTotal > 0) {
      currentIncomeRows.push({
        categoryId: 'uncategorized_income',
        amount: String(incomeTotal),
        transactionCount: incomeCount,
        categoryName: 'Uncategorized Income',
        categoryColor: '#94a3b8',
        isIncome: true,
      });
    }

    // Decrypt summary data for previous month
    async function fetchPreviousSummary(
      table: typeof categorySpendingSummary | typeof categoryIncomeSummary,
      accountIds: string[]
    ): Promise<Map<string, number>> {
      const map = new Map<string, number>();
      const idCol = table.categoryId;
      const conditions = [
        eq(table.userId, dataUserId),
        eq(table.yearMonth, previousMonth),
      ];
      if (accountIds.length > 0) {
        conditions.push(inArray(table.accountId, accountIds));
      }
      const rows = await db
        .select({ categoryId: idCol, amount: table.amount })
        .from(table)
        .where(and(...conditions));
      for (const row of rows) {
        try {
          const decrypted = await decryptField(row.amount, dek);
          const val = parseFloat(decrypted);
          map.set(row.categoryId, (map.get(row.categoryId) || 0) + val);
        } catch { /* skip */ }
      }
      return map;
    }

    if (isImportTransactionsEnabled) {
      const [expMap, incMap] = await Promise.all([
        fetchPreviousSummary(categorySpendingSummary, accountIdList),
        fetchPreviousSummary(categoryIncomeSummary, accountIdList),
      ]);
      prevExpenseMap = expMap;
      prevIncomeMap = incMap;
    } else {
      const [prevSpending, prevIncome] = await Promise.all([
        fetchTransactionsAggregated(previousMonth, previousMonth, accountIdList, false),
        fetchTransactionsAggregated(previousMonth, previousMonth, accountIdList, true),
      ]);
      prevExpenseMap = new Map(prevSpending.map(r => [r.categoryId, r.amount]));
      prevIncomeMap = new Map(prevIncome.map(r => [r.categoryId, r.amount]));
    }

    const prevMap = new Map<string, number>();
    for (const [k, v] of prevExpenseMap) prevMap.set(k, v);
    for (const [k, v] of prevIncomeMap) prevMap.set(k, v);
    if (prevSpendingTotal > 0) {
      prevMap.set('uncategorized', prevSpendingTotal);
    }
    if (prevIncomeTotal > 0) {
      prevMap.set('uncategorized_income', prevIncomeTotal);
    }

    // Decrypt and aggregate current month rows by categoryId
    const currentCategoryMap = new Map<string, any>();

    const allCurrentRows = [
      ...currentRows.map(r => ({ ...r, isIncome: false })),
      ...currentIncomeRows.map(r => ({ ...r, isIncome: true })),
    ];

    for (const row of allCurrentRows) {
      const catId = row.categoryId ?? '';
      const amount = row.categoryId === 'uncategorized'
        ? spendingTotal
        : row.categoryId === 'uncategorized_income'
        ? incomeTotal
        : isImportTransactionsEnabled
        ? parseFloat(await decryptField(row.amount, dek))
        : row.amount;

      const transactionCount = isImportTransactionsEnabled
        ? (row.transactionCount ? parseInt(await decryptField(String(row.transactionCount), dek)) || 0 : 0)
        : (row.transactionCount || 0);

      const existing = currentCategoryMap.get(catId);
      if (existing) {
        existing.amount += amount;
        existing.transactionCount += transactionCount;
      } else {
        const categoryName = (row.categoryId === 'uncategorized' || row.categoryId === 'uncategorized_income')
          ? row.categoryName
          : isImportTransactionsEnabled
          ? await decryptField(row.categoryName || 'Uncategorized', dek)
          : (row.categoryName || 'Uncategorized');

      currentCategoryMap.set(catId, {
        categoryId: catId,
        categoryName,
        categoryColor: row.categoryColor || '#6366f1',
        isIncome: row.isIncome,
        categoryType: row.categoryType,
        expenseParentId: row.expenseParentId || null,
        amount,
        transactionCount,
      });
      }
    }

    const data = Array.from(currentCategoryMap.values()).flatMap((aggregated) => {
      const prevAmount = prevMap.get(aggregated.categoryId) || 0;
      return expandCategoryRecord({
        ...aggregated,
        sourceCategoryId: aggregated.categoryId,
      }, prevAmount);
    });

    logger.info('GET /api/cash-flow/categories', { month: resolvedMonth, accountIds: accountIdList, count: data.length });
    return NextResponse.json(data);
  } catch (error) {
    logger.error('Error fetching category spending', { error });
    return NextResponse.json(
      { error: 'internal_error', message: 'Failed to fetch category spending data' },
      { status: 500 }
    );
  }
}
