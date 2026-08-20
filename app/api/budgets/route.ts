import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { accounts, budgets, categories, categorySpendingSummary, categoryIncomeSummary, transactions, transactionTags, userSettings } from '@/lib/db/schema';
import { eq, and, or, isNull, sql, inArray, gte, lt, lte } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptField, decryptRows, encryptRow } from '@/lib/crypto';
import { formatToCents } from '@/lib/services/account-history';
import { ensureCategoryDiscretionaryColumn } from '@/lib/db/seed-categories';

function getPeriodBounds(periodType: string, periodKey: string | null, now: Date) {
  let start: Date;
  let next: Date;
  let yearMonth: string;

  if (periodKey) {
    if (periodType === 'monthly') {
      const [y, m] = periodKey.split('-').map(Number);
      start = new Date(Date.UTC(y, m - 1, 1));
      next = new Date(Date.UTC(y, m, 1));
      yearMonth = periodKey;
    }
    else if (periodType === 'quarterly') {
      const [y, q] = periodKey.split('-Q').map(Number);
      start = new Date(Date.UTC(y, (q - 1) * 3, 1));
      next = new Date(Date.UTC(y, q * 3, 1));
      yearMonth = periodKey;
    }
    else { // yearly
      const y = Number(periodKey);
      start = new Date(Date.UTC(y, 0, 1));
      next = new Date(Date.UTC(y + 1, 0, 1));
      yearMonth = periodKey;
    }
  } else {
    const y = now.getFullYear();
    const m = now.getMonth();
    if (periodType === 'monthly') {
      start = new Date(Date.UTC(y, m, 1));
      next = new Date(Date.UTC(y, m + 1, 1));
      yearMonth = `${y}-${String(m + 1).padStart(2, '0')}`;
    } else if (periodType === 'quarterly') {
      const q = Math.floor(m / 3);
      start = new Date(Date.UTC(y, q * 3, 1));
      next = new Date(Date.UTC(y, (q + 1) * 3, 1));
      yearMonth = `${y}-Q${q + 1}`;
    } else { // yearly
      start = new Date(Date.UTC(y, 0, 1));
      next = new Date(Date.UTC(y + 1, 0, 1));
      yearMonth = String(y);
    }
  }

  return {
    yearMonth,
    startDate: start.toISOString().split('T')[0],
    endDate: next.toISOString().split('T')[0],
    label: yearMonth,
  };
}

