import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { accounts, accountSnapshots } from '@/lib/db/schema';
import { eq, and, inArray, asc, sql } from 'drizzle-orm';
import { logger } from '@/lib/logger';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const userId = session.user.id;
  const { searchParams } = new URL(request.url);
  const months = parseInt(searchParams.get('months') || '24', 10);

  const db = getDb();

  try {
    const allAccounts = await db
      .select()
      .from(accounts)
      .where(and(eq(accounts.userId, userId), eq(accounts.isHidden, false)))
      .orderBy(asc(accounts.displayOrder));

    const realEstateAccounts = allAccounts.filter((a) => a.type === 'realestate');
    const mortgageAccounts = allAccounts.filter((a) => a.type === 'mortgage');
    const mortgageMap = new Map(mortgageAccounts.map((m) => [m.id, m]));

    const properties = await Promise.all(
      realEstateAccounts.map(async (property) => {
        const meta = (property.metadata ?? {}) as Record<string, unknown>;
        const linkedMortgageIds = (meta.mortgageAccountIds ?? []) as string[];
        const linkedMortgages = linkedMortgageIds
          .map((id) => mortgageMap.get(id))
          .filter(Boolean) as typeof mortgageAccounts;

        const propertyValue = parseFloat(property.balance.toString());
        const totalMortgageBalance = linkedMortgages.reduce(
          (sum, m) => sum + parseFloat(m.balance.toString()),
          0
        );
        const equity = propertyValue - Math.abs(totalMortgageBalance);
        const ltv = propertyValue > 0 ? (Math.abs(totalMortgageBalance) / propertyValue) * 100 : 0;
        const saleProceeds = propertyValue * 0.92 - Math.abs(totalMortgageBalance);

        const snapshots = await db
          .select({
            snapshotDate: accountSnapshots.snapshotDate,
            balance: accountSnapshots.balance,
            isSynthetic: accountSnapshots.isSynthetic,
          })
          .from(accountSnapshots)
          .where(
            and(
              eq(accountSnapshots.userId, userId),
              eq(accountSnapshots.accountId, property.id),
              sql`${accountSnapshots.snapshotDate} >= CURRENT_DATE - INTERVAL '${sql.raw(String(months))} months'`
            )
          )
          .orderBy(asc(accountSnapshots.snapshotDate));

        const mortgageSnapshots = linkedMortgageIds.length > 0
          ? await db
              .select({ snapshotDate: accountSnapshots.snapshotDate, balance: accountSnapshots.balance, accountId: accountSnapshots.accountId, isSynthetic: accountSnapshots.isSynthetic })
              .from(accountSnapshots)
              .where(
                and(
                  eq(accountSnapshots.userId, userId),
                  inArray(accountSnapshots.accountId, linkedMortgageIds),
                  sql`${accountSnapshots.snapshotDate} >= CURRENT_DATE - INTERVAL '${sql.raw(String(months))} months'`
                )
              )
              .orderBy(asc(accountSnapshots.snapshotDate))
          : [];

        return {
          id: property.id,
          name: property.name,
          value: propertyValue,
          mortgageBalance: Math.abs(totalMortgageBalance),
          manualValue: (meta.manualValue as number) ?? null,
          metadata: meta,
          linkedMortgages: linkedMortgages.map((m) => ({
            id: m.id,
            name: m.name,
            balance: parseFloat(m.balance.toString()),
            originalLoanAmount: parseFloat(String((m.metadata as Record<string, unknown>)?.originalLoanAmount ?? '0')),
            interestRate: parseFloat(String((m.metadata as Record<string, unknown>)?.interestRate ?? '0')),
            monthlyPayment: parseFloat(String((m.metadata as Record<string, unknown>)?.monthlyPayment ?? '0')),
            termMonths: parseInt(String((m.metadata as Record<string, unknown>)?.termMonths ?? '360'), 10),
            metadata: (m.metadata as Record<string, unknown>) ?? {},
          })),
          equity,
          ltv,
          saleProceeds: Math.max(0, saleProceeds),
          snapshots: snapshots.map((s) => ({
            date: s.snapshotDate,
            value: parseFloat(s.balance.toString()),
            isSynthetic: s.isSynthetic,
          })),
          mortgageSnapshots: mortgageSnapshots.map((s) => ({
            date: s.snapshotDate,
            value: parseFloat(s.balance.toString()),
            isSynthetic: s.isSynthetic,
          })),
        };
      })
    );

    const totalValue = properties.reduce((s, p) => s + p.value, 0);
    const totalMortgage = properties.reduce((s, p) => s + p.linkedMortgages.reduce((ms, m) => ms + Math.abs(m.balance), 0), 0);
    const totalEquity = properties.reduce((s, p) => s + p.equity, 0);
    const overallLtv = totalValue > 0 ? (totalMortgage / totalValue) * 100 : 0;

    return NextResponse.json({
      properties,
      summary: {
        totalValue,
        totalMortgage,
        totalEquity,
        overallLtv,
        propertyCount: properties.length,
      },
    });
  } catch (error) {
    logger.error('Error fetching real estate data', { error });
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
