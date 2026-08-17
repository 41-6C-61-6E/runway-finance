import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getSessionDEK } from '@/lib/crypto-context';
import { resolveDataUserId } from '@/lib/sharing';
import { logger } from '@/lib/logger';
import { RecurringDetectSchema } from '@/lib/validations/recurring';
import { detectRecurringTransactions } from '@/lib/services/recurring-detection';

const LOG_TAG = '[api-recurring-detect]';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const dataUserId = await resolveDataUserId(session.user.id);
    const dek = await getSessionDEK();

    let body: unknown = {};
    try {
      body = await req.json();
    } catch {
      // empty body is fine
    }
    const hasBody = body && typeof body === 'object' && Object.keys(body).length > 0;
    let lookbackMonths: number | undefined;
    if (hasBody) {
      const parsed = RecurringDetectSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Invalid lookbackMonths (must be an integer between 1 and 36)' },
          { status: 400 }
        );
      }
      lookbackMonths = parsed.data.lookbackMonths;
    }

    const result = await detectRecurringTransactions(
      dataUserId,
      dek,
      lookbackMonths ? { lookbackMonths } : undefined
    );

    logger.info(`${LOG_TAG} Detection triggered manually`, {
      userId: dataUserId,
      ...result,
    });

    return NextResponse.json(result);
  } catch (err) {
    logger.error(`${LOG_TAG} POST detect failed:`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}
