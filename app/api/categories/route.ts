import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { categories, transactions } from '@/lib/db/schema';
import { eq, and, asc, sql } from 'drizzle-orm';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptRows, encryptRow } from '@/lib/crypto';
import { ensureCompoundCategories, ensureEmployerContributions, mergeDuplicateCategories } from '@/lib/db/seed-categories';

function normalizeCategoryName(name: string) {
  return name.trim().toLowerCase();
}

const CreateCategorySchema = z.object({
  name: z.string().min(1).max(100),
  parentId: z.string().uuid().nullable().optional(),
  color: z.string().max(7).default('#6366f1'),
  isIncome: z.boolean().default(false),
  excludeFromReports: z.boolean().default(false),
  hideFromTransactions: z.boolean().default(false),
  displayOrder: z.number().int().default(0),
  categoryType: z.enum(['standard', 'compound', 'transfer']).default('standard'),
  expenseParentId: z.string().uuid().nullable().optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const userId = session.user.id;
  const dataUserId = (session.user as any).dataUserId ?? session.user.id;
  const dek = await getSessionDEK();

  // Ensure compound categories exist (idempotent — safe to call on every page load)
  await ensureCompoundCategories(dataUserId, dek);
  await ensureEmployerContributions(dataUserId, dek);

  const [cats, txCounts] = await Promise.all([
    getDb()
      .select()
      .from(categories)
      .where(eq(categories.userId, dataUserId))
      .orderBy(asc(categories.displayOrder)),
    getDb()
      .select({
        categoryId: transactions.categoryId,
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(transactions)
      .where(and(eq(transactions.userId, dataUserId), sql`${transactions.categoryId} IS NOT NULL`))
      .groupBy(transactions.categoryId),
  ]);

  const countByCategoryId = new Map(txCounts.map((r) => [r.categoryId, r.count]));

  const decrypted = await decryptRows('categories', cats, dek);
  const withCounts = decrypted.map((cat) => ({
    ...cat,
    transactionCount: countByCategoryId.get(cat.id) ?? 0,
  }));
  logger.info('GET /api/categories', { userId, count: withCounts.length });
  return NextResponse.json(withCounts);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const userId = session.user.id;
  const dataUserId = (session.user as any).dataUserId ?? session.user.id;
  const dek = await getSessionDEK();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const parsed = CreateCategorySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_error', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { name, parentId, color, isIncome, excludeFromReports, hideFromTransactions, displayOrder, categoryType, expenseParentId } = parsed.data;

  await mergeDuplicateCategories(dataUserId, dek);

  const existingCategories = await decryptRows(
    'categories',
    await getDb()
      .select()
      .from(categories)
      .where(eq(categories.userId, dataUserId)),
    dek
  );
  const matchingExisting = existingCategories.find((cat) =>
    normalizeCategoryName(cat.name) === normalizeCategoryName(name) &&
    (cat.parentId ?? null) === (parentId ?? null)
  );

  if (matchingExisting) {
    logger.info('POST /api/categories - reused existing', { userId, name, parentId, existingId: matchingExisting.id });
    return NextResponse.json(matchingExisting, { status: 200 });
  }

  const encryptedValues = await encryptRow('categories', {
    userId: dataUserId,
    name,
    parentId: parentId ?? null,
    color,
    isIncome,
    isSystem: false,
    excludeFromReports,
    hideFromTransactions,
    displayOrder,
    categoryType,
    expenseParentId: expenseParentId ?? null,
  }, dek);

  const [cat] = await getDb()
    .insert(categories)
    .values(encryptedValues)
    .returning();

  logger.info('POST /api/categories - created', { userId, name, isIncome });
  return NextResponse.json(cat, { status: 201 });
}
