import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getSessionDEK } from '@/lib/crypto-context';
import { resolveDataUserId } from '@/lib/sharing';
import { logger } from '@/lib/logger';
import { RecurringUpcomingSchema } from '@/lib/validations/recurring';
import { getUpcomingBills } from '@/lib/services/recurring-detection';

const LOG_TAG = '[api-recurring-upcoming]';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const dataUserId = await resolveDataUserId(session.user.id);
    const dek = await getSessionDEK();

    const { searchParams } = new URL(req.url);
    const parsed = RecurringUpcomingSchema.parse({
      days: searchParams.get('days') || 30,
      flowType: searchParams.get('flowType') || 'all',
    });

    const countOnly = searchParams.get('countOnly') === 'true';

    const result = await getUpcomingBills(dataUserId, dek, parsed.days, parsed.flowType, countOnly);

    if (countOnly) {
      return NextResponse.json({ count: result.count });
    }

    return NextResponse.json(result);
  } catch (err) {
    logger.error(`${LOG_TAG} GET upcoming failed:`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}
