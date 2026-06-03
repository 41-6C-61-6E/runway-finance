import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { categoryRules, transactions, transactionTags } from '@/lib/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { evaluateCondition } from '@/lib/services/rules-engine';
import { logger } from '@/lib/logger';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptRows, encryptField } from '@/lib/crypto';
import { invalidateUserSearchCache } from '@/lib/services/search-cache';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const userId = session.user.id;
  const dataUserId = (session.user as any).dataUserId ?? session.user.id;
  const dek = await getSessionDEK();
  const { id } = await params;

  const [rule] = await getDb()
    .select()
    .from(categoryRules)
    .where(and(eq(categoryRules.userId, dataUserId), eq(categoryRules.id, id)))
    .limit(1);

  if (!rule) {
    return NextResponse.json({ error: 'not_found', message: 'Rule not found' }, { status: 404 });
  }

  const [decryptedRule] = await decryptRows('category_rules', [rule], dek);

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

  const decryptedTxns = await decryptRows('transactions', allTxns, dek);

  // Fetch existing tags for these transactions
  const txIds = decryptedTxns.map((t) => t.id);
  const existingTags = txIds.length > 0
    ? await getDb()
        .select({ transactionId: transactionTags.transactionId })
        .from(transactionTags)
        .where(inArray(transactionTags.transactionId, txIds))
    : [];
  const txsWithTags = new Set(existingTags.map((t) => t.transactionId));

  const matchedIds: string[] = [];
  const matchedUpdates: Array<{ txId: string; shouldUpdateTags: boolean; shouldUpdateCategory: boolean }> = [];

  for (const tx of decryptedTxns) {
    if (evaluateCondition(decryptedRule, tx)) {
      const hasTags = txsWithTags.has(tx.id);
      const shouldUpdateCategory = !tx.categoryId || decryptedRule.overrideExisting;
      const shouldUpdateTags = !hasTags || decryptedRule.overrideExisting;

      if (shouldUpdateCategory || shouldUpdateTags) {
        matchedIds.push(tx.id);
        matchedUpdates.push({
          txId: tx.id,
          shouldUpdateTags,
          shouldUpdateCategory,
        });
      }
    }
  }

  if (matchedIds.length > 0) {
    for (const update of matchedUpdates) {
      const txId = update.txId;

      if (update.shouldUpdateCategory) {
        const updateData: Record<string, unknown> = { updatedAt: new Date() };
        if (decryptedRule.setCategoryId) updateData.categoryId = decryptedRule.setCategoryId;
        if (decryptedRule.setPayee) {
          updateData.payee = await encryptField(decryptedRule.setPayee, dek);
        }
        if (decryptedRule.setReviewed !== null) updateData.reviewed = decryptedRule.setReviewed;

        await getDb()
          .update(transactions)
          .set(updateData)
          .where(eq(transactions.id, txId));
      }

      if (update.shouldUpdateTags) {
        if (decryptedRule.overrideExisting) {
          await getDb()
            .delete(transactionTags)
            .where(eq(transactionTags.transactionId, txId));
        }
        if (decryptedRule.setTagId) {
          await getDb()
            .insert(transactionTags)
            .values({ transactionId: txId, tagId: decryptedRule.setTagId })
            .onConflictDoNothing();
        }
      }
    }
  }

  logger.info('POST /api/category-rules/[id]/apply', { userId, ruleId: id, matched: matchedIds.length, total: allTxns.length });
  if (matchedIds.length > 0) {
    invalidateUserSearchCache(userId);
  }
  return NextResponse.json({
    matched: matchedIds.length,
    total: allTxns.length,
  });
}
