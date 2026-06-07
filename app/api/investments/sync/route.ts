import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { syncInvestmentPrices } from '@/lib/services/investments';
import { logger } from '@/lib/logger';

const LOG_TAG = '[api-investments-sync]';

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const userId = session.user.id;
    logger.info(`${LOG_TAG} Manual investment sync triggered`, { userId });
    
    const result = await syncInvestmentPrices(userId);
    return NextResponse.json(result);
  } catch (err) {
    logger.error(`${LOG_TAG} POST failed`, { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
