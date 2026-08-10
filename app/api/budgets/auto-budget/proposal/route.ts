import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { accounts, budgets, categories, transactions, userSettings } from '@/lib/db/schema';
import { eq, and, gte, lt, min, count } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptField } from '@/lib/crypto';
import { ensureCategoryDiscretionaryColumn } from '@/lib/db/seed-categories';

export async function POST(request: Request) {
  const session = await auth();
  const dataUserId = session?.user ? ((session.user as any).dataUserId ?? session.user.id) : undefined;
  if (!session?.user || !dataUserId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const dek = await getSessionDEK();
  let body: Record<string, any>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const lookbackMonths = Math.max(1, Math.min(24, parseInt(String(body.lookbackMonths || 3), 10)));
  const calculationMethod = ['average', 'median', 'max'].includes(body.calculationMethod)
    ? body.calculationMethod
    : 'average';
  const bufferPercentage = Math.max(-50, Math.min(100, parseFloat(String(body.bufferPercentage || 0)) || 0));
  const excludeOutliers = body.excludeOutliers === true;
  const excludeVirtualAccounts = body.excludeVirtualAccounts !== false; // checked by default
  const groupSmallCategories = body.groupSmallCategories !== false;
  const smallCategoryThreshold = Math.max(0, parseFloat(String(body.smallCategoryThreshold ?? 50)) || 50);
  const includeIncome = body.includeIncome === true;
  const onlyUnbudgeted = body.onlyUnbudgeted === true;
  const periodType = (body.periodType as string) || 'monthly';
  const periodKey = (body.periodKey as string) || null;

  const periodScale = periodType === 'quarterly' ? 3 : periodType === 'yearly' ? 12 : 1;

  const db = getDb();

  try {
    await ensureCategoryDiscretionaryColumn();

    // 1. Fetch user settings for imported data
    const userSettingsList = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, dataUserId))
      .limit(1);

    const userSetting = userSettingsList[0];
    const rawShowImported = userSetting?.showImportedData;
    const importSettings = {
      global: true,
      cashFlowProjections: true,
      ...(typeof rawShowImported === 'object' && rawShowImported !== null ? rawShowImported : {}),
    } as Record<string, boolean>;

    const isImportTransactionsEnabled = importSettings.global !== false && importSettings.cashFlowProjections !== false;

    // Fetch virtual accounts if excludeVirtualAccounts is enabled
    let virtualAccountIds = new Set<string>();
    if (excludeVirtualAccounts) {
      const userAccounts = await db
        .select({ id: accounts.id, externalId: accounts.externalId, type: accounts.type })
        .from(accounts)
        .where(eq(accounts.userId, dataUserId));

      virtualAccountIds = new Set(
        userAccounts
          .filter((a) => a.type === 'paystub' || (a.externalId && a.externalId.startsWith('virtual-')))
          .map((a) => a.id)
      );
    }

    // 2. Determine earliest transaction date across all user transactions
    const [oldestTxRow] = await db
      .select({
        oldestDate: min(transactions.date),
        totalTxCount: count(transactions.id),
      })
      .from(transactions)
      .where(and(eq(transactions.userId, dataUserId), eq(transactions.deleted, false)));

    const oldestTransactionDate = oldestTxRow?.oldestDate || null;
    const now = new Date();

    // Lookback operates on completed calendar months to avoid partial month skew
    const completedMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    const endIso = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];

    const requestedStartDate = new Date(completedMonthEnd.getFullYear(), completedMonthEnd.getMonth() - lookbackMonths + 1, 1);
    const requestedStartIso = requestedStartDate.toISOString().split('T')[0];

    let effectiveStartDate = requestedStartDate;
    let actualMonthsAvailable = lookbackMonths;
    let isInsufficientHistory = false;
    let warningMessage: string | null = null;

    if (oldestTransactionDate) {
      const oldestDateObj = new Date(oldestTransactionDate);
      if (oldestDateObj > requestedStartDate) {
        isInsufficientHistory = true;
        effectiveStartDate = oldestDateObj;
        
        const diffMs = Math.max(0, completedMonthEnd.getTime() - oldestDateObj.getTime());
        const daysAvailable = diffMs / (1000 * 60 * 60 * 24);
        actualMonthsAvailable = Math.max(0.5, Math.round((daysAvailable / 30.4375) * 10) / 10);

        warningMessage = `You requested a ${lookbackMonths}-month lookback, but transaction history is available starting from ${oldestTransactionDate} (~${actualMonthsAvailable} months). Calculations have been normalized to your available history span.`;
      }
    } else {
      isInsufficientHistory = true;
      actualMonthsAvailable = 0;
      warningMessage = 'No historical transaction data found. Proposal generated with default values.';
    }

    // 3. Fetch all active categories for user
    const userCategories = await db
      .select({
        id: categories.id,
        name: categories.name,
        color: categories.color,
        isIncome: categories.isIncome,
        categoryType: categories.categoryType,
        excludeFromReports: categories.excludeFromReports,
        parentId: categories.parentId,
        isDiscretionary: categories.isDiscretionary,
      })
      .from(categories)
      .where(eq(categories.userId, dataUserId));

    const decryptedCategories = await Promise.all(
      userCategories.map(async (c) => ({
        ...c,
        name: c.name ? await decryptField(c.name, dek) : 'Uncategorized',
      }))
    );

    const validCategories = decryptedCategories.filter(
      (c) => !c.excludeFromReports && c.categoryType !== 'transfer'
    );
    const categoryMap = new Map(validCategories.map((c) => [c.id, c]));

    // 4. Fetch existing budgets for period / recurring
    const existingBudgets = await db
      .select({
        id: budgets.id,
        categoryId: budgets.categoryId,
        amount: budgets.amount,
        periodType: budgets.periodType,
        yearMonth: budgets.yearMonth,
      })
      .from(budgets)
      .where(eq(budgets.userId, dataUserId));

    const decryptedExistingBudgets = await Promise.all(
      existingBudgets.map(async (b) => ({
        ...b,
        amount: parseFloat(await decryptField(b.amount, dek)) || 0,
      }))
    );

    const existingBudgetMap = new Map<string, number>();
    for (const b of decryptedExistingBudgets) {
      if (b.periodType === periodType && (b.yearMonth === periodKey || !b.yearMonth)) {
        existingBudgetMap.set(b.categoryId, b.amount);
      }
    }

    // 5. Fetch transactions within lookback period
    const txConditions = [
      eq(transactions.userId, dataUserId),
      gte(transactions.date, requestedStartIso),
      lt(transactions.date, endIso),
      eq(transactions.deleted, false),
      eq(transactions.pending, false),
      eq(transactions.ignored, false),
    ];
    if (!isImportTransactionsEnabled) {
      txConditions.push(eq(transactions.isImported, false));
    }

    const txRows = await db
      .select({
        id: transactions.id,
        date: transactions.date,
        amount: transactions.amount,
        categoryId: transactions.categoryId,
        description: transactions.description,
        payee: transactions.payee,
        source: transactions.source,
        paystubId: transactions.paystubId,
        accountId: transactions.accountId,
      })
      .from(transactions)
      .where(and(...txConditions));

    // Decrypt amounts & group by category & month (YYYY-MM), plus sample transactions
    const categoryMonthlyTotals = new Map<string, Map<string, number[]>>();
    const categoryTxSamples = new Map<string, Array<{ id: string; date: string; description: string; amount: number; source: string }>>();

    for (const row of txRows) {
      if (!row.categoryId || !categoryMap.has(row.categoryId)) continue;
      
      // Virtual account filtering
      if (excludeVirtualAccounts) {
        if (
          row.source === 'paystub' ||
          row.paystubId ||
          (row.accountId && virtualAccountIds.has(row.accountId))
        ) {
          continue;
        }
      }

      const decryptedAmt = parseFloat(await decryptField(row.amount, dek));
      if (isNaN(decryptedAmt)) continue;

      const ym = row.date.substring(0, 7);
      const cat = categoryMap.get(row.categoryId)!;
      
      const isCompound = cat.categoryType === 'compound';
      if (cat.isIncome && !isCompound && !includeIncome) continue;

      const effectiveAmount = Math.abs(decryptedAmt);

      if (!categoryMonthlyTotals.has(row.categoryId)) {
        categoryMonthlyTotals.set(row.categoryId, new Map());
      }
      const monthMap = categoryMonthlyTotals.get(row.categoryId)!;
      if (!monthMap.has(ym)) {
        monthMap.set(ym, []);
      }
      monthMap.get(ym)!.push(effectiveAmount);

      // Collect sample transactions for inspection (up to 15)
      if (!categoryTxSamples.has(row.categoryId)) {
        categoryTxSamples.set(row.categoryId, []);
      }
      const samples = categoryTxSamples.get(row.categoryId)!;
      if (samples.length < 15) {
        const rawDesc = row.description || row.payee || 'Transaction';
        const decryptedDesc = await decryptField(rawDesc, dek).catch(() => rawDesc);
        samples.push({
          id: row.id,
          date: row.date,
          description: decryptedDesc,
          amount: Math.round(effectiveAmount * 100) / 100,
          source: row.source || 'bank',
        });
      }
    }

    // 6. Compute proposals per category
    const divisorMonths = Math.max(0.5, actualMonthsAvailable);
    const proposalItems: Array<{
      categoryId: string;
      categoryName: string;
      categoryColor: string;
      isIncome: boolean;
      isDiscretionary: boolean;
      historicalAverage: number;
      historicalMedian: number;
      historicalMax: number;
      proposedAmount: number;
      existingAmount: number | null;
      isSmallCategory: boolean;
      isSelected: boolean;
      sampleTransactions?: Array<{ id: string; date: string; description: string; amount: number; source: string }>;
      groupedCategories?: Array<{
        categoryId: string;
        categoryName: string;
        historicalAverage: number;
        proposedAmount: number;
      }>;
    }> = [];

    const smallCategoriesGroup: Array<{
      categoryId: string;
      categoryName: string;
      historicalAverage: number;
      proposedAmount: number;
    }> = [];

    let totalSmallGroupProposed = 0;
    let totalSmallGroupAvg = 0;
    let totalSmallGroupMedian = 0;
    let totalSmallGroupMax = 0;

    const scaledSmallThreshold = smallCategoryThreshold * periodScale;

    for (const cat of validCategories) {
      if (cat.isIncome && !includeIncome) continue;
      if (onlyUnbudgeted && existingBudgetMap.has(cat.id)) continue;

      const monthMap = categoryMonthlyTotals.get(cat.id);
      let monthlySumList: number[] = [];

      if (monthMap) {
        for (const [, txAmts] of monthMap.entries()) {
          monthlySumList.push(txAmts.reduce((s, a) => s + a, 0));
        }
      }

      // Zero-spending categories are NEVER included unless an existing budget was set
      if (monthlySumList.length === 0 && !existingBudgetMap.has(cat.id)) {
        continue;
      }

      // Outlier exclusion at monthly totals level
      if (excludeOutliers && monthlySumList.length >= 3) {
        const mean = monthlySumList.reduce((s, m) => s + m, 0) / monthlySumList.length;
        const variance = monthlySumList.reduce((s, m) => s + Math.pow(m - mean, 2), 0) / monthlySumList.length;
        const stdDev = Math.sqrt(variance);
        const filtered = monthlySumList.filter((m) => Math.abs(m - mean) <= 2.0 * stdDev);
        if (filtered.length > 0) {
          monthlySumList = filtered;
        }
      }

      const totalSpent = monthlySumList.reduce((s, a) => s + a, 0);
      const monthlyAverage = totalSpent / divisorMonths;

      const sortedMonthly = [...monthlySumList].sort((a, b) => a - b);
      let monthlyMedian = 0;
      if (sortedMonthly.length > 0) {
        const mid = Math.floor(sortedMonthly.length / 2);
        monthlyMedian = sortedMonthly.length % 2 !== 0
          ? sortedMonthly[mid]
          : (sortedMonthly[mid - 1] + sortedMonthly[mid]) / 2;
      }

      const monthlyMax = sortedMonthly.length > 0 ? Math.max(...sortedMonthly) : 0;

      // Scale base amounts for target periodType (1 for monthly, 3 for quarterly, 12 for yearly)
      const historicalAverage = Math.round(monthlyAverage * periodScale);
      const historicalMedian = Math.round(monthlyMedian * periodScale);
      const historicalMax = Math.round(monthlyMax * periodScale);

      // Select base figure based on calculationMethod
      let baseAmount = historicalAverage;
      if (calculationMethod === 'median') baseAmount = historicalMedian;
      else if (calculationMethod === 'max') baseAmount = historicalMax;

      // Apply buffer & round to nearest integer dollar
      let calculatedProposed = Math.round(baseAmount * (1 + bufferPercentage / 100));

      if (calculatedProposed === 0 && !existingBudgetMap.has(cat.id)) {
        continue;
      }

      const existingAmt = existingBudgetMap.get(cat.id) ?? null;
      // Group categories whose average spending is <= threshold
      const isSmall = !cat.isIncome && historicalAverage > 0 && historicalAverage <= scaledSmallThreshold;

      if (groupSmallCategories && isSmall) {
        smallCategoriesGroup.push({
          categoryId: cat.id,
          categoryName: cat.name,
          historicalAverage,
          proposedAmount: calculatedProposed,
        });
        totalSmallGroupProposed += calculatedProposed;
        totalSmallGroupAvg += historicalAverage;
        totalSmallGroupMedian += historicalMedian;
        totalSmallGroupMax += historicalMax;
      } else {
        proposalItems.push({
          categoryId: cat.id,
          categoryName: cat.name,
          categoryColor: cat.color || '#6366f1',
          isIncome: cat.isIncome,
          isDiscretionary: cat.isDiscretionary ?? true,
          historicalAverage,
          historicalMedian,
          historicalMax,
          proposedAmount: calculatedProposed,
          existingAmount: existingAmt,
          isSmallCategory: false,
          isSelected: true,
          sampleTransactions: categoryTxSamples.get(cat.id) || [],
        });
      }
    }

    // Add grouped "All Other (Small Categories)" item if any small categories exist
    if (groupSmallCategories && smallCategoriesGroup.length > 0) {
      const otherCategory = validCategories.find(
        (c) => c.name.toLowerCase().includes('other') || c.name.toLowerCase().includes('misc')
      );

      proposalItems.push({
        categoryId: otherCategory?.id || 'all-other-grouped',
        categoryName: 'All Other (Small Categories)',
        categoryColor: '#64748b',
        isIncome: false,
        isDiscretionary: true,
        historicalAverage: Math.round(totalSmallGroupAvg),
        historicalMedian: Math.round(totalSmallGroupMedian),
        historicalMax: Math.round(totalSmallGroupMax),
        proposedAmount: Math.round(totalSmallGroupProposed),
        existingAmount: otherCategory ? existingBudgetMap.get(otherCategory.id) ?? null : null,
        isSmallCategory: true,
        isSelected: true,
        groupedCategories: smallCategoriesGroup,
      });
    }

    // Sort proposal items by proposed amount descending
    proposalItems.sort((a, b) => b.proposedAmount - a.proposedAmount);

    return NextResponse.json({
      proposal: proposalItems,
      meta: {
        oldestTransactionDate,
        requestedLookbackMonths: lookbackMonths,
        actualMonthsAvailable,
        totalTransactionsAnalyzed: txRows.length,
        isInsufficientHistory,
        warningMessage,
        periodType,
        periodScale,
      },
    });
  } catch (error) {
    logger.error('Error generating auto budget proposal', { error });
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
