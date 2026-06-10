import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { logger } from '@/lib/logger';
import { financialGoals } from '@/lib/db/schema';
import { eq, and, asc, desc } from 'drizzle-orm';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptRow, decryptRows, encryptRow } from '@/lib/crypto';
import { computeGoalAllocations, findSharedAccounts, getGoalAllocation } from '@/lib/services/goal-allocation';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const dek = await getSessionDEK();
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const type = searchParams.get('type');
  const userId = session.user.id;
  const dataUserId = (session.user as any).dataUserId ?? session.user.id;

  const conditions = [eq(financialGoals.userId, dataUserId)];
  if (status) conditions.push(eq(financialGoals.status, status));
  if (type) conditions.push(eq(financialGoals.type, type));

  const goals = await getDb()
    .select()
    .from(financialGoals)
    .where(and(...conditions))
    .orderBy(asc(financialGoals.sortOrder));

  const decrypted = await decryptRows('financial_goals', goals, dek);
  
  // Compute allocations for goals with linked accounts
  const allocationMap = new Map<string, any>();
  try {
    const allocation = await computeGoalAllocations(dataUserId);
    for (const account of allocation.accounts) {
      for (const goal of account.goals) {
        allocationMap.set(goal.goalId, goal);
      }
    }
  } catch (err) {
    logger.error('GET /api/financial-goals allocation', { error: err });
  }

  // Enrich goals with allocation data
  const enriched = decrypted.map(goal => {
    const alloc = allocationMap.get(goal.id);
    return {
      ...goal,
      allocatedAmount: alloc?.allocatedAmount ?? parseFloat(goal.currentAmount),
      isUnderfunded: alloc?.isUnderfunded ?? false,
      accountBalance: alloc?.accountBalance ?? null,
      accountName: alloc?.accountName ?? null,
      remainingOnAccount: alloc?.remainingOnAccount ?? null,
    };
  });

  logger.info('GET /api/financial-goals', { count: enriched.length, status, type });
  return NextResponse.json(enriched);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const dek = await getSessionDEK();
    const body = await req.json();
    const userId = session.user.id;
    const dataUserId = (session.user as any).dataUserId ?? session.user.id;
    const { name, description, type, targetAmount, currentAmount, targetDate, category, priority, status, linkedAccountId, percentage, reserve, sortOrder } = body;

    if (!name || !type || !targetAmount) {
      return NextResponse.json({ error: 'name, type, and targetAmount are required' }, { status: 400 });
    }

    const encryptedValues = await encryptRow('financial_goals', {
      userId: dataUserId,
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
      sortOrder: sortOrder != null ? Number(sortOrder) : 0,
    }, dek);

    const goal = await getDb().insert(financialGoals).values(encryptedValues).returning();
    const decrypted = await decryptRow('financial_goals', goal[0], dek);

    logger.info('POST /api/financial-goals', { goalId: goal[0].id });
    return NextResponse.json(decrypted, { status: 201 });
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
    const dek = await getSessionDEK();
    const body = await req.json();
    const userId = session.user.id;
    const dataUserId = (session.user as any).dataUserId ?? session.user.id;
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
        eq(financialGoals.userId, dataUserId)
      ))
      .limit(1);

    if (!existing[0]) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.targetAmount !== undefined) updateData.targetAmount = String(updates.targetAmount);
    if (updates.currentAmount !== undefined) updateData.currentAmount = String(updates.currentAmount);
    if (updates.targetDate !== undefined) updateData.targetDate = updates.targetDate || null;
    if (updates.percentage !== undefined) updateData.percentage = String(updates.percentage);
    if (updates.reserve !== undefined) updateData.reserve = String(updates.reserve);
    if (updates.status !== undefined) updateData.status = updates.status;
    if (updates.priority !== undefined) updateData.priority = updates.priority;
    if (updates.sortOrder !== undefined) updateData.sortOrder = Number(updates.sortOrder);
    if (updates.linkedAccountId !== undefined) updateData.linkedAccountId = updates.linkedAccountId || null;

    // When marking as completed, persist the current allocation so the release logic can read it
    if (updates.status === 'completed' && existing[0].linkedAccountId) {
      try {
        const currentAllocation = await getGoalAllocation(goalId, dataUserId);
        if (currentAllocation) {
          updateData.allocatedAmount = String(currentAllocation.allocatedAmount);
        }
      } catch {
        // If allocation computation fails, continue without persisting
      }
    }

    const encrypted = await encryptRow('financial_goals', updateData, dek);
    const updated = await getDb()
      .update(financialGoals)
      .set({
        ...encrypted,
        updatedAt: new Date(),
      })
      .where(eq(financialGoals.id, goalId))
      .returning();

    logger.info('PATCH /api/financial-goals', { goalId: id });
    const decrypted = updated[0] ? await decryptRow('financial_goals', updated[0], dek) : updated[0];
    return NextResponse.json(decrypted);
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

    const userId = session.user.id;
    const dataUserId = (session.user as any).dataUserId ?? session.user.id;
    const existing = await getDb()
      .select()
      .from(financialGoals)
      .where(and(
        eq(financialGoals.id, id),
        eq(financialGoals.userId, dataUserId)
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
