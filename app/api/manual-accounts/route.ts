import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { accounts } from '@/lib/db/schema';
import { eq, and, isNull, asc } from 'drizzle-orm';
import { createManualAccount, MANUAL_ACCOUNT_TYPES, type AssetSubType } from '@/lib/services/manual-accounts';
import { logger } from '@/lib/logger';

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated', message: 'Authentication required' }, { status: 401 });
  }

  const userId = session.user.id;

  const result = await getDb()
    .select()
    .from(accounts)
    .where(
      and(
        eq(accounts.userId, userId),
        isNull(accounts.connectionId),
      )
    )
    .orderBy(asc(accounts.displayOrder), asc(accounts.name));

  logger.info('GET /api/manual-accounts', { userId, count: result.length });
  return NextResponse.json(result);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated', message: 'Authentication required' }, { status: 401 });
  }

  const userId = session.user.id;

  let body: {
    name?: string;
    type?: string;
    metadata?: Record<string, unknown>;
    initialValue?: number;
    currency?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'validation_error', message: 'Invalid request body' }, { status: 400 });
  }

  if (!body.name || !body.type) {
    return NextResponse.json({ error: 'validation_error', message: 'name and type are required' }, { status: 400 });
  }

  if (!MANUAL_ACCOUNT_TYPES.includes(body.type as AssetSubType)) {
    return NextResponse.json({ error: 'validation_error', message: `Invalid type. Must be one of: ${MANUAL_ACCOUNT_TYPES.join(', ')}` }, { status: 400 });
  }

  try {
    const account = await createManualAccount({
      userId,
      name: body.name,
      type: body.type as AssetSubType,
      metadata: body.metadata,
      initialValue: body.initialValue,
      currency: body.currency,
    });
    logger.info('POST /api/manual-accounts - created', { userId, type: body.type, name: body.name, initialValue: body.initialValue });
    return NextResponse.json(account, { status: 201 });
  } catch (err) {
    logger.error('POST /api/manual-accounts - error', { userId, name: body.name, error: err instanceof Error ? err.message : 'Failed to create account' });
    return NextResponse.json({ error: 'internal_error', message: err instanceof Error ? err.message : 'Failed to create account' }, { status: 500 });
  }
}
