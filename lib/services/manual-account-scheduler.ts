import { getDb } from '@/lib/db';
import { accounts } from '@/lib/db/schema';
import { syncManualAccount, readApiConfig } from '@/lib/services/manual-accounts';
import { getServerDEK } from '@/lib/crypto-context';
import { eq, and, isNull } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { decryptField } from '@/lib/crypto';

const LOG_TAG = '[manual-account-scheduler]';

const SYNCABLE_TYPES = ['realestate', 'crypto', 'metals'] as const;

const SYNC_INTERVALS: Record<string, number> = {
  manual: 0,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
};

const RETRY_DELAY_MS = 30 * 60 * 1000;

async function canSyncUser(userId: string): Promise<boolean> {
  try {
    await getServerDEK(userId);
    return true;
  } catch {
    return false;
  }
}

async function extractSyncFrequency(accountRow: any, dek: Uint8Array): Promise<string> {
  if (!accountRow.metadata) return 'manual';
  try {
    let raw: string;
    if (typeof accountRow.metadata === 'string') {
      raw = await decryptField(accountRow.metadata, dek);
    } else {
      raw = JSON.stringify(accountRow.metadata);
    }
    const meta = JSON.parse(raw) as Record<string, unknown>;
    return (meta.syncFrequency as string) || 'manual';
  } catch {
    return 'manual';
  }
}

class ManualAccountScheduler {
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private _isRunning = false;

  get isRunning(): boolean {
    return this._isRunning;
  }

  async init(): Promise<void> {
    const db = getDb();
    const serverDekMap = new Map<string, Uint8Array>();

    const accountRows = await db
      .select({
        id: accounts.id,
        userId: accounts.userId,
        type: accounts.type,
        balanceDate: accounts.balanceDate,
        metadata: accounts.metadata,
      })
      .from(accounts)
      .where(and(
        isNull(accounts.connectionId),
      ));

    let scheduled = 0;
    let skipped = 0;
    for (const row of accountRows) {
      if (!SYNCABLE_TYPES.includes(row.type as typeof SYNCABLE_TYPES[number])) continue;

      if (!(await canSyncUser(row.userId))) {
        logger.warn(`${LOG_TAG} Skipping account — server DEK unavailable`, {
          accountId: row.id,
          userId: row.userId,
        });
        skipped++;
        continue;
      }

      let dek = serverDekMap.get(row.userId);
      if (!dek) {
        try {
          dek = await getServerDEK(row.userId);
          serverDekMap.set(row.userId, dek);
        } catch {
          logger.warn(`${LOG_TAG} Cannot get server DEK for user`, { userId: row.userId });
          skipped++;
          continue;
        }
      }

      const syncFrequency = await extractSyncFrequency(row, dek);
      if (this.schedule(row.id, row.userId, syncFrequency, row.balanceDate)) {
        scheduled++;
      }
    }

    this._isRunning = true;
    logger.info(`${LOG_TAG} Scheduler initialized`, { total: accountRows.length, scheduled, skipped });
  }

  schedule(
    id: string,
    userId: string,
    syncFrequency: string,
    balanceDate: Date | null
  ): boolean {
    this.cancel(id);

    if (syncFrequency === 'manual') return false;

    const interval = SYNC_INTERVALS[syncFrequency];
    if (!interval) return false;

    const now = Date.now();
    const lastSyncTime = balanceDate ? balanceDate.getTime() : 0;
    const nextSyncTime = lastSyncTime + interval;
    const delay = Math.max(0, nextSyncTime - now);

    const timer = setTimeout(() => this.execute(id, userId), delay);
    this.timers.set(id, timer);

    logger.info(`${LOG_TAG} Scheduled`, {
      accountId: id,
      frequency: syncFrequency,
      delay: `${Math.round(delay / 1000 / 60)}m`,
    });

    return true;
  }

  cancel(id: string): void {
    const existing = this.timers.get(id);
    if (existing) {
      clearTimeout(existing);
      this.timers.delete(id);
    }
  }

  async scheduleForUser(userId: string): Promise<void> {
    const db = getDb();
    const userAccounts = await db
      .select({
        id: accounts.id,
        type: accounts.type,
        balanceDate: accounts.balanceDate,
        metadata: accounts.metadata,
      })
      .from(accounts)
      .where(and(
        eq(accounts.userId, userId),
        isNull(accounts.connectionId),
      ));

    const dek = await getServerDEK(userId);
    for (const row of userAccounts) {
      if (!SYNCABLE_TYPES.includes(row.type as typeof SYNCABLE_TYPES[number])) continue;
      const syncFrequency = await extractSyncFrequency(row, dek);
      this.schedule(row.id, userId, syncFrequency, row.balanceDate);
    }
  }

  private async execute(id: string, userId: string): Promise<void> {
    this.timers.delete(id);

    let syncSuccess = false;
    let dekUnavailable = false;

    try {
      const dek = await getServerDEK(userId);
      const apiConfig = await readApiConfig(userId);
      const result = await syncManualAccount(id, userId, apiConfig, dek);
      syncSuccess = result.status === 'success';

      if (syncSuccess) {
        logger.info(`${LOG_TAG} Auto-sync completed`, { accountId: id });
      } else {
        logger.error(`${LOG_TAG} Auto-sync failed`, {
          accountId: id,
          error: result.errorMessage,
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('server-wrapped') || msg.includes('Encryption key unavailable')) {
        dekUnavailable = true;
        logger.warn(`${LOG_TAG} Server DEK unavailable, will not retry`, { accountId: id });
      } else {
        logger.error(`${LOG_TAG} Auto-sync error`, {
          accountId: id,
          error: msg,
        });
      }
    }

    // Re-read current state to decide how to reschedule
    try {
      const db = getDb();
      const [updated] = await db
        .select({
          userId: accounts.userId,
          balanceDate: accounts.balanceDate,
          metadata: accounts.metadata,
        })
        .from(accounts)
        .where(eq(accounts.id, id))
        .limit(1);

      if (!updated) return;

      const dek = await getServerDEK(updated.userId);
      const syncFrequency = await extractSyncFrequency(updated, dek);

      if (syncFrequency === 'manual') return;

      if (dekUnavailable) return;

      if (syncSuccess) {
        this.schedule(id, updated.userId, syncFrequency, updated.balanceDate);
      } else {
        const timer = setTimeout(() => this.execute(id, updated.userId), RETRY_DELAY_MS);
        this.timers.set(id, timer);
        logger.info(`${LOG_TAG} Retry scheduled in 30m`, { accountId: id });
      }
    } catch (err) {
      logger.error(`${LOG_TAG} Failed to reschedule`, {
        accountId: id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  shutdown(): void {
    for (const [id, timer] of this.timers) {
      clearTimeout(timer);
    }
    this.timers.clear();
    this._isRunning = false;
    logger.info(`${LOG_TAG} Scheduler shut down`);
  }
}

export const manualAccountScheduler = new ManualAccountScheduler();
