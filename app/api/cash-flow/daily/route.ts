import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { getSessionDEK } from '@/lib/crypto-context';
import { getCached, setCached } from '@/lib/server-cache';
import { buildFinanceContext } from '@/lib/finance/context';
import { getDailyCashFlow } from '@/lib/finance/daily-cash-flow';
import { DailyCashFlowQuerySchema } from '@/lib/validations/cash-flow';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: 'unauthorized', message: 'Authentication required' },
      { status: 401 }
    );
  }

  const userId = session.user.id;
  const dataUserId = (session.user as any).dataUserId ?? session.user.id;
  const { searchParams } = new URL(request.url);

  const parsed = DailyCashFlowQuerySchema.safeParse({
    startDate: searchParams.get('startDate') ?? undefined,
    endDate: searchParams.get('endDate') ?? undefined,
    search: searchParams.get('search') ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'validation_error',
        message: 'Invalid query parameters',
        details: parsed.error.flatten().fieldErrors,
      },
      { status: 400 }
    );
  }

  const { startDate, endDate, search } = parsed.data;

  // Cache key includes viewer userId because hidden account visibility varies per viewer
  const cacheKey = !search
    ? `user:${dataUserId}:daily-cash-flow:${userId}:${startDate}:${endDate}`
    : null;

  if (cacheKey) {
    const cached = getCached<any>(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }
  }

  try {
    const dek = await getSessionDEK();
    const ctx = await buildFinanceContext({ userId, dataUserId, dek });
    const result = await getDailyCashFlow(ctx, { startDate, endDate, search });

    if (cacheKey) {
      setCached(cacheKey, result, 2 * 60 * 1000); // 2 minutes TTL
    }

    logger.info('GET /api/cash-flow/daily', {
      startDate,
      endDate,
      daysCount: result.days.length,
      hasSearch: Boolean(search),
    });

    return NextResponse.json(result);
  } catch (err) {
    logger.error('Error fetching daily cash flow', {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: 'internal_error', message: 'Failed to fetch daily cash flow' },
      { status: 500 }
    );
  }
}
