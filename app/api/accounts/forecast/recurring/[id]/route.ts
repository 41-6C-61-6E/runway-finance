import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { recurringStreams } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { getSessionDEK } from '@/lib/crypto-context';
import { encryptField } from '@/lib/crypto';
import { calculateNextExpectedDate } from '@/lib/services/recurring-engine';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const dataUserId = (session.user as any).dataUserId ?? session.user.id;
  const dek = await getSessionDEK();
  const { id } = await params;

  let body: Record<string, any>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const db = getDb();

  try {
    const updateData: Record<string, any> = {
      updatedAt: new Date(),
    };

    if (body.name !== undefined) updateData.name = body.name.trim();
    if (body.payee !== undefined) updateData.payee = body.payee.trim();
    if (body.type !== undefined) updateData.type = body.type;
    if (body.frequency !== undefined) {
      updateData.frequency = body.frequency;
      updateData.intervalDays =
        body.frequency === 'weekly' ? 7 :
        body.frequency === 'biweekly' ? 14 :
        body.frequency === 'semimonthly' ? 15 :
        body.frequency === 'quarterly' ? 91 :
        body.frequency === 'yearly' ? 365 : 30;
    }
    if (body.accountId !== undefined) updateData.accountId = body.accountId || null;
    if (body.categoryId !== undefined) updateData.categoryId = body.categoryId || null;
    if (body.isActive !== undefined) updateData.isActive = !!body.isActive;
    if (body.isConfirmed !== undefined) updateData.isConfirmed = !!body.isConfirmed;
    if (body.isVariableAmount !== undefined) updateData.isVariableAmount = !!body.isVariableAmount;

    if (body.amount !== undefined) {
      const num = parseFloat(body.amount);
      if (!isNaN(num)) {
        updateData.amount = await encryptField(num.toFixed(2), dek);
      }
    }

    if (body.anchorDate !== undefined) updateData.anchorDate = body.anchorDate;
    if (body.nextExpectedDate !== undefined) {
      updateData.nextExpectedDate = body.nextExpectedDate;
    } else if (body.anchorDate !== undefined || body.frequency !== undefined) {
      const freq = body.frequency || 'monthly';
      const anchor = body.anchorDate || new Date().toISOString().split('T')[0];
      updateData.nextExpectedDate = calculateNextExpectedDate(anchor, freq);
    }

    const [updated] = await db
      .update(recurringStreams)
      .set(updateData)
      .where(and(eq(recurringStreams.id, id), eq(recurringStreams.userId, dataUserId)))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, item: updated });
  } catch (error) {
    logger.error('Failed to update recurring stream', { id, error });
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

  const dataUserId = (session.user as any).dataUserId ?? session.user.id;
  const { id } = await params;

  const db = getDb();

  try {
    const deleted = await db
      .delete(recurringStreams)
      .where(and(eq(recurringStreams.id, id), eq(recurringStreams.userId, dataUserId)))
      .returning();

    return NextResponse.json({ success: true, deletedCount: deleted.length });
  } catch (error) {
    logger.error('Failed to delete recurring stream', { id, error });
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
