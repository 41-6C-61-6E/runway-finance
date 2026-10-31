import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { computeGoalProjections } from '@/lib/services/goal-projections';
import { getCached, setCached } from '@/lib/server-cache';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const userId = session.user.id;
  const { searchParams } = new URL(req.url);
  const monthlyInflowParam = searchParams.get('monthlyInflow');
  const accountInflowsParam = searchParams.get('accountInflows');
  const lookbackMonthsParam = searchParams.get('lookbackMonths');
  const projectionMonthsParam = searchParams.get('projectionMonths');

  const cacheKey = `user:${userId}:goals-projections:${monthlyInflowParam || ''}:${accountInflowsParam || ''}:${lookbackMonthsParam || ''}:${projectionMonthsParam || ''}`;
  const cached = getCached<any>(cacheKey);
  if (cached) {
    return NextResponse.json(cached);
  }

  try {
    const overrides: {
      monthlyInflow?: number;
      accountInflows?: Record<string, number>;
      lookbackMonths?: number;
      projectionMonths?: number;
    } = {};

    if (monthlyInflowParam !== null) {
      const parsed = parseFloat(monthlyInflowParam);
      if (!isNaN(parsed) && parsed >= 0) {
        overrides.monthlyInflow = parsed;
      }
    }

    if (accountInflowsParam !== null) {
      try {
        const parsed = JSON.parse(accountInflowsParam);
        if (typeof parsed === 'object' && parsed !== null) {
          overrides.accountInflows = parsed;
        }
      } catch {
        // ignore parsing errors
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

    const projections = await computeGoalProjections(userId, overrides);
    setCached(cacheKey, projections, 2 * 60 * 1000);
    return NextResponse.json(projections);
  } catch (err) {
    logger.error('GET /api/goals/projections', { error: err });
    return NextResponse.json({ error: 'Failed to compute projections' }, { status: 500 });
  }
}
