import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { logger } from '@/lib/logger';
import { financialGoals } from '@/lib/db/schema';
import { accounts } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptField, decryptRow, encryptRow } from '@/lib/crypto';
import { getGoalAllocation, computeGoalAllocations } from '@/lib/services/goal-allocation';

export async function POST(req: NextRequest) {
  const session = await auth();
  const dataUserId = session?.user ? ((session.user as any).dataUserId ?? session.user.id) : undefined;
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const dek = await getSessionDEK();
    const { goalId } = await req.json();

    if (!goalId) {
      return NextResponse.json({ error: 'goalId is required' }, { status: 400 });
    }

    const goal = await getDb()
      .select()
      .from(financialGoals)
      .where(and(
        eq(financialGoals.id, goalId),
        eq(financialGoals.userId, dataUserId)
      ))
      .limit(1);

    if (!goal[0]) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
    }

    const decryptedGoal = await decryptRow('financial_goals', goal[0], dek);
    let newCurrentAmount = parseFloat(decryptedGoal.currentAmount);
    let newAllocatedAmount = parseFloat(decryptedGoal.allocatedAmount ?? '0');

    if (goal[0].linkedAccountId) {
      // Recompute allocation for this goal
      const allocation = await getGoalAllocation(goalId, dataUserId);
      if (allocation) {
        newAllocatedAmount = allocation.allocatedAmount;
      }
    }

    const encrypted = await encryptRow('financial_goals', { 
      currentAmount: String(newCurrentAmount),
      allocatedAmount: String(newAllocatedAmount),
    }, dek);
    const updated = await getDb()
      .update(financialGoals)
      .set({
        ...encrypted,
        updatedAt: new Date(),
      })
      .where(eq(financialGoals.id, goalId))
      .returning();

    logger.info('POST /api/goals/progress', { goalId, newCurrentAmount, newAllocatedAmount });
    const updatedGoal = updated[0] ? await decryptRow('financial_goals', updated[0], dek) : updated[0];
    return NextResponse.json({
      goal: updatedGoal,
      syncedBalance: newCurrentAmount,
      allocatedAmount: newAllocatedAmount,
    });
  } catch (err) {
    logger.error('POST /api/goals/progress', { error: err });
    return NextResponse.json({ error: 'Failed to sync progress' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const session = await auth();
  const dataUserId = session?.user ? ((session.user as any).dataUserId ?? session.user.id) : undefined;
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const dek = await getSessionDEK();
  const { searchParams } = new URL(req.url);
  const goalId = searchParams.get('goalId');

  if (!goalId) {
    return NextResponse.json({ error: 'goalId is required' }, { status: 400 });
  }

  const goal = await getDb()
    .select()
    .from(financialGoals)
    .where(and(
      eq(financialGoals.id, goalId),
      eq(financialGoals.userId, dataUserId)
    ))
    .limit(1);

  if (!goal[0]) {
    return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
  }

  const decrypted = await decryptRow('financial_goals', goal[0], dek);

  const target = parseFloat(decrypted.targetAmount);
  const current = parseFloat(decrypted.currentAmount);
  const progress = target > 0 ? Math.min((current / target) * 100, 100) : 0;

  return NextResponse.json({
    goal: decrypted,
    progress,
  });
}
