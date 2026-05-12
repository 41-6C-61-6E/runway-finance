import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { accounts, budgets, categories, transactions } from '@/lib/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { logger } from '@/lib/logger';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const userId = session.user.id;
  const { searchParams } = new URL(request.url);
  const months = parseInt(searchParams.get('months') || '6', 10);

  const db = getDb();

  try {
    const userAccounts = await db
      .select()
      .from(accounts)
      .where(and(eq(accounts.userId, userId), eq(accounts.isHidden, false)));

    const fundingAccountIds = userAccounts
      .filter((a) => ['checking', 'savings'].includes(a.type))
      .map((a) => a.id);

    if (fundingAccountIds.length === 0) {
      return NextResponse.json({ forecast: [], accounts: [] });
    }

    const budgetRows = await db
      .select({
        id: budgets.id,
        amount: budgets.amount,
        periodType: budgets.periodType,
        isRecurring: budgets.isRecurring,
        fundingAccountId: budgets.fundingAccountId,
        categoryName: categories.name,
      })
      .from(budgets)
      .leftJoin(categories, eq(budgets.categoryId, categories.id))
      .where(
        and(
          eq(budgets.userId, userId),
          sql`${budgets.fundingAccountId} IS NOT NULL`,
          eq(budgets.isRecurring, true),
        )
      );

    const now = new Date();
    const monthlyIncome = await db
      .select({
        accountId: transactions.accountId,
        total: sql<string>`SUM(${transactions.amount})`,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          sql`${transactions.date} >= CURRENT_DATE - INTERVAL '3 months'`,
          sql`${transactions.amount} > 0`,
        )
      )
      .groupBy(transactions.accountId);

    const avgMonthlyIncome = new Map<string, number>();
    for (const row of monthlyIncome) {
      avgMonthlyIncome.set(row.accountId, parseFloat(row.total.toString()) / 3);
    }

    const forecastMonths: Array<{
      month: string;
      label: string;
      accounts: Array<{
        accountId: string;
        accountName: string;
        startingBalance: number;
        projectedBalance: number;
        inflows: number;
        outflows: number;
      }>;
    }> = [];

    for (let i = 0; i < months; i++) {
      const forecastDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const ym = `${forecastDate.getFullYear()}-${String(forecastDate.getMonth() + 1).padStart(2, '0')}`;
      const label = forecastDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

      const accountProjections = userAccounts
        .filter((a) => ['checking', 'savings'].includes(a.type))
        .map((acc) => {
          const startingBalance = i === 0
            ? parseFloat(acc.balance.toString())
            : 0;

          const budgetedOutflows = budgetRows
            .filter((b) => b.fundingAccountId === acc.id)
            .reduce((sum, b) => {
              let monthlyAmount = parseFloat(b.amount.toString());
              if (b.periodType === 'quarterly') monthlyAmount /= 3;
              if (b.periodType === 'yearly') monthlyAmount /= 12;
              return sum + monthlyAmount;
            }, 0);

          const estInflows = avgMonthlyIncome.get(acc.id) || 0;

          return {
            accountId: acc.id,
            accountName: acc.name,
            startingBalance,
            projectedBalance: startingBalance + estInflows - budgetedOutflows,
            inflows: estInflows,
            outflows: budgetedOutflows,
          };
        });

      for (const proj of accountProjections) {
        proj.startingBalance = i === 0
          ? parseFloat(userAccounts.find((a) => a.id === proj.accountId)?.balance.toString() || '0')
          : forecastMonths[i - 1].accounts.find((a) => a.accountId === proj.accountId)?.projectedBalance || 0;
        proj.projectedBalance = proj.startingBalance + proj.inflows - proj.outflows;
      }

      forecastMonths.push({
        month: ym,
        label,
        accounts: accountProjections,
      });
    }

    return NextResponse.json({
      forecast: forecastMonths,
      accounts: userAccounts.filter((a) => ['checking', 'savings'].includes(a.type)).map((a) => ({
        id: a.id,
        name: a.name,
        balance: parseFloat(a.balance.toString()),
        type: a.type,
      })),
    });
  } catch (error) {
    logger.error('Error generating forecast', { error });
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
