import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { categoryRules, transactions, transactionTags } from '@/lib/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptRows, encryptRow, encryptField } from '@/lib/crypto';
import { evaluateCondition } from '@/lib/services/rules-engine';
import { invalidateUserSearchCache } from '@/lib/services/search-cache';

const BulkActionSchema = z.object({
  ids: z.array(z.string().uuid()),
  action: z.enum(['update', 'delete', 'run']),
  updates: z.object({
    isActive: z.boolean().optional(),
    setCategoryId: z.string().uuid().nullable().optional(),
    setTagId: z.string().uuid().nullable().optional(),
    setPayee: z.string().max(200).nullable().optional(),
    setReviewed: z.boolean().nullable().optional(),
    overrideExisting: z.boolean().optional(),
  }).optional(),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const userId = session.user.id;
  const dek = await getSessionDEK();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const parsed = BulkActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_error', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { ids, action, updates } = parsed.data;
  if (ids.length === 0) {
    return NextResponse.json({ success: true, count: 0 });
  }

  logger.info('POST /api/category-rules/bulk', { userId, action, count: ids.length });

  // 1. DELETE Action
  if (action === 'delete') {
    const deleted = await getDb()
      .delete(categoryRules)
      .where(and(eq(categoryRules.userId, userId), inArray(categoryRules.id, ids)))
      .returning();
    return NextResponse.json({ success: true, count: deleted.length });
  }

  // 2. UPDATE Action
  if (action === 'update') {
    if (!updates) {
      return NextResponse.json({ error: 'Missing updates object' }, { status: 400 });
    }

    const encrypted = (await encryptRow('category_rules', { ...updates }, dek)) as any;
    encrypted.updatedAt = new Date();

    const updated = await getDb()
      .update(categoryRules)
      .set(encrypted)
      .where(and(eq(categoryRules.userId, userId), inArray(categoryRules.id, ids)))
      .returning();

    return NextResponse.json({ success: true, count: updated.length });
  }

  // 3. RUN Action
  if (action === 'run') {
    // Fetch rules to apply
    const rules = await getDb()
      .select()
      .from(categoryRules)
      .where(and(eq(categoryRules.userId, userId), inArray(categoryRules.id, ids)));

    const decryptedRules = await decryptRows('category_rules', rules, dek);

    // Fetch transactions
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

    // Fetch existing tags for these transactions
    const txIds = decryptedTxns.map((t) => t.id);
    const existingTags = txIds.length > 0
      ? await getDb()
          .select({ transactionId: transactionTags.transactionId })
          .from(transactionTags)
          .where(inArray(transactionTags.transactionId, txIds))
      : [];
    const txsWithTags = new Set(existingTags.map((t) => t.transactionId));

    let totalMatched = 0;

    // Apply each rule
    for (const rule of decryptedRules) {
      const matchedUpdates: Array<{ txId: string; shouldUpdateTags: boolean; shouldUpdateCategory: boolean }> = [];
      for (const tx of decryptedTxns) {
        if (evaluateCondition(rule, tx)) {
          const hasTags = txsWithTags.has(tx.id);
          const shouldUpdateCategory = !tx.categoryId || rule.overrideExisting;
          const shouldUpdateTags = !hasTags || rule.overrideExisting;

          if (shouldUpdateCategory || shouldUpdateTags) {
            matchedUpdates.push({
              txId: tx.id,
              shouldUpdateTags,
              shouldUpdateCategory,
            });
          }
        }
      }

      if (matchedUpdates.length > 0) {
        totalMatched += matchedUpdates.length;

        for (const update of matchedUpdates) {
          const txId = update.txId;

          if (update.shouldUpdateCategory) {
            const updateData: Record<string, unknown> = { updatedAt: new Date() };
            if (rule.setCategoryId) updateData.categoryId = rule.setCategoryId;
            if (rule.setPayee) {
              updateData.payee = await encryptField(rule.setPayee, dek);
            }
            if (rule.setReviewed !== null) updateData.reviewed = rule.setReviewed;

            await getDb()
              .update(transactions)
              .set(updateData)
              .where(eq(transactions.id, txId));
          }

          if (update.shouldUpdateTags) {
            if (rule.overrideExisting) {
              await getDb()
                .delete(transactionTags)
                .where(eq(transactionTags.transactionId, txId));
            }
            if (rule.setTagId) {
              await getDb()
                .insert(transactionTags)
                .values({ transactionId: txId, tagId: rule.setTagId })
                .onConflictDoNothing();
            }
          }
        }
      }
    }

    if (totalMatched > 0) {
      invalidateUserSearchCache(userId);
    }

    return NextResponse.json({ success: true, matched: totalMatched, total: allTxns.length });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
