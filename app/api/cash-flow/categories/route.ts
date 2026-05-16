import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { logger } from '@/lib/logger';
import { categorySpendingSummary, categoryIncomeSummary, categories, transactions, accounts } from '@/lib/db/schema';
import { eq, and, gte, lte, sql, inArray } from 'drizzle-orm';
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

  async function fetchTransactionsAggregated(start: string, end: string, accountIds: string[], isIncome?: boolean): Promise<any[]> {
    let whereClause = and(
      eq(transactions.userId, session.user.id),
      gte(sql`to_char(${transactions.date}, 'YYYY-MM')`, start),
      lte(sql`to_char(${transactions.date}, 'YYYY-MM')`, end),
      eq(transactions.pending, false),
      eq(transactions.ignored, false),
    );
    if (accountIds.length > 0) {
      whereClause = and(whereClause, inArray(transactions.accountId, accountIds));
    }
    if (isIncome === true) {
      whereClause = and(whereClause, eq(categories.isIncome, true));
    }

    // Fetch all matching transactions (we need to decrypt amounts in memory since SQL aggregations won't work on encrypted data)
    const txRows = await db
      .select({
        amount: transactions.amount,
        categoryId: transactions.categoryId,
      })
      .from(transactions)
      .innerJoin(accounts, eq(transactions.accountId, accounts.id))
      .where(whereClause);

    // Decrypt and aggregate in memory
    const catTotals = new Map<string, number>();
    let catCounts = new Map<string, number>();
    for (const row of txRows) {
      if (!row.categoryId) continue;
      const decrypted = parseFloat(await decryptField(row.amount, dek));
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
    let whereClause = and(
      eq(transactions.userId, session.user.id),
      gte(sql`to_char(${transactions.date}, 'YYYY-MM')`, start),
      lte(sql`to_char(${transactions.date}, 'YYYY-MM')`, end),
      eq(transactions.categoryId, null),
      eq(transactions.pending, false),
      eq(transactions.ignored, false),
    );
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

      if (accountIdList.length > 0) {
        const [spending, income] = await Promise.all([
          fetchTransactionsAggregated(startMonth!, endMonth!, accountIdList, false),
          fetchTransactionsAggregated(startMonth!, endMonth!, accountIdList, true),
        ]);
        rows = spending;
        incomeRows = income;
      } else {
        // Use summary tables (pre-computed, but encrypted)
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
          .where(
            and(
              eq(categorySpendingSummary.userId, session.user.id),
              gte(categorySpendingSummary.yearMonth, startMonth!),
              lte(categorySpendingSummary.yearMonth, endMonth!),
              eq(categories.excludeFromReports, false),
            )
          );

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
          .where(
            and(
              eq(categoryIncomeSummary.userId, session.user.id),
              gte(categoryIncomeSummary.yearMonth, startMonth!),
              lte(categoryIncomeSummary.yearMonth, endMonth!),
              eq(categories.excludeFromReports, false),
            )
          );
      }

      const { total: uncategorizedTotal } = await fetchUncategorizedTotal(startMonth!, endMonth!, accountIdList);

      // Decrypt summary data if not from transaction-direct mode
      const data: any[] = [];
      if (accountIdList.length === 0) {
        for (const r of rows) {
          const decryptedAmt = await decryptField(r.amount, dek);
          data.push({
            categoryId: r.categoryId ?? '',
            categoryName: r.categoryName || 'Uncategorized',
            categoryColor: r.categoryColor || '#6366f1',
            isIncome: r.isIncome || false,
            amount: parseFloat(decryptedAmt),
          });
        }
        for (const r of incomeRows) {
          const decryptedAmt = await decryptField(r.amount, dek);
          data.push({
            categoryId: r.categoryId ?? '',
            categoryName: r.categoryName || 'Uncategorized',
            categoryColor: r.categoryColor || '#6366f1',
            isIncome: true,
            amount: parseFloat(decryptedAmt),
          });
        }
      } else {
        data.push(...rows, ...incomeRows);
      }

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

    if (accountIdList.length > 0) {
      const [spending, income] = await Promise.all([
        fetchTransactionsAggregated(resolvedMonth, resolvedMonth, accountIdList, false),
        fetchTransactionsAggregated(resolvedMonth, resolvedMonth, accountIdList, true),
      ]);
      currentRows = spending;
      currentIncomeRows = income;
    } else {
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
        .where(
          and(
            eq(categorySpendingSummary.userId, session.user.id),
            eq(categorySpendingSummary.yearMonth, resolvedMonth),
            eq(categories.excludeFromReports, false)
          )
        );

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
        .where(
          and(
            eq(categoryIncomeSummary.userId, session.user.id),
            eq(categoryIncomeSummary.yearMonth, resolvedMonth),
            eq(categories.excludeFromReports, false)
          )
        );
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
        : parseFloat(await decryptField(row.amount, dek));
      const prevAmount = prevMap.get(row.categoryId) || 0;
      const change = amount - prevAmount;
      const percentChange = prevAmount > 0 ? ((amount - prevAmount) / prevAmount) * 100 : 0;

      data.push({
        categoryId: row.categoryId ?? '',
        categoryName: row.categoryName || 'Uncategorized',
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
      const amount = parseFloat(await decryptField(row.amount, dek));
      const prevAmount = prevMap.get(row.categoryId) || 0;
      const change = amount - prevAmount;
      const percentChange = prevAmount > 0 ? ((amount - prevAmount) / prevAmount) * 100 : 0;

      data.push({
        categoryId: row.categoryId ?? '',
        categoryName: row.categoryName || 'Uncategorized',
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
