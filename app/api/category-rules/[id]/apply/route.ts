import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { categoryRules, transactions, transactionTags } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
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
  const dek = await getSessionDEK();
  const { id } = await params;

  const [rule] = await getDb()
    .select()
    .from(categoryRules)
    .where(and(eq(categoryRules.id, id), eq(categoryRules.userId, userId)))
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
    .where(and(eq(transactions.userId, userId), eq(transactions.deleted, false)));

  const decryptedTxns = await decryptRows('transactions', allTxns, dek);

  const matchedIds: string[] = [];
  for (const tx of decryptedTxns) {
    if (evaluateCondition(decryptedRule, tx)) {
      if (!tx.categoryId || decryptedRule.overrideExisting) {
        matchedIds.push(tx.id);
      }
    }
  }

  if (matchedIds.length > 0) {
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (decryptedRule.setCategoryId) updateData.categoryId = decryptedRule.setCategoryId;
    if (decryptedRule.setPayee) {
      updateData.payee = await encryptField(decryptedRule.setPayee, dek);
    }
    if (decryptedRule.setReviewed !== null) updateData.reviewed = decryptedRule.setReviewed;

    for (const txId of matchedIds) {
      await getDb()
        .update(transactions)
        .set(updateData)
        .where(eq(transactions.id, txId));

      // Apply tag if rule has setTagId
      if (decryptedRule.setTagId) {
        await getDb()
          .insert(transactionTags)
          .values({ transactionId: txId, tagId: decryptedRule.setTagId })
          .onConflictDoNothing();
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
