import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { getGoalAllocationHistory } from '@/lib/services/goal-allocation';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const userId = session.user.id;
  const dataUserId = (session.user as any).dataUserId ?? session.user.id;
  
  const { searchParams } = new URL(req.url);
  const goalId = searchParams.get('goalId');
  const limit = parseInt(searchParams.get('limit') || '30');

  if (!goalId) {
    return NextResponse.json({ error: 'goalId is required' }, { status: 400 });
  }

  try {
    const history = await getGoalAllocationHistory(goalId, dataUserId, limit);
    
    return NextResponse.json({ history });
  } catch (err) {
    logger.error('GET /api/goals/history', { error: err });
    return NextResponse.json({ error: 'Failed to fetch allocation history' }, { status: 500 });
  }
}
