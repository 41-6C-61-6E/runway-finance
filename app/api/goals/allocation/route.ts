import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { computeGoalAllocations, findSharedAccounts, snapshotAllocationsToHistory } from '@/lib/services/goal-allocation';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const userId = session.user.id;
  const dataUserId = (session.user as any).dataUserId ?? session.user.id;

  try {
    const [allocations, sharedAccounts] = await Promise.all([
      computeGoalAllocations(dataUserId),
      findSharedAccounts(dataUserId),
    ]);

    return NextResponse.json({
      allocations,
      sharedAccounts: Array.from(sharedAccounts.entries()).map(([accountId, goalIds]) => ({
        accountId,
        goalCount: goalIds.length,
        goalIds,
      })),
    });
  } catch (err) {
    logger.error('GET /api/goals/allocation', { error: err });
    return NextResponse.json({ error: 'Failed to compute allocations' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const userId = session.user.id;
  const dataUserId = (session.user as any).dataUserId ?? session.user.id;

  try {
    await snapshotAllocationsToHistory(dataUserId);
    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error('POST /api/goals/allocation', { error: err });
    return NextResponse.json({ error: 'Failed to snapshot allocations' }, { status: 500 });
  }
}
