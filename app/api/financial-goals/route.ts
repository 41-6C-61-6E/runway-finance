import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { logger } from '@/lib/logger';
import { financialGoals } from '@/lib/db/schema';
import { eq, and, asc, desc } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const type = searchParams.get('type');

  const conditions = [eq(financialGoals.userId, session.user.id)];
  if (status) conditions.push(eq(financialGoals.status, status));
  if (type) conditions.push(eq(financialGoals.type, type));

  const goals = await getDb()
    .select()
    .from(financialGoals)
    .where(and(...conditions))
    .orderBy(asc(financialGoals.priority), desc(financialGoals.targetDate));

  logger.info('GET /api/financial-goals', { count: goals.length, status, type });
  return NextResponse.json(goals);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { name, description, type, targetAmount, currentAmount, targetDate, category, priority, status, linkedAccountId, percentage, reserve } = body;

    if (!name || !type || !targetAmount) {
      return NextResponse.json({ error: 'name, type, and targetAmount are required' }, { status: 400 });
    }

    const goal = await getDb().insert(financialGoals).values({
      userId: session.user.id,
      name,
      description: description || null,
      type,
      targetAmount: String(targetAmount),
      currentAmount: String(currentAmount || 0),
      targetDate: targetDate || null,
      category: category || null,
      priority: priority || 0,
      status: status || 'active',
      linkedAccountId: linkedAccountId || null,
      percentage: percentage != null ? String(percentage) : '100',
      reserve: reserve != null ? String(reserve) : '0',
    }).returning();

    logger.info('POST /api/financial-goals', { goalId: goal[0].id });
    return NextResponse.json(goal[0], { status: 201 });
  } catch (err) {
    logger.error('POST /api/financial-goals', { error: err });
    return NextResponse.json({ error: 'Failed to create goal' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);

  try {
    const body = await req.json();
    const { id, ...updates } = body;

    const goalId = id || searchParams.get('id');

    if (!goalId) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const existing = await getDb()
      .select()
      .from(financialGoals)
      .where(and(
        eq(financialGoals.id, goalId),
        eq(financialGoals.userId, session.user.id)
      ))
      .limit(1);

    if (!existing[0]) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
    }

    const updated = await getDb()
      .update(financialGoals)
      .set({
        ...updates,
        targetAmount: updates.targetAmount !== undefined ? String(updates.targetAmount) : undefined,
        currentAmount: updates.currentAmount !== undefined ? String(updates.currentAmount) : undefined,
        targetDate: updates.targetDate || null,
        percentage: updates.percentage !== undefined ? String(updates.percentage) : undefined,
        reserve: updates.reserve !== undefined ? String(updates.reserve) : undefined,
        updatedAt: new Date(),
      })
      .where(eq(financialGoals.id, goalId))
      .returning();

    logger.info('PATCH /api/financial-goals', { goalId: id });
    return NextResponse.json(updated[0]);
  } catch (err) {
    logger.error('PATCH /api/financial-goals', { error: err });
    return NextResponse.json({ error: 'Failed to update goal' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const existing = await getDb()
      .select()
      .from(financialGoals)
      .where(and(
        eq(financialGoals.id, id),
        eq(financialGoals.userId, session.user.id)
      ))
      .limit(1);

    if (!existing[0]) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
    }

    await getDb()
      .delete(financialGoals)
      .where(eq(financialGoals.id, id));

    logger.info('DELETE /api/financial-goals', { goalId: id });
    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error('DELETE /api/financial-goals', { error: err });
    return NextResponse.json({ error: 'Failed to delete goal' }, { status: 500 });
  }
}
