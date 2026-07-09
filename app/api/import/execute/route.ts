import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { getSessionDEK } from '@/lib/crypto-context';
import { encryptField } from '@/lib/crypto';
import { parseCsv, parseDateField, determineTransactionSign } from '@/lib/utils/csv-parser';
import { transactions, accountSnapshots, accounts, categories, importLog } from '@/lib/db/schema';
import { eq, and, sql, desc } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { generateHistoricalAccountSnapshots, getEarliestTransactionDate, recalculateNetWorthSnapshots, formatToCents, roundToCents } from '@/lib/services/account-history';
import { updateMonthlyCashFlowSummaries, updateCategorySpendingSummaries, updateCategoryIncomeSummaries } from '@/lib/services/sync';
import { logger } from '@/lib/logger';
import { invalidateUserSearchCache } from '@/lib/services/search-cache';

type ImportType = 'transactions' | 'account_snapshots';

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;
  const dataUserId = (session.user as any).dataUserId ?? session.user.id;
  const dek = await getSessionDEK();

  try {
    const body = await request.json();
    const {
      csvText,
      importType,
      columnMapping,
      accountMapping,
      categoryMapping,
      newAccounts,
      newCategories,
      startDate,
      endDate,
      snapshotDayOfMonth,
    } = body;

    if (!csvText || !importType || !columnMapping) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (importType !== 'transactions' && importType !== 'account_snapshots') {
      return NextResponse.json({ error: 'Invalid import type' }, { status: 400 });
    }

    // Validate required columns
    if (importType === 'transactions') {
      if (!columnMapping.date || !columnMapping.amount || !columnMapping.description) {
        return NextResponse.json({ error: 'Transactions import requires date, amount, and description columns' }, { status: 400 });
      }
      if (!columnMapping.account) {
        return NextResponse.json({ error: 'Transactions import requires an account column' }, { status: 400 });
      }
    } else {
      if (!columnMapping.date || !columnMapping.balance || !columnMapping.account) {
        return NextResponse.json({ error: 'Account snapshots import requires date, balance, and account columns' }, { status: 400 });
      }
    }

    const parsed = parseCsv(csvText);
    if (parsed.headers.length === 0) {
      return NextResponse.json({ error: 'Could not parse CSV' }, { status: 400 });
    }

    logger.info(`[import/execute] Starting import: type=${importType}, totalRows=${parsed.totalRows}`, {
      accountMappingCount: Object.keys(accountMapping || {}).length,
      categoryMappingCount: Object.keys(categoryMapping || {}).length,
      newAccountsCount: Object.keys(newAccounts || {}).length,
      newCategoriesCount: Object.keys(newCategories || {}).length,
    });

    const EXCLUDED = '__excluded__';
    const warnings: string[] = [];

    // Step 1: Pre-generate IDs for new accounts and populate accountIdByRef
    // Treat empty/unmapped account selections as excluded
    const accountIdByRef = new Map<string, string | typeof EXCLUDED>();
    let excludedAccountCount = 0;
    if (accountMapping) {
      for (const [csvRef, accountId] of Object.entries(accountMapping)) {
        if (!accountId || accountId === EXCLUDED) {
          excludedAccountCount++;
          accountIdByRef.set(csvRef, EXCLUDED);
        } else {
          accountIdByRef.set(csvRef, accountId as string);
        }
      }
    }
    if (newAccounts && typeof newAccounts === 'object') {
      for (const csvRef of Object.keys(newAccounts)) {
        accountIdByRef.set(csvRef, randomUUID());
      }
    }

    // Step 2: Pre-generate IDs for new categories and populate categoryIdByName
    // Skip unmapped entries (empty string) so they become uncategorized
    logger.info(`[import/execute] categoryMapping received`, { categoryMapping });
    const categoryIdByName = new Map<string, string>();
    const unmappedCategories: string[] = [];
    if (categoryMapping) {
      for (const [csvName, categoryId] of Object.entries(categoryMapping)) {
        if (categoryId && typeof categoryId === 'string' && categoryId !== 'new') {
          // Valid existing category ID — map it directly
          categoryIdByName.set(csvName, categoryId);
        } else if (categoryId === 'new') {
          // 'new' means the user intended to create a category; the actual ID comes
          // from newCategories below. If newCategories has no entry for this name
          // (e.g. the user never filled out the form), treat it as unmapped.
          if (!newCategories || !(csvName in newCategories)) {
            unmappedCategories.push(csvName);
            logger.info(`[import/execute] Category mapped as 'new' but no creation data provided — treating as uncategorized`, { csvName });
          }
          // else: newCategories loop below will set the real UUID
        } else {
          unmappedCategories.push(csvName);
          logger.info(`[import/execute] Skipping unmapped category (will be uncategorized)`, { csvName });
        }
      }
    }
    if (unmappedCategories.length > 0) {
      warnings.push(`Unmapped categories (${unmappedCategories.map(n => `"${n}"`).join(', ')}) will be imported as uncategorized`);
    }
    if (excludedAccountCount > 0) {
      warnings.push(`${excludedAccountCount} account(s) excluded or unmapped — corresponding rows will be skipped`);
    }
    if (newCategories && typeof newCategories === 'object') {
      for (const csvName of Object.keys(newCategories)) {
        categoryIdByName.set(csvName, randomUUID());
      }
    }

    const importId = randomUUID();
    const csvToSystem: Record<string, string> = {};
    for (const [systemField, csvColumn] of Object.entries(columnMapping)) {
      if (csvColumn) {
        csvToSystem[csvColumn as string] = systemField;
      }
    }

    const transactionsToInsert: any[] = [];
    const snapshotsToInsert: any[] = [];
    let recordsSkipped = 0;
    let recordsErrored = 0;

    // Process allRows and encrypt fields in parallel
    const mappedRows = await Promise.all(
      parsed.allRows.map(async (row) => {
        try {
          const mapped: Record<string, string> = {};
          for (const [csvCol, value] of Object.entries(row)) {
            const systemField = csvToSystem[csvCol];
            if (systemField) {
              mapped[systemField] = value;
            }
          }

          if (mapped.date) {
            const parsedRowDate = parseDateField(mapped.date, importType === 'account_snapshots' ? snapshotDayOfMonth : undefined);
            if (startDate && parsedRowDate < startDate) {
              return { skipped: true };
            }
            if (endDate && parsedRowDate > endDate) {
              return { skipped: true };
            }
          }

          const csvAccountRef = mapped.account;
          if (!csvAccountRef) {
            return { skipped: true };
          }

          const resolved = accountIdByRef.get(csvAccountRef);
          if (!resolved || resolved === EXCLUDED) {
            return { skipped: true };
          }
          const resolvedAccountId = resolved;
          const resolvedCategoryId = mapped.category ? categoryIdByName.get(mapped.category) : null;
          const externalId = 'imported-' + randomUUID();

          if (importType === 'transactions') {
            const rawAmount = mapped.amount?.replace(/[^0-9.\-]/g, '') || '0';
            let parsedAmount = parseFloat(rawAmount);
            if (isNaN(parsedAmount)) parsedAmount = 0;

            if (mapped.type) {
              parsedAmount = determineTransactionSign(parsedAmount, mapped.type);
            }

            const encryptedAmount = await encryptField(formatToCents(roundToCents(parsedAmount)), dek);
            const encryptedDescription = await encryptField(mapped.description || '', dek);
            const encryptedPayee = mapped.payee ? await encryptField(mapped.payee, dek) : null;
            const encryptedMemo = mapped.memo ? await encryptField(mapped.memo, dek) : null;
            const encryptedNotes = mapped.notes ? await encryptField(mapped.notes, dek) : null;

            return {
              type: 'transaction',
              data: {
                userId: dataUserId,
                accountId: resolvedAccountId,
                externalId,
                date: parseDateField(mapped.date),
                amount: encryptedAmount,
                description: encryptedDescription,
                payee: encryptedPayee ?? undefined,
                memo: encryptedMemo ?? undefined,
                notes: encryptedNotes ?? undefined,
                categoryId: resolvedCategoryId ?? undefined,
                isImported: true,
                importId,
                reviewed: true,
              },
            };
          } else {
            const rawBalance = parseFloat(mapped.balance?.replace(/[^0-9.\-]/g, '') || '0');
            const roundedBalance = isNaN(rawBalance) ? 0 : roundToCents(rawBalance);
            const encryptedBalance = await encryptField(formatToCents(roundedBalance), dek);

            return {
              type: 'snapshot',
              data: {
                userId: dataUserId,
                accountId: resolvedAccountId,
                snapshotDate: parseDateField(mapped.date, snapshotDayOfMonth ?? 'end'),
                balance: encryptedBalance,
                isImported: true,
                importId,
                isSynthetic: false,
              },
            };
          }
        } catch (err) {
          return { errored: true };
        }
      })
    );

    for (const res of mappedRows) {
      if (res.skipped) {
        recordsSkipped++;
      } else if (res.errored) {
        recordsErrored++;
      } else if (res.type === 'transaction') {
        transactionsToInsert.push(res.data);
      } else if (res.type === 'snapshot') {
        snapshotsToInsert.push(res.data);
      }
    }

    const db = getDb();
    const recordsImported = transactionsToInsert.length + snapshotsToInsert.length;

    let dataStartDate: string | null = null;
    let dataEndDate: string | null = null;

    const allDates: string[] = [];
    for (const tx of transactionsToInsert) {
      if (tx.date) allDates.push(tx.date);
    }
    for (const snap of snapshotsToInsert) {
      if (snap.snapshotDate) allDates.push(snap.snapshotDate);
    }

    if (allDates.length > 0) {
      allDates.sort();
      dataStartDate = allDates[0];
      dataEndDate = allDates[allDates.length - 1];
    }

    logger.info(`[import/execute] Processing import chunks`, {
      transactionsToInsert: transactionsToInsert.length,
      snapshotsToInsert: snapshotsToInsert.length,
      recordsSkipped,
      recordsErrored,
    });

    await db.transaction(async (tx) => {
      const encryptedFileContent = await encryptField(csvText, dek);

      // Step 1: Create import log entry FIRST so FK constraints on import_id are satisfied
      await tx.insert(importLog).values({
        id: importId,
        userId: dataUserId,
        fileName: body.fileName || 'unknown.csv',
        importType: importType as ImportType,
        status: recordsErrored > 0 && recordsImported > 0 ? 'partial' : recordsErrored > 0 ? 'failed' : 'completed',
        recordsImported,
        recordsSkipped,
        recordsErrored,
        columnMapping,
        accountMapping: Object.fromEntries(accountIdByRef),
        categoryMapping: Object.fromEntries(categoryIdByName),
        startDate: startDate ? parseDateField(startDate) : null,
        endDate: endDate ? parseDateField(endDate) : null,
        dataStartDate,
        dataEndDate,
        fileContent: encryptedFileContent,
      });

      // Step 2: Create any new accounts
      if (newAccounts && typeof newAccounts === 'object') {
        for (const [csvRef, accountData] of Object.entries(newAccounts)) {
          const data = accountData as { name: string; type: string; currency?: string; institution?: string };
          const encryptedName = await encryptField(data.name, dek);
          const encryptedBalance = await encryptField('0', dek);
          const encryptedInstitution = data.institution ? await encryptField(data.institution, dek) : null;
          const newAccountId = accountIdByRef.get(csvRef) as string;

          await tx.insert(accounts).values({
            id: newAccountId,
            userId: dataUserId,
            externalId: 'imported-' + randomUUID(),
            name: encryptedName,
            balance: encryptedBalance,
            type: data.type || 'checking',
            currency: data.currency || 'USD',
            institution: encryptedInstitution ?? undefined,
            connectionId: null,
          });
        }
      }

      // Step 3: Create any new categories (properly encrypted)
      if (newCategories && typeof newCategories === 'object') {
        for (const [csvName, catData] of Object.entries(newCategories)) {
          const data = catData as { name: string; color?: string; isIncome?: boolean; parentId?: string | null };
          const newCategoryId = categoryIdByName.get(csvName) as string;

          await tx.insert(categories).values({
            id: newCategoryId,
            userId: dataUserId,
            name: await encryptField(data.name, dek),
            color: data.color || '#6366f1',
            isIncome: data.isIncome ?? false,
            parentId: data.parentId || null,
          });
        }
      }

      // Step 4: Batch insert transactions or snapshots (chunked to avoid huge queries)
      const CHUNK_SIZE = 500;
      if (transactionsToInsert.length > 0) {
        logger.info(`[import/execute] Inserting transactions chunk`, { count: transactionsToInsert.length, chunkSize: CHUNK_SIZE });
        for (let i = 0; i < transactionsToInsert.length; i += CHUNK_SIZE) {
          const chunk = transactionsToInsert.slice(i, i + CHUNK_SIZE);
          await tx.insert(transactions).values(chunk);
        }
      }

      if (snapshotsToInsert.length > 0) {
        logger.info(`[import/execute] Inserting account snapshots chunk`, { count: snapshotsToInsert.length, chunkSize: CHUNK_SIZE });
        for (let i = 0; i < snapshotsToInsert.length; i += CHUNK_SIZE) {
          const chunk = snapshotsToInsert.slice(i, i + CHUNK_SIZE);
          await tx.insert(accountSnapshots)
            .values(chunk)
            .onConflictDoUpdate({
              target: [accountSnapshots.userId, accountSnapshots.accountId, accountSnapshots.snapshotDate],
              set: {
                balance: sql`EXCLUDED.balance`,
                isImported: sql`EXCLUDED.is_imported`,
                importId: sql`EXCLUDED.import_id`,
                isSynthetic: sql`EXCLUDED.is_synthetic`,
              },
            });
        }
      }
    });

    // Step 5: Post-import processing (Snapshots and Summary updates)
    try {
      const affectedAccountIds = new Set<string>();
      for (const tx of transactionsToInsert) {
        if (tx.accountId) affectedAccountIds.add(tx.accountId);
      }
      for (const snap of snapshotsToInsert) {
        if (snap.accountId) affectedAccountIds.add(snap.accountId);
      }
      if (newAccounts && typeof newAccounts === 'object') {
        for (const csvRef of Object.keys(newAccounts)) {
          const accId = accountIdByRef.get(csvRef);
          if (accId && accId !== EXCLUDED) {
            affectedAccountIds.add(accId);
          }
        }
      }

      if (affectedAccountIds.size > 0) {
        const todayStr = new Date().toISOString().split('T')[0];
        logger.info(`[import/execute] Regenerating snapshots for affected accounts`, { count: affectedAccountIds.size });
        for (const acctId of affectedAccountIds) {
          const earliestTx = await getEarliestTransactionDate(acctId);
          const fromDateStr = earliestTx || todayStr;
          await generateHistoricalAccountSnapshots(
            acctId,
            dataUserId,
            fromDateStr,
            todayStr,
            dek
          );

          // Sync the main accounts table balance with the latest snapshot balance
          const [latestSnapshot] = await db
            .select({ balance: accountSnapshots.balance })
            .from(accountSnapshots)
            .where(
              and(
                eq(accountSnapshots.accountId, acctId),
                eq(accountSnapshots.userId, dataUserId)
              )
            )
            .orderBy(desc(accountSnapshots.snapshotDate))
            .limit(1);

          if (latestSnapshot) {
            await db
              .update(accounts)
              .set({
                balance: latestSnapshot.balance,
                balanceDate: new Date(),
                updatedAt: new Date(),
              })
              .where(eq(accounts.id, acctId));
          }
        }
      }

      // Historically recalculate the daily net worth snapshots table
      await recalculateNetWorthSnapshots(dataUserId, dek);

      // Update cash flow, category spending, and category income summaries for charts
      await updateMonthlyCashFlowSummaries(dataUserId, dek);
      await updateCategorySpendingSummaries(dataUserId, dek);
      await updateCategoryIncomeSummaries(dataUserId, dek);
      logger.info(`[import/execute] Successfully updated summaries, regenerated snapshots, and updated account balances.`);
    } catch (postImportError) {
      const msg = postImportError instanceof Error ? postImportError.message : String(postImportError);
      logger.error(`[import/execute] Error in post-import snapshot/summary updates`, { error: msg });
      warnings.push(`Post-import processing warning: ${msg}. Snapshots and summaries may be stale. You can recalculate them from Settings > Analytics > Data Sources.`);
    }

    if (transactionsToInsert.length > 0) {
      invalidateUserSearchCache(dataUserId);
    }

    return NextResponse.json({
      success: true,
      importId,
      recordsImported,
      recordsSkipped,
      recordsErrored,
      status: recordsErrored > 0 && recordsImported > 0 ? 'partial' : recordsErrored > 0 ? 'failed' : 'completed',
      warnings: warnings.length > 0 ? warnings : undefined,
    });
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`[import/execute] Import failed`, {
      message: rawMessage,
      error: error instanceof Error ? error.stack : String(error),
    });

    // Classify common Postgres errors into user-friendly messages
    let cleanMessage: string;
    if (rawMessage.includes('Failed query:')) {
      if (rawMessage.includes('violates foreign key constraint')) {
        if (rawMessage.includes('user_id')) {
          cleanMessage = 'Import failed: Your user account reference is invalid. This is a system configuration issue — please contact support.';
        } else if (rawMessage.includes('account_id')) {
          cleanMessage = 'Import failed: Some account references in your CSV don\'t match any existing account. Check your account mapping and try again.';
        } else if (rawMessage.includes('category_id')) {
          cleanMessage = 'Import failed: Some category references in your CSV don\'t match any existing category. Check your category mapping and try again.';
        } else {
          cleanMessage = 'Import failed: A reference in your data is invalid. Make sure all accounts and categories are properly mapped.';
        }
      } else if (rawMessage.includes('violates unique constraint') || rawMessage.includes('duplicate key')) {
        cleanMessage = 'Import failed: Duplicate records detected. Some of these transactions may have already been imported. Check for duplicates in your CSV.';
      } else if (rawMessage.includes('invalid input syntax for type date') || rawMessage.includes('date/time')) {
        cleanMessage = 'Import failed: Some dates in your CSV could not be understood. Make sure dates are in a supported format (e.g. "May 23, 2026" or "YYYY-MM-DD").';
      } else if (rawMessage.includes('invalid input syntax for type uuid')) {
        cleanMessage = 'Import failed: A UUID value in your data is invalid. This may indicate a corrupt account or category reference.';
      } else {
        cleanMessage = 'Import failed: A database error occurred. Check that all required columns are mapped and your CSV data is valid.';
      }
    } else {
      cleanMessage = rawMessage;
    }

    return NextResponse.json(
      { error: 'Import failed', message: cleanMessage, errorDetails: cleanMessage },
      { status: 500 }
    );
  }
}
