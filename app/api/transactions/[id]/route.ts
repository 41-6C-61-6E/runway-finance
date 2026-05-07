import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { transactions, accounts, categories } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { PatchTransactionSchema } from '@/lib/validations/transaction';
import { sanitizeText } from '@/lib/utils/sanitize';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: 'unauthenticated', message: 'Authentication required' },
      { status: 401 }
    );
  }

  const userId = session.user.id;
  const { id } = await params;

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
    return NextResponse.json(
      { error: 'not_found', message: 'Transaction not found' },
      { status: 404 }
    );
  }

  const row = result[0];
  return NextResponse.json({
    ...row.transaction,
    accountName: row.accountName ?? null,
    category: row.category ?? null,
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
  const { id } = await params;

  const [existing] = await getDb()
    .select()
    .from(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.userId, userId)))
    .limit(1);

  if (!existing) {
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

  // Sanitize text fields
  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (categoryId !== undefined) updateData.categoryId = categoryId;
  if (payee !== undefined) updateData.payee = sanitizeText(payee, 200);
  if (notes !== undefined) updateData.notes = sanitizeText(notes, 2000);
  if (reviewed !== undefined) updateData.reviewed = reviewed;
  if (ignored !== undefined) updateData.ignored = ignored;

  const [updated] = await getDb()
    .update(transactions)
    .set(updateData)
    .where(eq(transactions.id, id))
    .returning();

  return NextResponse.json(updated);
}
