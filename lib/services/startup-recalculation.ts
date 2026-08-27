import { getDb } from '@/lib/db';
import { accounts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getServerDEK } from '@/lib/crypto-context';
import { decryptRows } from '@/lib/crypto';
import { generateHistoricalAccountSnapshots, recalculateNetWorthSnapshots, getAccountEarliestCalculationDate } from '@/lib/services/account-history';
import { generateAssetHistorySnapshots } from '@/lib/services/asset-estimator';
import { updateMonthlyCashFlowSummaries, updateCategorySpendingSummaries, updateCategoryIncomeSummaries } from '@/lib/services/sync';
import { invalidateUserSearchCache } from '@/lib/services/search-cache';
import { readApiConfig } from '@/lib/services/manual-accounts';
import { logger } from '@/lib/logger';

import { REAL_ESTATE_SUBTYPES } from '@/lib/constants/account-types';

const MODEL_SNAPSHOT_TYPES = [
  ...REAL_ESTATE_SUBTYPES,
  'other',
  'vehicle',
  'metals',
  'mortgage'
];

function formatRecalculationError(err: unknown): string {
  if (err instanceof Error) {
    if ('cause' in err && err.cause !== undefined) {
      const causeMsg = err.cause instanceof Error ? err.cause.message : String(err.cause);
      return `${err.message} (cause: ${causeMsg})`;
    }
    return err.message;
  }
  return String(err);
}


export interface RecalculationStatus {
  status: 'idle' | 'running' | 'completed' | 'failed';
  totalUsers: number;
  processedUsers: number;
  currentUser: string | null;
  errors: string[];
  startedAt: string | null;
  completedAt: string | null;
  type: string;
  /**
   * L-3 (2026-08-27 security review): the user who owns this run (manual
   * per-user runs). `system-startup` runs have owner null (visible to all).
   * Callers only report status for runs they own/triggered, to prevent
   * cross-user bleed of other households' progress/errors.
   */
  owner: string | null;
}

export let recalculationStatus: RecalculationStatus = {
  status: 'idle',
  totalUsers: 0,
  processedUsers: 0,
  currentUser: null,
  errors: [],
  startedAt: null,
  completedAt: null,
  type: 'system-startup',
  owner: null,
};

