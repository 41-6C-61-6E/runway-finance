import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  transactions,
  accounts,
  categories,
  userSettings,
  transactionTags,
  tags,
} from "@/lib/db/schema";
import {
  eq,
  and,
  or,
  sql,
  gte,
  lte,
  desc,
  asc,
  inArray,
  isNull,
} from "drizzle-orm";
import {
  TransactionFilterSchema,
  BulkPatchTransactionSchema,
  BulkDeleteTransactionSchema,
} from "@/lib/validations/transaction";
import { logger } from "@/lib/logger";
import { getSessionDEK } from "@/lib/crypto-context";
import { decryptField, decryptRow, decryptRows } from "@/lib/crypto";
import {
  updateCategorySpendingSummaries,
  updateCategoryIncomeSummaries,
  updateMonthlyCashFlowSummaries,
} from "@/lib/services/sync";
import { getSearchMatchingTransactionIds, invalidateUserSearchCache } from "@/lib/services/search-cache";

const UNCATEGORIZED_CATEGORY_IDS = new Set([
  "uncategorized",
  "uncategorized_income",
]);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseCommaSeparatedIds(value?: string) {
  return value
    ? value
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean)
    : [];
}

function buildCategoryConditions(
  categoryId?: string,
  categoryIds?: string,
) {
  if (categoryIds) {
    const ids = parseCommaSeparatedIds(categoryIds);
    if (ids.length === 0) return [];

    const includesUncategorized = ids.some((id) =>
      UNCATEGORIZED_CATEGORY_IDS.has(id),
    );
    const validCategoryIds = ids.filter((id) => UUID_PATTERN.test(id));

    if (includesUncategorized && validCategoryIds.length > 0) {
      return [
        or(
          isNull(transactions.categoryId),
          inArray(transactions.categoryId, validCategoryIds),
        ),
      ];
    }

    if (includesUncategorized) {
      return [isNull(transactions.categoryId)];
    }

    if (validCategoryIds.length > 0) {
      return [inArray(transactions.categoryId, validCategoryIds)];
    }

    return [sql`false`];
  }

  if (categoryId) {
    if (UNCATEGORIZED_CATEGORY_IDS.has(categoryId)) {
      return [isNull(transactions.categoryId)];
    }

    if (UUID_PATTERN.test(categoryId)) {
      return [eq(transactions.categoryId, categoryId)];
    }

    return [sql`false`];
  }

  return [];
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: "unauthenticated", message: "Authentication required" },
      { status: 401 },
    );
  }

  const userId = session.user.id;
  const dek = await getSessionDEK();
  const { searchParams } = new URL(request.url);

  const parsed = TransactionFilterSchema.safeParse({
    accountId: searchParams.get("accountId") ?? undefined,
    accountIds: searchParams.get("accountIds") ?? undefined,
    accountTypes:
      searchParams.get("accountTypes") ??
      searchParams.get("accountType") ??
      undefined,
    startDate: searchParams.get("startDate") ?? undefined,
    endDate: searchParams.get("endDate") ?? undefined,
    categoryId: searchParams.get("categoryId") ?? undefined,
    categoryIds: searchParams.get("categoryIds") ?? undefined,
    tagId: searchParams.get("tagId") ?? undefined,
    tagIds: searchParams.get("tagIds") ?? undefined,
    search: searchParams.get("search") ?? undefined,
    type: searchParams.get("type") ?? undefined,
    pending: searchParams.get("pending") ?? undefined,
    reviewed: searchParams.get("reviewed") ?? undefined,
    categorizedByAi: searchParams.get("categorizedByAi") ?? undefined,
    minAmount: searchParams.get("minAmount") ?? undefined,
    maxAmount: searchParams.get("maxAmount") ?? undefined,
    limit: parseInt(searchParams.get("limit") ?? "50", 10),
    offset: parseInt(searchParams.get("offset") ?? "0", 10),
    sort: searchParams.get("sort") ?? "date",
    order: searchParams.get("order") ?? "desc",
    totalAmountOnly:
      searchParams.get("totalAmountOnly") === "true" ? true : undefined,
  });

  if (!parsed.success) {
    logger.warn("Transaction query validation failed", {
      errors: parsed.error.flatten().fieldErrors,
    });
    return NextResponse.json(
      {
        error: "validation_error",
        message: "Invalid query parameters",
        details: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
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
    ...(typeof rawShowImported === "object" && rawShowImported !== null
      ? rawShowImported
      : {}),
  } as Record<string, boolean>;

  const isImportTransactionsEnabled =
    importSettings.global !== false &&
    importSettings.cashFlowProjections !== false;

  logger.info("Fetching transactions", {
    accountId: filters.accountId,
    categoryId: filters.categoryId,
    search: filters.search,
    startDate: filters.startDate,
    endDate: filters.endDate,
    limit: filters.limit,
    offset: filters.offset,
    totalAmountOnly: filters.totalAmountOnly,
  });

  // Build where clause (excluding encrypted field filters — applied in memory).
  // Hidden and excluded accounts are global exclusions for user-facing data.
  const whereConditions = [
    eq(transactions.userId, userId),
    or(
      and(
        eq(accounts.isHidden, false),
        eq(accounts.isExcludedFromNetWorth, false)
      ),
      eq(accounts.type, 'paystub')
    ),
    eq(transactions.deleted, false),
  ];

  if (filters.search) {
    const matchingSearchIds = await getSearchMatchingTransactionIds(userId, dek, filters.search);
    if (matchingSearchIds.size === 0) {
      if (filters.idsOnly) {
        return NextResponse.json({ ids: [] });
      }
      if (filters.totalAmountOnly) {
        return NextResponse.json({ totalAmount: 0 });
      }
      return NextResponse.json({
        data: [],
        total: 0,
        totalAmount: 0,
        limit: filters.limit,
        offset: filters.offset,
      });
    }
    whereConditions.push(inArray(transactions.id, Array.from(matchingSearchIds)));
  }

  if (!isImportTransactionsEnabled) {
    whereConditions.push(eq(transactions.isImported, false));
  }

  if (filters.accountIds) {
    const ids = filters.accountIds
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    if (ids.length > 0) {
      whereConditions.push(inArray(transactions.accountId, ids));
    }
  } else if (filters.accountId) {
    whereConditions.push(eq(transactions.accountId, filters.accountId));
  }
  if (filters.accountTypes) {
    const types = filters.accountTypes
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
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
    whereConditions.push(
      eq(transactions.categorizedByAi, filters.categorizedByAi),
    );
  }

  // Handle tag filter — resolve to matching transaction IDs via join
  if (filters.tagIds) {
    const tagIdList = filters.tagIds.split(',').map((id) => id.trim()).filter(Boolean);
    if (tagIdList.length > 0) {
      const taggedTxIds = await getDb()
        .select({ transactionId: transactionTags.transactionId })
        .from(transactionTags)
        .where(inArray(transactionTags.tagId, tagIdList));
      const txIds = taggedTxIds.map((r) => r.transactionId);
      if (txIds.length > 0) {
        whereConditions.push(inArray(transactions.id, txIds));
      } else {
        // No transactions match these tags — return empty
        whereConditions.push(sql`false`);
      }
    }
  } else if (filters.tagId) {
    const taggedTxIds = await getDb()
      .select({ transactionId: transactionTags.transactionId })
      .from(transactionTags)
      .where(eq(transactionTags.tagId, filters.tagId));
    const txIds = taggedTxIds.map((r) => r.transactionId);
    if (txIds.length > 0) {
      whereConditions.push(inArray(transactions.id, txIds));
    } else {
      whereConditions.push(sql`false`);
    }
  }

  // Handle category filter
  whereConditions.push(
    ...buildCategoryConditions(filters.categoryId, filters.categoryIds),
  );

  if (filters.idsOnly) {
    const hasEncryptedFilters = !!(
      filters.minAmount !== undefined ||
      filters.maxAmount !== undefined ||
      filters.type !== undefined
    );

    if (!hasEncryptedFilters) {
      const result = await getDb()
        .select({ id: transactions.id })
        .from(transactions)
        .leftJoin(accounts, eq(transactions.accountId, accounts.id))
        .where(and(...whereConditions));
      return NextResponse.json({ ids: result.map((r) => r.id) });
    }

    let query = getDb()
      .select({
        id: transactions.id,
        amount: transactions.amount,
        description: transactions.description,
        payee: transactions.payee,
        notes: transactions.notes,
        categoryName: categories.name,
        categoryType: categories.categoryType,
      })
      .from(transactions)
      .leftJoin(accounts, eq(transactions.accountId, accounts.id))
      .leftJoin(categories, eq(transactions.categoryId, categories.id));

    const result = await query.where(and(...whereConditions));

    let filtered = await Promise.all(
      result.map(async (row: any) => {
        const decryptedAmt =
          parseFloat(await decryptField(row.amount, dek)) || 0;
        const amount = Math.abs(decryptedAmt);
        let matchesSearch = true;
        if (filters.search) {
          const q = filters.search.toLowerCase();
          const descDec = (
            await decryptField(row.description, dek)
          ).toLowerCase();
          const payeeDec = row.payee
            ? (await decryptField(row.payee, dek)).toLowerCase()
            : "";
          const notesDec = row.notes
            ? (await decryptField(row.notes, dek)).toLowerCase()
            : "";
          const catDec = row.categoryName
            ? (await decryptField(row.categoryName, dek)).toLowerCase()
            : "";
          matchesSearch =
            descDec.includes(q) ||
            payeeDec.includes(q) ||
            notesDec.includes(q) ||
            catDec.includes(q);
        }
        let matchesType = true;
        if (filters.type === "income") {
          matchesType = (decryptedAmt > 0 || row.categoryType === 'compound') && row.categoryType !== 'transfer';
        } else if (filters.type === "expense") {
          matchesType = (decryptedAmt < 0 || row.categoryType === 'compound') && row.categoryType !== 'transfer';
        }
        return { id: row.id, amount, matchesSearch, matchesType, categoryType: row.categoryType };
      }),
    );

    if (filters.search) {
      filtered = filtered.filter((f) => f.matchesSearch);
    }
    if (filters.type) {
      filtered = filtered.filter((f) => f.matchesType);
    }
    if (filters.minAmount !== undefined) {
      filtered = filtered.filter((f) => f.amount > filters.minAmount!);
    }
    if (filters.maxAmount !== undefined) {
      filtered = filtered.filter((f) => f.amount <= filters.maxAmount!);
    }

    return NextResponse.json({ ids: filtered.map((f) => f.id) });
  }

  // Optimized path for calculating total amount of matching transactions (Option A)
  if (filters.totalAmountOnly) {
    const selectFields: any = { amount: transactions.amount };
    if (filters.search) {
      selectFields.description = transactions.description;
      selectFields.payee = transactions.payee;
      selectFields.notes = transactions.notes;
      selectFields.categoryName = categories.name;
    }

    let query = getDb()
      .select(selectFields)
      .from(transactions)
      .leftJoin(accounts, eq(transactions.accountId, accounts.id));

    if (filters.search) {
      query = query.leftJoin(
        categories,
        eq(transactions.categoryId, categories.id),
      ) as any;
    }

    const result = await query.where(and(...whereConditions));

    let filtered = await Promise.all(
      result.map(async (row: any) => {
        const decryptedAmt =
          parseFloat(await decryptField(row.amount, dek)) || 0;
        const amount = Math.abs(decryptedAmt);
        let matchesSearch = true;
        if (filters.search) {
          const q = filters.search.toLowerCase();
          const descDec = (
            await decryptField(row.description, dek)
          ).toLowerCase();
          const payeeDec = row.payee
            ? (await decryptField(row.payee, dek)).toLowerCase()
            : "";
          const notesDec = row.notes
            ? (await decryptField(row.notes, dek)).toLowerCase()
            : "";
          const catDec = row.categoryName
            ? (await decryptField(row.categoryName, dek)).toLowerCase()
            : "";
          matchesSearch =
            descDec.includes(q) ||
            payeeDec.includes(q) ||
            notesDec.includes(q) ||
            catDec.includes(q);
        }
        let matchesType = true;
        if (filters.type === "income") {
          matchesType = decryptedAmt > 0;
        } else if (filters.type === "expense") {
          matchesType = decryptedAmt < 0;
        }
        return { amount, matchesSearch, matchesType };
      }),
    );

    if (filters.search) {
      filtered = filtered.filter((f) => f.matchesSearch);
    }
    if (filters.type) {
      filtered = filtered.filter((f) => f.matchesType);
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

  const hasEncryptedFilters = !!(
    filters.minAmount !== undefined ||
    filters.maxAmount !== undefined ||
    filters.type !== undefined
  );
  const isEncryptedSort =
    filters.sort === "amount" ||
    filters.sort === "description" ||
    filters.sort === "account" ||
    filters.sort === "category";

  // If we can paginate in the database, do so! (Massive speedup for page loads/nav)
  if (!hasEncryptedFilters && !isEncryptedSort) {
    let orderByClause;
    if (filters.sort === "date") {
      orderByClause =
        filters.order === "asc"
          ? asc(transactions.date)
          : desc(transactions.date);
    } else if (filters.sort === "postedDate") {
      orderByClause =
        filters.order === "asc"
          ? asc(transactions.postedDate)
          : desc(transactions.postedDate);
    } else if (filters.sort === "ai") {
      orderByClause =
        filters.order === "asc"
          ? asc(transactions.categorizedByAi)
          : desc(transactions.categorizedByAi);
    } else {
      orderByClause = desc(transactions.date);
    }

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
    const decryptedTxns = await Promise.all(
      result.map(async (row) => {
        const tx = await decryptRow("transactions", row.transaction, dek);
        let accountName: string | null = null;
        if (row.account?.name) {
          accountName = await decryptField(row.account.name, dek);
        }
        let category = row.category;
        if (category?.name) {
          category = {
            ...category,
            name: await decryptField(category.name, dek),
          };
        }
        return { ...tx, accountName, category };
      }),
    );

    // Batch fetch tags for this page of transactions
    const txIds = decryptedTxns.map((t: any) => t.id);
    const tagRows = txIds.length > 0
      ? await getDb()
          .select({
            transactionId: transactionTags.transactionId,
            tagId: tags.id,
            tagName: tags.name,
            tagColor: tags.color,
          })
          .from(transactionTags)
          .leftJoin(tags, eq(transactionTags.tagId, tags.id))
          .where(inArray(transactionTags.transactionId, txIds))
      : [];

    // Decrypt tag names and build a map
    const tagsByTxId = new Map<string, any[]>();
    for (const row of tagRows) {
      const name = row.tagName ? await decryptField(row.tagName, dek) : '';
      const tag = { id: row.tagId, name, color: row.tagColor };
      const existing = tagsByTxId.get(row.transactionId) ?? [];
      existing.push(tag);
      tagsByTxId.set(row.transactionId, existing);
    }

    const txnsWithTags = decryptedTxns.map((tx: any) => ({
      ...tx,
      tags: tagsByTxId.get(tx.id) ?? [],
    }));

    logger.info("Transactions fetched (SQL Paginated)", {
      total: totalBeforeFilters,
      returned: txnsWithTags.length,
    });
    return NextResponse.json({
      data: txnsWithTags,
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
  const decryptedTxns = await Promise.all(
    result.map(async (row) => {
      const tx = await decryptRow("transactions", row.transaction, dek);
      let accountName: string | null = null;
      if (row.account?.name) {
        accountName = await decryptField(row.account.name, dek);
      }
      let category = row.category;
      if (category?.name) {
        category = {
          ...category,
          name: await decryptField(category.name, dek),
        };
      }
      return { ...tx, accountName, category };
    }),
  );

  // Apply search filter in memory
  let filtered = decryptedTxns;
  if (filters.search) {
    const q = filters.search.toLowerCase();
    filtered = filtered.filter(
      (t: any) =>
        (String(t.description ?? "").toLowerCase().includes(q)) ||
        (String(t.payee ?? "").toLowerCase().includes(q)) ||
        (String(t.notes ?? "").toLowerCase().includes(q)) ||
        (String(t.category?.name ?? "").toLowerCase().includes(q)),
    );
  }

  // Apply type filter in memory
  if (filters.type === "income") {
    filtered = filtered.filter((t: any) => parseFloat(t.amount) > 0);
  } else if (filters.type === "expense") {
    filtered = filtered.filter((t: any) => parseFloat(t.amount) < 0);
  }

  // Apply amount filters in memory
  if (filters.minAmount !== undefined) {
    filtered = filtered.filter(
      (t: any) => Math.abs(parseFloat(t.amount) || 0) > filters.minAmount!,
    );
  }
  if (filters.maxAmount !== undefined) {
    filtered = filtered.filter(
      (t: any) => Math.abs(parseFloat(t.amount) || 0) <= filters.maxAmount!,
    );
  }

  // Sort in memory
  filtered.sort((a: any, b: any) => {
    let aVal: any;
    let bVal: any;

    switch (filters.sort) {
      case "amount":
        aVal = Math.abs(parseFloat(a.amount) || 0);
        bVal = Math.abs(parseFloat(b.amount) || 0);
        break;
      case "description":
        aVal = String(a.description ?? "").toLowerCase();
        bVal = String(b.description ?? "").toLowerCase();
        break;
      case "account":
        aVal = String(a.accountName ?? "").toLowerCase();
        bVal = String(b.accountName ?? "").toLowerCase();
        break;
      case "category":
        aVal = String(a.category?.name ?? "").toLowerCase();
        bVal = String(b.category?.name ?? "").toLowerCase();
        break;
      case "postedDate":
        aVal = a.postedDate ? new Date(a.postedDate).getTime() : 0;
        bVal = b.postedDate ? new Date(b.postedDate).getTime() : 0;
        break;
      case "ai":
        aVal = a.categorizedByAi ? 1 : 0;
        bVal = b.categorizedByAi ? 1 : 0;
        break;
      case "date":
      default:
        aVal = a.date ? new Date(a.date).getTime() : 0;
        bVal = b.date ? new Date(b.date).getTime() : 0;
        break;
    }

    if (aVal === bVal) {
      return a.id > b.id ? 1 : -1;
    }

    if (filters.order === "asc") {
      return aVal > bVal ? 1 : -1;
    } else {
      return aVal < bVal ? 1 : -1;
    }
  });

  const total = filtered.length;
  const totalAmount = filtered.reduce(
    (sum: number, t: any) => sum + Math.abs(parseFloat(t.amount) || 0),
    0,
  );

  // Paginate
  const sliced = filtered.slice(filters.offset, filters.offset + filters.limit);

  // Batch fetch tags for this page
  const slicedIds = sliced.map((t: any) => t.id);
  const sliceTagRows = slicedIds.length > 0
    ? await getDb()
        .select({
          transactionId: transactionTags.transactionId,
          tagId: tags.id,
          tagName: tags.name,
          tagColor: tags.color,
        })
        .from(transactionTags)
        .leftJoin(tags, eq(transactionTags.tagId, tags.id))
        .where(inArray(transactionTags.transactionId, slicedIds))
    : [];

  const sliceTagsByTxId = new Map<string, any[]>();
  for (const row of sliceTagRows) {
    const name = row.tagName ? await decryptField(row.tagName, dek) : '';
    const tag = { id: row.tagId, name, color: row.tagColor };
    const existing = sliceTagsByTxId.get(row.transactionId) ?? [];
    existing.push(tag);
    sliceTagsByTxId.set(row.transactionId, existing);
  }

  const slicedWithTags = sliced.map((tx: any) => ({
    ...tx,
    tags: sliceTagsByTxId.get(tx.id) ?? [],
  }));

  logger.info("Transactions fetched (In-Memory Fallback)", {
    total,
    returned: slicedWithTags.length,
  });
  return NextResponse.json({
    data: slicedWithTags,
    total,
    totalAmount,
    limit: filters.limit,
    offset: filters.offset,
  });
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: "unauthenticated", message: "Authentication required" },
      { status: 401 },
    );
  }

  const userId = session.user.id;
  const dek = await getSessionDEK();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    logger.warn("Transaction PATCH invalid request body");
    return NextResponse.json(
      { error: "validation_error", message: "Invalid request body" },
      { status: 400 },
    );
  }

  const parsed = BulkPatchTransactionSchema.safeParse(body);
  if (!parsed.success) {
    logger.warn("Transaction bulk patch validation failed", {
      errors: parsed.error.flatten().fieldErrors,
    });
    return NextResponse.json(
      {
        error: "validation_error",
        message: "Invalid request body",
        details: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  const { ids, patch, selectAllMatching, ...filterFields } = parsed.data;
  const patchedFields: string[] = [];
  if (patch.categoryId !== undefined) patchedFields.push("categoryId");
  if (patch.reviewed !== undefined) patchedFields.push("reviewed");
  if (patch.ignored !== undefined) patchedFields.push("ignored");
  logger.info("Patching transactions", {
    selectAllMatching: !!selectAllMatching,
    idsCount: ids?.length,
    patchedFields,
  });

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.categoryId !== undefined) {
    updateData.categoryId = patch.categoryId;
    updateData.categorizedByAi = false;
  }
  if (patch.reviewed !== undefined) updateData.reviewed = patch.reviewed;
  if (patch.ignored !== undefined) updateData.ignored = patch.ignored;

  let updated;

  if (selectAllMatching) {
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
      ...(typeof rawShowImported === "object" && rawShowImported !== null
        ? rawShowImported
        : {}),
    } as Record<string, boolean>;

    const isImportTransactionsEnabled =
      importSettings.global !== false &&
      importSettings.cashFlowProjections !== false;

    const whereConditions = [
      eq(transactions.userId, userId),
      or(
        and(
          eq(accounts.isHidden, false),
          eq(accounts.isExcludedFromNetWorth, false)
        ),
        eq(accounts.type, 'paystub')
      ),
      eq(transactions.deleted, false),
    ];

    if (!isImportTransactionsEnabled) {
      whereConditions.push(eq(transactions.isImported, false));
    }

    if (filterFields.accountIds) {
      const splitIds = filterFields.accountIds
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);
      if (splitIds.length > 0) {
        whereConditions.push(inArray(transactions.accountId, splitIds));
      }
    } else if (filterFields.accountId) {
      whereConditions.push(eq(transactions.accountId, filterFields.accountId));
    }
    if (filterFields.accountTypes) {
      const types = filterFields.accountTypes
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      if (types.length > 0) {
        whereConditions.push(inArray(accounts.type, types));
      }
    }
    if (filterFields.startDate) {
      whereConditions.push(gte(transactions.date, filterFields.startDate));
    }
    if (filterFields.endDate) {
      whereConditions.push(lte(transactions.date, filterFields.endDate));
    }
    if (filterFields.pending !== undefined) {
      whereConditions.push(
        eq(transactions.pending, filterFields.pending === "true"),
      );
    }
    if (filterFields.reviewed !== undefined) {
      whereConditions.push(
        eq(transactions.reviewed, filterFields.reviewed === "true"),
      );
    }
    if (filterFields.categorizedByAi !== undefined) {
      whereConditions.push(
        eq(
          transactions.categorizedByAi,
          filterFields.categorizedByAi === "true",
        ),
      );
    }

    whereConditions.push(
      ...buildCategoryConditions(filterFields.categoryId, filterFields.categoryIds),
    );

    const hasEncryptedFilters = !!(
      filterFields.search ||
      filterFields.minAmount ||
      filterFields.maxAmount ||
      filterFields.type
    );

    if (!hasEncryptedFilters) {
      updated = await getDb()
        .update(transactions)
        .set(updateData)
        .from(accounts)
        .where(and(eq(transactions.accountId, accounts.id), ...whereConditions))
        .returning();
    } else {
      const result = await getDb()
        .select({
          id: transactions.id,
          amount: transactions.amount,
          description: transactions.description,
          payee: transactions.payee,
          notes: transactions.notes,
          categoryName: categories.name,
        })
        .from(transactions)
        .leftJoin(accounts, eq(transactions.accountId, accounts.id))
        .leftJoin(categories, eq(transactions.categoryId, categories.id))
        .where(and(...whereConditions));

      let filtered = await Promise.all(
        result.map(async (row: any) => {
          const decryptedAmt =
            parseFloat(await decryptField(row.amount, dek)) || 0;
          const amount = Math.abs(decryptedAmt);
          let matchesSearch = true;
          if (filterFields.search) {
            const q = filterFields.search.toLowerCase();
            const descDec = (
              await decryptField(row.description, dek)
            ).toLowerCase();
            const payeeDec = row.payee
              ? (await decryptField(row.payee, dek)).toLowerCase()
              : "";
            const notesDec = row.notes
              ? (await decryptField(row.notes, dek)).toLowerCase()
              : "";
            const catDec = row.categoryName
              ? (await decryptField(row.categoryName, dek)).toLowerCase()
              : "";
            matchesSearch =
              descDec.includes(q) ||
              payeeDec.includes(q) ||
              notesDec.includes(q) ||
              catDec.includes(q);
          }
          let matchesType = true;
          if (filterFields.type === "income") {
            matchesType = decryptedAmt > 0;
          } else if (filterFields.type === "expense") {
            matchesType = decryptedAmt < 0;
          }
          return { id: row.id, amount, matchesSearch, matchesType };
        }),
      );

      if (filterFields.search) {
        filtered = filtered.filter((f) => f.matchesSearch);
      }
      if (filterFields.type) {
        filtered = filtered.filter((f) => f.matchesType);
      }
      if (filterFields.minAmount) {
        filtered = filtered.filter(
          (f) => f.amount > parseFloat(filterFields.minAmount!),
        );
      }
      if (filterFields.maxAmount) {
        filtered = filtered.filter(
          (f) => f.amount <= parseFloat(filterFields.maxAmount!),
        );
      }

      const matchingIds = filtered.map((f) => f.id);

      if (matchingIds.length > 0) {
        updated = await getDb()
          .update(transactions)
          .set(updateData)
          .where(
            and(
              eq(transactions.userId, userId),
              inArray(transactions.id, matchingIds),
            ),
          )
          .returning();
      } else {
        updated = [];
      }
    }
  } else {
    updated = await getDb()
      .update(transactions)
      .set(updateData)
      .where(
        and(eq(transactions.userId, userId), inArray(transactions.id, ids!)),
      )
      .returning();
  }

  invalidateUserSearchCache(userId);

  Promise.all([
    updateCategorySpendingSummaries(userId, dek),
    updateCategoryIncomeSummaries(userId, dek),
    updateMonthlyCashFlowSummaries(userId, dek),
  ]).catch((err) => {
    logger.error("Background summaries rebuild failed", { userId, error: err });
  });

  logger.info("Transactions patched", { updatedCount: updated.length });
  return NextResponse.json({ updated: updated.length });
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: "unauthenticated", message: "Authentication required" },
      { status: 401 },
    );
  }

  const userId = session.user.id;
  const dek = await getSessionDEK();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    logger.warn("Transaction DELETE invalid request body");
    return NextResponse.json(
      { error: "validation_error", message: "Invalid request body" },
      { status: 400 },
    );
  }

  const parsed = BulkDeleteTransactionSchema.safeParse(body);
  if (!parsed.success) {
    logger.warn("Transaction bulk delete validation failed", {
      errors: parsed.error.flatten().fieldErrors,
    });
    return NextResponse.json(
      {
        error: "validation_error",
        message: "Invalid request body",
        details: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  const { ids, selectAllMatching, ...filterFields } = parsed.data;
  logger.info("Deleting transactions", {
    selectAllMatching: !!selectAllMatching,
    idsCount: ids?.length,
  });

  let updated;

  if (selectAllMatching) {
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
      ...(typeof rawShowImported === "object" && rawShowImported !== null
        ? rawShowImported
        : {}),
    } as Record<string, boolean>;

    const isImportTransactionsEnabled =
      importSettings.global !== false &&
      importSettings.cashFlowProjections !== false;

    const whereConditions = [
      eq(transactions.userId, userId),
      or(
        and(
          eq(accounts.isHidden, false),
          eq(accounts.isExcludedFromNetWorth, false)
        ),
        eq(accounts.type, 'paystub')
      ),
      eq(transactions.deleted, false),
    ];

    if (!isImportTransactionsEnabled) {
      whereConditions.push(eq(transactions.isImported, false));
    }

    if (filterFields.accountIds) {
      const splitIds = filterFields.accountIds
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);
      if (splitIds.length > 0) {
        whereConditions.push(inArray(transactions.accountId, splitIds));
      }
    } else if (filterFields.accountId) {
      whereConditions.push(eq(transactions.accountId, filterFields.accountId));
    }
    if (filterFields.accountTypes) {
      const types = filterFields.accountTypes
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      if (types.length > 0) {
        whereConditions.push(inArray(accounts.type, types));
      }
    }
    if (filterFields.startDate) {
      whereConditions.push(gte(transactions.date, filterFields.startDate));
    }
    if (filterFields.endDate) {
      whereConditions.push(lte(transactions.date, filterFields.endDate));
    }
    if (filterFields.pending !== undefined) {
      whereConditions.push(
        eq(transactions.pending, filterFields.pending === "true"),
      );
    }
    if (filterFields.reviewed !== undefined) {
      whereConditions.push(
        eq(transactions.reviewed, filterFields.reviewed === "true"),
      );
    }
    if (filterFields.categorizedByAi !== undefined) {
      whereConditions.push(
        eq(
          transactions.categorizedByAi,
          filterFields.categorizedByAi === "true",
        ),
      );
    }

    whereConditions.push(
      ...buildCategoryConditions(filterFields.categoryId, filterFields.categoryIds),
    );

    const hasEncryptedFilters = !!(
      filterFields.search ||
      filterFields.minAmount ||
      filterFields.maxAmount ||
      filterFields.type
    );

    if (!hasEncryptedFilters) {
      updated = await getDb()
        .update(transactions)
        .set({ deleted: true, updatedAt: new Date() })
        .from(accounts)
        .where(and(eq(transactions.accountId, accounts.id), ...whereConditions))
        .returning();
    } else {
      const result = await getDb()
        .select({
          id: transactions.id,
          amount: transactions.amount,
          description: transactions.description,
          payee: transactions.payee,
          notes: transactions.notes,
          categoryName: categories.name,
        })
        .from(transactions)
        .leftJoin(accounts, eq(transactions.accountId, accounts.id))
        .leftJoin(categories, eq(transactions.categoryId, categories.id))
        .where(and(...whereConditions));

      let filtered = await Promise.all(
        result.map(async (row: any) => {
          const decryptedAmt =
            parseFloat(await decryptField(row.amount, dek)) || 0;
          const amount = Math.abs(decryptedAmt);
          let matchesSearch = true;
          if (filterFields.search) {
            const q = filterFields.search.toLowerCase();
            const descDec = (
              await decryptField(row.description, dek)
            ).toLowerCase();
            const payeeDec = row.payee
              ? (await decryptField(row.payee, dek)).toLowerCase()
              : "";
            const notesDec = row.notes
              ? (await decryptField(row.notes, dek)).toLowerCase()
              : "";
            const catDec = row.categoryName
              ? (await decryptField(row.categoryName, dek)).toLowerCase()
              : "";
            matchesSearch =
              descDec.includes(q) ||
              payeeDec.includes(q) ||
              notesDec.includes(q) ||
              catDec.includes(q);
          }
          let matchesType = true;
          if (filterFields.type === "income") {
            matchesType = decryptedAmt > 0;
          } else if (filterFields.type === "expense") {
            matchesType = decryptedAmt < 0;
          }
          return { id: row.id, amount, matchesSearch, matchesType };
        }),
      );

      if (filterFields.search) {
        filtered = filtered.filter((f) => f.matchesSearch);
      }
      if (filterFields.type) {
        filtered = filtered.filter((f) => f.matchesType);
      }
      if (filterFields.minAmount) {
        filtered = filtered.filter(
          (f) => f.amount > parseFloat(filterFields.minAmount!),
        );
      }
      if (filterFields.maxAmount) {
        filtered = filtered.filter(
          (f) => f.amount <= parseFloat(filterFields.maxAmount!),
        );
      }

      const matchingIds = filtered.map((f) => f.id);

      if (matchingIds.length > 0) {
        updated = await getDb()
          .update(transactions)
          .set({ deleted: true, updatedAt: new Date() })
          .where(
            and(
              eq(transactions.userId, userId),
              inArray(transactions.id, matchingIds),
            ),
          )
          .returning();
      } else {
        updated = [];
      }
    }
  } else {
    updated = await getDb()
      .update(transactions)
      .set({ deleted: true, updatedAt: new Date() })
      .where(
        and(eq(transactions.userId, userId), inArray(transactions.id, ids!)),
      )
      .returning();
  }

  invalidateUserSearchCache(userId);

  Promise.all([
    updateCategorySpendingSummaries(userId, dek),
    updateCategoryIncomeSummaries(userId, dek),
    updateMonthlyCashFlowSummaries(userId, dek),
  ]).catch((err) => {
    logger.error("Background summaries rebuild failed after bulk DELETE", {
      userId,
      error: err,
    });
  });

  logger.info("Transactions deleted", { deletedCount: updated.length });
  return NextResponse.json({ updated: updated.length });
}
