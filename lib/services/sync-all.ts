import { getDb } from '@/lib/db';
import { simplifinConnections, userEncryptionKeys } from '@/lib/db/schema';
import { syncConnection } from '@/lib/services/sync';
import { getServerDEK } from '@/lib/crypto-context';
import { eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';

const LOG_TAG = '[runway-sync]';

const SYNC_INTERVALS: Record<string, number> = {
  manual: 0,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
};

function isSyncDue(syncFrequency: string, lastSyncAt: Date | null): boolean {
  if (syncFrequency === 'manual') return false;
  const interval = SYNC_INTERVALS[syncFrequency];
  if (!interval) return false;
  if (!lastSyncAt) return true;
  return Date.now() - lastSyncAt.getTime() >= interval;
}

export async function syncAllConnections(): Promise<void> {
  const connections = await getDb()
    .select({
      id: simplifinConnections.id,
      userId: simplifinConnections.userId,
      syncFrequency: simplifinConnections.syncFrequency,
      lastSyncAt: simplifinConnections.lastSyncAt,
    })
    .from(simplifinConnections);

  if (connections.length === 0) {
    logger.info(`${LOG_TAG} No connections found, skipping sync.`);
    return;
  }

  const dueConnections = connections.filter((c) =>
    isSyncDue(c.syncFrequency, c.lastSyncAt)
  );

  if (dueConnections.length === 0) {
    logger.info(`${LOG_TAG} No connections due for sync.`);
    return;
  }

  const startedAt = Date.now();
  logger.info(`${LOG_TAG} Sync started`, {
    totalConnections: connections.length,
    dueConnections: dueConnections.length,
  });

  for (let i = 0; i < dueConnections.length; i++) {
    const conn = dueConnections[i];
    try {
      const dek = await getServerDEK(conn.userId);
      const result = await syncConnection(conn.id, conn.userId, dek);
      if (result.status === 'success') {
        logger.info(
          `${LOG_TAG} Connection synced (${i + 1}/${dueConnections.length})`,
          {
            connectionId: conn.id,
            accountsSynced: result.accountsSynced,
            transactionsFetched: result.transactionsFetched,
            transactionsNew: result.transactionsNew,
          }
        );
      } else {
        logger.error(
          `${LOG_TAG} Connection sync failed (${i + 1}/${dueConnections.length})`,
          {
            connectionId: conn.id,
            error: result.errorMessage,
          }
        );
      }
    } catch (err) {
      logger.error(`${LOG_TAG} Unexpected error on connection (${i + 1}/${dueConnections.length})`, {
        connectionId: conn.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logger.info(`${LOG_TAG} Sync completed`, { totalDurationMs: Date.now() - startedAt });
}
