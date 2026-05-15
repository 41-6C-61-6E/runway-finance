import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { logger } from '@/lib/logger';
import { financialGoals } from '@/lib/db/schema';
import { accounts } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const { goalId } = await req.json();

    if (!goalId) {
      return NextResponse.json({ error: 'goalId is required' }, { status: 400 });
    }

    const goal = await getDb()
      .select()
      .from(financialGoals)
      .where(and(
        eq(financialGoals.id, goalId),
        eq(financialGoals.userId, session.user.id)
      ))
      .limit(1);

    if (!goal[0]) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
    }

    let newCurrentAmount = parseFloat(goal[0].currentAmount);

    if (goal[0].linkedAccountId) {
      const acct = await getDb()
        .select({ balance: accounts.balance })
        .from(accounts)
        .where(and(
          eq(accounts.id, goal[0].linkedAccountId),
          eq(accounts.userId, session.user.id)
        ))
        .limit(1);

      if (acct[0]) {
        newCurrentAmount = parseFloat(acct[0].balance);
      }
    }

    const updated = await getDb()
      .update(financialGoals)
      .set({
        currentAmount: String(newCurrentAmount),
        updatedAt: new Date(),
      })
      .where(eq(financialGoals.id, goalId))
      .returning();

    logger.info('POST /api/goals/progress', { goalId, newCurrentAmount });
    return NextResponse.json({
      goal: updated[0],
      syncedBalance: newCurrentAmount,
    });
  } catch (err) {
    logger.error('POST /api/goals/progress', { error: err });
    return NextResponse.json({ error: 'Failed to sync progress' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

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
      eq(financialGoals.userId, session.user.id)
    ))
    .limit(1);

  if (!goal[0]) {
    return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
  }

  let linkedAccountBalance: number | null = null;
  if (goal[0].linkedAccountId) {
    const acct = await getDb()
      .select({ balance: accounts.balance })
      .from(accounts)
      .where(and(
        eq(accounts.id, goal[0].linkedAccountId),
        eq(accounts.userId, session.user.id)
      ))
      .limit(1);

    if (acct[0]) {
      linkedAccountBalance = parseFloat(acct[0].balance);
    }
  }

  const target = parseFloat(goal[0].targetAmount);
  const current = parseFloat(goal[0].currentAmount);
  const progress = target > 0 ? Math.min((current / target) * 100, 100) : 0;

  return NextResponse.json({
    goal: goal[0],
    progress,
    linkedAccountBalance,
  });
}
