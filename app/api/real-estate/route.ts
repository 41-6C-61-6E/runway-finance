import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { accounts, accountSnapshots } from '@/lib/db/schema';
import { eq, and, inArray, asc, sql } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptField, decryptRows } from '@/lib/crypto';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const userId = session.user.id;
  const dek = await getSessionDEK();
  const { searchParams } = new URL(request.url);
  const months = parseInt(searchParams.get('months') || '24', 10);

  const db = getDb();

  try {
    const allAccounts = await db
      .select()
      .from(accounts)
      .where(and(eq(accounts.userId, userId), eq(accounts.isHidden, false)))
      .orderBy(asc(accounts.displayOrder));

    // Decrypt all accounts
    const decryptedAccounts = await decryptRows('accounts', allAccounts, dek);

    const realEstateAccounts = decryptedAccounts.filter((a: any) => a.type === 'realestate');
    const mortgageAccounts = decryptedAccounts.filter((a: any) => a.type === 'mortgage');
    const mortgageMap = new Map(mortgageAccounts.map((m: any) => [m.id, m]));

    const properties = await Promise.all(
      realEstateAccounts.map(async (property: any) => {
        const meta: Record<string, unknown> = property.metadata
          ? (typeof property.metadata === 'string' ? JSON.parse(property.metadata) : property.metadata)
          : {};
        const linkedMortgageIds = (meta.mortgageAccountIds ?? []) as string[];
        const linkedMortgages = linkedMortgageIds
          .map((id) => mortgageMap.get(id))
          .filter(Boolean) as any[];

        const propertyValue = parseFloat(property.balance);
        const totalMortgageBalance = linkedMortgages.reduce(
          (sum, m) => sum + parseFloat(m.balance),
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

        const decryptedSnapshots = await Promise.all(snapshots.map(async (s) => ({
          date: s.snapshotDate,
          value: parseFloat(await decryptField(s.balance, dek)),
          isSynthetic: s.isSynthetic,
        })));

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

        const decryptedMortgageSnapshots = await Promise.all(mortgageSnapshots.map(async (s) => ({
          date: s.snapshotDate,
          value: parseFloat(await decryptField(s.balance, dek)),
          isSynthetic: s.isSynthetic,
        })));

        return {
          id: property.id,
          name: property.name,
          value: propertyValue,
          mortgageBalance: Math.abs(totalMortgageBalance),
          manualValue: (meta.manualValue as number) ?? null,
          metadata: meta,
          linkedMortgages: linkedMortgages.map((m: any) => {
            const mortgageMeta: Record<string, unknown> = m.metadata
              ? (typeof m.metadata === 'string' ? JSON.parse(m.metadata) : m.metadata)
              : {};
            return {
              id: m.id,
              name: m.name,
              balance: parseFloat(m.balance),
              originalLoanAmount: parseFloat(String(mortgageMeta?.originalLoanAmount ?? '0')),
              interestRate: parseFloat(String(mortgageMeta?.interestRate ?? '0')),
              monthlyPayment: parseFloat(String(mortgageMeta?.monthlyPayment ?? '0')),
              termMonths: parseInt(String(mortgageMeta?.termMonths ?? '360'), 10),
              metadata: mortgageMeta ?? {},
            };
          }),
          equity,
          ltv,
          saleProceeds: Math.max(0, saleProceeds),
          snapshots: decryptedSnapshots,
          mortgageSnapshots: decryptedMortgageSnapshots,
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
