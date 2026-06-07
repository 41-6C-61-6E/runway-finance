import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { investmentTransactions } from '@/lib/db/schema';
import { and, eq, desc } from 'drizzle-orm';
import { syncInvestmentPrices } from '@/lib/services/investments';
import { logger } from '@/lib/logger';

const LOG_TAG = '[api-investments-transactions]';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const userId = session.user.id;
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('accountId');

    const db = getDb();

    const conditions = [eq(investmentTransactions.userId, userId)];
    if (accountId) {
      conditions.push(eq(investmentTransactions.accountId, accountId));
    }

    const txns = await db
      .select()
      .from(investmentTransactions)
      .where(and(...conditions))
      .orderBy(desc(investmentTransactions.transactionDate));

    return NextResponse.json(txns);
  } catch (err) {
    logger.error(`${LOG_TAG} GET failed`, { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const userId = session.user.id;
    const body = await request.json();
    const {
      accountId,
      ticker,
      type,
      shares,
      pricePerShare,
      commission,
      transactionDate,
      notes,
    } = body;

    if (!accountId || !ticker || !type || shares === undefined || pricePerShare === undefined || !transactionDate) {
      return NextResponse.json({ error: 'missing_required_fields' }, { status: 400 });
    }

    const db = getDb();

    const [txn] = await db
      .insert(investmentTransactions)
      .values({
        userId,
        accountId,
        ticker: ticker.toUpperCase().trim(),
        type,
        shares: String(shares),
        pricePerShare: String(pricePerShare),
        commission: commission !== undefined ? String(commission) : '0',
        transactionDate,
        notes: notes || null,
      })
      .returning();

    // Recalculate portfolio synthetic snapshots in background
    syncInvestmentPrices(userId).catch(err => {
      logger.warn(`${LOG_TAG} Background sync failed:`, err);
    });

    return NextResponse.json(txn);
  } catch (err) {
    logger.error(`${LOG_TAG} POST failed`, { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
