import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { investmentHoldings } from '@/lib/db/schema';
import { getPortfolioHoldings, syncInvestmentPrices } from '@/lib/services/investments';
import { getFinancialProvider } from '@/lib/services/financial-provider';
import { logger } from '@/lib/logger';

const LOG_TAG = '[api-investments-holdings]';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const userId = session.user.id;
    const portfolio = await getPortfolioHoldings(userId);
    return NextResponse.json(portfolio);
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
    const { accountId, ticker, shares, costBasis, purchaseDate, notes } = body;

    if (!accountId || !ticker || shares === undefined || costBasis === undefined) {
      return NextResponse.json({ error: 'missing_required_fields' }, { status: 400 });
    }

    const db = getDb();
    
    // Insert new manual position
    const [holding] = await db
      .insert(investmentHoldings)
      .values({
        userId,
        accountId,
        ticker: ticker.toUpperCase().trim(),
        shares: String(shares),
        costBasis: String(costBasis),
        purchaseDate: purchaseDate || null,
        notes: notes || null,
      })
      .returning();

    // Trigger price and metadata sync in the background for this user
    syncInvestmentPrices(userId).catch(err => {
      logger.warn(`${LOG_TAG} Background sync failed:`, err);
    });

    return NextResponse.json(holding);
  } catch (err) {
    logger.error(`${LOG_TAG} POST failed`, { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
