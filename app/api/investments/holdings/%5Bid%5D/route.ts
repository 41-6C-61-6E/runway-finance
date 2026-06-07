import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { investmentHoldings } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { syncInvestmentPrices } from '@/lib/services/investments';
import { logger } from '@/lib/logger';

const LOG_TAG = '[api-investments-holdings-id]';

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
    const { shares, costBasis, purchaseDate, notes } = body;

    const db = getDb();

    const updateFields: any = {
      updatedAt: new Date(),
    };

    if (shares !== undefined) updateFields.shares = String(shares);
    if (costBasis !== undefined) updateFields.costBasis = String(costBasis);
    if (purchaseDate !== undefined) updateFields.purchaseDate = purchaseDate || null;
    if (notes !== undefined) updateFields.notes = notes || null;

    const [updatedHolding] = await db
      .update(investmentHoldings)
      .set(updateFields)
      .where(and(eq(investmentHoldings.id, id), eq(investmentHoldings.userId, userId)))
      .returning();

    if (!updatedHolding) {
      return NextResponse.json({ error: 'holding_not_found' }, { status: 404 });
    }

    // Trigger price and snapshots recalculation in the background
    syncInvestmentPrices(userId).catch(err => {
      logger.warn(`${LOG_TAG} Background sync failed:`, err);
    });

    return NextResponse.json(updatedHolding);
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

    const [deletedHolding] = await db
      .delete(investmentHoldings)
      .where(and(eq(investmentHoldings.id, id), eq(investmentHoldings.userId, userId)))
      .returning();

    if (!deletedHolding) {
      return NextResponse.json({ error: 'holding_not_found' }, { status: 404 });
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
