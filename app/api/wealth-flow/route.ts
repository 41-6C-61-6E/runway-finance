import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getSessionDEK } from '@/lib/crypto-context';
import { calculateWealthFlow } from '@/lib/services/wealth-flow';
import { logger } from '@/lib/logger';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: 'unauthenticated', message: 'Authentication required' },
      { status: 401 }
    );
  }

  const userId = session.user.id;
  const dataUserId = (session.user as any).dataUserId ?? session.user.id;

  let dek: Uint8Array;
  try {
    dek = await getSessionDEK();
  } catch (err) {
    logger.error('[api-wealth-flow] Failed to resolve user session DEK', { error: err });
    return NextResponse.json(
      { error: 'decryption_failed', message: 'Failed to access key material' },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(request.url);
  const month = searchParams.get('month');
  let startMonth = searchParams.get('startMonth');
  let endMonth = searchParams.get('endMonth');
  let startDate = searchParams.get('startDate');
  let endDate = searchParams.get('endDate');
  const timeframe = searchParams.get('timeframe') || undefined;
  const accountIdsParam = searchParams.get('accountIds') || '';
  const accountIds = accountIdsParam ? accountIdsParam.split(',').filter(Boolean) : [];

  if (!startDate || !endDate) {
    if (month) {
      startMonth = month;
      endMonth = month;
    }

    if (!startMonth || !endMonth) {
      const now = new Date();
      const currentYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      startMonth = currentYm;
      endMonth = currentYm;
    }

    startDate = `${startMonth}-01`;
    const [ey, em] = endMonth.split('-').map(Number);
    endDate = `${endMonth}-${String(new Date(ey, em, 0).getDate()).padStart(2, '0')}`;
  }

  try {
    const data = await calculateWealthFlow(dataUserId, startDate, endDate, dek, accountIds, timeframe);
    return NextResponse.json(data);
  } catch (error) {
    logger.error('[api-wealth-flow] Error calculating wealth flow', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: 'internal_error', message: 'Failed to calculate wealth flow' },
      { status: 500 }
    );
  }
}
