import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { budgets, categories, categorySpendingSummary } from '@/lib/db/schema';
import { eq, and, or, isNull, sql } from 'drizzle-orm';
import { logger } from '@/lib/logger';

function getPeriodBounds(periodType: string, periodKey: string | null, now: Date) {
  if (periodKey) {
    if (periodType === 'monthly') {
      const [y, m] = periodKey.split('-').map(Number);
      return {
        yearMonth: periodKey,
        startDate: `${periodKey}-01`,
        endDate: new Date(y, m, 0).toISOString().split('T')[0],
        label: periodKey,
      };
    }
    if (periodType === 'quarterly') {
      const [y, q] = periodKey.split('-Q').map(Number);
      const startMonth = (q - 1) * 3 + 1;
      const endMonth = q * 3;
      return {
        yearMonth: `${y}-Q${q}`,
        startDate: `${y}-${String(startMonth).padStart(2, '0')}-01`,
        endDate: new Date(y, endMonth, 0).toISOString().split('T')[0],
        label: periodKey,
      };
    }
    if (periodType === 'yearly') {
      return {
        yearMonth: periodKey,
        startDate: `${periodKey}-01-01`,
        endDate: `${periodKey}-12-31`,
        label: periodKey,
      };
    }
  }

  if (periodType === 'quarterly') {
    const q = Math.floor(now.getMonth() / 3) + 1;
    const y = now.getFullYear();
    const startMonth = (q - 1) * 3;
    return {
      yearMonth: `${y}-Q${q}`,
      startDate: `${y}-${String(startMonth + 1).padStart(2, '0')}-01`,
      endDate: new Date(y, startMonth + 3, 0).toISOString().split('T')[0],
      label: `${y}-Q${q}`,
    };
  }
  if (periodType === 'yearly') {
    const y = now.getFullYear();
    return {
      yearMonth: String(y),
      startDate: `${y}-01-01`,
      endDate: `${y}-12-31`,
      label: String(y),
    };
  }

  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return {
    yearMonth: ym,
    startDate: `${ym}-01`,
    endDate: new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0],
    label: ym,
  };
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

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
          periodType ? eq(budgets.periodType, periodType) : undefined,
        )
      );

    let actualSpending: Array<{ categoryId: string; amount: string }> = [];
    const categoryIds = budgetRows.map((b) => b.categoryId).filter(Boolean);

    if (categoryIds.length > 0) {
      if (periodType === 'quarterly') {
        const [y, q] = bounds.yearMonth.split('-Q').map(Number);
        const months = [];
        for (let m = (q - 1) * 3 + 1; m <= q * 3; m++) {
          months.push(`${y}-${String(m).padStart(2, '0')}`);
        }
        actualSpending = await db
          .select({
            categoryId: categorySpendingSummary.categoryId,
            amount: sql<string>`SUM(${categorySpendingSummary.amount})`,
          })
          .from(categorySpendingSummary)
          .where(
            and(
              eq(categorySpendingSummary.userId, session.user.id),
              sql`${categorySpendingSummary.yearMonth} IN ${sql.raw(`(${months.map((m) => `'${m}'`).join(',')})`)}`,
              sql`${categorySpendingSummary.categoryId} IN ${sql.raw(`(${categoryIds.map((c) => `'${c}'`).join(',')})`)}`,
            )
          )
          .groupBy(categorySpendingSummary.categoryId);
      } else if (periodType === 'yearly') {
        actualSpending = await db
          .select({
            categoryId: categorySpendingSummary.categoryId,
            amount: sql<string>`SUM(${categorySpendingSummary.amount})`,
          })
          .from(categorySpendingSummary)
          .where(
            and(
              eq(categorySpendingSummary.userId, session.user.id),
              sql`${categorySpendingSummary.yearMonth} LIKE ${bounds.yearMonth + '%'}`,
              sql`${categorySpendingSummary.categoryId} IN ${sql.raw(`(${categoryIds.map((c) => `'${c}'`).join(',')})`)}`,
            )
          )
          .groupBy(categorySpendingSummary.categoryId);
      } else {
        actualSpending = await db
          .select({
            categoryId: categorySpendingSummary.categoryId,
            amount: categorySpendingSummary.amount,
          })
          .from(categorySpendingSummary)
          .where(
            and(
              eq(categorySpendingSummary.userId, session.user.id),
              eq(categorySpendingSummary.yearMonth, bounds.yearMonth),
              sql`${categorySpendingSummary.categoryId} IN ${sql.raw(`(${categoryIds.map((c) => `'${c}'`).join(',')})`)}`,
            )
          );
      }
    }

    const actualMap = new Map<string, number>();
    for (const row of actualSpending) {
      actualMap.set(row.categoryId, parseFloat(row.amount.toString()));
    }

    const data = budgetRows.map((row) => {
      const budgeted = parseFloat(row.amount.toString());
      const actual = actualMap.get(row.categoryId) || 0;
      const remaining = budgeted - actual;
      const percentUsed = budgeted > 0 ? (actual / budgeted) * 100 : 0;

      return {
        id: row.id,
        categoryId: row.categoryId,
        categoryName: row.categoryName || 'Uncategorized',
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
      };
    });

    const result: Record<string, unknown> = { budgets: data, period: bounds };

    if (includeCategories) {
      const allCategories = await db
        .select({ id: categories.id, name: categories.name, color: categories.color })
        .from(categories)
        .where(eq(categories.userId, session.user.id));
      result.categories = allCategories;
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

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const db = getDb();
  try {
    const [budget] = await db
      .insert(budgets)
      .values({
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
      })
      .returning();

    return NextResponse.json(budget, { status: 201 });
  } catch (error) {
    logger.error('Error creating budget', { error });
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
