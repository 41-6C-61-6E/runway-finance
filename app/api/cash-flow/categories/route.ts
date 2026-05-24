import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { logger } from '@/lib/logger';
import { categorySpendingSummary, categoryIncomeSummary, categories, transactions, accounts, userSettings } from '@/lib/db/schema';
import { eq, and, or, gte, lte, sql, inArray, isNull } from 'drizzle-orm';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptField, decryptRows } from '@/lib/crypto';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const dek = await getSessionDEK();
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

  async function fetchTransactionsAggregated(start: string, end: string, accountIds: string[], isIncome?: boolean): Promise<any[]> {
    const conditions = [
      eq(transactions.userId, session.user.id),
      gte(sql`to_char(${transactions.date}, 'YYYY-MM')`, start),
      lte(sql`to_char(${transactions.date}, 'YYYY-MM')`, end),
      eq(transactions.pending, false),
      eq(transactions.ignored, false),
      eq(accounts.isHidden, false),
      eq(accounts.isExcludedFromNetWorth, false),
      or(isNull(transactions.categoryId), sql`coalesce(${categories.excludeFromReports}, false) = false`),
    ];
    if (!isImportTransactionsEnabled) {
      conditions.push(eq(transactions.isImported, false));
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
      const decrypted = parseFloat(await decryptField(row.amount, dek));
      if (isIncome === true && decrypted <= 0) continue;
      if (isIncome === false && decrypted >= 0) continue;
      const absVal = Math.abs(decrypted);
      if (absVal <= 0) continue;
      catTotals.set(row.categoryId, (catTotals.get(row.categoryId) || 0) + absVal);
      catCounts.set(row.categoryId, (catCounts.get(row.categoryId) || 0) + 1);
    }

    // Fetch category names/colors
    const catIds = Array.from(catTotals.keys());
    if (catIds.length === 0) return [];

    const cats = await db
      .select({ id: categories.id, name: categories.name, color: categories.color, isIncome: categories.isIncome })
      .from(categories)
      .where(and(eq(categories.userId, session.user.id), inArray(categories.id, catIds)));

    const decryptedCats = await decryptRows('categories', cats, dek);
    const catInfo = new Map(decryptedCats.map((c: any) => [c.id, c]));

    return catIds.map((catId) => {
      const info = catInfo.get(catId);
      return {
        categoryId: catId,
        categoryName: info?.name || 'Uncategorized',
        categoryColor: info?.color || '#6366f1',
        isIncome: info?.isIncome || false,
        amount: catTotals.get(catId) || 0,
        transactionCount: catCounts.get(catId) || 0,
      };
    });
  }

  async function fetchUncategorizedTotal(start: string, end: string, accountIds: string[]): Promise<{ total: number; count: number; isIncome: boolean }> {
    const conditions = [
      eq(transactions.userId, session.user.id),
      gte(sql`to_char(${transactions.date}, 'YYYY-MM')`, start),
      lte(sql`to_char(${transactions.date}, 'YYYY-MM')`, end),
      eq(transactions.categoryId, null),
      eq(transactions.pending, false),
      eq(transactions.ignored, false),
    ];
    if (!isImportTransactionsEnabled) {
      conditions.push(eq(transactions.isImported, false));
    }
    let whereClause = and(...conditions);
    if (accountIds.length > 0) {
      whereClause = and(whereClause, inArray(transactions.accountId, accountIds));
    }

    const rows = await db
      .select({ amount: transactions.amount })
      .from(transactions)
      .where(whereClause);

    let total = 0;
    let count = 0;
    for (const row of rows) {
      const decrypted = parseFloat(await decryptField(row.amount, dek));
      if (Math.abs(decrypted) <= 0) continue;
      total += Math.abs(decrypted);
      count++;
    }
    return { total, count, isIncome: total > 0 };
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
          eq(categorySpendingSummary.userId, session.user.id),
          gte(categorySpendingSummary.yearMonth, startMonth!),
          lte(categorySpendingSummary.yearMonth, endMonth!),
          eq(categories.excludeFromReports, false),
        ];

        const incomeConditions = [
          eq(categoryIncomeSummary.userId, session.user.id),
          gte(categoryIncomeSummary.yearMonth, startMonth!),
          lte(categoryIncomeSummary.yearMonth, endMonth!),
          eq(categories.excludeFromReports, false),
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
          })
          .from(categoryIncomeSummary)
          .innerJoin(categories, eq(categoryIncomeSummary.categoryId, categories.id))
          .where(and(...incomeConditions));
      }

      const { total: uncategorizedTotal } = await fetchUncategorizedTotal(startMonth!, endMonth!, accountIdList);

      // Decrypt and aggregate by categoryId
      const categoryMap = new Map<string, any>();
      if (isImportTransactionsEnabled) {
        for (const r of [...rows, ...incomeRows]) {
          const decryptedAmt = await decryptField(r.amount, dek);
          const catId = r.categoryId ?? '';
          const existing = categoryMap.get(catId);
          if (existing) {
            existing.amount += parseFloat(decryptedAmt);
          } else {
            const decryptedName = await decryptField(r.categoryName || 'Uncategorized', dek);
            categoryMap.set(catId, {
              categoryId: catId,
              categoryName: decryptedName,
              categoryColor: r.categoryColor || '#6366f1',
              isIncome: r.isIncome || r === incomeRows.find((ir) => ir.categoryId === catId) || false,
              amount: parseFloat(decryptedAmt),
            });
          }
        }
      } else {
        for (const r of [...rows, ...incomeRows]) {
          const catId = r.categoryId ?? '';
          const existing = categoryMap.get(catId);
          if (existing) {
            existing.amount += r.amount;
          } else {
            categoryMap.set(catId, { ...r, categoryId: catId });
          }
        }
      }
      const data = Array.from(categoryMap.values());

      if (uncategorizedTotal !== 0) {
        data.push({
          categoryId: 'uncategorized',
          categoryName: 'Uncategorized',
          categoryColor: '#94a3b8',
          isIncome: uncategorizedTotal > 0,
          amount: uncategorizedTotal,
        });
      }

      logger.info('GET /api/cash-flow/categories (range)', { startMonth, endMonth, accountIds: accountIdList, count: data.length });
      return NextResponse.json(data);
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
        eq(categorySpendingSummary.userId, session.user.id),
        eq(categorySpendingSummary.yearMonth, resolvedMonth),
        eq(categories.excludeFromReports, false)
      ];
      const incomeConditions = [
        eq(categoryIncomeSummary.userId, session.user.id),
        eq(categoryIncomeSummary.yearMonth, resolvedMonth),
        eq(categories.excludeFromReports, false)
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
        })
        .from(categoryIncomeSummary)
        .innerJoin(categories, eq(categoryIncomeSummary.categoryId, categories.id))
        .where(and(...incomeConditions));
    }

    const { total: uncategorizedAmountStr, count: uncategorizedCount, isIncome: uncategorizedIsIncome } = await fetchUncategorizedTotal(resolvedMonth, resolvedMonth, accountIdList);
    const uncategorizedAmount = uncategorizedAmountStr;

    // Fetch previous month uncategorized
    const { total: prevUncategorizedAmount } = await fetchUncategorizedTotal(previousMonth, previousMonth, accountIdList);

    if (uncategorizedAmount !== 0) {
      currentRows.push({
        categoryId: 'uncategorized',
        amount: String(uncategorizedAmount),
        transactionCount: uncategorizedCount,
        categoryName: 'Uncategorized',
        categoryColor: '#94a3b8',
        isIncome: uncategorizedIsIncome,
      });
    }

    // Decrypt summary data for previous month
    async function fetchPreviousSummary(table: typeof categorySpendingSummary | typeof categoryIncomeSummary, catIds: string[]): Promise<Map<string, number>> {
      const map = new Map<string, number>();
      if (catIds.length === 0) return map;
      const idCol = 'categoryId' in table ? table.categoryId : categorySpendingSummary.categoryId;
      const rows = await db
        .select({ categoryId: idCol, amount: table.amount })
        .from(table)
        .where(and(eq(table.userId, session.user.id), eq(table.yearMonth, previousMonth)));
      for (const row of rows) {
        try {
          const decrypted = await decryptField(row.amount, dek);
          map.set(row.categoryId, parseFloat(decrypted));
        } catch { /* skip */ }
      }
      return map;
    }

    const [prevExpenseMap, prevIncomeMap] = await Promise.all([
      fetchPreviousSummary(categorySpendingSummary, []),
      fetchPreviousSummary(categoryIncomeSummary, []),
    ]);

    const prevMap = new Map<string, number>();
    for (const [k, v] of prevExpenseMap) prevMap.set(k, v);
    for (const [k, v] of prevIncomeMap) prevMap.set(k, v);
    if (prevUncategorizedAmount !== 0) {
      prevMap.set('uncategorized', prevUncategorizedAmount);
    }

    const data: any[] = [];

    // Process spending rows
    for (const row of currentRows) {
      const amount = row.categoryId === 'uncategorized'
        ? uncategorizedAmount
        : isImportTransactionsEnabled
        ? parseFloat(await decryptField(row.amount, dek))
        : row.amount;
      const prevAmount = prevMap.get(row.categoryId) || 0;
      const change = amount - prevAmount;
      const percentChange = prevAmount > 0 ? ((amount - prevAmount) / prevAmount) * 100 : 0;

      const categoryName = isImportTransactionsEnabled
        ? await decryptField(row.categoryName || 'Uncategorized', dek)
        : (row.categoryName || 'Uncategorized');
      data.push({
        categoryId: row.categoryId ?? '',
        categoryName,
        categoryColor: row.categoryColor || '#6366f1',
        isIncome: row.isIncome || false,
        amount,
        transactionCount: row.transactionCount ? parseInt(String(row.transactionCount)) || 0 : 0,
        previousAmount: prevAmount,
        change,
        percentChange,
      });
    }

    // Process income rows (only for summary-table mode; in transaction mode income is already included)
    for (const row of currentIncomeRows) {
      const amount = isImportTransactionsEnabled
        ? parseFloat(await decryptField(row.amount, dek))
        : row.amount;
      const prevAmount = prevMap.get(row.categoryId) || 0;
      const change = amount - prevAmount;
      const percentChange = prevAmount > 0 ? ((amount - prevAmount) / prevAmount) * 100 : 0;

      const incomeCategoryName = isImportTransactionsEnabled
        ? await decryptField(row.categoryName || 'Uncategorized', dek)
        : (row.categoryName || 'Uncategorized');
      data.push({
        categoryId: row.categoryId ?? '',
        categoryName: incomeCategoryName,
        categoryColor: row.categoryColor || '#6366f1',
        isIncome: true,
        amount,
        transactionCount: row.transactionCount ? parseInt(String(row.transactionCount)) || 0 : 0,
        previousAmount: prevAmount,
        change,
        percentChange,
      });
    }

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
