import { getDb } from '@/lib/db';
import { simplifinConnections } from '@/lib/db/schema';
import { syncConnection } from '@/lib/services/sync';
import { debugInfo, debugError } from '@/lib/debug';

const LOG_TAG = '[runway-sync]';

/**
 * Sync all SimpleFIN connections sequentially.
 * Each connection is synced one at a time to avoid overwhelming SimpleFIN Bridge.
 * Per-connection errors are logged but do not stop the rest.
 */
export async function syncAllConnections(): Promise<void> {
  const connections = await getDb()
    .select({
      id: simplifinConnections.id,
      userId: simplifinConnections.userId,
    })
    .from(simplifinConnections);

  if (connections.length === 0) {
    debugInfo(`${LOG_TAG} No connections found, skipping sync.`);
    return;
  }

  debugInfo(`${LOG_TAG} Sync started: ${connections.length} connections`);

  for (const conn of connections) {
    try {
      const result = await syncConnection(conn.id, conn.userId);
      if (result.status === 'success') {
        debugInfo(
          `${LOG_TAG} Connection ${conn.id}: synced ${result.accountsSynced} accounts, ${result.transactionsFetched} transactions`
        );
      } else {
        debugError(
          `${LOG_TAG} Connection ${conn.id}: sync failed — ${result.errorMessage}`
        );
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      debugError(`${LOG_TAG} Connection ${conn.id}: unexpected error — ${errorMessage}`);
    }
  }

  debugInfo(`${LOG_TAG} Sync completed.`);
}