function parsePeriodRange(keyOrDate: string | null | undefined): { start: string; end: string } {
  if (!keyOrDate) {
    return { start: '1970-01-01', end: '9999-12-31' };
  }
  const s = keyOrDate.trim();
  if (s.includes('-Q')) {
    const [y, q] = s.split('-Q').map(Number);
    const startMonth = (q - 1) * 3 + 1;
    const endMonth = q * 3;
    const start = `${y}-${String(startMonth).padStart(2, '0')}-01`;
    const lastDay = new Date(Date.UTC(y, endMonth, 0)).getUTCDate();
    const end = `${y}-${String(endMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return { start, end };
  }
  if (/^\d{4}-\d{2}$/.test(s)) {
    const [y, m] = s.split('-').map(Number);
    const start = `${y}-${String(m).padStart(2, '0')}-01`;
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const end = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return { start, end };
  }
  if (/^\d{4}$/.test(s)) {
    const y = Number(s);
    return { start: `${y}-01-01`, end: `${y}-12-31` };
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return { start: s, end: s };
  }
  return { start: '1970-01-01', end: '9999-12-31' };
}

function getPreviousPeriodKey(periodType: string, periodKey: string): string {
  if (periodType === 'monthly') {
    const [y, m] = periodKey.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 2, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  }
  if (periodType === 'quarterly') {
    const [y, q] = periodKey.split('-Q').map(Number);
    if (q === 1) return `${y - 1}-Q4`;
    return `${y}-Q${q - 1}`;
  }
  return String(Number(periodKey) - 1);
}

export async function GET(request: Request) {
  const session = await auth();
  const dataUserId = session?.user ? ((session.user as any).dataUserId ?? session.user.id) : undefined;
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const dek = await getSessionDEK();
  const { searchParams } = new URL(request.url);
  const now = new Date();
  const periodType = searchParams.get('periodType') || 'monthly';
  const periodKey = searchParams.get('periodKey');
  const includeCategories = searchParams.get('includeCategories') === 'true';

  const db = getDb();

  try {
    await ensureCategoryDiscretionaryColumn();
    const bounds = periodKey ? getPeriodBounds(periodType, periodKey, now) : getPeriodBounds(periodType, null, now);
    const targetPeriodKey = bounds.yearMonth;
    const targetRange = parsePeriodRange(targetPeriodKey);

    const allUserBudgets = await db
      .select({
        id: budgets.id,
        categoryId: budgets.categoryId,
        amount: budgets.amount,
        isRecurring: budgets.isRecurring,
        effectiveFrom: budgets.effectiveFrom,
        effectiveTo: budgets.effectiveTo,
        yearMonth: budgets.yearMonth,
        periodType: budgets.periodType,
        periodKey: budgets.periodKey,
        fundingAccountId: budgets.fundingAccountId,
        rollover: budgets.rollover,
        notes: budgets.notes,
        createdAt: budgets.createdAt,
        categoryName: categories.name,
        categoryColor: categories.color,
        isIncome: categories.isIncome,
        categoryType: categories.categoryType,
        isDiscretionary: categories.isDiscretionary,
      })
      .from(budgets)
      .leftJoin(categories, eq(budgets.categoryId, categories.id))
      .where(
        and(
          eq(budgets.userId, dataUserId),
          or(eq(categories.excludeFromReports, false), isNull(categories.excludeFromReports)),
        )
      );

    // Decrypt budget amounts and notes
    const decryptedBudgetRows = await Promise.all(allUserBudgets.map(async (row) => ({
      ...row,
      amount: await decryptField(row.amount, dek),
      categoryName: row.categoryName ? await decryptField(row.categoryName, dek) : 'Uncategorized',
      notes: row.notes ? await decryptField(row.notes, dek).catch(() => row.notes) : null,
    })));

    // Group budgets by categoryId and timeframe
    const categoryBudgetsMap = new Map<string, typeof decryptedBudgetRows>();
    for (const b of decryptedBudgetRows) {
      // Check if budget is active in target period
      let isActive = false;
      if (b.isRecurring) {
        const fromDate = b.effectiveFrom ? parsePeriodRange(b.effectiveFrom).start : '1970-01-01';
        const toDate = b.effectiveTo ? parsePeriodRange(b.effectiveTo).end : '9999-12-31';
        isActive = fromDate <= targetRange.end && toDate >= targetRange.start;
      } else {
        const oneOffKey = b.yearMonth || b.periodKey || b.effectiveFrom;
        if (oneOffKey) {
          const oneOffRange = parsePeriodRange(oneOffKey);
          isActive = oneOffRange.start <= targetRange.end && oneOffRange.end >= targetRange.start;
        }
      }

      if (isActive) {
        const existingList = categoryBudgetsMap.get(b.categoryId) || [];
        existingList.push(b);
        categoryBudgetsMap.set(b.categoryId, existingList);
      }
    }

    interface ResolvedBudgetItem {
      id: string;
      categoryId: string;
      categoryName: string;
      categoryColor: string;
      periodType: string;
      nativePeriodType: 'monthly' | 'quarterly' | 'yearly';
      nativeAmount: number;
      budgeted: number;
      periodKey?: string | null;
      yearMonth?: string | null;
      effectiveFrom?: string | null;
      effectiveTo?: string | null;
      isRecurring: boolean;
      fundingAccountId: string | null;
      rollover: boolean;
      notes: string | null;
      isIncome: boolean | null;
      categoryType: string | null;
      isDiscretionary: boolean | null;
    }

    const activeBudgetRows: ResolvedBudgetItem[] = [];

    for (const [catId, bList] of categoryBudgetsMap.entries()) {
      // Sort candidates by parsed start date descending so the newest configured budget takes precedence
      const sortedCandidates = [...bList].sort((a, b) => {
        const dateA = a.effectiveFrom ? parsePeriodRange(a.effectiveFrom).start : '1970-01-01';
        const dateB = b.effectiveFrom ? parsePeriodRange(b.effectiveFrom).start : '1970-01-01';
        return dateB.localeCompare(dateA);
      });

      let chosen: typeof decryptedBudgetRows[0] | null = null;
      let nativePeriodType: 'monthly' | 'quarterly' | 'yearly' = 'monthly';
      let budgetedMultiplier = 1;

      if (periodType === 'monthly') {
        // Priority: Direct Monthly (x1) > Quarterly Roll-Down (/3) > Yearly Roll-Down (/12)
        const directMonthly = sortedCandidates.find((c) => (c.periodType || 'monthly') === 'monthly');
        if (directMonthly) {
          chosen = directMonthly;
          nativePeriodType = 'monthly';
          budgetedMultiplier = 1;
        } else {
          const quarterlyCandidate = sortedCandidates.find((c) => c.periodType === 'quarterly');
          if (quarterlyCandidate) {
            chosen = quarterlyCandidate;
            nativePeriodType = 'quarterly';
            budgetedMultiplier = 1 / 3;
          } else {
            const yearlyCandidate = sortedCandidates.find((c) => c.periodType === 'yearly');
            if (yearlyCandidate) {
              chosen = yearlyCandidate;
              nativePeriodType = 'yearly';
              budgetedMultiplier = 1 / 12;
            }
          }
        }
      } else if (periodType === 'quarterly') {
        // Priority: Direct Quarterly (x1) > Monthly Rollup (x3) > Yearly Roll-Down (/4)
        const directQuarterly = sortedCandidates.find((c) => c.periodType === 'quarterly');
        if (directQuarterly) {
          chosen = directQuarterly;
          nativePeriodType = 'quarterly';
          budgetedMultiplier = 1;
        } else {
          const monthlyCandidate = sortedCandidates.find((c) => (c.periodType || 'monthly') === 'monthly');
          if (monthlyCandidate) {
            chosen = monthlyCandidate;
            nativePeriodType = 'monthly';
            budgetedMultiplier = 3;
          } else {
            const yearlyCandidate = sortedCandidates.find((c) => c.periodType === 'yearly');
            if (yearlyCandidate) {
              chosen = yearlyCandidate;
              nativePeriodType = 'yearly';
              budgetedMultiplier = 1 / 4;
            }
          }
        }
      } else {
        // Yearly: Priority: Direct Yearly (x1) > Quarterly Rollup (x4) > Monthly Rollup (x12)
        const directYearly = sortedCandidates.find((c) => c.periodType === 'yearly');
        if (directYearly) {
          chosen = directYearly;
          nativePeriodType = 'yearly';
          budgetedMultiplier = 1;
        } else {
          const quarterlyCandidate = sortedCandidates.find((c) => c.periodType === 'quarterly');
          if (quarterlyCandidate) {
            chosen = quarterlyCandidate;
            nativePeriodType = 'quarterly';
            budgetedMultiplier = 4;
          } else {
            const monthlyCandidate = sortedCandidates.find((c) => (c.periodType || 'monthly') === 'monthly');
            if (monthlyCandidate) {
              chosen = monthlyCandidate;
              nativePeriodType = 'monthly';
              budgetedMultiplier = 12;
            }
          }
        }
      }

      if (chosen) {
        const nativeAmount = parseFloat(chosen.amount) || 0;
        activeBudgetRows.push({
          id: chosen.id,
          categoryId: chosen.categoryId,
          categoryName: chosen.categoryName,
          categoryColor: chosen.categoryColor || '#6366f1',
          periodType: periodType,
          nativePeriodType,
          nativeAmount,
          budgeted: nativeAmount * budgetedMultiplier,
          periodKey: chosen.periodKey || chosen.yearMonth || null,
          yearMonth: chosen.yearMonth || null,
          effectiveFrom: chosen.effectiveFrom || null,
          effectiveTo: chosen.effectiveTo || null,
          isRecurring: chosen.isRecurring,
          fundingAccountId: chosen.fundingAccountId,
          rollover: chosen.rollover,
          notes: chosen.notes,
          isIncome: chosen.isIncome,
          categoryType: chosen.categoryType,
          isDiscretionary: chosen.isDiscretionary,
        });
      }
    }

    // Fetch all categories for hierarchy mapping
    const allCategories = await db
      .select({ 
        id: categories.id, 
        name: categories.name, 
        color: categories.color, 
        parentId: categories.parentId, 
        isIncome: categories.isIncome,
        categoryType: categories.categoryType,
        isDiscretionary: categories.isDiscretionary,
      })
      .from(categories)
      .where(eq(categories.userId, dataUserId));

    const decryptedAllCategories = await Promise.all(allCategories.map(async (c) => ({
      ...c,
      name: c.name ? await decryptField(c.name, dek) : 'Uncategorized',
    })));

    const categoryByIdMap = new Map(decryptedAllCategories.map(c => [c.id, c]));
    const parentMap = new Map<string, string | null>(
      decryptedAllCategories.map(c => [c.id, c.parentId || null])
    );

    // Set of categories that have an active direct budget item
    const budgetedCategoryIds = new Set(activeBudgetRows.map((b) => b.categoryId));

    // Find the closest ancestor (or self) that has a budget item
    const getClosestBudgetedCategory = (catId: string): string | null => {
      let curr: string | null = catId;
      while (curr) {
        if (budgetedCategoryIds.has(curr)) return curr;
        curr = parentMap.get(curr) || null;
      }
      return null;
    };

    // Build coveredCategoryIds mapping: maps each budgeted category to itself + any unbudgeted descendants that roll into it
    const coveredCategoriesMap = new Map<string, string[]>();
    for (const catId of budgetedCategoryIds) {
      coveredCategoriesMap.set(catId, [catId]);
    }
    for (const cat of decryptedAllCategories) {
      const targetId = getClosestBudgetedCategory(cat.id);
      if (targetId && targetId !== cat.id) {
        const list = coveredCategoriesMap.get(targetId) || [targetId];
        if (!list.includes(cat.id)) {
          list.push(cat.id);
        }
        coveredCategoriesMap.set(targetId, list);
      }
    }

    // User settings & account exclusion configuration
    const userSettingsList = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, dataUserId))
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

    const budgetExclusions = (userSetting?.budgetExclusions as { categoryIds?: string[]; tagIds?: string[] }) || {};
    const excludedCategoryIds = new Set(budgetExclusions.categoryIds || []);
    const excludedTagIds = new Set(budgetExclusions.tagIds || []);

    // Direct-match only: a split group is NOT excluded wholesale when one
    // member carries an excluded tag — only the tagged transaction itself.
    const excludedTransactionIds = new Set<string>();
    if (excludedTagIds.size > 0) {
      const taggedRows = await db
        .select({ transactionId: transactionTags.transactionId })
        .from(transactionTags)
        .where(inArray(transactionTags.tagId, Array.from(excludedTagIds)));
      for (const r of taggedRows) {
        if (r.transactionId) excludedTransactionIds.add(r.transactionId);
      }
    }

    const userAccounts = await db
      .select({
        id: accounts.id,
        isHidden: accounts.isHidden,
        isExcludedFromNetWorth: accounts.isExcludedFromNetWorth,
      })
      .from(accounts)
      .where(eq(accounts.userId, dataUserId));

    const excludedAccountIds = new Set(
      userAccounts.filter((a) => a.isHidden || a.isExcludedFromNetWorth).map((a) => a.id)
    );

    // Fetch all active period transactions
    const txConditions = [
      eq(transactions.userId, dataUserId),
      gte(transactions.date, bounds.startDate),
      lt(transactions.date, bounds.endDate),
      eq(transactions.deleted, false),
      eq(transactions.ignored, false),
    ];
    if (!isImportTransactionsEnabled) {
      txConditions.push(eq(transactions.isImported, false));
    }

    const txRows = await db
      .select({
        id: transactions.id,
        date: transactions.date,
        categoryId: transactions.categoryId,
        amount: transactions.amount,
        accountId: transactions.accountId,
        ignored: transactions.ignored,
      })
      .from(transactions)
      .where(and(...txConditions));

    const budgetActualsMap = new Map<string, number>();
    const unbudgetedActualsMap = new Map<string, number>();

    for (const row of txRows) {
      if (!row.categoryId) continue;
      if (row.ignored) continue;
      if (row.date) {
        const txDateStr = typeof row.date === 'string' ? row.date : (row.date instanceof Date ? row.date.toISOString().split('T')[0] : String(row.date));
        if (txDateStr < bounds.startDate || txDateStr >= bounds.endDate) continue;
      }
      if (row.accountId && excludedAccountIds.has(row.accountId)) continue;
      if (excludedTransactionIds.has(row.id)) continue;
      if (excludedCategoryIds.has(row.categoryId)) continue;

      const decrypted = await decryptField(String(row.amount), dek);
      const amount = parseFloat(decrypted);
      if (isNaN(amount)) continue;

      const catInfo = categoryByIdMap.get(row.categoryId);
      const isIncomeCat = catInfo?.isIncome ?? false;

      // Net spending/income calculation:
      // For expense categories: expense purchases are negative in DB (-amount is spending), returns are positive (+amount reduces spending).
      // For income categories: income deposits are positive in DB (+amount is income), refunds are negative (-amount reduces income).
      const netVal = isIncomeCat ? amount : -amount;
      const targetBudgetCatId = getClosestBudgetedCategory(row.categoryId);

      if (targetBudgetCatId) {
        // Transaction is covered by a budget item (direct or ancestor)
        const prev = budgetActualsMap.get(targetBudgetCatId) || 0;
        budgetActualsMap.set(targetBudgetCatId, prev + netVal);
      } else {
        // Transaction is UNBUDGETED - evaluate for Everything Else bucket
        if (
          catInfo &&
          !catInfo.isIncome &&
          catInfo.categoryType !== 'compound' &&
          catInfo.categoryType !== 'transfer' &&
          catInfo.name.toLowerCase() !== 'everything else' &&
          !excludedCategoryIds.has(row.categoryId)
        ) {
          const prev = unbudgetedActualsMap.get(row.categoryId) || 0;
          unbudgetedActualsMap.set(row.categoryId, prev + netVal);
        }
      }
    }

    // Build Everything Else breakout list
    const everythingElseBreakout = Array.from(unbudgetedActualsMap.entries())
      .map(([catId, actual]) => {
        const cat = categoryByIdMap.get(catId);
        return {
          categoryId: catId,
          categoryName: cat?.name || 'Uncategorized',
          categoryColor: cat?.color || '#6366f1',
          actual,
        };
      })
      .filter((c) => c.actual > 0)
      .sort((a, b) => b.actual - a.actual);

    // Calculate rollover carryover for active monthly expense budgets with rollover: true
    const rolloverCarryoverMap = new Map<string, number>();
    if (periodType === 'monthly') {
      const rolloverRows = activeBudgetRows.filter(
        (r) => r.rollover && !r.isIncome && r.categoryType !== 'compound'
      );

      if (rolloverRows.length > 0) {
        const [targetYear, targetMonth] = targetPeriodKey.split('-').map(Number);

        for (const row of rolloverRows) {
          const fromKey = row.effectiveFrom || '1970-01';
          const fromRange = parsePeriodRange(fromKey);
          const fromDate = new Date(fromRange.start);
          const fromYear = fromDate.getUTCFullYear();
          const fromMonth = fromDate.getUTCMonth() + 1;

          // Compute list of prior consecutive month keys (up to 12 months back)
          const priorMonthKeys: string[] = [];
          for (let offset = 12; offset >= 1; offset--) {
            const d = new Date(Date.UTC(targetYear, targetMonth - 1 - offset, 1));
            const y = d.getUTCFullYear();
            const m = d.getUTCMonth() + 1;
            const ymKey = `${y}-${String(m).padStart(2, '0')}`;
            if (y > fromYear || (y === fromYear && m >= fromMonth)) {
              priorMonthKeys.push(ymKey);
            }
          }

          if (priorMonthKeys.length > 0) {
            const earliestMonthStart = `${priorMonthKeys[0]}-01`;
            const priorCoveredCatIds = coveredCategoriesMap.get(row.categoryId) || [row.categoryId];

            const priorTxConditions = [
              eq(transactions.userId, dataUserId),
              gte(transactions.date, earliestMonthStart),
              lt(transactions.date, bounds.startDate),
              eq(transactions.deleted, false),
              eq(transactions.ignored, false),
              inArray(transactions.categoryId, priorCoveredCatIds),
            ];
            if (!isImportTransactionsEnabled) {
              priorTxConditions.push(eq(transactions.isImported, false));
            }

            const priorTxRows = await db
              .select({
                id: transactions.id,
                date: transactions.date,
                amount: transactions.amount,
                accountId: transactions.accountId,
                categoryId: transactions.categoryId,
              })
              .from(transactions)
              .where(and(...priorTxConditions));

            // Group prior actual spending by month (YYYY-MM)
            const priorMonthlyActuals = new Map<string, number>();
            for (const tx of priorTxRows) {
              if (tx.accountId && excludedAccountIds.has(tx.accountId)) continue;
              if (excludedTransactionIds.has(tx.id)) continue;
              if (tx.categoryId && excludedCategoryIds.has(tx.categoryId)) continue;

              const decrypted = await decryptField(String(tx.amount), dek);
              const amt = parseFloat(decrypted);
              if (isNaN(amt)) continue;

              const txDateStr = typeof tx.date === 'string' ? tx.date : (tx.date instanceof Date ? tx.date.toISOString().split('T')[0] : String(tx.date));
              const txYm = txDateStr.substring(0, 7);
              // For expense categories, purchases are negative in DB (-amount is spending)
              const netSpend = -amt;
              priorMonthlyActuals.set(txYm, (priorMonthlyActuals.get(txYm) || 0) + netSpend);
            }

            // Find historical budget records for this category
            const catHistoricalBudgets = categoryBudgetsMap.get(row.categoryId) || [];

            let accumulatedCarryover = 0;
            for (const ym of priorMonthKeys) {
              const ymRange = parsePeriodRange(ym);
              const matchingBudget = catHistoricalBudgets.find((b) => {
                if (b.isRecurring) {
                  const bFrom = b.effectiveFrom ? parsePeriodRange(b.effectiveFrom).start : '1970-01-01';
                  const bTo = b.effectiveTo ? parsePeriodRange(b.effectiveTo).end : '9999-12-31';
                  return bFrom <= ymRange.end && bTo >= ymRange.start;
                } else {
                  const oneOff = b.yearMonth || b.periodKey;
                  return oneOff === ym;
                }
              });

              const priorBudgeted = matchingBudget ? (parseFloat(matchingBudget.amount) || 0) : row.budgeted;
              const priorActual = priorMonthlyActuals.get(ym) || 0;
              const priorRemaining = priorBudgeted - priorActual;

              // Envelope carryforward: surplus adds to carryover pool, deficit reduces it (floored at 0)
              accumulatedCarryover = Math.max(0, accumulatedCarryover + priorRemaining);
            }

            // Cap accumulated carryover at 3x monthly budget to prevent unbounded runaway accumulation
            const maxCap = (row.budgeted || row.nativeAmount) * 3;
            accumulatedCarryover = Math.min(accumulatedCarryover, maxCap);
            rolloverCarryoverMap.set(row.categoryId, Math.round(accumulatedCarryover * 100) / 100);
          }
        }
      }
    }

    // Map active budget rows with exact calculated actuals and Everything Else breakout
    let hasExplicitEverythingElse = false;
    const data = activeBudgetRows.map((row) => {
      const nativeAmount = row.nativeAmount;
      const budgeted = row.budgeted;

      const isIncome = row.isIncome ?? false;
      const isCompound = row.categoryType === 'compound';
      const effectiveIsIncome = isIncome && !isCompound;
      let actual = budgetActualsMap.get(row.categoryId) || 0;

      const isEverythingElse = (row.categoryName || '').toLowerCase().includes('everything else') ||
                               (row.categoryName || '').toLowerCase().includes('all other') ||
                               (row.categoryName || '').toLowerCase().includes('misc');
      let groupedBreakout: typeof everythingElseBreakout | undefined = undefined;

      if (isEverythingElse) {
        hasExplicitEverythingElse = true;
        groupedBreakout = everythingElseBreakout;
        const totalUnbudgetedActual = everythingElseBreakout.reduce((s, c) => s + c.actual, 0);
        actual = Math.max(actual, totalUnbudgetedActual);
      }

      const rolloverCarryover = rolloverCarryoverMap.get(row.categoryId) || 0;
      const availableBudget = (row.rollover && !effectiveIsIncome) ? budgeted + rolloverCarryover : budgeted;
      const remaining = effectiveIsIncome ? actual - budgeted : availableBudget - actual;
      const percentUsed = availableBudget > 0 ? (actual / availableBudget) * 100 : 0;
      const coveredCategoryIds = coveredCategoriesMap.get(row.categoryId) || [row.categoryId];

      return {
        id: row.id,
        categoryId: row.categoryId,
        categoryName: isEverythingElse ? 'Everything Else' : row.categoryName,
        categoryColor: isEverythingElse ? '#64748b' : (row.categoryColor || '#6366f1'),
        periodType: row.periodType,
        nativePeriodType: row.nativePeriodType,
        nativeAmount: nativeAmount,
        periodKey: row.periodKey || row.yearMonth || null,
        yearMonth: row.yearMonth || null,
        effectiveFrom: row.effectiveFrom || null,
        effectiveTo: row.effectiveTo || null,
        isRecurring: row.isRecurring,
        fundingAccountId: row.fundingAccountId,
        rollover: row.rollover,
        rolloverCarryover,
        availableBudget,
        notes: row.notes,
        monthlyAmount: row.nativePeriodType === 'monthly'
          ? nativeAmount
          : (row.nativePeriodType === 'quarterly' ? nativeAmount / 3 : nativeAmount / 12),
        budgeted,
        actual,
        remaining,
        percentUsed,
        type: effectiveIsIncome ? 'income' : 'expense',
        isDiscretionary: row.isDiscretionary ?? true,
        isEverythingElse,
        isCatchAll: isEverythingElse,
        groupedBreakout,
        coveredCategoryIds,
      };
    });

    // If there is unbudgeted spending and no explicit Everything Else budget exists, add synthetic Everything Else item
    if (!hasExplicitEverythingElse && everythingElseBreakout.length > 0) {
      const totalUnbudgetedActual = everythingElseBreakout.reduce((s, c) => s + c.actual, 0);
      data.push({
        id: 'synthetic-everything-else',
        categoryId: 'everything-else-special',
        categoryName: 'Everything Else',
        categoryColor: '#64748b',
        periodType: periodType,
        nativePeriodType: periodType as any,
        nativeAmount: 0,
        periodKey: null,
        yearMonth: null,
        effectiveFrom: null,
        effectiveTo: null,
        isRecurring: true,
        fundingAccountId: null,
        rollover: false,
        notes: null,
        monthlyAmount: 0,
        budgeted: 0,
        actual: totalUnbudgetedActual,
        remaining: -totalUnbudgetedActual,
        percentUsed: 0,
        type: 'expense' as const,
        isDiscretionary: true,
        isEverythingElse: true,
        isCatchAll: true,
        groupedBreakout: everythingElseBreakout,
        coveredCategoryIds: everythingElseBreakout.map((b) => b.categoryId),
      });
    }

    const result: Record<string, unknown> = { budgets: data, period: bounds };

    if (includeCategories) {
      let catList = decryptedAllCategories.map((c) => ({
        id: c.id,
        name: c.name,
        color: c.color,
        isIncome: c.isIncome,
        parentId: c.parentId,
        isDiscretionary: c.isDiscretionary,
      }));

      // Ensure "Everything Else" is in categories list for selection
      if (!catList.some((c) => c.name.toLowerCase() === 'everything else')) {
        catList.push({
          id: 'everything-else-special',
          name: 'Everything Else',
          color: '#64748b',
          isIncome: false,
          parentId: null,
          isDiscretionary: true,
        });
      }

      result.categories = catList;
    }
    return NextResponse.json(result);
  } catch (error) {
    logger.error('Error fetching budgets', { error });
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await auth();
  const dataUserId = session?.user ? ((session.user as any).dataUserId ?? session.user.id) : undefined;
  if (!session?.user || !dataUserId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const dek = await getSessionDEK();
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const db = getDb();
  try {
    const targetPeriodKey = (body.periodKey as string) ?? null;
    const targetPeriodType = (body.periodType as string) || 'monthly';
    let targetCategoryId = body.categoryId as string;
    const effectiveFrom = targetPeriodKey || (
      targetPeriodType === 'yearly'
        ? String(new Date().getFullYear())
        : targetPeriodType === 'quarterly'
        ? `${new Date().getFullYear()}-Q${Math.floor(new Date().getMonth() / 3) + 1}`
        : `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
    );

    // Handle synthetic or named 'Everything Else' category creation
    if (targetCategoryId === 'everything-else-special' || !targetCategoryId) {
      const userCategories = await db
        .select()
        .from(categories)
        .where(eq(categories.userId, dataUserId));

      const decryptedCategories = await Promise.all(
        userCategories.map(async (c) => ({
          ...c,
          name: c.name ? await decryptField(c.name, dek) : '',
        }))
      );

      let eeCat = decryptedCategories.find((c) => c.name.toLowerCase() === 'everything else');
      if (!eeCat) {
        const encryptedCat = await encryptRow(
          'categories',
          {
            userId: dataUserId,
            name: 'Everything Else',
            color: '#64748b',
            isIncome: false,
            categoryType: 'expense',
            excludeFromReports: false,
            isDiscretionary: true,
          },
          dek
        );
        const [newCat] = await db.insert(categories).values(encryptedCat).returning({ id: categories.id });
        targetCategoryId = newCat.id;
      } else {
        targetCategoryId = eeCat.id;
      }
    }

    const [existing] = await db
      .select()
      .from(budgets)
      .where(
        and(
          eq(budgets.userId, dataUserId),
          eq(budgets.categoryId, targetCategoryId),
          eq(budgets.periodType, targetPeriodType),
          targetPeriodKey ? eq(budgets.yearMonth, targetPeriodKey) : isNull(budgets.yearMonth)
        )
      )
      .limit(1);

    if (existing) {
      return NextResponse.json(
        { error: 'duplicate_budget', message: 'A budget already exists for this category and period' },
        { status: 400 }
      );
    }

    const encryptedValues = await encryptRow('budgets', {
      userId: dataUserId,
      categoryId: targetCategoryId,
      periodType: targetPeriodType,
      yearMonth: body.isRecurring !== false ? null : targetPeriodKey,
      periodKey: body.isRecurring !== false ? null : targetPeriodKey,
      effectiveFrom: effectiveFrom,
      effectiveTo: null,
      amount: formatToCents(parseFloat(String(body.amount ?? 0)) || 0),
      isRecurring: body.isRecurring !== false,
      fundingAccountId: (body.fundingAccountId as string) ?? null,
      rollover: body.rollover === true,
      notes: (body.notes as string) ?? null,
    }, dek);

    if (typeof body.isDiscretionary === 'boolean') {
      await db
        .update(categories)
        .set({ isDiscretionary: body.isDiscretionary })
        .where(and(eq(categories.id, targetCategoryId), eq(categories.userId, dataUserId)));
    }

    const [budget] = await db
      .insert(budgets)
      .values(encryptedValues)
      .returning();

    return NextResponse.json(budget, { status: 201 });
  } catch (error) {
    logger.error('Error creating budget', { error });
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const dataUserId = (session.user as any).dataUserId ?? session.user.id;
  const dek = await getSessionDEK();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const id = (searchParams.get('id') || body.id) as string;
  if (!id) {
    return NextResponse.json({ error: 'missing_id' }, { status: 400 });
  }

  const db = getDb();
  const [existing] = await db
    .select()
    .from(budgets)
    .where(and(eq(budgets.id, id), eq(budgets.userId, dataUserId)))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const targetCategoryId = (body.categoryId as string) || existing.categoryId;
  if (typeof body.isDiscretionary === 'boolean' && targetCategoryId) {
    await db
      .update(categories)
      .set({ isDiscretionary: body.isDiscretionary })
      .where(and(eq(categories.id, targetCategoryId), eq(categories.userId, dataUserId)));
  }

  const applyMode = (body.applyMode as string) || 'future';
  const currentPeriodKey = (body.periodKey as string) || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const periodType = (body.periodType as string) || existing.periodType;

  if (existing.isRecurring && applyMode === 'future' && body.amount !== undefined) {
    const existingFrom = existing.effectiveFrom || '1970-01';
    if (existingFrom < currentPeriodKey) {
      const prevPeriod = getPreviousPeriodKey(periodType, currentPeriodKey);
      await db
        .update(budgets)
        .set({ effectiveTo: prevPeriod, updatedAt: new Date() })
        .where(eq(budgets.id, id));

      const newEncryptedData = await encryptRow('budgets', {
        userId: dataUserId,
        categoryId: targetCategoryId,
        periodType: periodType,
        yearMonth: null,
        periodKey: null,
        effectiveFrom: currentPeriodKey,
        effectiveTo: null,
        amount: formatToCents(parseFloat(String(body.amount)) || 0),
        isRecurring: true,
        fundingAccountId: (body.fundingAccountId as string) ?? existing.fundingAccountId,
        rollover: body.rollover !== undefined ? body.rollover === true : existing.rollover,
        notes: (body.notes as string) ?? existing.notes,
      }, dek);

      const [newBudget] = await db.insert(budgets).values(newEncryptedData).returning();
      return NextResponse.json(newBudget);
    }
  }

  let updateData: Record<string, unknown> = {};
  if (body.categoryId !== undefined) updateData.categoryId = body.categoryId;
  if (body.periodType !== undefined) updateData.periodType = body.periodType;
  if (body.amount !== undefined) updateData.amount = formatToCents(parseFloat(String(body.amount)) || 0);
  if (body.isRecurring !== undefined) updateData.isRecurring = body.isRecurring;
  if (body.periodKey !== undefined) {
    updateData.yearMonth = body.isRecurring ? null : body.periodKey;
    updateData.periodKey = body.isRecurring ? null : body.periodKey;
  }
  if (body.effectiveFrom !== undefined) updateData.effectiveFrom = body.effectiveFrom;
  if (body.effectiveTo !== undefined) updateData.effectiveTo = body.effectiveTo;
  if (body.fundingAccountId !== undefined) updateData.fundingAccountId = body.fundingAccountId || null;
  if (body.rollover !== undefined) updateData.rollover = body.rollover;
  if (body.notes !== undefined) updateData.notes = body.notes || null;
  updateData.updatedAt = new Date();

  updateData = await encryptRow('budgets', updateData, dek);

  try {
    const [updated] = await db
      .update(budgets)
      .set(updateData)
      .where(eq(budgets.id, id))
      .returning();
    return NextResponse.json(updated);
  } catch (error) {
    logger.error('Error updating budget', { error });
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const session = await auth();
  const dataUserId = session?.user ? ((session.user as any).dataUserId ?? session.user.id) : undefined;
  if (!session?.user || !dataUserId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const periodKey = searchParams.get('periodKey') || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

  const db = getDb();

  try {
    if (action === 'reset') {
      await db.delete(budgets).where(eq(budgets.userId, dataUserId));
      return NextResponse.json({ success: true, message: 'All budgets reset' });
    }

    if (action === 'purge_history') {
      await db
        .delete(budgets)
        .where(
          and(
            eq(budgets.userId, dataUserId),
            or(
              lt(budgets.effectiveTo, periodKey),
              lt(budgets.yearMonth, periodKey)
            )
          )
        );

      await db
        .update(budgets)
        .set({ effectiveFrom: periodKey, effectiveTo: null })
        .where(eq(budgets.userId, dataUserId));

      return NextResponse.json({ success: true, message: 'Budget history removed' });
    }

    return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
  } catch (error) {
    logger.error('Error in DELETE /api/budgets', { error });
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
