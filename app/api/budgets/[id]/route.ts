import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { budgets, categories } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { getSessionDEK } from '@/lib/crypto-context';
import { encryptRow } from '@/lib/crypto';
import { formatToCents } from '@/lib/services/account-history';

function getPreviousPeriodKey(periodType: string, periodKey: string): string {
  if (periodType === 'monthly') {
    const [y, m] = periodKey.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 2, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  }
  if (periodType === 'quarterly') {
    const [y, q] = periodKey.split('-Q').map(Number);
    if (q === 1) return `${y - 1}-Q4`;
    return `${y}-Q${q - 1}`;
  }
  return String(Number(periodKey) - 1);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await params;
  const dataUserId = (session.user as any).dataUserId ?? session.user.id;
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
    .where(and(eq(budgets.id, id), eq(budgets.userId, dataUserId)))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const targetCategoryId = (body.categoryId as string) || existing.categoryId;
  if (typeof body.isDiscretionary === 'boolean' && targetCategoryId) {
    await db
      .update(categories)
      .set({ isDiscretionary: body.isDiscretionary })
      .where(and(eq(categories.id, targetCategoryId), eq(categories.userId, dataUserId)));
  }

  const applyMode = (body.applyMode as string) || 'future';
  const currentPeriodKey = (body.periodKey as string) || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const periodType = (body.periodType as string) || existing.periodType;

  if (existing.isRecurring && applyMode === 'future' && body.amount !== undefined) {
    const existingFrom = existing.effectiveFrom || '1970-01';
    if (existingFrom < currentPeriodKey) {
      const prevPeriod = getPreviousPeriodKey(periodType, currentPeriodKey);
      await db
        .update(budgets)
        .set({ effectiveTo: prevPeriod, updatedAt: new Date() })
        .where(eq(budgets.id, id));

      const newEncryptedData = await encryptRow('budgets', {
        userId: dataUserId,
        categoryId: targetCategoryId,
        periodType: periodType,
        yearMonth: null,
        periodKey: null,
        effectiveFrom: currentPeriodKey,
        effectiveTo: null,
        amount: formatToCents(parseFloat(String(body.amount)) || 0),
        isRecurring: true,
        fundingAccountId: (body.fundingAccountId as string) ?? existing.fundingAccountId,
        rollover: body.rollover !== undefined ? body.rollover === true : existing.rollover,
        notes: (body.notes as string) ?? existing.notes,
      }, dek);

      const [newBudget] = await db.insert(budgets).values(newEncryptedData).returning();
      return NextResponse.json(newBudget);
    }
  }

  let updateData: Record<string, unknown> = {};
  if (body.categoryId !== undefined) updateData.categoryId = body.categoryId;
  if (body.periodType !== undefined) updateData.periodType = body.periodType;
  if (body.amount !== undefined) updateData.amount = formatToCents(parseFloat(String(body.amount)) || 0);
  if (body.isRecurring !== undefined) updateData.isRecurring = body.isRecurring;
  if (body.periodKey !== undefined) {
    updateData.yearMonth = body.isRecurring ? null : body.periodKey;
    updateData.periodKey = body.isRecurring ? null : body.periodKey;
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
  const dataUserId = (session.user as any).dataUserId ?? session.user.id;

  const db = getDb();
  const [existing] = await db
    .select()
    .from(budgets)
    .where(and(eq(budgets.id, id), eq(budgets.userId, dataUserId)))
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
