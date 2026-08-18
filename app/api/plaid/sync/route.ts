import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { plaidConnections } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { resolveDataUserId } from '@/lib/sharing';
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

    // Pre-check ownership before invoking the sync service: the service only
    // validates ownership AFTER inserting a `running` sync log row, and its
    // error path writes lastSyncStatus='error' onto the connection row —
    // both are cross-tenant side effects for a foreign connectionId.
    const [connection] = await getDb()
      .select({ userId: plaidConnections.userId })
      .from(plaidConnections)
      .where(eq(plaidConnections.id, connectionId))
      .limit(1);

    if (!connection) {
      return NextResponse.json({ error: 'not_found', message: 'Plaid connection not found' }, { status: 404 });
    }

    const dataUserId = await resolveDataUserId(userId);
    const connectionDataUserId = await resolveDataUserId(connection.userId);
    if (connectionDataUserId !== dataUserId) {
      return NextResponse.json({ error: 'not_found', message: 'Plaid connection not found' }, { status: 404 });
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
