import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { simplifinConnections } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated', message: 'Authentication required' }, { status: 401 });
  }

  const userId = session.user.id;

  // Verify ownership
  const [connection] = await getDb()
    .select()
    .from(simplifinConnections)
    .where(eq(simplifinConnections.id, id))
    .limit(1);

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

  // Call sync service
  const { syncConnection } = await import('@/lib/services/sync');
  const result = await syncConnection(id, userId);

  if (result.status === 'success') {
    logger.info('Sync completed', { connectionId: id, userId, accountsSynced: result.accountsSynced, transactionsNew: result.transactionsNew, transactionsUpdated: result.transactionsUpdated });
  } else {
    logger.error('Sync failed', { connectionId: id, userId, error: result.errorMessage });
  }

  return NextResponse.json({
    status: result.status,
    accountsSynced: result.accountsSynced,
    transactionsFetched: result.transactionsFetched,
    transactionsNew: result.transactionsNew,
    transactionsUpdated: result.transactionsUpdated,
    ...(result.status === 'error' && { error: result.errorMessage }),
  }, { status: result.status === 'success' ? 200 : 502 });
}
