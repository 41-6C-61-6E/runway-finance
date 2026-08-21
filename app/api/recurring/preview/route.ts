import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getSessionDEK } from '@/lib/crypto-context';
import { resolveDataUserId } from '@/lib/sharing';
import { previewMatchingTransactions } from '@/lib/services/recurring-detection';
import { logger } from '@/lib/logger';

const LOG_TAG = '[api-recurring-preview]';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const dataUserId = await resolveDataUserId(session.user.id);
    const dek = await getSessionDEK();

    const { searchParams } = new URL(req.url);
    const pattern = searchParams.get('pattern') || '';
    const accountId = searchParams.get('accountId') || null;

    if (!pattern.trim()) {
      return NextResponse.json({
        count: 0,
        totalAmount: 0,
        averageAmount: 0,
        latestDate: null,
        suggestedFrequency: null,
        recentTransactions: [],
      });
    }

    const preview = await previewMatchingTransactions(dataUserId, dek, pattern, accountId);
    return NextResponse.json(preview);
  } catch (err) {
    logger.error(`${LOG_TAG} GET failed:`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}
