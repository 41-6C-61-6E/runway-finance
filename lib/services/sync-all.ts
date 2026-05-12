import { getDb } from '@/lib/db';
import { simplifinConnections } from '@/lib/db/schema';
import { syncConnection } from '@/lib/services/sync';
import { logger } from '@/lib/logger';

const LOG_TAG = '[runway-sync]';

export async function syncAllConnections(): Promise<void> {
  const connections = await getDb()
    .select({
      id: simplifinConnections.id,
      userId: simplifinConnections.userId,
    })
    .from(simplifinConnections);

  if (connections.length === 0) {
    logger.info(`${LOG_TAG} No connections found, skipping sync.`);
    return;
  }

  const startedAt = Date.now();
  logger.info(`${LOG_TAG} Sync started`, { connectionCount: connections.length });

  for (let i = 0; i < connections.length; i++) {
    const conn = connections[i];
    try {
      const result = await syncConnection(conn.id, conn.userId);
      if (result.status === 'success') {
        logger.info(
          `${LOG_TAG} Connection synced (${i + 1}/${connections.length})`,
          {
            connectionId: conn.id,
            accountsSynced: result.accountsSynced,
            transactionsFetched: result.transactionsFetched,
            transactionsNew: result.transactionsNew,
          }
        );
      } else {
        logger.error(
          `${LOG_TAG} Connection sync failed (${i + 1}/${connections.length})`,
          {
            connectionId: conn.id,
            error: result.errorMessage,
          }
        );
      }
    } catch (err) {
      logger.error(`${LOG_TAG} Unexpected error on connection (${i + 1}/${connections.length})`, {
        connectionId: conn.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logger.info(`${LOG_TAG} Sync completed`, { totalDurationMs: Date.now() - startedAt });
}
