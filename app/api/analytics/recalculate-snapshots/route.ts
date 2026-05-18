import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { accounts, accountSnapshots } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptRows } from '@/lib/crypto';
import { generateHistoricalAccountSnapshots } from '@/lib/services/account-history';

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

    logger.info('Starting snapshot recalculation', { userId });

    // Get all user accounts
    const userAccounts = await db
      .select()
      .from(accounts)
      .where(eq(accounts.userId, userId));

    const decrypted = await decryptRows('accounts', userAccounts, dek);

    let syntheticCount = 0;
    let skippedCount = 0;
    const errors: Array<{ accountId: string; error: string }> = [];

    // Regenerate snapshots for each account
    for (const account of decrypted) {
      try {
        // Generate synthetic snapshots from transaction history
        // This will fill in missing dates based on transaction data
        const result = await generateHistoricalAccountSnapshots(
          account.id,
          userId,
          '2023-01-01', // Start from beginning
          new Date().toISOString().split('T')[0], // Up to today
          dek
        );

        syntheticCount += result.syntheticCount;
        skippedCount += result.skippedRealCount;

        logger.info('Generated snapshots for account', {
          accountId: account.id,
          accountName: account.name,
          syntheticCount: result.syntheticCount,
          skippedReal: result.skippedRealCount,
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.push({ accountId: account.id, error: errorMsg });
        logger.error('Failed to generate snapshots for account', {
          accountId: account.id,
          error: errorMsg,
        });
      }
    }

    logger.info('Snapshot recalculation complete', {
      userId,
      syntheticCount,
      skippedCount,
      errorCount: errors.length,
    });

    return NextResponse.json({
      success: true,
      message: 'Snapshots recalculated successfully',
      stats: {
        accountsProcessed: decrypted.length,
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
