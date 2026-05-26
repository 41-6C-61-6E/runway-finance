import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptField } from '@/lib/crypto';
import { parseCsv, parseDateField } from '@/lib/utils/csv-parser';
import { fuzzyMatchCategory } from '@/lib/utils/fuzzy-match';
import { getDb } from '@/lib/db';
import { accounts, categories } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;
  const dek = await getSessionDEK();

  try {
    const body = await request.json();
    const { csvText, importType, columnMapping, accountMapping, categoryMapping } = body;

    if (!csvText || !importType || !columnMapping) {
      return NextResponse.json({ error: 'Missing required fields: csvText, importType, columnMapping' }, { status: 400 });
    }

    const parsed = parseCsv(csvText);

    // Fetch user's accounts and categories for resolution
    const rawAccounts = await getDb()
      .select({ id: accounts.id, name: accounts.name, type: accounts.type })
      .from(accounts)
      .where(eq(accounts.userId, userId));

    const userAccounts = await Promise.all(rawAccounts.map(async (a) => ({
      id: a.id,
      name: await decryptField(a.name, dek),
      type: a.type,
    })));

    const rawCategories = await getDb()
      .select({
        id: categories.id,
        name: categories.name,
        parentId: categories.parentId,
        color: categories.color,
        isIncome: categories.isIncome,
      })
      .from(categories)
      .where(eq(categories.userId, userId));

    const userCategories = await Promise.all(rawCategories.map(async (c) => ({
      id: c.id,
      name: await decryptField(c.name, dek),
      parentId: c.parentId,
      color: c.color,
      isIncome: c.isIncome,
    })));

    const accountMap = new Map<string, string>();
    if (accountMapping) {
      for (const [csvRef, accountId] of Object.entries(accountMapping)) {
        accountMap.set(csvRef, accountId as string);
      }
    }

    const categoryMap = new Map<string, string>();
    if (categoryMapping) {
      for (const [csvName, categoryId] of Object.entries(categoryMapping)) {
        categoryMap.set(csvName, categoryId as string);
      }
    }

    const mappedRows = parsed.rows.slice(0, 20).map((row) => {
      const mapped: Record<string, string> = {};
      for (const [systemField, csvColumn] of Object.entries(columnMapping)) {
        if (csvColumn && row[csvColumn as string] !== undefined) {
          mapped[systemField] = row[csvColumn as string];
        }
      }

      // Normalize date field
      if (mapped.date) {
        mapped.parsedDate = parseDateField(mapped.date);
      }

      // Resolve account reference
      if (mapped.account) {
        const resolvedId = accountMap.get(mapped.account);
        if (resolvedId) {
          const acc = userAccounts.find((a) => a.id === resolvedId);
          mapped.resolvedAccount = acc?.name ?? mapped.account;
        } else {
          mapped.resolvedAccount = 'Create: ' + mapped.account;
        }
      }

      // Resolve category reference
      if (mapped.category) {
        const resolvedId = categoryMap.get(mapped.category);
        if (resolvedId) {
          const cat = userCategories.find((c) => c.id === resolvedId);
          mapped.resolvedCategory = cat?.name ?? mapped.category;
        } else {
          mapped.resolvedCategory = 'Create: ' + mapped.category;
        }
      }

      return mapped;
    });

    // Collect unique account references and category names for mapping
    // Use allRows (full dataset) so accounts/categories appearing anywhere
    // in the file are presented for mapping, not just the first N preview rows
    const uniqueAccountRefs = new Set<string>();
    const uniqueCategoryNames = new Set<string>();

    for (const row of parsed.allRows) {
      const accountCol = columnMapping.account;
      const categoryCol = columnMapping.category;
      if (accountCol && row[accountCol]) uniqueAccountRefs.add(row[accountCol]);
      if (categoryCol && row[categoryCol]) uniqueCategoryNames.add(row[categoryCol]);
    }

    return NextResponse.json({
      preview: mappedRows,
      totalRows: parsed.totalRows,
      uniqueAccountRefs: Array.from(uniqueAccountRefs),
      uniqueCategoryNames: Array.from(uniqueCategoryNames),
      resolvedAccounts: Array.from(uniqueAccountRefs).map((ref) => ({
        csvRef: ref,
        existingAccount: userAccounts.find(
          (a) => a.name.toLowerCase() === ref.toLowerCase() || a.id === ref
        ) ?? null,
      })),
      resolvedCategories: Array.from(uniqueCategoryNames).map((name) => {
        // Try exact match first
        const exact = userCategories.find(
          (c) => c.name.toLowerCase() === name.toLowerCase()
        );
        if (exact) {
          return { csvName: name, existingCategory: { ...exact, fuzzyScore: 1.0 } };
        }
        // Fall back to fuzzy match
        const fuzzy = fuzzyMatchCategory(name, userCategories);
        return {
          csvName: name,
          existingCategory: fuzzy
            ? { ...userCategories.find((c) => c.id === fuzzy.id)!, fuzzyScore: fuzzy.score }
            : null,
        };
      }),
      allAccounts: userAccounts.map((a) => ({ id: a.id, name: a.name, type: a.type })),
      allCategories: userCategories.map((c) => ({
        id: c.id,
        name: c.name,
        parentId: c.parentId,
        color: c.color,
        isIncome: c.isIncome,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Preview failed', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
