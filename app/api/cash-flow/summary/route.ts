import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { getSessionDEK } from '@/lib/crypto-context';
import { getCached, setCached } from '@/lib/server-cache';
import { buildFinanceContext } from '@/lib/finance/context';
import { getCashFlowSummary } from '@/lib/finance/cash-flow';

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const userId = session.user.id;
  const dataUserId = (session.user as any).dataUserId ?? session.user.id;
  const dek = await getSessionDEK();
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const cacheKey = `user:${userId}:cash-flow-summary:${dataUserId}:${currentMonth}`;
  const cached = getCached<any>(cacheKey);
  if (cached) {
    return NextResponse.json(cached);
  }

  try {
    const ctx = await buildFinanceContext({ userId, dataUserId, dek, now });
    const payload = await getCashFlowSummary(ctx);

    setCached(cacheKey, payload, 2 * 60 * 1000);
    logger.info('GET /api/cash-flow/summary', { currentMonth, netIncome: payload.netIncome });
    return NextResponse.json(payload);
  } catch (error) {
    logger.error('Error fetching cash flow summary', { error });
    return NextResponse.json(
      { error: 'internal_error', message: 'Failed to fetch cash flow summary' },
      { status: 500 }
    );
  }
}
