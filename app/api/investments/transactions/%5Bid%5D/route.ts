import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { investmentTransactions } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { syncInvestmentPrices } from '@/lib/services/investments';
import { logger } from '@/lib/logger';

const LOG_TAG = '[api-investments-transactions-id]';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const userId = session.user.id;
    const body = await request.json();
    const { ticker, type, shares, pricePerShare, commission, transactionDate, notes } = body;

    const db = getDb();

    const updateFields: any = {
      updatedAt: new Date(),
    };

    if (ticker !== undefined) updateFields.ticker = ticker.toUpperCase().trim();
    if (type !== undefined) updateFields.type = type;
    if (shares !== undefined) updateFields.shares = String(shares);
    if (pricePerShare !== undefined) updateFields.pricePerShare = String(pricePerShare);
    if (commission !== undefined) updateFields.commission = String(commission);
    if (transactionDate !== undefined) updateFields.transactionDate = transactionDate;
    if (notes !== undefined) updateFields.notes = notes || null;

    const [updatedTxn] = await db
      .update(investmentTransactions)
      .set(updateFields)
      .where(and(eq(investmentTransactions.id, id), eq(investmentTransactions.userId, userId)))
      .returning();

    if (!updatedTxn) {
      return NextResponse.json({ error: 'transaction_not_found' }, { status: 404 });
    }

    // Trigger price and snapshots recalculation in the background
    syncInvestmentPrices(userId).catch(err => {
      logger.warn(`${LOG_TAG} Background sync failed:`, err);
    });

    return NextResponse.json(updatedTxn);
  } catch (err) {
    logger.error(`${LOG_TAG} PATCH failed`, { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const userId = session.user.id;
    const db = getDb();

    const [deletedTxn] = await db
      .delete(investmentTransactions)
      .where(and(eq(investmentTransactions.id, id), eq(investmentTransactions.userId, userId)))
      .returning();

    if (!deletedTxn) {
      return NextResponse.json({ error: 'transaction_not_found' }, { status: 404 });
    }

    // Recalculate portfolio synthetic snapshots in background
    syncInvestmentPrices(userId).catch(err => {
      logger.warn(`${LOG_TAG} Background sync failed:`, err);
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error(`${LOG_TAG} DELETE failed`, { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
