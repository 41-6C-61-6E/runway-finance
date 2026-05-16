import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { logger } from '@/lib/logger';
import { financialGoals } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptRow } from '@/lib/crypto';

export async function GET(req: NextRequest) {
  const session = await auth();
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
      eq(financialGoals.userId, session.user.id)
    ))
    .limit(1);

  if (!goal[0]) {
    return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
  }

  const decrypted = await decryptRow('financial_goals', goal[0], dek);
  const target = parseFloat(decrypted.targetAmount);
  const current = parseFloat(decrypted.currentAmount);
  const progress = target > 0 ? Math.min((current / target) * 100, 100) : 0;

  const milestones = [
    { percentage: 25, label: '25%', achieved: progress >= 25 },
    { percentage: 50, label: '50%', achieved: progress >= 50 },
    { percentage: 75, label: '75%', achieved: progress >= 75 },
    { percentage: 100, label: '100%', achieved: progress >= 100 },
  ];

  return NextResponse.json({
    goal: decrypted,
    progress,
    milestones,
  });
}
