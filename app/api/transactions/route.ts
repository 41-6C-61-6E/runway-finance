import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { transactions, accounts, categories } from '@/lib/db/schema';
import { eq, and, or, sql, gt, gte, lte, asc, desc, inArray, not } from 'drizzle-orm';
import { TransactionFilterSchema, BulkPatchTransactionSchema } from '@/lib/validations/transaction';
import { logger } from '@/lib/logger';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: 'unauthenticated', message: 'Authentication required' },
      { status: 401 }
    );
  }

  const userId = session.user.id;
  const { searchParams } = new URL(request.url);

  const parsed = TransactionFilterSchema.safeParse({
    accountId: searchParams.get('accountId') ?? undefined,
    accountIds: searchParams.get('accountIds') ?? undefined,
    accountTypes: searchParams.get('accountTypes') ?? undefined,
    startDate: searchParams.get('startDate') ?? undefined,
    endDate: searchParams.get('endDate') ?? undefined,
    categoryId: searchParams.get('categoryId') ?? undefined,
    categoryIds: searchParams.get('categoryIds') ?? undefined,
    search: searchParams.get('search') ?? undefined,
    pending: searchParams.get('pending') ?? undefined,
    reviewed: searchParams.get('reviewed') ?? undefined,
    minAmount: searchParams.get('minAmount') ?? undefined,
    maxAmount: searchParams.get('maxAmount') ?? undefined,
    limit: parseInt(searchParams.get('limit') ?? '50', 10),
    offset: parseInt(searchParams.get('offset') ?? '0', 10),
    sort: searchParams.get('sort') ?? 'date',
    order: searchParams.get('order') ?? 'desc',
  });

  if (!parsed.success) {
    logger.warn('Transaction query validation failed', { errors: parsed.error.flatten().fieldErrors });
    return NextResponse.json(
      { error: 'validation_error', message: 'Invalid query parameters', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const filters = parsed.data;

  logger.info('Fetching transactions', { accountId: filters.accountId, categoryId: filters.categoryId, search: filters.search, startDate: filters.startDate, endDate: filters.endDate, limit: filters.limit, offset: filters.offset });

  // Build where clause
  const whereConditions = [eq(transactions.userId, userId)];

  // Filter out hidden accounts unless explicitly filtering by accountId
  if (!filters.accountId) {
    const hiddenAccountIds = await getDb()
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.userId, userId), eq(accounts.isHidden, true)));
    
    if (hiddenAccountIds.length > 0) {
      const hiddenIds = hiddenAccountIds.map((a) => a.id);
      whereConditions.push(not(inArray(transactions.accountId, hiddenIds)));
    }
  }

  if (filters.accountIds) {
    const ids = filters.accountIds.split(',').map(id => id.trim()).filter(Boolean);
    if (ids.length > 0) {
      whereConditions.push(inArray(transactions.accountId, ids));
    }
  } else if (filters.accountId) {
    whereConditions.push(eq(transactions.accountId, filters.accountId));
  }
  if (filters.accountTypes) {
    const types = filters.accountTypes.split(',').map(t => t.trim()).filter(Boolean);
    if (types.length > 0) {
      whereConditions.push(inArray(accounts.type, types));
    }
  }
  if (filters.startDate) {
    whereConditions.push(gte(transactions.date, filters.startDate));
  }
  if (filters.endDate) {
    whereConditions.push(lte(transactions.date, filters.endDate));
  }
  if (filters.pending !== undefined) {
    whereConditions.push(eq(transactions.pending, filters.pending));
  }
  if (filters.reviewed !== undefined) {
    whereConditions.push(eq(transactions.reviewed, filters.reviewed));
  }
  if (filters.minAmount !== undefined) {
    whereConditions.push(gt(sql`ABS(${transactions.amount})`, filters.minAmount));
  }
  if (filters.maxAmount !== undefined) {
    whereConditions.push(lte(sql`ABS(${transactions.amount})`, filters.maxAmount));
  }

  // Handle category filter
  if (filters.categoryIds) {
    const ids = filters.categoryIds.split(',').map(id => id.trim()).filter(Boolean);
    if (ids.length > 0) {
      const uncategorizedIdx = ids.indexOf('uncategorized');
      if (uncategorizedIdx !== -1) {
        const otherIds = ids.filter((_, i) => i !== uncategorizedIdx);
        if (otherIds.length > 0) {
          whereConditions.push(
            or(eq(transactions.categoryId, null), inArray(transactions.categoryId, otherIds))
          );
        } else {
          whereConditions.push(eq(transactions.categoryId, null));
        }
      } else {
        whereConditions.push(inArray(transactions.categoryId, ids));
      }
    }
  } else if (filters.categoryId) {
    if (filters.categoryId === 'uncategorized') {
      whereConditions.push(eq(transactions.categoryId, null));
    } else {
      whereConditions.push(eq(transactions.categoryId, filters.categoryId));
    }
  }

  // Handle search with FTS
  if (filters.search) {
    const searchQuery = sql`to_tsvector('english', ${transactions.description} || ' ' || COALESCE(${transactions.payee}, '') || ' ' || COALESCE(${transactions.notes}, ''))`;
    const searchVector = sql`plainto_tsquery('english', ${filters.search})`;
    whereConditions.push(sql`${searchQuery} @@ ${searchVector}`);
  }

  // Get total count (leftJoin accounts for accountTypes filter)
  const [totalRow] = await getDb()
    .select({ count: sql<number>`count(*)` })
    .from(transactions)
    .leftJoin(accounts, eq(transactions.accountId, accounts.id))
    .where(and(...whereConditions))
    .limit(1);

  const total = totalRow?.count ?? 0;

  // Build ordered query with joins
  const sortColumn = filters.sort === 'amount' ? transactions.amount : filters.sort === 'description' ? transactions.description : transactions.date;
  const orderFn = filters.order === 'asc' ? asc : desc;

  const result = await getDb()
    .select({
      transaction: transactions,
      account: {
        name: accounts.name,
      },
      category: {
        id: categories.id,
        name: categories.name,
        color: categories.color,
      },
    })
    .from(transactions)
    .leftJoin(accounts, eq(transactions.accountId, accounts.id))
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(...whereConditions))
    .orderBy(orderFn(sortColumn))
    .limit(filters.limit)
    .offset(filters.offset);

  // Transform to flat structure
  const data = result.map((row) => ({
    ...row.transaction,
    accountName: row.account?.name ?? null,
    category: row.category ?? null,
  }));

  logger.info('Transactions fetched', { total, returned: data.length });
  return NextResponse.json({ data, total, limit: filters.limit, offset: filters.offset });
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: 'unauthenticated', message: 'Authentication required' },
      { status: 401 }
    );
  }

  const userId = session.user.id;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    logger.warn('Transaction PATCH invalid request body');
    return NextResponse.json(
      { error: 'validation_error', message: 'Invalid request body' },
      { status: 400 }
    );
  }

  const parsed = BulkPatchTransactionSchema.safeParse(body);
  if (!parsed.success) {
    logger.warn('Transaction bulk patch validation failed', { errors: parsed.error.flatten().fieldErrors });
    return NextResponse.json(
      { error: 'validation_error', message: 'Invalid request body', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { ids, patch } = parsed.data;
  const patchedFields: string[] = [];
  if (patch.categoryId !== undefined) patchedFields.push('categoryId');
  if (patch.reviewed !== undefined) patchedFields.push('reviewed');
  if (patch.ignored !== undefined) patchedFields.push('ignored');
  logger.info('Patching transactions', { idsCount: ids.length, patchedFields });

  const updated = await getDb()
    .update(transactions)
    .set({
      ...(patch.categoryId !== undefined ? { categoryId: patch.categoryId } : {}),
      ...(patch.reviewed !== undefined ? { reviewed: patch.reviewed } : {}),
      ...(patch.ignored !== undefined ? { ignored: patch.ignored } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(transactions.userId, userId), sql`${transactions.id} = ANY(${ids})`))
    .returning();

  logger.info('Transactions patched', { updatedCount: updated.length });
  return NextResponse.json({ updated: updated.length });
}
