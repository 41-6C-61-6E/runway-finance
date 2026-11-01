import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { categoryRules, transactions, transactionTags } from '@/lib/db/schema';
import { eq, and, inArray, asc } from 'drizzle-orm';
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
    // Fetch rules to apply ordered deterministically by priority
    const rules = await getDb()
      .select()
      .from(categoryRules)
      .where(and(eq(categoryRules.userId, userId), inArray(categoryRules.id, ids)))
      .orderBy(asc(categoryRules.priority), asc(categoryRules.createdAt), asc(categoryRules.id));

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

    const matchedUpdates = new Map<string, {
      txId: string;
      setCategoryId?: string | null;
      setPayee?: string | null;
      setReviewed?: boolean | null;
      setTagId?: string | null;
      overrideExistingTag?: boolean;
      shouldUpdateCategory: boolean;
      shouldUpdateTags: boolean;
    }>();

    for (const tx of decryptedTxns) {
      let catApplied = false;
      let tagApplied = false;
      const hasTags = txsWithTags.has(tx.id);

      for (const rule of decryptedRules) {
        if (evaluateCondition(rule, tx)) {
          const ruleWantsCat = Boolean(rule.setCategoryId || rule.setPayee || rule.setReviewed !== null);
          const canUpdateCategory = !catApplied && ruleWantsCat && (!tx.categoryId || rule.overrideExisting);
          const canUpdateTags = !tagApplied && Boolean(rule.setTagId) && (!hasTags || rule.overrideExisting);

          if (canUpdateCategory || canUpdateTags) {
            const current = matchedUpdates.get(tx.id) || {
              txId: tx.id,
              shouldUpdateCategory: false,
              shouldUpdateTags: false,
            };

            if (canUpdateCategory) {
              current.shouldUpdateCategory = true;
              current.setCategoryId = rule.setCategoryId;
              current.setPayee = rule.setPayee ?? null;
              current.setReviewed = rule.setReviewed ?? null;
              catApplied = true;
            }

            if (canUpdateTags) {
              current.shouldUpdateTags = true;
              current.setTagId = rule.setTagId ?? null;
              current.overrideExistingTag = Boolean(rule.overrideExisting);
              tagApplied = true;
            }

            matchedUpdates.set(tx.id, current);

            if (catApplied && tagApplied) {
              break;
            }
          }
        }
      }
    }

    const updatesToApply = Array.from(matchedUpdates.values());
    if (updatesToApply.length > 0) {
      await getDb().transaction(async (tx) => {
        for (const update of updatesToApply) {
          const txId = update.txId;

          if (update.shouldUpdateCategory) {
            const updateData: Record<string, unknown> = { updatedAt: new Date() };
            if (update.setCategoryId) updateData.categoryId = update.setCategoryId;
            if (update.setPayee) {
              updateData.payee = await encryptField(update.setPayee, dek);
            }
            if (update.setReviewed !== null && update.setReviewed !== undefined) {
              updateData.reviewed = update.setReviewed;
            }

            await tx
              .update(transactions)
              .set(updateData)
              .where(eq(transactions.id, txId));
          }

          if (update.shouldUpdateTags && update.setTagId) {
            if (update.overrideExistingTag) {
              await tx
                .delete(transactionTags)
                .where(eq(transactionTags.transactionId, txId));
            }
            await tx
              .insert(transactionTags)
              .values({ transactionId: txId, tagId: update.setTagId })
              .onConflictDoNothing();
          }
        }
      });
    }

    if (updatesToApply.length > 0) {
      invalidateUserSearchCache(userId);
    }

    return NextResponse.json({ success: true, matched: updatesToApply.length, total: allTxns.length });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
