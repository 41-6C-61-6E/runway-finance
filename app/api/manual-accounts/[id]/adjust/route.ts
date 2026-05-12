import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { accounts } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { adjustManualAccountValue } from '@/lib/services/manual-accounts';
import { logger } from '@/lib/logger';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated', message: 'Authentication required' }, { status: 401 });
  }

  const userId = session.user.id;
  const { id } = await params;

  const [account] = await getDb()
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, id), eq(accounts.userId, userId)))
    .limit(1);

  if (!account) {
    return NextResponse.json({ error: 'not_found', message: 'Account not found' }, { status: 404 });
  }

  let body: { value?: number; amountOz?: number; note?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'validation_error', message: 'Invalid request body' }, { status: 400 });
  }

  let result;
  if (account.type === 'metals' && body.amountOz !== undefined) {
    result = await adjustManualAccountValue(id, userId, 0, body.note, body.amountOz);
  } else {
    if (body.value === undefined || body.value === null) {
      return NextResponse.json({ error: 'validation_error', message: 'value is required for this account type' }, { status: 400 });
    }
    result = await adjustManualAccountValue(id, userId, body.value, body.note);
  }

  logger.info('POST /api/manual-accounts/[id]/adjust', { userId, id, value: body.value, amountOz: body.amountOz, note: body.note, status: result.status });

  if (result.status === 'error') {
    return NextResponse.json(result, { status: 500 });
  }

  return NextResponse.json(result);
}
