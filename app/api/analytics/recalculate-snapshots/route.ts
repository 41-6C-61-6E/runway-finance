import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { accounts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptRows } from '@/lib/crypto';
import { generateHistoricalAccountSnapshots } from '@/lib/services/account-history';
import { generateAssetHistorySnapshots } from '@/lib/services/asset-estimator';
import { readApiConfig } from '@/lib/services/manual-accounts';

const MODEL_SNAPSHOT_TYPES = ['realestate', 'primaryhome', 'secondaryhome', 'rentalproperty', 'commercial', 'land', 'otherrealestate', 'vehicle', 'metals', 'mortgage'];

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
    const dek = await getSessionDEK();
    const db = getDb();

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'netWorth';
    const today = new Date().toISOString().split('T')[0];

    logger.info('Starting snapshot recalculation', { userId, type });

    const userAccounts = await db
      .select()
      .from(accounts)
      .where(eq(accounts.userId, userId));

    const decrypted = await decryptRows('accounts', userAccounts, dek);

    let syntheticCount = 0;
    let skippedCount = 0;
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
              account.id, userId, account.type, meta as Record<string, unknown>, apiConfig, dek
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
              userId,
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
    } else if (type === 'realEstate') {
      const apiConfig = await readApiConfig(userId).catch(() => undefined);
      const relevant = decrypted.filter((a: any) => MODEL_SNAPSHOT_TYPES.includes(a.type));
      for (const account of relevant) {
        try {
          const meta = typeof account.metadata === 'string'
            ? JSON.parse(account.metadata)
            : (typeof account.metadata === 'object' && account.metadata !== null ? account.metadata : {});
          const count = await generateAssetHistorySnapshots(
            account.id, userId, account.type, meta as Record<string, unknown>, apiConfig, dek
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
    } else if (type === 'cashFlow') {
      // Cash flow projections are computed on-the-fly from budgets and
      // spending patterns; no stored snapshots to regenerate.
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
        : `Recalculated ${type === 'netWorth' ? 'net worth' : type === 'realEstate' ? 'real estate' : 'cash flow'} snapshots successfully`,
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