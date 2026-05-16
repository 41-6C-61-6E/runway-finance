import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { logger } from '@/lib/logger';
import { categorySpendingSummary, categoryIncomeSummary, categories, transactions, accounts } from '@/lib/db/schema';
import { eq, and, gte, lte, sql, inArray } from 'drizzle-orm';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const now = new Date();
  const month = searchParams.get('month');
  const startMonth = searchParams.get('startMonth');
  const endMonth = searchParams.get('endMonth');
  const accountIdsParam = searchParams.get('accountIds') || '';
  const accountIdList = accountIdsParam ? accountIdsParam.split(',').filter(Boolean) : [];

  const isRange = startMonth && endMonth;

  const db = getDb();

  try {
    if (isRange) {
      // ── Multi-month mode ──────────────────────────────────────────────
      let rows: any[];
      let incomeRows: any[];

      if (accountIdList.length > 0) {
        // Query transactions directly when filtering by account
        rows = await db
          .select({
            categoryId: transactions.categoryId,
            amount: sql<string>`SUM(ABS(${transactions.amount}))`,
            transactionCount: sql<number>`COUNT(*)`,
            categoryName: categories.name,
            categoryColor: categories.color,
            isIncome: categories.isIncome,
          })
          .from(transactions)
          .innerJoin(accounts, eq(transactions.accountId, accounts.id))
          .innerJoin(categories, eq(transactions.categoryId, categories.id))
          .where(
            and(
              eq(transactions.userId, session.user.id),
              gte(sql`to_char(${transactions.date}, 'YYYY-MM')`, startMonth),
              lte(sql`to_char(${transactions.date}, 'YYYY-MM')`, endMonth),
              eq(categories.excludeFromReports, false),
              inArray(accounts.id, accountIdList),
              eq(transactions.pending, false),
              eq(transactions.ignored, false),
              sql`ABS(${transactions.amount}) > 0`,
            )
          )
          .groupBy(transactions.categoryId, categories.name, categories.color, categories.isIncome);

        // Fetch income categories from transactions
        incomeRows = await db
          .select({
            categoryId: transactions.categoryId,
            amount: sql<string>`SUM(ABS(${transactions.amount}))`,
            transactionCount: sql<number>`COUNT(*)`,
            categoryName: categories.name,
            categoryColor: categories.color,
            isIncome: categories.isIncome,
          })
          .from(transactions)
          .innerJoin(accounts, eq(transactions.accountId, accounts.id))
          .innerJoin(categories, eq(transactions.categoryId, categories.id))
          .where(
            and(
              eq(transactions.userId, session.user.id),
              gte(sql`to_char(${transactions.date}, 'YYYY-MM')`, startMonth),
              lte(sql`to_char(${transactions.date}, 'YYYY-MM')`, endMonth),
              eq(categories.excludeFromReports, false),
              eq(categories.isIncome, true),
              inArray(accounts.id, accountIdList),
              eq(transactions.pending, false),
              eq(transactions.ignored, false),
              sql`ABS(${transactions.amount}) > 0`,
            )
          )
          .groupBy(transactions.categoryId, categories.name, categories.color, categories.isIncome);
      } else {
        rows = await db
          .select({
            categoryId: categorySpendingSummary.categoryId,
            amount: sql<string>`SUM(${categorySpendingSummary.amount})`,
            transactionCount: sql<number>`SUM(${categorySpendingSummary.transactionCount})`,
            categoryName: categories.name,
            categoryColor: categories.color,
            isIncome: categories.isIncome,
          })
          .from(categorySpendingSummary)
          .innerJoin(categories, eq(categorySpendingSummary.categoryId, categories.id))
          .where(
            and(
              eq(categorySpendingSummary.userId, session.user.id),
              gte(categorySpendingSummary.yearMonth, startMonth),
              lte(categorySpendingSummary.yearMonth, endMonth),
              eq(categories.excludeFromReports, false),
            )
          )
          .groupBy(categorySpendingSummary.categoryId, categories.name, categories.color, categories.isIncome);

        // Also fetch income categories across range
        incomeRows = await db
          .select({
            categoryId: categoryIncomeSummary.categoryId,
            amount: sql<string>`SUM(${categoryIncomeSummary.amount})`,
            transactionCount: sql<number>`SUM(${categoryIncomeSummary.transactionCount})`,
            categoryName: categories.name,
            categoryColor: categories.color,
            isIncome: categories.isIncome,
          })
          .from(categoryIncomeSummary)
          .innerJoin(categories, eq(categoryIncomeSummary.categoryId, categories.id))
          .where(
            and(
              eq(categoryIncomeSummary.userId, session.user.id),
              gte(categoryIncomeSummary.yearMonth, startMonth),
              lte(categoryIncomeSummary.yearMonth, endMonth),
              eq(categories.excludeFromReports, false),
            )
          )
          .groupBy(categoryIncomeSummary.categoryId, categories.name, categories.color, categories.isIncome);
      }

      // Aggregate uncategorized across range
      const uncatSqlRange = accountIdList.length > 0
        ? sql`SELECT CAST(COALESCE(SUM(amount), 0) AS REAL) as total
            FROM transactions
            WHERE user_id = ${session.user.id}
              AND to_char(date, 'YYYY-MM') >= ${startMonth}
              AND to_char(date, 'YYYY-MM') <= ${endMonth}
              AND category_id IS NULL
              AND pending = false
              AND amount != 0
              AND account_id IN (${sql.raw(accountIdList.map((id) => `'${id}'`).join(', '))})`
        : sql`SELECT CAST(COALESCE(SUM(amount), 0) AS REAL) as total
            FROM transactions
            WHERE user_id = ${session.user.id}
              AND to_char(date, 'YYYY-MM') >= ${startMonth}
              AND to_char(date, 'YYYY-MM') <= ${endMonth}
              AND category_id IS NULL
              AND pending = false
              AND amount != 0`;
      const uncatResult = await db.execute(uncatSqlRange);
      const uncatRow = uncatResult.rows?.[0] as { total: unknown } | undefined;
      const uncategorizedTotal = Math.abs(parseFloat(String(uncatRow?.total ?? '0')));

      const data: any[] = rows.map((r) => ({
        categoryId: r.categoryId ?? '',
        categoryName: r.categoryName || 'Uncategorized',
        categoryColor: r.categoryColor || '#6366f1',
        isIncome: r.isIncome || false,
        amount: parseFloat(r.amount.toString()),
      }));

      // Merge income category rows
      for (const r of incomeRows) {
        data.push({
          categoryId: r.categoryId ?? '',
          categoryName: r.categoryName || 'Uncategorized',
          categoryColor: r.categoryColor || '#6366f1',
          isIncome: true,
          amount: parseFloat(r.amount.toString()),
        });
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

    // ── Single-month mode (existing behavior) ───────────────────────────
    const resolvedMonth = month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const prevDate = new Date(parseInt(resolvedMonth.split('-')[0]), parseInt(resolvedMonth.split('-')[1]) - 2, 1);
    const previousMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;

    let currentRows: any[];
    let currentIncomeRows: any[];

    if (accountIdList.length > 0) {
      // Query transactions directly when filtering by account
      currentRows = await db
        .select({
          categoryId: transactions.categoryId,
          amount: sql<string>`SUM(ABS(${transactions.amount}))`,
          transactionCount: sql<number>`COUNT(*)`,
          categoryName: categories.name,
          categoryColor: categories.color,
          isIncome: categories.isIncome,
        })
        .from(transactions)
        .innerJoin(accounts, eq(transactions.accountId, accounts.id))
        .innerJoin(categories, eq(transactions.categoryId, categories.id))
        .where(
          and(
            eq(transactions.userId, session.user.id),
            sql`to_char(${transactions.date}, 'YYYY-MM') = ${resolvedMonth}`,
            eq(categories.excludeFromReports, false),
            inArray(accounts.id, accountIdList),
            eq(transactions.pending, false),
            eq(transactions.ignored, false),
            sql`ABS(${transactions.amount}) > 0`,
          )
        )
        .groupBy(transactions.categoryId, categories.name, categories.color, categories.isIncome);

      // Fetch income categories from transactions
      currentIncomeRows = await db
        .select({
          categoryId: transactions.categoryId,
          amount: sql<string>`SUM(ABS(${transactions.amount}))`,
          transactionCount: sql<number>`COUNT(*)`,
          categoryName: categories.name,
          categoryColor: categories.color,
          isIncome: categories.isIncome,
        })
        .from(transactions)
        .innerJoin(accounts, eq(transactions.accountId, accounts.id))
        .innerJoin(categories, eq(transactions.categoryId, categories.id))
        .where(
          and(
            eq(transactions.userId, session.user.id),
            sql`to_char(${transactions.date}, 'YYYY-MM') = ${resolvedMonth}`,
            eq(categories.excludeFromReports, false),
            eq(categories.isIncome, true),
            inArray(accounts.id, accountIdList),
            eq(transactions.pending, false),
            eq(transactions.ignored, false),
            sql`ABS(${transactions.amount}) > 0`,
          )
        )
        .groupBy(transactions.categoryId, categories.name, categories.color, categories.isIncome);
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

      // Also fetch income categories for current month
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

    // Build uncategorized WHERE clause with optional account filter
    const uncatAccountFilter = accountIdList.length > 0
      ? ` AND account_id IN (${accountIdList.map((id) => `'${id}'`).join(', ')})`
      : '';

    // Fetch uncategorized transactions for current month
    const uncatSql = accountIdList.length > 0
      ? sql`SELECT CAST(COUNT(*) AS INTEGER) as cnt, CAST(COALESCE(SUM(amount), 0) AS REAL) as total
          FROM transactions
          WHERE user_id = ${session.user.id}
            AND to_char(date, 'YYYY-MM') = ${resolvedMonth}
            AND category_id IS NULL
            AND pending = false
            AND amount != 0
            AND account_id IN (${sql.raw(accountIdList.map((id) => `'${id}'`).join(', '))})`
      : sql`SELECT CAST(COUNT(*) AS INTEGER) as cnt, CAST(COALESCE(SUM(amount), 0) AS REAL) as total
          FROM transactions
          WHERE user_id = ${session.user.id}
            AND to_char(date, 'YYYY-MM') = ${resolvedMonth}
            AND category_id IS NULL
            AND pending = false
            AND amount != 0`;

    const uncategorizedResult = await db.execute(uncatSql);
    const uncatRow = uncategorizedResult.rows?.[0] as { cnt: unknown; total: unknown } | undefined;
    let uncategorizedAmount = 0;
    let uncategorizedCount = 0;
    let uncategorizedIsIncome = false;
    if (uncatRow) {
      const cnt = parseInt(String(uncatRow.cnt)) || 0;
      const rawTotal = parseFloat(String(uncatRow.total)) || 0;
      if (cnt > 0 && rawTotal !== 0) {
        uncategorizedAmount = Math.abs(rawTotal);
        uncategorizedCount = cnt;
        uncategorizedIsIncome = rawTotal > 0;
      }
    }

    // Fetch uncategorized transactions for previous month
    const prevUncatSql = accountIdList.length > 0
      ? sql`SELECT CAST(COALESCE(SUM(amount), 0) AS REAL) as total
          FROM transactions
          WHERE user_id = ${session.user.id}
            AND to_char(date, 'YYYY-MM') = ${previousMonth}
            AND category_id IS NULL
            AND pending = false
            AND amount != 0
            AND account_id IN (${sql.raw(accountIdList.map((id) => `'${id}'`).join(', '))})`
      : sql`SELECT CAST(COALESCE(SUM(amount), 0) AS REAL) as total
          FROM transactions
          WHERE user_id = ${session.user.id}
            AND to_char(date, 'YYYY-MM') = ${previousMonth}
            AND category_id IS NULL
            AND pending = false
            AND amount != 0`;

    const prevUncategorizedResult = await db.execute(prevUncatSql);
    const prevUncatRow = prevUncategorizedResult.rows?.[0] as { total: unknown } | undefined;
    const prevUncategorizedAmount = prevUncatRow ? Math.abs(parseFloat(String(prevUncatRow.total)) || 0) : 0;

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

    const previousRows = await db
      .select({
        categoryId: categorySpendingSummary.categoryId,
        amount: categorySpendingSummary.amount,
      })
      .from(categorySpendingSummary)
      .where(
        and(
          eq(categorySpendingSummary.userId, session.user.id),
          eq(categorySpendingSummary.yearMonth, previousMonth)
        )
      );

    // Fetch previous month income categories for change calculation
    const prevIncomeRows = await db
      .select({
        categoryId: categoryIncomeSummary.categoryId,
        amount: categoryIncomeSummary.amount,
      })
      .from(categoryIncomeSummary)
      .where(
        and(
          eq(categoryIncomeSummary.userId, session.user.id),
          eq(categoryIncomeSummary.yearMonth, previousMonth)
        )
      );

    const prevMap = new Map<string, number>();
    for (const row of previousRows) {
      prevMap.set(row.categoryId, parseFloat(row.amount.toString()));
    }
    for (const row of prevIncomeRows) {
      prevMap.set(row.categoryId, parseFloat(row.amount.toString()));
    }
    // Add previous uncategorized amount to prevMap
    if (prevUncategorizedAmount !== 0) {
      prevMap.set('uncategorized', prevUncategorizedAmount);
    }

    const data = currentRows.map((row) => {
      const amount = parseFloat(row.amount.toString());
      const prevAmount = prevMap.get(row.categoryId) || 0;
      const prevAmountNum = prevAmount || 0;
      const change = amount - prevAmountNum;
      const percentChange = prevAmountNum > 0 ? ((amount - prevAmountNum) / prevAmountNum) * 100 : 0;

      return {
        categoryId: row.categoryId ?? '',
        categoryName: row.categoryName || 'Uncategorized',
        categoryColor: row.categoryColor || '#6366f1',
        isIncome: row.isIncome || false,
        amount,
        transactionCount: row.transactionCount,
        previousAmount: prevAmount,
        change,
        percentChange,
      };
    });

    // Map income rows to same data shape
    for (const row of currentIncomeRows) {
      const amount = parseFloat(row.amount.toString());
      const prevAmount = prevMap.get(row.categoryId) || 0;
      const prevAmountNum = prevAmount || 0;
      const change = amount - prevAmountNum;
      const percentChange = prevAmountNum > 0 ? ((amount - prevAmountNum) / prevAmountNum) * 100 : 0;

      data.push({
        categoryId: row.categoryId ?? '',
        categoryName: row.categoryName || 'Uncategorized',
        categoryColor: row.categoryColor || '#6366f1',
        isIncome: true,
        amount,
        transactionCount: row.transactionCount,
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
