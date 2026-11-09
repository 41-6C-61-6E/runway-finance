import 'server-only';
import { getDb } from '@/lib/db';
import { sentNotifications, userNotifications, userSettings, accounts, simplifinConnections, plaidConnections } from '@/lib/db/schema';
import { eq, and, or, sql, gte } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { sendPushNotification } from '../transport';

/**
 * Re-arms sync-failure alerts after a successful sync (R1).
 */
export async function healSyncAlerts(userId: string, targetId: string): Promise<void> {
  try {
    const db = getDb();
    const syncKeyPrefix = `sync_error:${targetId}:`;
    const staleKeyPrefix = `stale_sync:${targetId}:`;

    await db
      .delete(sentNotifications)
      .where(
        and(
          eq(sentNotifications.userId, userId),
          or(
            sql`${sentNotifications.key} LIKE ${syncKeyPrefix + '%'}`,
            sql`${sentNotifications.key} LIKE ${staleKeyPrefix + '%'}`
          )
        )
      );

    await db
      .update(userNotifications)
      .set({ isRead: true, readAt: new Date() })
      .where(
        and(
          eq(userNotifications.userId, userId),
          or(
            eq(userNotifications.type, 'sync_error'),
            eq(userNotifications.type, 'stale_sync')
          ),
          or(
            sql`${userNotifications.urlPath} LIKE ${`%${targetId}%`}`,
            sql`${userNotifications.urlPath} LIKE ${`%connection=${targetId}`}`
          )
        )
      );
  } catch (err) {
    logger.debug('[notifications-service] Could not heal sync alerts (non-critical)', {
      userId,
      targetId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Sustained sync failure / staleness alerts.
 */
export async function checkStaleConnectionsAndNotify(userId: string, dek: Uint8Array): Promise<void> {
  try {
    const db = getDb();
    const [settings] = await db
      .select({
        notifySyncErrors: userSettings.notifySyncErrors,
        locale: userSettings.locale,
        currency: userSettings.currency,
      })
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);

    if (!settings || !settings.notifySyncErrors) return;

    const { getAccountsSyncStatus } = await import('@/lib/services/sync-health');
    const { decryptRows } = await import('@/lib/crypto');
    const { getConnectionDisplayName } = await import('@/lib/services/scheduler-logger');

    const userAccounts = await db
      .select()
      .from(accounts)
      .where(
        and(
          eq(accounts.userId, userId),
          eq(accounts.isHidden, false),
          eq(accounts.isExcludedFromNetWorth, false)
        )
      );

    const decrypted = await decryptRows('accounts', userAccounts, dek);
    const statuses = await getAccountsSyncStatus(userId, dek, decrypted);

    const sfConns = await db
      .select({
        id: simplifinConnections.id,
        label: simplifinConnections.label,
        lastSyncAt: simplifinConnections.lastSyncAt,
        lastSyncStatus: simplifinConnections.lastSyncStatus,
        lastSyncError: simplifinConnections.lastSyncError,
        createdAt: simplifinConnections.createdAt,
      })
      .from(simplifinConnections)
      .where(eq(simplifinConnections.userId, userId));

    const pConns = await db
      .select({
        id: plaidConnections.id,
        label: plaidConnections.label,
        institutionName: plaidConnections.institutionName,
        lastSyncAt: plaidConnections.lastSyncAt,
        lastSyncStatus: plaidConnections.lastSyncStatus,
        lastSyncError: plaidConnections.lastSyncError,
        createdAt: plaidConnections.createdAt,
      })
      .from(plaidConnections)
      .where(eq(plaidConnections.userId, userId));

    const connsMap = new Map<
      string,
      {
        id: string;
        label: string;
        institutionName?: string | null;
        lastSyncAt: Date | null;
        lastSyncStatus: string;
        lastSyncError: string | null;
        createdAt: Date;
      }
    >();
    for (const c of sfConns) connsMap.set(c.id, c);
    for (const c of pConns) connsMap.set(c.id, c);

    const now = Date.now();
    const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    const weekEpoch = Math.floor(now / SEVEN_DAYS_MS);

    const brokenConnectionIds = new Set<string>();
    const brokenManualAccounts: any[] = [];

    for (const acc of decrypted) {
      const status = statuses[acc.id];
      if (!status || status.status !== 'error') continue;

      const connectionId = acc.connectionId || acc.plaidConnectionId;
      if (connectionId) {
        brokenConnectionIds.add(connectionId);
      } else {
        brokenManualAccounts.push(acc);
      }
    }

    // 1. Process broken bank connections (1 notification per connection)
    for (const connectionId of brokenConnectionIds) {
      const conn = connsMap.get(connectionId);
      const lastSuccessTime = conn?.lastSyncAt
        ? new Date(conn.lastSyncAt).getTime()
        : conn?.createdAt
          ? new Date(conn.createdAt).getTime()
          : 0;

      if (now - lastSuccessTime < THREE_DAYS_MS) {
        continue;
      }

      const keyPrefix = `sync_error:${connectionId}:`;
      const recentAlerts = await db
        .select({ id: sentNotifications.id, sentAt: sentNotifications.sentAt })
        .from(sentNotifications)
        .where(
          and(
            eq(sentNotifications.userId, userId),
            sql`${sentNotifications.key} LIKE ${keyPrefix + '%'}`,
            gte(sentNotifications.sentAt, new Date(now - SEVEN_DAYS_MS))
          )
        )
        .limit(1);

      if (recentAlerts.length > 0) {
        continue;
      }

      const connectionDisplayName =
        (await getConnectionDisplayName(connectionId, dek)) ||
        conn?.institutionName ||
        conn?.label ||
        null;

      const title = connectionDisplayName
        ? `Bank connection problem: ${connectionDisplayName}`
        : 'Bank connection problem';

      const daysBroken = Math.max(3, Math.round((now - lastSuccessTime) / (1000 * 60 * 60 * 24)));
      const body = `Your bank connection${connectionDisplayName ? ` to ${connectionDisplayName}` : ''} has not synced in ${daysBroken} days. Tap to review and re-authorize if needed.`;
      const urlPath = `/settings?tab=advanced&connection=${connectionId}`;
      const dedupKey = `sync_error:${connectionId}:w${weekEpoch}`;

      try {
        await sendPushNotification(
          userId,
          title,
          body,
          urlPath,
          'sync_error',
          dedupKey
        );
      } catch (err) {
        logger.debug('[notifications-service] Connection sync alert suppressed or failed (non-fatal):', err);
      }
    }

    // 2. Process broken standalone manual accounts (e.g. Redfin, crypto xpub, metals)
    for (const acc of brokenManualAccounts) {
      let meta: any = {};
      try {
        meta = typeof acc.metadata === 'string' ? JSON.parse(acc.metadata) : (acc.metadata || {});
      } catch {}
      if (
        acc.type === 'stock_option' ||
        meta.isEquityAccount ||
        (typeof acc.externalId === 'string' && acc.externalId.startsWith('equity-'))
      ) {
        continue;
      }

      const lastSuccessTime = acc.balanceDate
        ? new Date(acc.balanceDate).getTime()
        : acc.createdAt
          ? new Date(acc.createdAt).getTime()
          : 0;

      if (now - lastSuccessTime < THREE_DAYS_MS) {
        continue;
      }

      const keyPrefix = `sync_error:${acc.id}:`;
      const recentAlerts = await db
        .select({ id: sentNotifications.id, sentAt: sentNotifications.sentAt })
        .from(sentNotifications)
        .where(
          and(
            eq(sentNotifications.userId, userId),
            sql`${sentNotifications.key} LIKE ${keyPrefix + '%'}`,
            gte(sentNotifications.sentAt, new Date(now - SEVEN_DAYS_MS))
          )
        )
        .limit(1);

      if (recentAlerts.length > 0) {
        continue;
      }

      const daysBroken = Math.max(3, Math.round((now - lastSuccessTime) / (1000 * 60 * 60 * 24)));
      const title = `Sync problem: ${acc.name}`;
      const body = `Account balance has not updated in ${daysBroken} days. Tap to review account settings.`;
      const urlPath = `/accounts?account=${acc.id}`;
      const dedupKey = `sync_error:${acc.id}:w${weekEpoch}`;

      try {
        await sendPushNotification(
          userId,
          title,
          body,
          urlPath,
          'sync_error',
          dedupKey
        );
      } catch (err) {
        logger.debug('[notifications-service] Manual account sync alert suppressed or failed (non-fatal):', err);
      }
    }
  } catch (err) {
    logger.error('[notifications-service] Error checking stale connections:', err);
  }
}

