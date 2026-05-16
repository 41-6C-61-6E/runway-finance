import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { budgets } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { getSessionDEK } from '@/lib/crypto-context';
import { encryptRow } from '@/lib/crypto';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await params;
  const userId = session.user.id;
  const dek = await getSessionDEK();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const db = getDb();
  const [existing] = await db
    .select()
    .from(budgets)
    .where(and(eq(budgets.id, id), eq(budgets.userId, userId)))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  let updateData: Record<string, unknown> = {};
  if (body.categoryId !== undefined) updateData.categoryId = body.categoryId;
  if (body.periodType !== undefined) updateData.periodType = body.periodType;
  if (body.amount !== undefined) updateData.amount = String(body.amount);
  if (body.isRecurring !== undefined) updateData.isRecurring = body.isRecurring;
  if (body.periodKey !== undefined) {
    updateData.yearMonth = body.periodKey || null;
    updateData.periodKey = body.periodKey || null;
  }
  if (body.fundingAccountId !== undefined) updateData.fundingAccountId = body.fundingAccountId || null;
  if (body.rollover !== undefined) updateData.rollover = body.rollover;
  if (body.notes !== undefined) updateData.notes = body.notes || null;
  updateData.updatedAt = new Date();

  updateData = await encryptRow('budgets', updateData, dek);

  try {
    const [updated] = await db
      .update(budgets)
      .set(updateData)
      .where(eq(budgets.id, id))
      .returning();
    return NextResponse.json(updated);
  } catch (error) {
    logger.error('Error updating budget', { error });
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await params;
  const userId = session.user.id;

  const db = getDb();
  const [existing] = await db
    .select()
    .from(budgets)
    .where(and(eq(budgets.id, id), eq(budgets.userId, userId)))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  try {
    await db.delete(budgets).where(eq(budgets.id, id));
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Error deleting budget', { error });
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
