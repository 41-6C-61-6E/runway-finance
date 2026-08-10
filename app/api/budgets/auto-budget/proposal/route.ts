import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { budgets, categories, transactions, userSettings } from '@/lib/db/schema';
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
  const groupSmallCategories = body.groupSmallCategories !== false;
  const smallCategoryThreshold = Math.max(0, parseFloat(String(body.smallCategoryThreshold ?? 50)) || 50);
  const includeIncome = body.includeIncome === true;
  const onlyUnbudgeted = body.onlyUnbudgeted === true;
  const periodType = (body.periodType as string) || 'monthly';
  const periodKey = (body.periodKey as string) || null;

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

    // Calculate requested start date
    const requestedStartDate = new Date(now.getFullYear(), now.getMonth() - lookbackMonths, 1);
    const requestedStartIso = requestedStartDate.toISOString().split('T')[0];

    // Effective start date is bounded by requested start date
    let effectiveStartDate = requestedStartDate;
    let actualMonthsAvailable = lookbackMonths;
    let isInsufficientHistory = false;
    let warningMessage: string | null = null;

    if (oldestTransactionDate) {
      const oldestDateObj = new Date(oldestTransactionDate);
      if (oldestDateObj > requestedStartDate) {
        isInsufficientHistory = true;
        effectiveStartDate = oldestDateObj;
        
        // Calculate fractional/actual months available
        const diffMs = now.getTime() - oldestDateObj.getTime();
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
      lt(transactions.date, now.toISOString().split('T')[0]),
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
      })
      .from(transactions)
      .where(and(...txConditions));

    // Decrypt amounts & group by category & month (YYYY-MM)
    const categoryMonthlyTotals = new Map<string, Map<string, number[]>>();

    for (const row of txRows) {
      if (!row.categoryId || !categoryMap.has(row.categoryId)) continue;
      const decryptedAmt = parseFloat(await decryptField(row.amount, dek));
      if (isNaN(decryptedAmt)) continue;

      const ym = row.date.substring(0, 7);
      const cat = categoryMap.get(row.categoryId)!;
      
      // Compound categories treatment or standard
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

    for (const cat of validCategories) {
      if (cat.isIncome && !includeIncome) continue;
      if (onlyUnbudgeted && existingBudgetMap.has(cat.id)) continue;

      const monthMap = categoryMonthlyTotals.get(cat.id);
      const monthlySumList: number[] = [];

      if (monthMap) {
        for (const [, txAmts] of monthMap.entries()) {
          let monthTotal = txAmts.reduce((s, a) => s + a, 0);
          if (excludeOutliers && txAmts.length > 2) {
            const mean = monthTotal / txAmts.length;
            const variance = txAmts.reduce((s, a) => s + Math.pow(a - mean, 2), 0) / txAmts.length;
            const stdDev = Math.sqrt(variance);
            const filteredAmts = txAmts.filter((a) => Math.abs(a - mean) <= 2.5 * stdDev);
            monthTotal = filteredAmts.reduce((s, a) => s + a, 0);
          }
          monthlySumList.push(monthTotal);
        }
      }

      const totalSpent = monthlySumList.reduce((s, a) => s + a, 0);
      const historicalAverage = Math.round((totalSpent / divisorMonths) * 100) / 100;

      const sortedMonthly = [...monthlySumList].sort((a, b) => a - b);
      let historicalMedian = 0;
      if (sortedMonthly.length > 0) {
        const mid = Math.floor(sortedMonthly.length / 2);
        historicalMedian = sortedMonthly.length % 2 !== 0
          ? sortedMonthly[mid]
          : (sortedMonthly[mid - 1] + sortedMonthly[mid]) / 2;
      }
      historicalMedian = Math.round(historicalMedian * 100) / 100;

      const historicalMax = sortedMonthly.length > 0 ? Math.round(Math.max(...sortedMonthly) * 100) / 100 : 0;

      // Select base figure based on calculationMethod
      let baseAmount = historicalAverage;
      if (calculationMethod === 'median') baseAmount = historicalMedian;
      else if (calculationMethod === 'max') baseAmount = historicalMax;

      // Apply buffer
      let calculatedProposed = baseAmount * (1 + bufferPercentage / 100);
      calculatedProposed = Math.round(calculatedProposed * 100) / 100;

      // Filter out pure 0 spending categories unless they have existing budgets
      if (calculatedProposed === 0 && !existingBudgetMap.has(cat.id)) {
        continue;
      }

      const existingAmt = existingBudgetMap.get(cat.id) ?? null;
      const isSmall = !cat.isIncome && calculatedProposed > 0 && calculatedProposed <= smallCategoryThreshold;

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
        });
      }
    }

    // Add grouped "All Other (Small Categories)" item if any small categories exist
    if (groupSmallCategories && smallCategoriesGroup.length > 0) {
      // Find or pick a target catch-all category name/id if available
      const otherCategory = validCategories.find(
        (c) => c.name.toLowerCase().includes('other') || c.name.toLowerCase().includes('misc')
      );

      proposalItems.push({
        categoryId: otherCategory?.id || 'all-other-grouped',
        categoryName: 'All Other (Small Categories)',
        categoryColor: '#64748b',
        isIncome: false,
        isDiscretionary: true,
        historicalAverage: Math.round(totalSmallGroupAvg * 100) / 100,
        historicalMedian: Math.round(totalSmallGroupMedian * 100) / 100,
        historicalMax: Math.round(totalSmallGroupMax * 100) / 100,
        proposedAmount: Math.round(totalSmallGroupProposed * 100) / 100,
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
      },
    });
  } catch (error) {
    logger.error('Error generating auto budget proposal', { error });
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
