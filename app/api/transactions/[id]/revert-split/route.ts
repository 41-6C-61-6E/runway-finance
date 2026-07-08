import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { transactions } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { getSessionDEK } from '@/lib/crypto-context';
import { updateCategorySpendingSummaries, updateCategoryIncomeSummaries, updateMonthlyCashFlowSummaries } from '@/lib/services/sync';
import { invalidateUserSearchCache } from '@/lib/services/search-cache';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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
  const { id } = await params;

  logger.info('Reverting split transaction request received', { transactionId: id });

  const db = getDb();

  // 1. Find transaction by ID
  const [txn] = await db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.id, id),
        eq(transactions.userId, dataUserId),
        eq(transactions.deleted, false)
      )
    )
    .limit(1);

  if (!txn) {
    logger.warn('Transaction not found for revert split', { transactionId: id });
    return NextResponse.json(
      { error: 'not_found', message: 'Transaction not found' },
      { status: 404 }
    );
  }

  // Determine the parent ID
  const parentId = txn.parentId || txn.id;

  // 2. Fetch the parent transaction
  const [parentTx] = await db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.id, parentId),
        eq(transactions.userId, dataUserId),
        eq(transactions.deleted, false)
      )
    )
    .limit(1);

  if (!parentTx) {
    logger.warn('Parent transaction not found for revert split', { parentId });
    return NextResponse.json(
      { error: 'not_found', message: 'Parent transaction not found' },
      { status: 404 }
    );
  }

  // 3. Check if there are actually split children associated with the parent
  const children = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.parentId, parentTx.id), eq(transactions.deleted, false)));

  if (children.length === 0) {
    return NextResponse.json(
      { error: 'bad_request', message: 'Transaction is not currently split' },
      { status: 400 }
    );
  }

  try {
    await db.transaction(async (tx) => {
      // 4. Delete the child transactions (cascade deletes tags automatically)
      await tx
        .delete(transactions)
        .where(eq(transactions.parentId, parentTx.id));

      // 5. Restore the parent transaction (unignore it)
      await tx
        .update(transactions)
        .set({ ignored: false, updatedAt: new Date() })
        .where(eq(transactions.id, parentTx.id));
    });

    invalidateUserSearchCache(dataUserId);

    // Rebuild summaries asynchronously
    Promise.all([
      updateCategorySpendingSummaries(dataUserId, dek),
      updateCategoryIncomeSummaries(dataUserId, dek),
      updateMonthlyCashFlowSummaries(dataUserId, dek),
    ]).catch((err) => {
      logger.error('Background summaries rebuild failed after revert split', { userId: dataUserId, error: err });
    });

    logger.info('Transaction split reverted successfully', { parentId: parentTx.id });

    return NextResponse.json({
      success: true,
      transaction: { ...parentTx, ignored: false },
    });
  } catch (err) {
    logger.error('Failed to commit transaction revert split', { transactionId: id, error: err });
    return NextResponse.json(
      { error: 'server_error', message: 'Failed to revert transaction split' },
      { status: 500 }
    );
  }
}
