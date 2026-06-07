import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getFinancialProvider } from '@/lib/services/financial-provider';
import { logger } from '@/lib/logger';

const LOG_TAG = '[api-investments-tickers-search]';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const userId = session.user.id;
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');

    if (!query || query.trim().length < 1) {
      return NextResponse.json([]);
    }

    const provider = await getFinancialProvider(userId);
    const results = await provider.searchTicker(query);
    return NextResponse.json(results);
  } catch (err) {
    logger.error(`${LOG_TAG} GET failed`, { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
