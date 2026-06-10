import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { accounts, holdingSnapshots } from '@/lib/db/schema';
import { eq, and, gte, lte, inArray, asc } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptRows } from '@/lib/crypto';
import { isInvestmentAccount } from '@/lib/utils/account-scope';

const LOG_TAG = '[api-investments-holding-history]';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const dataUserId = (session.user as any).dataUserId ?? session.user.id;
  const dek = await getSessionDEK();
  const { searchParams } = new URL(request.url);

  // Optional filters
  const ticker = searchParams.get('ticker'); // e.g. "VTI"
  const securityId = searchParams.get('securityId');
  const days = Math.min(parseInt(searchParams.get('days') ?? '30', 10), 365);

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const startStr = startDate.toISOString().split('T')[0];

  try {
    // Get all user investment accounts
    const userAccounts = await getDb()
      .select()
      .from(accounts)
      .where(eq(accounts.userId, dataUserId));

    const decryptedAccounts = await decryptRows('accounts', userAccounts, dek);
    const investmentAccounts = decryptedAccounts.filter((acc) =>
      isInvestmentAccount(acc.type)
    );

    if (investmentAccounts.length === 0) {
      return NextResponse.json({ history: [] });
    }

    const accountIds = investmentAccounts.map((acc) => acc.id);

    // Build where conditions
    const conditions = [
      eq(holdingSnapshots.userId, dataUserId),
      inArray(holdingSnapshots.accountId, accountIds),
      gte(holdingSnapshots.snapshotDate, startStr),
    ];

    if (ticker) {
      conditions.push(eq(holdingSnapshots.ticker, ticker));
    }
    if (securityId) {
      conditions.push(eq(holdingSnapshots.securityId, securityId));
    }

    const rawSnapshots = await getDb()
      .select()
      .from(holdingSnapshots)
      .where(and(...conditions))
      .orderBy(asc(holdingSnapshots.snapshotDate));

    if (rawSnapshots.length === 0) {
      return NextResponse.json({ history: [] });
    }

    const decryptedSnapshots = await decryptRows('holding_snapshots', rawSnapshots, dek);

    // Group by ticker/securityId, each with a date-series
    const grouped: Record<string, { ticker: string | null; name: string | null; points: { date: string; price: number; value: number }[] }> = {};

    for (const snap of decryptedSnapshots) {
      const key = snap.ticker || snap.securityId;
      if (!grouped[key]) {
        grouped[key] = {
          ticker: snap.ticker ?? null,
          name: snap.name ?? null,
          points: [],
        };
      }
      grouped[key].points.push({
        date: String(snap.snapshotDate),
        price: parseFloat(snap.price) || 0,
        value: parseFloat(snap.value) || 0,
      });
    }

    const history = Object.entries(grouped).map(([key, { ticker: t, name, points }]) => ({
      key,
      ticker: t,
      name,
      points,
    }));

    return NextResponse.json({ history });
  } catch (error) {
    logger.error(`${LOG_TAG} Error fetching holding history`, {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: 'internal_error', message: 'Failed to fetch holding history' },
      { status: 500 }
    );
  }
}
