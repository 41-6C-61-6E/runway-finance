import { getDb } from '@/lib/db';
import { simplifinConnections, plaidConnections, accountSnapshots, accounts } from '@/lib/db/schema';
import { eq, and, gte, inArray } from 'drizzle-orm';
import { getShareGroup } from '@/lib/sharing';
import { decryptField } from '@/lib/crypto';
import { logger } from '@/lib/logger';

export interface SyncStatus {
  status: 'ok' | 'warning' | 'error';
  reason?: string;
  lastSyncAt?: string;
}

const LOG_TAG = '[sync-health]';

// Market-based account types that fluctuate daily with the market
const MARKET_TYPES = new Set([
  'investment',
  'brokerage',
  'retirement',
  'rothira',
  'traditionalira',
  '401k',
  '403b',
  'sepira',
  'simpleira',
  '529',
  'hsa',
  'otherinvestment',
  'crypto',
  'metals'
]);

export async function getAccountsSyncStatus(
  userId: string,
  dataUserId: string,
  dek: Uint8Array,
  decryptedAccounts: any[]
): Promise<Record<string, SyncStatus>> {
  try {
    const db = getDb();
    
    // 1. Fetch all connection IDs associated with the user/share-group
    const group = await getShareGroup(userId);
    const userIds = group ? group.allUserIds : [userId];

    const sfConns = await db
      .select({
        id: simplifinConnections.id,
        label: simplifinConnections.label,
        syncFrequency: simplifinConnections.syncFrequency,
        lastSyncAt: simplifinConnections.lastSyncAt,
        lastSyncStatus: simplifinConnections.lastSyncStatus,
        lastSyncError: simplifinConnections.lastSyncError,
      })
      .from(simplifinConnections)
      .where(inArray(simplifinConnections.userId, userIds));

    const pConns = await db
      .select({
        id: plaidConnections.id,
        label: plaidConnections.label,
        syncFrequency: plaidConnections.syncFrequency,
        lastSyncAt: plaidConnections.lastSyncAt,
        lastSyncStatus: plaidConnections.lastSyncStatus,
        lastSyncError: plaidConnections.lastSyncError,
      })
      .from(plaidConnections)
      .where(inArray(plaidConnections.userId, userIds));

    // Create maps for quick lookup
    const connectionsMap = new Map<string, typeof sfConns[number]>();
    for (const conn of sfConns) {
      connectionsMap.set(conn.id, conn);
    }
    for (const conn of pConns) {
      connectionsMap.set(conn.id, conn);
    }

    // 2. Fetch all historical snapshots for this dataUser in the last 7 calendar days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];

    const snapshots = await db
      .select({
        accountId: accountSnapshots.accountId,
        snapshotDate: accountSnapshots.snapshotDate,
        balance: accountSnapshots.balance,
      })
      .from(accountSnapshots)
      .where(
        and(
          eq(accountSnapshots.userId, dataUserId),
          gte(accountSnapshots.snapshotDate, sevenDaysAgoStr)
        )
      );

    // Group snapshots by accountId
    const snapshotsByAccount = new Map<string, { date: string; balanceEncrypted: string }[]>();
    for (const snap of snapshots) {
      const existing = snapshotsByAccount.get(snap.accountId) ?? [];
      existing.push({ date: snap.snapshotDate, balanceEncrypted: snap.balance });
      snapshotsByAccount.set(snap.accountId, existing);
    }

    const statuses: Record<string, SyncStatus> = {};

    const now = Date.now();

    for (const acc of decryptedAccounts) {
      const accountId = acc.id;

      // Extract and parse metadata safely
      let meta: Record<string, any> = {};
      if (typeof acc.metadata === 'string' && acc.metadata.trim() !== '') {
        try {
          meta = JSON.parse(acc.metadata);
        } catch {}
      } else if (typeof acc.metadata === 'object' && acc.metadata !== null) {
        meta = acc.metadata;
      }

      // Check if user has explicitly muted alerts/warnings for this account
      if (meta.muteSyncWarnings === true) {
        statuses[accountId] = { status: 'ok' };
        continue;
      }

      const connectionId = acc.connectionId || acc.plaidConnectionId;
      const hasConnection = !!connectionId;

      // Check if manual account is API-driven
      const isCryptoApi = acc.type === 'crypto' && typeof meta.xpub === 'string' && meta.xpub.trim() !== '';
      const isMetalsApi = acc.type === 'metals' && typeof meta.amountOz !== 'undefined' && parseFloat(String(meta.amountOz)) > 0;
      const isRealEstateApi = [
        'realestate', 'primaryhome', 'secondaryhome', 'rentalproperty', 'commercial', 'land', 'otherrealestate',
        'single-family', 'condo', 'townhouse', 'multi-family'
      ].includes(acc.type) && typeof meta.address === 'string' && meta.address.trim() !== '';
      const isApiDrivenManual = isCryptoApi || isMetalsApi || isRealEstateApi;

      // If it's a completely manual/offline account, there is nothing to sync, so it is always OK
      if (!hasConnection && !isApiDrivenManual) {
        statuses[accountId] = { status: 'ok' };
        continue;
      }

      // ── Rule 1: Connection Error (Applies to connected accounts) ──
      if (hasConnection) {
        const conn = connectionsMap.get(connectionId);
        if (conn && conn.lastSyncStatus === 'error') {
          statuses[accountId] = {
            status: 'error',
            reason: conn.lastSyncError || 'The connection failed to sync.',
            lastSyncAt: conn.lastSyncAt ? new Date(conn.lastSyncAt).toISOString() : undefined,
          };
          continue;
        }
      }

      // ── Rule 2: Stale Connection (Applies to connected accounts) ──
      if (hasConnection) {
        const conn = connectionsMap.get(connectionId);
        if (conn) {
          if (!conn.lastSyncAt) {
            statuses[accountId] = {
              status: 'warning',
              reason: 'Connection has never successfully synced.',
            };
            continue;
          }

          const lastSyncTime = new Date(conn.lastSyncAt).getTime();
          const elapsedHours = (now - lastSyncTime) / (1000 * 60 * 60);

          if (conn.syncFrequency === 'daily' && elapsedHours > 48) {
            statuses[accountId] = {
              status: 'warning',
              reason: `Connection has not successfully synced in over 48 hours (last sync was ${Math.round(elapsedHours / 24)} days ago).`,
              lastSyncAt: new Date(conn.lastSyncAt).toISOString(),
            };
            continue;
          }

          if (conn.syncFrequency === 'weekly' && elapsedHours > 24 * 9) {
            statuses[accountId] = {
              status: 'warning',
              reason: `Connection has not successfully synced in over 9 days (last sync was ${Math.round(elapsedHours / 24)} days ago).`,
              lastSyncAt: new Date(conn.lastSyncAt).toISOString(),
            };
            continue;
          }

          if (conn.syncFrequency === 'manual' && elapsedHours > 24 * 30) {
            statuses[accountId] = {
              status: 'warning',
              reason: `Connection has not been synced in over 30 days.`,
              lastSyncAt: new Date(conn.lastSyncAt).toISOString(),
            };
            continue;
          }
        }
      }

      // ── Rule 3: Stale Balance / Market Stagnation (Applies to Investment/Crypto/Metals with active API) ──
      if (MARKET_TYPES.has(acc.type)) {
        const accountSnaps = snapshotsByAccount.get(accountId) ?? [];
        if (accountSnaps.length >= 3) {
          // Decrypt balances for comparison
          const decryptedBalances = await Promise.all(
            accountSnaps.map(async (s) => {
              try {
                const dec = await decryptField(s.balanceEncrypted, dek);
                return parseFloat(dec) || 0;
              } catch {
                return 0;
              }
            })
          );

          // Check if all decrypted values are identical
          const firstVal = decryptedBalances[0];
          const allIdentical = decryptedBalances.every((val) => val === firstVal);

          if (allIdentical) {
            statuses[accountId] = {
              status: 'warning',
              reason: 'Account balance has been static for 7 days despite connection syncs. The data provider may be serving stale cache.',
              lastSyncAt: acc.balanceDate ? new Date(acc.balanceDate).toISOString() : undefined,
            };
            continue;
          }
        }
      }

      // ── Rule 4: Specific Account Update Delay ──
      // If the account balance date is extremely old, despite connection syncs succeeding.
      if (acc.balanceDate) {
        const balanceTime = new Date(acc.balanceDate).getTime();
        const elapsedDays = (now - balanceTime) / (1000 * 60 * 60 * 24);
        if (elapsedDays > 5) {
          statuses[accountId] = {
            status: 'warning',
            reason: `This account's balance has not updated since ${new Date(acc.balanceDate).toLocaleDateString()}, although the sync service is running.`,
            lastSyncAt: new Date(acc.balanceDate).toISOString(),
          };
          continue;
        }
      }

      // If all checks pass, the status is healthy
      statuses[accountId] = { status: 'ok' };
    }

    return statuses;
  } catch (error: any) {
    logger.error(`${LOG_TAG} Error calculating sync health`, { error: error.message });
    return {};
  }
}
