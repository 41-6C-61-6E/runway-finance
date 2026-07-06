import { getDb } from '@/lib/db';
import { plaidConnections, simplifinConnections, accounts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { getServerDEK } from '@/lib/crypto-context';
import { syncPlaidConnection } from '@/lib/services/plaid-sync';

export async function healProductionAccounts(): Promise<void> {
  const db = getDb();
  logger.info('[startup-healing] Scanning for incorrectly disabled or mismatched accounts...');

  try {
    const allAccounts = await db.select().from(accounts);
    const plaidConns = await db.select().from(plaidConnections);
    const sfConns = await db.select().from(simplifinConnections);

    const plaidConnMap = new Map(plaidConns.map(c => [c.id, c]));
    const sfConnMap = new Map(sfConns.map(c => [c.id, c]));

    const accountsByPlaidConn = new Map<string, typeof allAccounts>();
    for (const acc of allAccounts) {
      if (acc.plaidConnectionId) {
        if (!accountsByPlaidConn.has(acc.plaidConnectionId)) {
          accountsByPlaidConn.set(acc.plaidConnectionId, []);
        }
        accountsByPlaidConn.get(acc.plaidConnectionId)!.push(acc);
      }
    }

    const connectionsToSync = new Set<string>();

    // 1. Scan for active accounts in disabledLists
    for (const acc of allAccounts) {
      if (acc.plaidConnectionId) {
        const conn = plaidConnMap.get(acc.plaidConnectionId);
        if (conn) {
          const disabled = conn.disabledAccounts || [];
          if (disabled.includes(acc.externalId)) {
            logger.info('[startup-healing] Re-enabling active account on Plaid connection', { accountId: acc.id, connectionId: conn.id });
            const updatedDisabled = disabled.filter(id => id !== acc.externalId);
            await db
              .update(plaidConnections)
              .set({ 
                disabledAccounts: updatedDisabled,
                cursor: null, // Clear cursor for full re-sync
                lastSyncStatus: 'pending',
                lastSyncError: null
              })
              .where(eq(plaidConnections.id, conn.id));
            
            conn.disabledAccounts = updatedDisabled;
            connectionsToSync.add(conn.id);
          }
        }
      }

      if (acc.connectionId) {
        const conn = sfConnMap.get(acc.connectionId);
        if (conn) {
          const disabled = conn.disabledAccounts || [];
          if (disabled.includes(acc.externalId)) {
            logger.info('[startup-healing] Re-enabling active account on SimpleFIN connection', { accountId: acc.id, connectionId: conn.id });
            const updatedDisabled = disabled.filter(id => id !== acc.externalId);
            await db
              .update(simplifinConnections)
              .set({ disabledAccounts: updatedDisabled })
              .where(eq(simplifinConnections.id, conn.id));
            
            conn.disabledAccounts = updatedDisabled;
            // SimpleFIN doesn't use cursors, so no reset cursor is needed
          }
        }
      }
    }

    // 2. Scan for mismatched remapped accounts
    for (const [connId, connAccounts] of accountsByPlaidConn.entries()) {
      const conn = plaidConnMap.get(connId);
      if (!conn) continue;

      const mismatchedAccounts = connAccounts.filter(
        acc => acc.externalId.startsWith('ACT-') || acc.externalId.startsWith('manual-')
      );

      if (mismatchedAccounts.length === 0) continue;

      const disabled = conn.disabledAccounts || [];
      if (mismatchedAccounts.length === 1 && disabled.length === 1) {
        const mismatchedAcc = mismatchedAccounts[0];
        const correctPlaidId = disabled[0];

        logger.info('[startup-healing] Repairing mismatched remapped account', { accountId: mismatchedAcc.id, correctPlaidId });

        await db
          .update(accounts)
          .set({
            externalId: correctPlaidId,
            updatedAt: new Date(),
          })
          .where(eq(accounts.id, mismatchedAcc.id));

        const updatedDisabled = disabled.filter(id => id !== correctPlaidId);
        await db
          .update(plaidConnections)
          .set({ 
            disabledAccounts: updatedDisabled,
            cursor: null, // Clear cursor for full re-sync
            lastSyncStatus: 'pending',
            lastSyncError: null
          })
          .where(eq(plaidConnections.id, conn.id));

        conn.disabledAccounts = updatedDisabled;
        connectionsToSync.add(conn.id);
      }
    }

    // 3. Trigger full sync in the background for any connection that was healed/reset
    if (connectionsToSync.size > 0) {
      logger.info('[startup-healing] Triggering background full re-sync for healed connections', { count: connectionsToSync.size });
      for (const connId of connectionsToSync) {
        const conn = plaidConnMap.get(connId);
        if (!conn) continue;

        try {
          const dek = await getServerDEK(conn.userId);
          logger.info('[startup-healing] Starting async full re-sync', { connectionId: conn.id, userId: conn.userId });
          syncPlaidConnection(conn.id, conn.userId, dek).catch(err => {
            logger.error('[startup-healing] Background Plaid sync failed', { connectionId: conn.id, error: String(err) });
          });
        } catch (err) {
          logger.error('[startup-healing] Failed to resolve server DEK or initiate sync', { connectionId: conn.id, error: String(err) });
        }
      }
    } else {
      logger.info('[startup-healing] No incorrectly disabled or mismatched accounts found.');
    }
  } catch (err) {
    logger.error('[startup-healing] Error scanning/healing production accounts', { error: String(err) });
  }
}
