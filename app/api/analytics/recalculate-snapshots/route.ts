import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { accounts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptRows } from '@/lib/crypto';
import { generateHistoricalAccountSnapshots, recalculateNetWorthSnapshots } from '@/lib/services/account-history';
import { generateAssetHistorySnapshots } from '@/lib/services/asset-estimator';
import { readApiConfig } from '@/lib/services/manual-accounts';
import { updateMonthlyCashFlowSummaries, updateCategorySpendingSummaries, updateCategoryIncomeSummaries } from '@/lib/services/sync';
import { invalidateUserSearchCache } from '@/lib/services/search-cache';

const MODEL_SNAPSHOT_TYPES = [
  'realestate', 'primaryhome', 'secondaryhome', 'rentalproperty', 'commercial', 'land', 'otherrealestate',
  'single-family', 'condo', 'townhouse', 'multi-family', 'other',
  'vehicle', 'metals', 'mortgage'
];

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { error: 'unauthenticated', message: 'Authentication required' },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const dataUserId = (session.user as any).dataUserId ?? session.user.id;
    const dek = await getSessionDEK();
    const db = getDb();

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'netWorth';
    const today = new Date().toISOString().split('T')[0];

    logger.info('Starting snapshot recalculation', { userId, type });

    const userAccounts = await db
      .select()
      .from(accounts)
      .where(eq(accounts.userId, dataUserId));

    const decrypted = await decryptRows('accounts', userAccounts, dek);

    let syntheticCount = 0;
    let skippedCount = 0;
    let summaryMonths = 0;
    let summaryTransactions = 0;
    let summarySpendingRows = 0;
    let summarySpendingCategories = 0;
    let summaryIncomeRows = 0;
    let summaryIncomeCategories = 0;
    const errors: Array<{ accountId: string; error: string }> = [];

    if (type === 'netWorth') {
      const apiConfig = await readApiConfig(userId).catch(() => undefined);
      for (const account of decrypted) {
        try {
          if (MODEL_SNAPSHOT_TYPES.includes(account.type)) {
            const meta = typeof account.metadata === 'string'
              ? JSON.parse(account.metadata)
              : (typeof account.metadata === 'object' && account.metadata !== null ? account.metadata : {});
            const count = await generateAssetHistorySnapshots(
              account.id, dataUserId, account.type, meta as Record<string, unknown>, apiConfig, dek
            );
            syntheticCount += count;
            logger.info('Generated model-based snapshots for account during netWorth recalculate', {
              accountId: account.id,
              accountName: account.name,
              syntheticCount: count,
            });
          } else {
            const result = await generateHistoricalAccountSnapshots(
              account.id,
              dataUserId,
              '2023-01-01',
              today,
              dek
            );
            syntheticCount += result.syntheticCount;
            skippedCount += result.skippedRealCount;
            logger.info('Generated transaction-based snapshots for account', {
              accountId: account.id,
              accountName: account.name,
              syntheticCount: result.syntheticCount,
              skippedReal: result.skippedRealCount,
            });
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          errors.push({ accountId: account.id, error: errorMsg });
          logger.error('Failed to generate snapshots for account', {
            accountId: account.id,
            error: errorMsg,
          });
        }
      }
      // Rebuild the aggregated net worth table from the regenerated account snapshots
      await recalculateNetWorthSnapshots(dataUserId, dek);
    } else if (type === 'realEstate') {
      const apiConfig = await readApiConfig(userId).catch(() => undefined);
      const relevant = decrypted.filter((a: any) => MODEL_SNAPSHOT_TYPES.includes(a.type));
      for (const account of relevant) {
        try {
          const meta = typeof account.metadata === 'string'
            ? JSON.parse(account.metadata)
            : (typeof account.metadata === 'object' && account.metadata !== null ? account.metadata : {});
          const count = await generateAssetHistorySnapshots(
            account.id, dataUserId, account.type, meta as Record<string, unknown>, apiConfig, dek
          );
          syntheticCount += count;
          logger.info('Generated model-based snapshots for account', {
            accountId: account.id,
            accountName: account.name,
            syntheticCount: count,
          });
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          errors.push({ accountId: account.id, error: errorMsg });
          logger.error('Failed to generate model-based snapshots for account', {
            accountId: account.id,
            error: errorMsg,
          });
        }
      }
      // Rebuild the aggregated net worth table from the regenerated real estate snapshots
      await recalculateNetWorthSnapshots(dataUserId, dek);
    } else if (type === 'cashFlow') {
      // Cash flow projections are computed on-the-fly from budgets and
      // spending patterns; no stored snapshots to regenerate.
    } else if (type === 'summaries') {
      invalidateUserSearchCache(dataUserId);
      const monthlyResult = await updateMonthlyCashFlowSummaries(dataUserId, dek);
      const spendingResult = await updateCategorySpendingSummaries(dataUserId, dek);
      const incomeResult = await updateCategoryIncomeSummaries(dataUserId, dek);
      summaryMonths = monthlyResult.monthsUpdated;
      summaryTransactions = monthlyResult.transactionsProcessed;
      summarySpendingRows = spendingResult.categoryRows;
      summarySpendingCategories = spendingResult.categoriesCount;
      summaryIncomeRows = incomeResult.categoryRows;
      summaryIncomeCategories = incomeResult.categoriesCount;
    }

    logger.info('Snapshot recalculation complete', {
      userId,
      type,
      syntheticCount,
      skippedCount,
      errorCount: errors.length,
    });

    return NextResponse.json({
      success: true,
      message: errors.length > 0
        ? `Completed with ${errors.length} error${errors.length === 1 ? '' : 's'}`
        : type === 'netWorth'
          ? `Regenerated account snapshots and rebuilt net worth chart (${syntheticCount} synthetic snapshots across ${decrypted.length} accounts)`
          : type === 'realEstate'
            ? `Regenerated estimated snapshots for model-based accounts (${syntheticCount} synthetic snapshots created)`
            : type === 'summaries'
              ? `Recalculated cash flow (${summaryMonths} months, ${summaryTransactions} transactions), spending (${summarySpendingRows} rows, ${summarySpendingCategories} categories), and income summaries (${summaryIncomeRows} rows, ${summaryIncomeCategories} categories)`
              : `Cash flow projections are computed in real-time \u2014 no stored data to recalculate`,
      stats: {
        accountsProcessed: type === 'netWorth'
          ? decrypted.length
          : type === 'realEstate'
            ? decrypted.filter((a: any) => MODEL_SNAPSHOT_TYPES.includes(a.type)).length
            : 0,
        syntheticSnapshotsCreated: syntheticCount,
        skippedRealSnapshots: skippedCount,
        errorsEncountered: errors.length,
        errors: errors.length > 0 ? errors : undefined,
        ...(type === 'summaries' ? {
          summaryMonths,
          summaryTransactions,
          summarySpendingRows,
          summarySpendingCategories,
          summaryIncomeRows,
          summaryIncomeCategories,
        } : {}),
      },
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Error recalculating snapshots', { error: errorMsg });
    return NextResponse.json(
      { error: 'recalculation_failed', message: errorMsg },
      { status: 500 }
    );
  }
}