import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { aiProposals, transactions, categories as categoriesTable, categoryRules } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { getSessionDEK } from '@/lib/crypto-context';
import { encryptField } from '@/lib/crypto';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const userId = session.user.id;
  const { id } = await params;

  const db = getDb();

  const [proposal] = await db
    .select()
    .from(aiProposals)
    .where(and(eq(aiProposals.id, id), eq(aiProposals.userId, userId)))
    .limit(1);

  if (!proposal) {
    return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
  }

  if (proposal.status !== 'pending') {
    return NextResponse.json({ error: 'Proposal already processed' }, { status: 400 });
  }

  const payload = proposal.payload as any;
  const dek = await getSessionDEK();

  try {
    switch (proposal.type) {
      case 'categorize': {
        await db
          .update(transactions)
          .set({
            categoryId: payload.proposedCategoryId,
            reviewed: true,
            updatedAt: new Date(),
          })
          .where(eq(transactions.id, payload.transactionId));
        logger.info('Approved categorize proposal', { userId, proposalId: id, transactionId: payload.transactionId });
        break;
      }

      case 'create_category': {
        const encryptedName = await encryptField(payload.name, dek);
        const [created] = await db
          .insert(categoriesTable)
          .values({
            userId,
            parentId: payload.parentId,
            name: encryptedName,
            color: payload.color ?? '#6366f1',
            isIncome: payload.isIncome ?? false,
            isSystem: false,
            displayOrder: 999,
          })
          .returning();
        payload._resolvedCategoryId = created.id;
        logger.info('Approved create_category proposal', { userId, proposalId: id, categoryId: created.id });
        break;
      }

      case 'create_rule': {
        const encryptedRule = await encryptField(payload.ruleName, dek);
        await db
          .insert(categoryRules)
          .values({
            userId,
            name: encryptedRule,
            priority: 999,
            isActive: true,
            conditionField: payload.conditionField,
            conditionOperator: payload.conditionOperator,
            conditionValue: await encryptField(payload.conditionValue, dek),
            conditionCaseSensitive: payload.conditionCaseSensitive ?? false,
            setCategoryId: payload.setCategoryId,
            isSystem: false,
          })
          .returning();
        logger.info('Approved create_rule proposal', { userId, proposalId: id, ruleName: payload.ruleName });
        break;
      }
    }

    await db
      .update(aiProposals)
      .set({ status: 'approved', updatedAt: new Date(), payload })
      .where(eq(aiProposals.id, id));

    // If we created a category, find and update dependent proposals
    if (payload._resolvedCategoryId) {
      const dependentProposals = await db
        .select()
        .from(aiProposals)
        .where(and(
          eq(aiProposals.userId, userId),
          eq(aiProposals.status, 'pending'),
        ));

      for (const dep of dependentProposals) {
        const depPayload = dep.payload as any;
        let updated = false;

        if (dep.type === 'categorize' && depPayload.proposedCategoryName === payload.name) {
          depPayload.proposedCategoryId = payload._resolvedCategoryId;
          updated = true;
        }
        if (dep.type === 'create_rule' && depPayload.setCategoryName === payload.name && !depPayload.setCategoryId) {
          depPayload.setCategoryId = payload._resolvedCategoryId;
          updated = true;
        }

        if (updated) {
          await db
            .update(aiProposals)
            .set({ payload: depPayload })
            .where(eq(aiProposals.id, dep.id));
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error('Failed to approve proposal', { userId, proposalId: id, error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
