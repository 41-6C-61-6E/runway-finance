import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getSessionDEK } from '@/lib/crypto-context';
import { syncPlaidConnection } from '@/lib/services/plaid-sync';
import { logger } from '@/lib/logger';

const LOG_TAG = '[api-plaid-sync]';

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'unauthenticated', message: 'Authentication required' }, { status: 401 });
    }

    const userId = session.user.id;
    const dek = await getSessionDEK();

    let body: { connectionId?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'validation_error', message: 'Invalid request body' }, { status: 400 });
    }

    const { connectionId } = body;
    if (!connectionId) {
      return NextResponse.json({ error: 'validation_error', message: 'connectionId is required' }, { status: 400 });
    }

    const result = await syncPlaidConnection(connectionId, userId, dek);

    return NextResponse.json(result, { status: result.status === 'success' ? 200 : 502 });
  } catch (error: any) {
    logger.error(`${LOG_TAG} Error manually syncing Plaid`, { error: error.message });
    return NextResponse.json({
      error: 'internal_error',
      message: error.message || 'Failed to sync Plaid connection'
    }, { status: 500 });
  }
}
