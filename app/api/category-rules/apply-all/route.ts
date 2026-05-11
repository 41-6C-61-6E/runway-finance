import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { transactions } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { applyRulesToTransactions } from '@/lib/services/rules-engine';

export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const userId = session.user.id;

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

  if (allTxns.length === 0) {
    return NextResponse.json({ updated: 0, total: 0 });
  }

  const ruleResults = await applyRulesToTransactions(allTxns, userId);

  if (ruleResults.size > 0) {
    for (const [txId, action] of ruleResults) {
      const updateData: Record<string, unknown> = { updatedAt: new Date() };
      if (action.categoryId) updateData.categoryId = action.categoryId;
      if (action.payee) updateData.payee = action.payee;
      if (action.reviewed !== null) updateData.reviewed = action.reviewed;
      if (Object.keys(updateData).length > 1) {
        await getDb()
          .update(transactions)
          .set(updateData)
          .where(eq(transactions.id, txId));
      }
    }
  }

  return NextResponse.json({
    updated: ruleResults.size,
    total: allTxns.length,
  });
}
