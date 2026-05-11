import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { categoryRules, transactions } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { evaluateCondition } from '@/lib/services/rules-engine';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const userId = session.user.id;
  const { id } = await params;

  const [rule] = await getDb()
    .select()
    .from(categoryRules)
    .where(and(eq(categoryRules.id, id), eq(categoryRules.userId, userId)))
    .limit(1);

  if (!rule) {
    return NextResponse.json({ error: 'not_found', message: 'Rule not found' }, { status: 404 });
  }

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
    .where(eq(transactions.userId, userId));

  const matchedIds: string[] = [];
  for (const tx of allTxns) {
    if (evaluateCondition(rule, tx)) {
      matchedIds.push(tx.id);
    }
  }

  if (matchedIds.length > 0) {
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (rule.setCategoryId) updateData.categoryId = rule.setCategoryId;
    if (rule.setPayee) updateData.payee = rule.setPayee;
    if (rule.setReviewed !== null) updateData.reviewed = rule.setReviewed;

    for (const txId of matchedIds) {
      await getDb()
        .update(transactions)
        .set(updateData)
        .where(eq(transactions.id, txId));
    }
  }

  return NextResponse.json({
    matched: matchedIds.length,
    total: allTxns.length,
  });
}
