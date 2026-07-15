import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { simplifinConnections, plaidConnections, accounts } from '@/lib/db/schema';
import { inArray, eq, and, isNull, ne } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { syncScheduler } from '@/lib/services/sync-scheduler';
import { getShareGroup } from '@/lib/sharing';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptRows } from '@/lib/crypto';
import { manualAccountScheduler } from '@/lib/services/manual-account-scheduler';

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'unauthenticated', message: 'Authentication required' }, { status: 401 });
    }

    const userId = session.user.id;
    const { resolveDataUserId } = await import('@/lib/sharing');
    const dataUserId = await resolveDataUserId(userId);
    const dek = await getSessionDEK();

    const group = await getShareGroup(userId);
    const userIds = group ? group.allUserIds : [userId];

    // Fetch SimpleFIN connections
    const sfConnections = await getDb()
      .select({
        id: simplifinConnections.id,
        label: simplifinConnections.label,
        userId: simplifinConnections.userId,
      })
      .from(simplifinConnections)
      .where(inArray(simplifinConnections.userId, userIds));

    // Fetch Plaid connections
    const pConnections = await getDb()
      .select({
        id: plaidConnections.id,
        label: plaidConnections.label,
        userId: plaidConnections.userId,
      })
      .from(plaidConnections)
      .where(inArray(plaidConnections.userId, userIds));

    // Fetch manual accounts to find those pulling via API
    const manualAccountsRaw = await getDb()
      .select({
        id: accounts.id,
        name: accounts.name,
        type: accounts.type,
        metadata: accounts.metadata,
        balanceDate: accounts.balanceDate,
      })
      .from(accounts)
      .where(
        and(
          eq(accounts.userId, dataUserId),
          isNull(accounts.connectionId),
          isNull(accounts.plaidConnectionId),
          ne(accounts.type, 'paystub')
        )
      );

    const decryptedAccounts = await decryptRows('accounts', manualAccountsRaw, dek);

    const syncableManualAccounts = decryptedAccounts.filter((acc: any) => {
      const type = acc.type;
      const meta = acc.metadata || {};

      const isRealEstate = [
        'realestate', 'primaryhome', 'secondaryhome', 'rentalproperty', 'commercial', 'land', 'otherrealestate',
        'single-family', 'condo', 'townhouse', 'multi-family'
      ].includes(type);
      if (isRealEstate && typeof meta.address === 'string' && meta.address.trim() !== '') {
        return true;
      }

      if (type === 'crypto' && typeof meta.xpub === 'string' && meta.xpub.trim() !== '') {
        return true;
      }

      if (type === 'metals' && typeof meta.amountOz !== 'undefined' && parseFloat(String(meta.amountOz)) > 0) {
        return true;
      }

      return false;
    });

    const totalToSync = sfConnections.length + pConnections.length + syncableManualAccounts.length;
    if (totalToSync === 0) {
      return NextResponse.json({
        status: 'success',
        message: 'No connections or API-driven manual accounts to sync',
        syncedCount: 0,
        results: [],
      });
    }

    logger.info('Sync all started', {
      userId,
      dataUserId,
      simplefinCount: sfConnections.length,
      plaidCount: pConnections.length,
      manualCount: syncableManualAccounts.length,
    });

    const { syncManualAccount, readApiConfig } = await import('@/lib/services/manual-accounts');
    const apiConfig = await readApiConfig(userId);

    const connectionPromises = [
      ...sfConnections.map(async (conn) => {
        try {
          const { syncConnection } = await import('@/lib/services/sync');
          const result = await syncConnection(conn.id, userId);

          const [refreshed] = await getDb()
            .select({ syncFrequency: simplifinConnections.syncFrequency, lastSyncAt: simplifinConnections.lastSyncAt })
            .from(simplifinConnections)
            .where(eq(simplifinConnections.id, conn.id))
            .limit(1);

          if (refreshed) {
            await syncScheduler.schedule(conn.id, refreshed.syncFrequency, refreshed.lastSyncAt, userId);
          }

          return {
            id: conn.id,
            name: conn.label,
            type: 'simplefin',
            status: result.status,
            accountsSynced: result.accountsSynced || 0,
            transactionsNew: result.transactionsNew || 0,
            error: result.status === 'error' ? result.errorMessage : undefined,
          };
        } catch (err: any) {
          logger.error('Error syncing SimpleFIN connection in sync all', { connectionId: conn.id, error: err.message });
          return {
            id: conn.id,
            name: conn.label,
            type: 'simplefin',
            status: 'error',
            error: err.message || 'Unknown error',
          };
        }
      }),
      ...pConnections.map(async (conn) => {
        try {
          const { syncPlaidConnection } = await import('@/lib/services/plaid-sync');
          const result = await syncPlaidConnection(conn.id, userId, dek);

          const [refreshed] = await getDb()
            .select({ syncFrequency: plaidConnections.syncFrequency, lastSyncAt: plaidConnections.lastSyncAt })
            .from(plaidConnections)
            .where(eq(plaidConnections.id, conn.id))
            .limit(1);

          if (refreshed) {
            await syncScheduler.schedule(conn.id, refreshed.syncFrequency, refreshed.lastSyncAt, userId);
          }

          return {
            id: conn.id,
            name: conn.label || 'Plaid Connection',
            type: 'plaid',
            status: result.status,
            accountsSynced: result.accountsSynced || 0,
            transactionsNew: result.transactionsNew || 0,
            error: result.status === 'error' ? result.errorMessage : undefined,
          };
        } catch (err: any) {
          logger.error('Error syncing Plaid connection in sync all', { connectionId: conn.id, error: err.message });
          return {
            id: conn.id,
            name: conn.label || 'Plaid Connection',
            type: 'plaid',
            status: 'error',
            error: err.message || 'Unknown error',
          };
        }
      }),
    ];

    const manualPromises = syncableManualAccounts.map(async (acc) => {
      try {
        const result = await syncManualAccount(acc.id, dataUserId, apiConfig, dek);

        if (result.status === 'success') {
          const [refreshed] = await getDb()
            .select({ balanceDate: accounts.balanceDate, metadata: accounts.metadata })
            .from(accounts)
            .where(eq(accounts.id, acc.id))
            .limit(1);

          if (refreshed) {
            let syncFrequency = 'manual';
            try {
              const { decryptField } = await import('@/lib/crypto');
              let raw: string;
              if (typeof refreshed.metadata === 'string') {
                raw = await decryptField(refreshed.metadata, dek);
              } else {
                raw = JSON.stringify(refreshed.metadata || '{}');
              }
              const meta = JSON.parse(raw) as Record<string, unknown>;
              syncFrequency = (meta.syncFrequency as string) || 'manual';

              const isRealEstate = [
                'realestate', 'primaryhome', 'secondaryhome', 'rentalproperty', 'commercial', 'land', 'otherrealestate',
                'single-family', 'condo', 'townhouse', 'multi-family'
              ].includes(acc.type);
              if (isRealEstate && syncFrequency === 'daily') {
                syncFrequency = 'best';
                try {
                  meta.syncFrequency = 'best';
                  const updatedMeta = JSON.stringify(meta);
                  const encryptedMeta = dek ? await (await import('@/lib/crypto')).encryptField(updatedMeta, dek) : updatedMeta;
                  await getDb()
                    .update(accounts)
                    .set({ metadata: encryptedMeta, updatedAt: new Date() })
                    .where(eq(accounts.id, acc.id));
                } catch (dbErr) {
                  logger.error('Failed to save coerced syncFrequency in connection sync', { accountId: acc.id, error: String(dbErr) });
                }
              }
            } catch {}
            await manualAccountScheduler.schedule(acc.id, userId, syncFrequency, refreshed.balanceDate);
          }
        }

        return {
          id: acc.id,
          name: acc.name,
          type: 'manual-account',
          status: result.status,
          error: result.status === 'error' ? result.errorMessage : undefined,
        };
      } catch (err: any) {
        logger.error('Error syncing manual account in sync all', { accountId: acc.id, error: err.message });
        return {
          id: acc.id,
          name: acc.name,
          type: 'manual-account',
          status: 'error',
          error: err.message || 'Unknown error',
        };
      }
    });

    const results = await Promise.all([...connectionPromises, ...manualPromises]);
    const failedCount = results.filter((r) => r.status === 'error').length;
    const overallStatus = failedCount === results.length ? 'error' : failedCount > 0 ? 'partial' : 'success';

    logger.info('Sync all finished', { userId, status: overallStatus, total: totalToSync, failed: failedCount });

    return NextResponse.json({
      status: overallStatus,
      results,
      syncedCount: totalToSync - failedCount,
      failedCount,
    });
  } catch (error: any) {
    logger.error('Sync all internal error', { error: error.message });
    return NextResponse.json({ error: 'internal_error', message: error.message || 'Failed to sync' }, { status: 500 });
  }
}
