import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { transactions, accounts, categories, transactionTags, tags } from '@/lib/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { PatchTransactionSchema } from '@/lib/validations/transaction';
import { sanitizeText } from '@/lib/utils/sanitize';
import { logger } from '@/lib/logger';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptField, decryptRow, encryptRow, decryptRows } from '@/lib/crypto';
import { updateCategorySpendingSummaries, updateCategoryIncomeSummaries, updateMonthlyCashFlowSummaries } from '@/lib/services/sync';
import { invalidateUserSearchCache } from '@/lib/services/search-cache';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
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

  logger.info('Fetching transaction', { transactionId: id });

  const result = await getDb()
    .select({
      transaction: transactions,
      accountName: accounts.name,
      category: {
        id: categories.id,
        name: categories.name,
        color: categories.color,
      },
    })
    .from(transactions)
    .leftJoin(accounts, eq(transactions.accountId, accounts.id))
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(eq(transactions.id, id), eq(transactions.userId, dataUserId), eq(transactions.deleted, false)))
    .limit(1);

  if (result.length === 0) {
    logger.warn('Transaction not found', { transactionId: id });
    return NextResponse.json(
      { error: 'not_found', message: 'Transaction not found' },
      { status: 404 }
    );
  }

  const row = result[0];

  // Decrypt transaction fields
  const decryptedTx = await decryptRow('transactions', row.transaction, dek);

  // Decrypt account name if present
  let accountName: string | null = null;
  if (row.accountName) {
    accountName = await decryptField(row.accountName, dek);
  }

  // Decrypt category name if present
  let category = row.category;
  if (category?.name) {
    category = { ...category, name: await decryptField(category.name, dek) };
  }

  // Fetch tags for this transaction
  const tagRows = await getDb()
    .select({ tagId: tags.id, tagName: tags.name, tagColor: tags.color })
    .from(transactionTags)
    .leftJoin(tags, eq(transactionTags.tagId, tags.id))
    .where(eq(transactionTags.transactionId, id));

  const txTags = await Promise.all(
    tagRows.map(async (r) => ({
      id: r.tagId,
      name: r.tagName ? await decryptField(r.tagName, dek) : '',
      color: r.tagColor,
    }))
  );

  return NextResponse.json({
    ...decryptedTx,
    accountName: accountName ?? null,
    category: category ?? null,
    tags: txTags,
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
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

  const [existing] = await getDb()
    .select()
    .from(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.userId, dataUserId), eq(transactions.deleted, false)))
    .limit(1);

  if (!existing) {
    logger.warn('Transaction not found for PATCH', { transactionId: id });
    return NextResponse.json(
      { error: 'not_found', message: 'Transaction not found' },
      { status: 404 }
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

  const parsed = PatchTransactionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_error', message: 'Invalid request body', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { categoryId, tagIds, payee, notes, memo, reviewed, ignored, description, amount, date, postedDate, pending } = parsed.data;

  const changedFields: string[] = [];
  if (categoryId !== undefined) changedFields.push('categoryId');
  if (tagIds !== undefined) changedFields.push('tagIds');
  if (payee !== undefined) changedFields.push('payee');
  if (notes !== undefined) changedFields.push('notes');
  if (memo !== undefined) changedFields.push('memo');
  if (reviewed !== undefined) changedFields.push('reviewed');
  if (ignored !== undefined) changedFields.push('ignored');
  if (description !== undefined) changedFields.push('description');
  if (amount !== undefined) changedFields.push('amount');
  if (date !== undefined) changedFields.push('date');
  if (postedDate !== undefined) changedFields.push('postedDate');
  if (pending !== undefined) changedFields.push('pending');
  logger.info('Updating transaction', { transactionId: id, changedFields });

  // Sanitize and encrypt text fields
  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (categoryId !== undefined) {
    updateData.categoryId = categoryId;
    updateData.categorizedByAi = false;

    const childCheck = await getDb()
      .select({ id: transactions.id })
      .from(transactions)
      .where(and(eq(transactions.parentId, id), eq(transactions.deleted, false)))
      .limit(1);
    if (childCheck.length > 0) {
      await getDb()
        .delete(transactions)
        .where(eq(transactions.parentId, id));
      updateData.ignored = false;
    }
  }
  if (payee !== undefined) updateData.payee = sanitizeText(payee, 200);
  if (notes !== undefined) updateData.notes = sanitizeText(notes, 2000);
  if (memo !== undefined) updateData.memo = sanitizeText(memo, 500);
  if (reviewed !== undefined) updateData.reviewed = reviewed;
  if (ignored !== undefined) updateData.ignored = ignored;
  if (description !== undefined) updateData.description = sanitizeText(description, 500);
  if (amount !== undefined) updateData.amount = amount;
  if (date !== undefined) updateData.date = date;
  if (postedDate !== undefined) updateData.postedDate = postedDate;
  if (pending !== undefined) updateData.pending = pending;

  const encrypted = await encryptRow('transactions', updateData, dek);
  const [updated] = await getDb()
    .update(transactions)
    .set(encrypted)
    .where(eq(transactions.id, id))
    .returning();

  // Replace tags if provided
  if (tagIds !== undefined) {
    await getDb().delete(transactionTags).where(eq(transactionTags.transactionId, id));
    if (tagIds.length > 0) {
      await getDb().insert(transactionTags).values(
        tagIds.map((tagId) => ({ transactionId: id, tagId }))
      );
    }
  }

  invalidateUserSearchCache(dataUserId);

  // Rebuild summaries since categories/transactions changed (non-blocking background task)
  Promise.all([
    updateCategorySpendingSummaries(dataUserId, dek),
    updateCategoryIncomeSummaries(dataUserId, dek),
    updateMonthlyCashFlowSummaries(dataUserId, dek),
  ]).catch((err) => {
    logger.error('Background summaries rebuild failed', { userId, error: err });
  });

  return NextResponse.json(updated);
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
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

  logger.info('Soft deleting transaction', { transactionId: id });

  const [existing] = await getDb()
    .select()
    .from(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.userId, dataUserId), eq(transactions.deleted, false)))
    .limit(1);

  if (!existing) {
    logger.warn('Transaction not found for DELETE', { transactionId: id });
    return NextResponse.json(
      { error: 'not_found', message: 'Transaction not found' },
      { status: 404 }
    );
  }

  const [updated] = await getDb()
    .update(transactions)
    .set({ deleted: true, updatedAt: new Date() })
    .where(eq(transactions.id, id))
    .returning();

  invalidateUserSearchCache(dataUserId);

  // Rebuild summaries since categories/transactions changed (non-blocking background task)
  Promise.all([
    updateCategorySpendingSummaries(dataUserId, dek),
    updateCategoryIncomeSummaries(dataUserId, dek),
    updateMonthlyCashFlowSummaries(dataUserId, dek),
  ]).catch((err) => {
    logger.error('Background summaries rebuild failed after DELETE', { userId, error: err });
  });

  return NextResponse.json(updated);
}

