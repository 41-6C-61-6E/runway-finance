import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { transactions, transactionTags } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { applyRulesToTransactions } from '@/lib/services/rules-engine';
import { logger } from '@/lib/logger';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptRows, encryptField } from '@/lib/crypto';
import { invalidateUserSearchCache } from '@/lib/services/search-cache';

export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const userId = session.user.id;
  const dataUserId = (session.user as any).dataUserId ?? session.user.id;
  const dek = await getSessionDEK();

  const allTxns = await getDb()
    .select({
      id: transactions.id,
      description: transactions.description,
      payee: transactions.payee,
      memo: transactions.memo,
      amount: transactions.amount,
      categoryId: transactions.categoryId,
    })
    .from(transactions)
    .where(and(eq(transactions.userId, dataUserId), eq(transactions.deleted, false)));

  if (allTxns.length === 0) {
    return NextResponse.json({ updated: 0, total: 0 });
  }

  const decryptedTxns = await decryptRows('transactions', allTxns, dek);
  const ruleResults = await applyRulesToTransactions(decryptedTxns, dataUserId, dek);

  if (ruleResults.size > 0) {
    for (const [txId, action] of ruleResults) {
      if (action.shouldUpdateCategory) {
        const updateData: Record<string, unknown> = { updatedAt: new Date() };
        if (action.categoryId) updateData.categoryId = action.categoryId;
        if (action.payee) {
          updateData.payee = await encryptField(action.payee, dek);
        }
        if (action.reviewed !== null) updateData.reviewed = action.reviewed;
        if (Object.keys(updateData).length > 1) {
          await getDb()
            .update(transactions)
            .set(updateData)
            .where(eq(transactions.id, txId));
        }
      }

      if (action.shouldUpdateTags) {
        if (action.overrideExisting) {
          await getDb()
            .delete(transactionTags)
            .where(eq(transactionTags.transactionId, txId));
        }
        if (action.setTagId) {
          await getDb()
            .insert(transactionTags)
            .values({ transactionId: txId, tagId: action.setTagId })
            .onConflictDoNothing();
        }
      }
    }
  }

  logger.info('POST /api/category-rules/apply-all', { userId, updated: ruleResults.size, total: allTxns.length });
  if (ruleResults.size > 0) {
    invalidateUserSearchCache(userId);
  }
  return NextResponse.json({
    updated: ruleResults.size,
    total: allTxns.length,
  });
}
