import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { transactions, accounts, categories, userSettings } from '@/lib/db/schema';
import { eq, and, or, sql, gte, lte, desc, asc, inArray, isNull } from 'drizzle-orm';
import { TransactionFilterSchema, BulkPatchTransactionSchema } from '@/lib/validations/transaction';
import { logger } from '@/lib/logger';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptField, decryptRow, decryptRows } from '@/lib/crypto';
import { updateCategorySpendingSummaries, updateCategoryIncomeSummaries, updateMonthlyCashFlowSummaries } from '@/lib/services/sync';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: 'unauthenticated', message: 'Authentication required' },
      { status: 401 }
    );
  }

  const userId = session.user.id;
  const dek = await getSessionDEK();
  const { searchParams } = new URL(request.url);

  const parsed = TransactionFilterSchema.safeParse({
    accountId: searchParams.get('accountId') ?? undefined,
    accountIds: searchParams.get('accountIds') ?? undefined,
    accountTypes: searchParams.get('accountTypes') ?? searchParams.get('accountType') ?? undefined,
    startDate: searchParams.get('startDate') ?? undefined,
    endDate: searchParams.get('endDate') ?? undefined,
    categoryId: searchParams.get('categoryId') ?? undefined,
    categoryIds: searchParams.get('categoryIds') ?? undefined,
    search: searchParams.get('search') ?? undefined,
    pending: searchParams.get('pending') ?? undefined,
    reviewed: searchParams.get('reviewed') ?? undefined,
    categorizedByAi: searchParams.get('categorizedByAi') ?? undefined,
    minAmount: searchParams.get('minAmount') ?? undefined,
    maxAmount: searchParams.get('maxAmount') ?? undefined,
    limit: parseInt(searchParams.get('limit') ?? '50', 10),
    offset: parseInt(searchParams.get('offset') ?? '0', 10),
    sort: searchParams.get('sort') ?? 'date',
    order: searchParams.get('order') ?? 'desc',
    totalAmountOnly: searchParams.get('totalAmountOnly') === 'true' ? true : undefined,
  });

  if (!parsed.success) {
    logger.warn('Transaction query validation failed', { errors: parsed.error.flatten().fieldErrors });
    return NextResponse.json(
      { error: 'validation_error', message: 'Invalid query parameters', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const filters = parsed.data;

  // Fetch user settings to respect imported data toggles
  const userSettingsList = await getDb()
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);

  const userSetting = userSettingsList[0];
  const rawShowImported = userSetting?.showImportedData;
  const importSettings = {
    global: true,
    netWorth: true,
    realEstate: true,
    cashFlowProjections: true,
    ...(typeof rawShowImported === 'object' && rawShowImported !== null ? rawShowImported : {}),
  } as Record<string, boolean>;

  const isImportTransactionsEnabled = importSettings.global !== false && importSettings.cashFlowProjections !== false;

  logger.info('Fetching transactions', { accountId: filters.accountId, categoryId: filters.categoryId, search: filters.search, startDate: filters.startDate, endDate: filters.endDate, limit: filters.limit, offset: filters.offset, totalAmountOnly: filters.totalAmountOnly });

  // Build where clause (excluding encrypted field filters — applied in memory).
  // Hidden and excluded accounts are global exclusions for user-facing data.
  const whereConditions = [
    eq(transactions.userId, userId),
    eq(accounts.isHidden, false),
    eq(accounts.isExcludedFromNetWorth, false),
  ];

  if (!isImportTransactionsEnabled) {
    whereConditions.push(eq(transactions.isImported, false));
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
  if (filters.categorizedByAi !== undefined) {
    whereConditions.push(eq(transactions.categorizedByAi, filters.categorizedByAi));
  }

  // Handle category filter
  if (filters.categoryIds) {
    const ids = filters.categoryIds.split(',').map(id => id.trim()).filter(Boolean);
    if (ids.length > 0) {
      const uncategorizedIdx = ids.findIndex(id => id === 'uncategorized' || id === 'uncategorized_income');
        if (uncategorizedIdx !== -1) {
        const otherIds = ids.filter((_, i) => i !== uncategorizedIdx);
        if (otherIds.length > 0) {
          whereConditions.push(
            or(isNull(transactions.categoryId), inArray(transactions.categoryId, otherIds))
          );
        } else {
          whereConditions.push(isNull(transactions.categoryId));
        }
      } else {
        whereConditions.push(inArray(transactions.categoryId, ids));
      }
    }
  } else if (filters.categoryId) {
    if (filters.categoryId === 'uncategorized' || filters.categoryId === 'uncategorized_income') {
      whereConditions.push(isNull(transactions.categoryId));
    } else {
      whereConditions.push(eq(transactions.categoryId, filters.categoryId));
    }
  }

  // Optimized path for calculating total amount of matching transactions (Option A)
  if (filters.totalAmountOnly) {
    const selectFields: any = { amount: transactions.amount };
    if (filters.search) {
      selectFields.description = transactions.description;
      selectFields.payee = transactions.payee;
      selectFields.notes = transactions.notes;
    }

    const result = await getDb()
      .select(selectFields)
      .from(transactions)
      .leftJoin(accounts, eq(transactions.accountId, accounts.id))
      .where(and(...whereConditions));

    let filtered = await Promise.all(result.map(async (row: any) => {
      const amount = Math.abs(parseFloat(await decryptField(row.amount, dek)) || 0);
      let matchesSearch = true;
      if (filters.search) {
        const q = filters.search.toLowerCase();
        const descDec = (await decryptField(row.description, dek)).toLowerCase();
        const payeeDec = row.payee ? (await decryptField(row.payee, dek)).toLowerCase() : '';
        const notesDec = row.notes ? (await decryptField(row.notes, dek)).toLowerCase() : '';
        matchesSearch = descDec.includes(q) || payeeDec.includes(q) || notesDec.includes(q);
      }
      return { amount, matchesSearch };
    }));

    if (filters.search) {
      filtered = filtered.filter((f) => f.matchesSearch);
    }
    if (filters.minAmount !== undefined) {
      filtered = filtered.filter((f) => f.amount > filters.minAmount!);
    }
    if (filters.maxAmount !== undefined) {
      filtered = filtered.filter((f) => f.amount <= filters.maxAmount!);
    }

    const totalAmount = filtered.reduce((sum, f) => sum + f.amount, 0);
    return NextResponse.json({ totalAmount });
  }

  // Get total count (before in-memory filters)
  const [totalRow] = await getDb()
    .select({ count: sql<number>`count(*)` })
    .from(transactions)
    .leftJoin(accounts, eq(transactions.accountId, accounts.id))
    .where(and(...whereConditions))
    .limit(1);

  const totalBeforeFilters = totalRow?.count ?? 0;

  const hasEncryptedFilters = !!(filters.search || filters.minAmount !== undefined || filters.maxAmount !== undefined);
  const isEncryptedSort = filters.sort === 'amount' || filters.sort === 'description';

  // If we can paginate in the database, do so! (Massive speedup for page loads/nav)
  if (!hasEncryptedFilters && !isEncryptedSort) {
    const orderByClause = filters.sort === 'date'
      ? (filters.order === 'asc' ? asc(transactions.date) : desc(transactions.date))
      : desc(transactions.date);

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
      .orderBy(orderByClause)
      .limit(filters.limit)
      .offset(filters.offset);

    // Decrypt only the sliced paginated records (exactly 50 items)
    const decryptedTxns = await Promise.all(result.map(async (row) => {
      const tx = await decryptRow('transactions', row.transaction, dek);
      let accountName: string | null = null;
      if (row.account?.name) {
        accountName = await decryptField(row.account.name, dek);
      }
      let category = row.category;
      if (category?.name) {
        category = { ...category, name: await decryptField(category.name, dek) };
      }
      return { ...tx, accountName, category };
    }));

    logger.info('Transactions fetched (SQL Paginated)', { total: totalBeforeFilters, returned: decryptedTxns.length });
    return NextResponse.json({
      data: decryptedTxns,
      total: totalBeforeFilters,
      totalAmount: null, // calculated lazily by client
      limit: filters.limit,
      offset: filters.offset,
    });
  }

  // Fallback path: fetch all matching rows (we need to decrypt before filtering/sorting by encrypted fields)
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
    .orderBy(desc(transactions.date));

  // Decrypt all transactions
  const decryptedTxns = await Promise.all(result.map(async (row) => {
    const tx = await decryptRow('transactions', row.transaction, dek);
    let accountName: string | null = null;
    if (row.account?.name) {
      accountName = await decryptField(row.account.name, dek);
    }
    let category = row.category;
    if (category?.name) {
      category = { ...category, name: await decryptField(category.name, dek) };
    }
    return { ...tx, accountName, category };
  }));

  // Apply search filter in memory
  let filtered = decryptedTxns;
  if (filters.search) {
    const q = filters.search.toLowerCase();
    filtered = filtered.filter((t: any) =>
      (t.description?.toLowerCase().includes(q) ?? false) ||
      (t.payee?.toLowerCase().includes(q) ?? false) ||
      (t.notes?.toLowerCase().includes(q) ?? false)
    );
  }

  // Apply amount filters in memory
  if (filters.minAmount !== undefined) {
    filtered = filtered.filter((t: any) => Math.abs(parseFloat(t.amount) || 0) > filters.minAmount!);
  }
  if (filters.maxAmount !== undefined) {
    filtered = filtered.filter((t: any) => Math.abs(parseFloat(t.amount) || 0) <= filters.maxAmount!);
  }

  // Sort in memory
  if (isEncryptedSort) {
    filtered.sort((a: any, b: any) => {
      const aVal = filters.sort === 'amount' ? Math.abs(parseFloat(a.amount) || 0) : (a.description ?? '');
      const bVal = filters.sort === 'amount' ? Math.abs(parseFloat(b.amount) || 0) : (b.description ?? '');
      if (filters.order === 'asc') return aVal > bVal ? 1 : -1;
      return aVal < bVal ? 1 : -1;
    });
  }

  const total = filtered.length;
  const totalAmount = filtered.reduce(
    (sum: number, t: any) => sum + Math.abs(parseFloat(t.amount) || 0),
    0
  );

  // Paginate
  const sliced = filtered.slice(filters.offset, filters.offset + filters.limit);

  logger.info('Transactions fetched (In-Memory Fallback)', { total, returned: sliced.length });
  return NextResponse.json({ data: sliced, total, totalAmount, limit: filters.limit, offset: filters.offset });
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
  const dek = await getSessionDEK();

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

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.categoryId !== undefined) {
    updateData.categoryId = patch.categoryId;
    updateData.categorizedByAi = false;
  }
  if (patch.reviewed !== undefined) updateData.reviewed = patch.reviewed;
  if (patch.ignored !== undefined) updateData.ignored = patch.ignored;

  const updated = await getDb()
    .update(transactions)
    .set(updateData)
    .where(and(eq(transactions.userId, userId), inArray(transactions.id, ids)))
    .returning();

  // Rebuild summaries since categories/transactions changed (non-blocking background task)
  Promise.all([
    updateCategorySpendingSummaries(userId, dek),
    updateCategoryIncomeSummaries(userId, dek),
    updateMonthlyCashFlowSummaries(userId, dek),
  ]).catch((err) => {
    logger.error('Background summaries rebuild failed', { userId, error: err });
  });

  logger.info('Transactions patched', { updatedCount: updated.length });
  return NextResponse.json({ updated: updated.length });
}
