import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { transactions, transactionTags } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { SplitTransactionSchema } from '@/lib/validations/transaction';
import { logger } from '@/lib/logger';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptField, encryptRow } from '@/lib/crypto';
import { updateCategorySpendingSummaries, updateCategoryIncomeSummaries, updateMonthlyCashFlowSummaries } from '@/lib/services/sync';
import { invalidateUserSearchCache } from '@/lib/services/search-cache';

export async function POST(
  request: Request,
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

  logger.info('Splitting transaction request received', { transactionId: id });

  // 1. Fetch parent transaction
  const [parentTx] = await getDb()
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

  if (!parentTx) {
    logger.warn('Parent transaction not found for split', { transactionId: id });
    return NextResponse.json(
      { error: 'not_found', message: 'Transaction not found' },
      { status: 404 }
    );
  }

  // Ensure it's not already a child transaction (cannot split a split)
  if (parentTx.parentId) {
    return NextResponse.json(
      { error: 'bad_request', message: 'Cannot split a child transaction' },
      { status: 400 }
    );
  }

  // Ensure it's not a pending transaction
  if (parentTx.pending) {
    return NextResponse.json(
      { error: 'bad_request', message: 'Cannot split a pending transaction' },
      { status: 400 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'validation_error', message: 'Invalid request body' },
      { status: 400 }
    );
  }

  const parsed = SplitTransactionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'validation_error',
        message: 'Invalid request body',
        details: parsed.error.flatten().fieldErrors,
      },
      { status: 400 }
    );
  }

  const { splits } = parsed.data;

  // 2. Validate split amounts match parent amount
  const decryptedAmountStr = await decryptField(parentTx.amount, dek);
  const parentAmount = parseFloat(decryptedAmountStr) || 0;
  const parentAbs = Math.abs(parentAmount);

  let splitsSum = 0;
  for (const split of splits) {
    const cleanSplitAmount = parseFloat(split.amount.replace(/[^\d.-]/g, '')) || 0;
    splitsSum += Math.abs(cleanSplitAmount);
  }

  if (Math.round(parentAbs * 100) !== Math.round(splitsSum * 100)) {
    return NextResponse.json(
      {
        error: 'validation_error',
        message: `Sum of splits ($${splitsSum.toFixed(2)}) must equal the transaction amount ($${parentAbs.toFixed(2)})`,
      },
      { status: 400 }
    );
  }

  const newChildren: any[] = [];

  try {
    await getDb().transaction(async (tx) => {
      // 3. Mark parent as ignored
      await tx
        .update(transactions)
        .set({ ignored: true, reviewed: true, updatedAt: new Date() })
        .where(eq(transactions.id, id));

      // 4. Create and encrypt child transactions
      for (let i = 0; i < splits.length; i++) {
        const split = splits[i];
        const cleanAmountNum = parseFloat(split.amount.replace(/[^\d.-]/g, '')) || 0;
        // Apply original transaction sign (income vs expense)
        const childAmountNum = parentAmount >= 0 ? Math.abs(cleanAmountNum) : -Math.abs(cleanAmountNum);
        const childAmountStr = childAmountNum.toFixed(2);

        const parentDesc = parentTx.description ? await decryptField(parentTx.description, dek) : '';
        const parentPayee = parentTx.payee ? await decryptField(parentTx.payee, dek) : null;
        const parentMemo = parentTx.memo ? await decryptField(parentTx.memo, dek) : null;

        const childValues = {
          userId: dataUserId,
          accountId: parentTx.accountId,
          externalId: `${parentTx.externalId}_split_${i}`,
          date: parentTx.date,
          postedDate: parentTx.postedDate,
          amount: childAmountStr,
          description: split.description?.trim() || parentDesc,
          payee: parentPayee,
          memo: parentMemo,
          pending: parentTx.pending,
          categoryId: split.categoryId || null,
          notes: split.notes?.trim() || null,
          reviewed: true,
          categorizedByAi: false,
          ignored: false,
          deleted: false,
          isImported: parentTx.isImported,
          importId: parentTx.importId,
          source: parentTx.source,
          parentId: parentTx.id,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const encryptedChild = await encryptRow('transactions', childValues, dek);

        const [insertedChild] = await tx
          .insert(transactions)
          .values(encryptedChild)
          .returning();

        if (split.tagIds && split.tagIds.length > 0) {
          await tx.insert(transactionTags).values(
            split.tagIds.map((tagId) => ({
              transactionId: insertedChild.id,
              tagId,
            }))
          );
        }

        newChildren.push(insertedChild);
      }
    });

    invalidateUserSearchCache(dataUserId);

    // Rebuild summaries asynchronously
    Promise.all([
      updateCategorySpendingSummaries(dataUserId, dek),
      updateCategoryIncomeSummaries(dataUserId, dek),
      updateMonthlyCashFlowSummaries(dataUserId, dek),
    ]).catch((err) => {
      logger.error('Background summaries rebuild failed after split', { userId: dataUserId, error: err });
    });

    logger.info('Transaction split successfully', {
      parentId: id,
      splitsCount: splits.length,
    });

    return NextResponse.json({
      success: true,
      parent: { ...parentTx, ignored: true, reviewed: true },
      children: newChildren,
    });
  } catch (err) {
    logger.error('Failed to commit transaction split', { transactionId: id, error: err });
    return NextResponse.json(
      { error: 'server_error', message: 'Failed to split transaction' },
      { status: 500 }
    );
  }
}
