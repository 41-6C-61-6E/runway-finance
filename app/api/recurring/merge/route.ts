import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getSessionDEK } from '@/lib/crypto-context';
import { resolveDataUserId } from '@/lib/sharing';
import { logger } from '@/lib/logger';
import { RecurringMergeSchema } from '@/lib/validations/recurring';
import { mergeRecurringTransactions } from '@/lib/services/recurring-detection';

const LOG_TAG = '[api-recurring-merge]';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const dataUserId = await resolveDataUserId(session.user.id);
    const dek = await getSessionDEK();
    const body = await req.json();

    const { targetId, sourceIds, customName } = RecurringMergeSchema.parse(body);

    const result = await mergeRecurringTransactions(
      dataUserId,
      dek,
      targetId,
      sourceIds,
      customName
    );

    return NextResponse.json(result);
  } catch (err) {
    logger.error(`${LOG_TAG} POST merge failed:`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal Server Error' },
      { status: 400 }
    );
  }
}
