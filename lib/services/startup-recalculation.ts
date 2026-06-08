import { getDb } from '@/lib/db';
import { accounts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getServerDEK } from '@/lib/crypto-context';
import { decryptRows } from '@/lib/crypto';
import { generateHistoricalAccountSnapshots, recalculateNetWorthSnapshots } from '@/lib/services/account-history';
import { generateAssetHistorySnapshots } from '@/lib/services/asset-estimator';
import { updateMonthlyCashFlowSummaries, updateCategorySpendingSummaries, updateCategoryIncomeSummaries } from '@/lib/services/sync';
import { invalidateUserSearchCache } from '@/lib/services/search-cache';
import { readApiConfig } from '@/lib/services/manual-accounts';
import { logger } from '@/lib/logger';

const MODEL_SNAPSHOT_TYPES = [
  'realestate', 'primaryhome', 'secondaryhome', 'rentalproperty', 'commercial', 'land', 'otherrealestate',
  'single-family', 'condo', 'townhouse', 'multi-family', 'other',
  'vehicle', 'metals', 'mortgage'
];

export async function recalculateAllSnapshots(): Promise<void> {
  const db = getDb();

  const userIds = await db
    .selectDistinct({ userId: accounts.userId })
    .from(accounts)
    .then(rows => rows.map(r => r.userId));

  if (userIds.length === 0) {
    logger.info('[startup-recalculation] No users with accounts found, skipping recalculation');
    return;
  }

  logger.info('[startup-recalculation] Starting full snapshot recalculation', { userCount: userIds.length });

  for (const userId of userIds) {
    try {
      const dek = await getServerDEK(userId);

      const userAccounts = await db
        .select()
        .from(accounts)
        .where(eq(accounts.userId, userId));

      if (userAccounts.length === 0) continue;

      const decrypted = await decryptRows('accounts', userAccounts, dek);
      const today = new Date().toISOString().split('T')[0];
      const apiConfig = await readApiConfig(userId).catch(() => undefined);

      for (const account of decrypted) {
        try {
          if (MODEL_SNAPSHOT_TYPES.includes(account.type)) {
            const meta = typeof account.metadata === 'string'
              ? JSON.parse(account.metadata)
              : (typeof account.metadata === 'object' && account.metadata !== null ? account.metadata : {});
            await generateAssetHistorySnapshots(
              account.id, userId, account.type, meta as Record<string, unknown>, apiConfig, dek
            );
          } else {
            await generateHistoricalAccountSnapshots(account.id, userId, '2023-01-01', today, dek);
          }
        } catch (accountErr) {
          logger.error('[startup-recalculation] Failed to regenerate snapshots for account', {
            userId, accountId: account.id, accountName: account.name,
            error: accountErr instanceof Error ? accountErr.message : String(accountErr),
          });
        }
      }

      await recalculateNetWorthSnapshots(userId, dek);

      await Promise.all([
        updateMonthlyCashFlowSummaries(userId, dek),
        updateCategorySpendingSummaries(userId, dek),
        updateCategoryIncomeSummaries(userId, dek),
      ]).catch((err) => {
        logger.error('[startup-recalculation] Failed to update summaries', { userId, error: String(err) });
      });

      invalidateUserSearchCache(userId);

      logger.info('[startup-recalculation] Completed for user', { userId });
    } catch (userErr) {
      logger.error('[startup-recalculation] Failed for user', {
        userId,
        error: userErr instanceof Error ? userErr.message : String(userErr),
      });
    }
  }

  logger.info('[startup-recalculation] Full recalculation finished', { userCount: userIds.length });
}
