import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { simplifinConnections, plaidConnections } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { syncScheduler } from '@/lib/services/sync-scheduler';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated', message: 'Authentication required' }, { status: 401 });
  }

  const userId = session.user.id;

  // Verify ownership in SimpleFIN
  let isSimplefin = true;
  let [connection] = await getDb()
    .select()
    .from(simplifinConnections)
    .where(eq(simplifinConnections.id, id))
    .limit(1);

  if (!connection) {
    isSimplefin = false;
    const [plaidConn] = await getDb()
      .select()
      .from(plaidConnections)
      .where(eq(plaidConnections.id, id))
      .limit(1);
    connection = plaidConn as any;
  }

  if (!connection) {
    return NextResponse.json(
      { error: 'not_found', message: 'Connection not found' },
      { status: 404 }
    );
  }

  if (connection.userId !== userId) {
    return NextResponse.json(
      { error: 'forbidden', message: 'You do not own this connection' },
      { status: 403 }
    );
  }

  let result: any;
  if (isSimplefin) {
    const { syncConnection } = await import('@/lib/services/sync');
    result = await syncConnection(id, userId);
  } else {
    const { syncPlaidConnection } = await import('@/lib/services/plaid-sync');
    result = await syncPlaidConnection(id, userId);
  }

  if (result.status === 'success') {
    logger.info('Sync completed', { connectionId: id, userId, isSimplefin, accountsSynced: result.accountsSynced, transactionsNew: result.transactionsNew });
  } else {
    logger.error('Sync failed', { connectionId: id, userId, isSimplefin, error: result.errorMessage });
  }

  // Reschedule the sync timer based on the updated lastSyncAt
  let refreshed: any;
  if (isSimplefin) {
    [refreshed] = await getDb()
      .select({ syncFrequency: simplifinConnections.syncFrequency, lastSyncAt: simplifinConnections.lastSyncAt })
      .from(simplifinConnections)
      .where(eq(simplifinConnections.id, id))
      .limit(1);
  } else {
    [refreshed] = await getDb()
      .select({ syncFrequency: plaidConnections.syncFrequency, lastSyncAt: plaidConnections.lastSyncAt })
      .from(plaidConnections)
      .where(eq(plaidConnections.id, id))
      .limit(1);
  }

  if (refreshed) {
    syncScheduler.schedule(id, refreshed.syncFrequency, refreshed.lastSyncAt);
  }

  return NextResponse.json({
    status: result.status,
    accountsSynced: result.accountsSynced,
    transactionsFetched: result.transactionsFetched,
    transactionsNew: result.transactionsNew,
    transactionsUpdated: result.transactionsUpdated,
    details: result.details ?? [],
    durationMs: result.durationMs ?? 0,
    ...(result.status === 'error' && { error: result.errorMessage }),
  }, { status: result.status === 'success' ? 200 : 502 });
}
