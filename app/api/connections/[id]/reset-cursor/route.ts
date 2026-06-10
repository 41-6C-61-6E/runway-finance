import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { plaidConnections } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';

const LOG_TAG = '[api-connections-reset-cursor]';

/**
 * POST /api/connections/:id/reset-cursor
 *
 * Clears the stored Plaid cursor for a connection so the next sync
 * is treated as a first-ever sync and requests the maximum 730 days
 * of transaction history. This does NOT re-link the Item or consume
 * another Plaid Item slot.
 *
 * After clearing the cursor, it immediately triggers a full sync.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated', message: 'Authentication required' }, { status: 401 });
  }

  const userId = session.user.id;

  // Only valid for Plaid connections (SimpleFIN doesn't use a cursor)
  const [connection] = await getDb()
    .select()
    .from(plaidConnections)
    .where(eq(plaidConnections.id, id))
    .limit(1);

  if (!connection) {
    return NextResponse.json({ error: 'not_found', message: 'Plaid connection not found' }, { status: 404 });
  }

  if (connection.userId !== userId) {
    return NextResponse.json({ error: 'forbidden', message: 'You do not own this connection' }, { status: 403 });
  }

  // Clear the cursor — next transactionsSync call with no cursor + days_requested=730
  // will pull the full available history (up to 2 years)
  await getDb()
    .update(plaidConnections)
    .set({ cursor: null, lastSyncStatus: 'pending', lastSyncError: null })
    .where(eq(plaidConnections.id, id));

  logger.info(`${LOG_TAG} Cursor cleared, triggering full re-sync`, { connectionId: id, userId });

  // Immediately trigger the full sync
  const { syncPlaidConnection } = await import('@/lib/services/plaid-sync');
  const result = await syncPlaidConnection(id, userId);

  if (result.status === 'success') {
    logger.info(`${LOG_TAG} Full re-sync completed`, {
      connectionId: id,
      accountsSynced: result.accountsSynced,
      transactionsNew: result.transactionsNew,
    });
  } else {
    logger.error(`${LOG_TAG} Full re-sync failed`, { connectionId: id, error: result.errorMessage });
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
