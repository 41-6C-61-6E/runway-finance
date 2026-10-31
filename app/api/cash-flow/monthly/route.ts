import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { getSessionDEK } from '@/lib/crypto-context';
import { buildFinanceContext } from '@/lib/finance/context';
import { getMonthlyCashFlow } from '@/lib/finance/cash-flow';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const userId = session.user.id;
  const dek = await getSessionDEK();
  const { searchParams } = new URL(request.url);
  const months = parseInt(searchParams.get('months') || '12', 10);

  try {
    const ctx = await buildFinanceContext({ userId, dek });
    const data = await getMonthlyCashFlow(ctx, months);

    logger.info('GET /api/cash-flow/monthly', { months, count: data.length });
    return NextResponse.json(data);
  } catch (error) {
    logger.error('Error fetching monthly cash flow', { error });
    return NextResponse.json(
      { error: 'internal_error', message: 'Failed to fetch monthly cash flow data' },
      { status: 500 }
    );
  }
}
