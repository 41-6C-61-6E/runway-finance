import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { transactions, accounts, categories } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { PatchTransactionSchema } from '@/lib/validations/transaction';
import { sanitizeText } from '@/lib/utils/sanitize';
import { logger } from '@/lib/logger';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptField, decryptRow, encryptRow } from '@/lib/crypto';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: 'unauthenticated', message: 'Authentication required' },
      { status: 401 }
    );
  }

  const userId = session.user.id;
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
    .where(and(eq(transactions.id, id), eq(transactions.userId, userId)))
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

  return NextResponse.json({
    ...decryptedTx,
    accountName: accountName ?? null,
    category: category ?? null,
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
  const dek = await getSessionDEK();
  const { id } = await params;

  const [existing] = await getDb()
    .select()
    .from(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.userId, userId)))
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

  const { categoryId, payee, notes, reviewed, ignored } = parsed.data;

  const changedFields: string[] = [];
  if (categoryId !== undefined) changedFields.push('categoryId');
  if (payee !== undefined) changedFields.push('payee');
  if (notes !== undefined) changedFields.push('notes');
  if (reviewed !== undefined) changedFields.push('reviewed');
  if (ignored !== undefined) changedFields.push('ignored');
  logger.info('Updating transaction', { transactionId: id, changedFields });

  // Sanitize and encrypt text fields
  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (categoryId !== undefined) updateData.categoryId = categoryId;
  if (payee !== undefined) updateData.payee = sanitizeText(payee, 200);
  if (notes !== undefined) updateData.notes = sanitizeText(notes, 2000);
  if (reviewed !== undefined) updateData.reviewed = reviewed;
  if (ignored !== undefined) updateData.ignored = ignored;

  const encrypted = await encryptRow('transactions', updateData, dek);
  const [updated] = await getDb()
    .update(transactions)
    .set(encrypted)
    .where(eq(transactions.id, id))
    .returning();

  return NextResponse.json(updated);
}