export async function runBackgroundRecalculation(
  force = false,
  specificUserId?: string,
  specificType = 'netWorth',
  dekOverride?: Uint8Array
): Promise<void> {
  if (recalculationStatus.status === 'running' && !force) {
    logger.info('[startup-recalculation] Recalculation already running, skipping');
    return;
  }

  const db = getDb();
  let userIds: string[] = [];

  if (specificUserId) {
    userIds = [specificUserId];
  } else {
    userIds = await db
      .selectDistinct({ userId: accounts.userId })
      .from(accounts)
      .then(rows => rows.map(r => r.userId));
  }

  recalculationStatus = {
    status: 'running',
    totalUsers: userIds.length,
    processedUsers: 0,
    currentUser: null,
    errors: [],
    startedAt: new Date().toISOString(),
    completedAt: null,
    type: specificUserId ? specificType : 'system-startup',
    owner: specificUserId ?? null,
  };

  if (userIds.length === 0) {
    logger.info('[startup-recalculation] No users found for recalculation');
    recalculationStatus.status = 'completed';
    recalculationStatus.completedAt = new Date().toISOString();
    return;
  }

  logger.info('[startup-recalculation] Starting background recalculation', {
    userCount: userIds.length,
    type: recalculationStatus.type,
  });

  for (const userId of userIds) {
    recalculationStatus.currentUser = userId;
    // Yield event loop
    await new Promise(resolve => setTimeout(resolve, 50));

    try {
      const dek = dekOverride || (await getServerDEK(userId));

      const userAccounts = await db
        .select()
        .from(accounts)
        .where(eq(accounts.userId, userId));

      if (userAccounts.length === 0) {
        recalculationStatus.processedUsers++;
        continue;
      }

      const decrypted = await decryptRows('accounts', userAccounts, dek);
      const today = new Date().toISOString().split('T')[0];
      const apiConfig = await readApiConfig(userId).catch(() => undefined);

      if (specificType === 'netWorth' || !specificUserId) {
        for (const account of decrypted) {
          // Yield event loop
          await new Promise(resolve => setTimeout(resolve, 20));

          try {
            if (MODEL_SNAPSHOT_TYPES.includes(account.type)) {
              const meta = typeof account.metadata === 'string'
                ? JSON.parse(account.metadata)
                : (typeof account.metadata === 'object' && account.metadata !== null ? account.metadata : {});
              await generateAssetHistorySnapshots(
                account.id, userId, account.type, meta as Record<string, unknown>, apiConfig, dek
              );
            } else {
              const fromDate = await getAccountEarliestCalculationDate(
                account.id,
                userId,
                account.metadata,
                dek
              );
              await generateHistoricalAccountSnapshots(account.id, userId, fromDate, today, dek);
            }
          } catch (accountErr) {
            const errMsg = `Account "${account.name}" (${account.id}): ${formatRecalculationError(accountErr)}`;
            recalculationStatus.errors.push(errMsg);
            logger.error('[startup-recalculation] Failed to generate account snapshots', {
              userId, accountId: account.id, error: accountErr
            });
          }
        }
        await recalculateNetWorthSnapshots(userId, dek);
      } else if (specificType === 'realEstate') {
        const relevant = decrypted.filter(a => MODEL_SNAPSHOT_TYPES.includes(a.type));
        for (const account of relevant) {
          await new Promise(resolve => setTimeout(resolve, 20));
          try {
            const meta = typeof account.metadata === 'string'
              ? JSON.parse(account.metadata)
              : (typeof account.metadata === 'object' && account.metadata !== null ? account.metadata : {});
            await generateAssetHistorySnapshots(
              account.id, userId, account.type, meta as Record<string, unknown>, apiConfig, dek
            );
          } catch (accountErr) {
            const errMsg = `Real Estate "${account.name}" (${account.id}): ${formatRecalculationError(accountErr)}`;
            recalculationStatus.errors.push(errMsg);
            logger.error('[startup-recalculation] Failed to generate real estate snapshots', {
              userId, accountId: account.id, error: accountErr
            });
          }
        }
        await recalculateNetWorthSnapshots(userId, dek);
      }

      if (specificType === 'summaries' || !specificUserId) {
        // Run sequentially to avoid saturating the connection pool
        try {
          await updateMonthlyCashFlowSummaries(userId, dek);
          await updateCategorySpendingSummaries(userId, dek);
          await updateCategoryIncomeSummaries(userId, dek);
        } catch (err) {
          const errMsg = `Summaries: ${formatRecalculationError(err)}`;
          recalculationStatus.errors.push(errMsg);
          logger.error('[startup-recalculation] Failed to update summaries', { userId, error: err });
        }
      }

      invalidateUserSearchCache(userId);
      logger.info('[startup-recalculation] Completed recalculation for user', { userId });
    } catch (userErr) {
      const errMsg = `User ${userId}: ${formatRecalculationError(userErr)}`;
      recalculationStatus.errors.push(errMsg);
      logger.error('[startup-recalculation] Failed recalculation for user', { userId, error: userErr });
    }

    recalculationStatus.processedUsers++;
  }

  recalculationStatus.status = recalculationStatus.errors.length > 0 ? 'failed' : 'completed';
  recalculationStatus.completedAt = new Date().toISOString();
  recalculationStatus.currentUser = null;

  logger.info('[startup-recalculation] Background recalculation finished', {
    status: recalculationStatus.status,
    errors: recalculationStatus.errors.length,
  });
}

export async function recalculateAllSnapshots(force = false): Promise<void> {
  // Only run startup recalculation if explicitly requested via env (e.g. after schema migration) or forced
  const startupRecalcEnabled = process.env.RECALCULATE_ON_STARTUP === 'true' || force;
  if (!startupRecalcEnabled) {
    logger.info('[startup-recalculation] Startup recalculation skipped (snapshots are up to date; set RECALCULATE_ON_STARTUP=true to force on boot)');
    return;
  }

  // Defer startup recalculation by 8 seconds to allow server to boot and handle initial requests cleanly
  setTimeout(() => {
    logger.info('[startup-recalculation] Triggering deferred startup recalculation');
    runBackgroundRecalculation(force).catch((err: unknown) => {
      logger.error('[startup-recalculation] Startup recalculation run error', { error: err });
    });
  }, 8000);
}
