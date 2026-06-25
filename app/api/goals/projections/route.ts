import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { computeGoalProjections } from '@/lib/services/goal-projections';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const userId = session.user.id;
  const dataUserId = (session.user as any).dataUserId ?? session.user.id;

  const { searchParams } = new URL(req.url);
  const monthlyInflowParam = searchParams.get('monthlyInflow');
  const lookbackMonthsParam = searchParams.get('lookbackMonths');
  const projectionMonthsParam = searchParams.get('projectionMonths');

  try {
    const overrides: {
      monthlyInflow?: number;
      lookbackMonths?: number;
      projectionMonths?: number;
    } = {};

    if (monthlyInflowParam !== null) {
      const parsed = parseFloat(monthlyInflowParam);
      if (!isNaN(parsed) && parsed >= 0) {
        overrides.monthlyInflow = parsed;
      }
    }

    if (lookbackMonthsParam !== null) {
      const parsed = parseInt(lookbackMonthsParam, 10);
      if (!isNaN(parsed) && parsed >= 1) {
        overrides.lookbackMonths = parsed;
      }
    }

    if (projectionMonthsParam !== null) {
      const parsed = parseInt(projectionMonthsParam, 10);
      if (!isNaN(parsed) && parsed >= 1 && parsed <= 240) {
        overrides.projectionMonths = parsed;
      }
    }

    const projections = await computeGoalProjections(dataUserId, overrides);

    return NextResponse.json(projections);
  } catch (err) {
    logger.error('GET /api/goals/projections', { error: err });
    return NextResponse.json({ error: 'Failed to compute projections' }, { status: 500 });
  }
}
