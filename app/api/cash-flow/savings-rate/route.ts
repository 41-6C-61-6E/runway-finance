import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { logger } from '@/lib/logger';
import { accounts, categories, userSettings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getSessionDEK } from '@/lib/crypto-context';
import { decryptRows } from '@/lib/crypto';
import { getUserTransactionsFromCache } from '@/lib/services/search-cache';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;
  const dataUserId = (session.user as any).dataUserId ?? session.user.id;
  const dek = await getSessionDEK();
  const { searchParams } = new URL(request.url);
  const months = parseInt(searchParams.get('months') || '12', 10);

  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);
  const startYearMonth = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`;

  const db = getDb();

  try {
    // 1. Fetch user accounts & decrypt
    const allAccounts = await db
      .select()
      .from(accounts)
      .where(eq(accounts.userId, dataUserId));
    const decryptedAccounts = await decryptRows('accounts', allAccounts, dek);
    const accountMap = new Map<string, typeof decryptedAccounts[0]>();
    for (const acc of decryptedAccounts) {
      accountMap.set(acc.id, acc);
    }

    // 2. Fetch categories & decrypt
    const allCategories = await db
      .select()
      .from(categories)
      .where(eq(categories.userId, dataUserId));
    const decryptedCategories = await decryptRows('categories', allCategories, dek);
    const categoryMap = new Map<string, typeof decryptedCategories[0]>();
    for (const cat of decryptedCategories) {
      categoryMap.set(cat.id, cat);
    }

    // 3. Fetch user settings
    const [settings] = await db
      .select({ paystubEnabled: userSettings.paystubEnabled })
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);
    const isPaystubEnabled = settings?.paystubEnabled ?? false;

    // Filter active (reportable or paystub) accounts
    const activeAccounts = decryptedAccounts.filter(
      (a: any) => (!a.isHidden && !a.isExcludedFromNetWorth) || a.type === 'paystub'
    );
    const activeAccountIds = new Set(activeAccounts.map(a => a.id));

    // Connected account existence flags for smart transfer handling
    const hasConnectedSavings = activeAccounts.some(a => a.type === 'savings');
    const hasConnectedInvestment = activeAccounts.some(a =>
      ['investment', 'brokerage', 'crypto', 'metals', '529', 'otherinvestment', 'otherInvestment'].includes(a.type)
    );
    const hasConnectedRetirement = activeAccounts.some(a =>
      ['retirement', 'rothira', 'traditionalira', '401k', '403b', 'sepira', 'simpleira'].includes(a.type)
    );
    const hasConnectedHsa = activeAccounts.some(a => ['hsa', 'health'].includes(a.type));

    // 4. Fetch decrypted transactions from cache
    const decryptedTxns = await getUserTransactionsFromCache(dataUserId, dek);

    // 5. Aggregate month-by-month
    const monthlyStats: Record<
      string,
      {
        income: number;
        expenses: number;
        retirement: number;
        paystubRetirement: number;
        hsa: number;
        paystubHsa: number;
        brokerage: number;
        savingsAccount: number;
      }
    > = {};

    for (const tx of decryptedTxns) {
      if (tx.ignored) continue;
      if (!activeAccountIds.has(tx.accountId)) continue;
      if (!isPaystubEnabled && tx.source === 'paystub') continue;

      const yearMonth = tx.date.substring(0, 7);
      if (yearMonth < startYearMonth) continue;

      const amount = parseFloat(tx.amount);
      if (isNaN(amount)) continue;

      if (!monthlyStats[yearMonth]) {
        monthlyStats[yearMonth] = {
          income: 0,
          expenses: 0,
          retirement: 0,
          paystubRetirement: 0,
          hsa: 0,
          paystubHsa: 0,
          brokerage: 0,
          savingsAccount: 0,
        };
      }
      const stats = monthlyStats[yearMonth];

      const category = tx.categoryId ? categoryMap.get(tx.categoryId) : undefined;

      // Skip report-excluded categories
      let excluded = category?.excludeFromReports ?? false;
      if (!excluded && category?.parentId) {
        const parent = categoryMap.get(category.parentId);
        if (parent?.excludeFromReports) excluded = true;
      }
      if (excluded) continue;

      // A. Standard Cash Flow Income / Expenses
      if (category?.categoryType !== 'transfer') {
        if (category?.categoryType === 'compound') {
          const absAmt = Math.abs(amount);
          stats.income += absAmt;
          stats.expenses += absAmt;
        } else if (amount > 0) {
          if (category && !category.isIncome) {
            stats.expenses -= amount;
          } else {
            stats.income += amount;
          }
        } else if (amount < 0) {
          const absAmt = Math.abs(amount);
          if (category && category.isIncome) {
            stats.income -= absAmt;
          } else {
            stats.expenses += absAmt;
          }
        }
      }

      // B. Savings Flow Analysis
      const acc = accountMap.get(tx.accountId);
      const accountType = acc?.type?.toLowerCase() || '';
      const categoryName = category?.name || '';
      const categoryParentId = category?.parentId;
      const parentCategory = categoryParentId ? categoryMap.get(categoryParentId) : undefined;
      const parentCategoryName = parentCategory?.name || '';

      const isRetirementCategory =
        categoryName.includes('Retirement') ||
        categoryName.includes('401k') ||
        categoryName.includes('IRA') ||
        categoryName.includes('Pension') ||
        parentCategoryName.includes('Retirement');

      const isHsaCategory =
        categoryName.includes('HSA') ||
        categoryName.includes('FSA') ||
        (parentCategoryName.includes('Health & Medical') && categoryName.includes('Contribution'));

      const isSavingsTransferCategory = categoryName === 'Transfer to Savings';

      const isInvestmentTransferCategory =
        categoryName === 'Transfer to Investment' ||
        categoryName.includes('Brokerage') ||
        categoryName.includes('Buy') ||
        (categoryName.includes('Contribution') && (accountType === 'investment' || accountType === 'brokerage'));

      // Case 1: Paystub Virtual Accounts (pre-tax paycheck deductions)
      if (tx.source === 'paystub' && amount < 0) {
        const absAmt = Math.abs(amount);
        if (isRetirementCategory) {
          stats.retirement += absAmt;
          stats.paystubRetirement += absAmt;
        } else if (isHsaCategory) {
          stats.hsa += absAmt;
          stats.paystubHsa += absAmt;
        }
      }
      // Case 2: Standard Bank/Asset Accounts
      else {
        // Retirement Accounts
        if (['retirement', 'rothira', 'traditionalira', '401k', '403b', 'sepira', 'simpleira'].includes(accountType)) {
          if (amount > 0) {
            stats.retirement += amount;
          } else {
            stats.retirement -= Math.abs(amount);
          }
        }
        // HSA Accounts
        else if (['hsa', 'health'].includes(accountType)) {
          if (amount > 0) {
            stats.hsa += amount;
          } else {
            stats.hsa -= Math.abs(amount);
          }
        }
        // Brokerage Accounts
        else if (['investment', 'brokerage', 'crypto', 'metals', '529', 'otherinvestment', 'otherInvestment'].includes(accountType)) {
          if (amount > 0) {
            stats.brokerage += amount;
          } else {
            stats.brokerage -= Math.abs(amount);
          }
        }
        // Savings Accounts
        else if (accountType === 'savings') {
          if (amount > 0) {
            stats.savingsAccount += amount;
          } else {
            stats.savingsAccount -= Math.abs(amount);
          }
        }
        // Depository (Checking/Cash) Outflows to Unconnected Destination Accounts
        else if (['checking', 'cash'].includes(accountType) && amount < 0) {
          const absAmt = Math.abs(amount);
          if (isRetirementCategory && !hasConnectedRetirementAccounts(decryptedAccounts)) {
            stats.retirement += absAmt;
          } else if (isHsaCategory && !hasConnectedHsaAccounts(decryptedAccounts)) {
            stats.hsa += absAmt;
          } else if (isSavingsTransferCategory && !hasConnectedSavingsAccounts(decryptedAccounts)) {
            stats.savingsAccount += absAmt;
          } else if (isInvestmentTransferCategory && !hasConnectedInvestmentAccounts(decryptedAccounts)) {
            stats.brokerage += absAmt;
          }
        }
      }
    }

    // Helper functions to check connected account types
    function hasConnectedSavingsAccounts(accountsList: any[]) {
      return accountsList.some(a => a.type === 'savings' && !a.isHidden && !a.isExcludedFromNetWorth);
    }
    function hasConnectedInvestmentAccounts(accountsList: any[]) {
      return accountsList.some(a =>
        ['investment', 'brokerage', 'crypto', 'metals', '529', 'otherinvestment', 'otherInvestment'].includes(a.type) &&
        !a.isHidden &&
        !a.isExcludedFromNetWorth
      );
    }
    function hasConnectedRetirementAccounts(accountsList: any[]) {
      return accountsList.some(a =>
        ['retirement', 'rothira', 'traditionalira', '401k', '403b', 'sepira', 'simpleira'].includes(a.type) &&
        !a.isHidden &&
        !a.isExcludedFromNetWorth
      );
    }
    function hasConnectedHsaAccounts(accountsList: any[]) {
      return accountsList.some(a =>
        ['hsa', 'health'].includes(a.type) &&
        !a.isHidden &&
        !a.isExcludedFromNetWorth
      );
    }

    // Convert aggregated map to a sorted list and finalize leftover cash / savings rate
    const result = Object.entries(monthlyStats)
      .map(([yearMonth, stats]) => {
        // Leftover cash is standard cash flow surplus (income - expenses)
        // minus all savings components that did not go into expenses (i.e. bank transfers).
        // Since paystub retirement & HSA deductions are already in stats.expenses, they are NOT subtracted from leftover cash.
        const nonPaystubRetirement = Math.max(0, stats.retirement - stats.paystubRetirement);
        const nonPaystubHsa = Math.max(0, stats.hsa - stats.paystubHsa);

        const leftoverCash = (stats.income - stats.expenses) - stats.brokerage - stats.savingsAccount - nonPaystubRetirement - nonPaystubHsa;

        const totalSavings = stats.retirement + stats.hsa + stats.brokerage + stats.savingsAccount + leftoverCash;
        const savingsRate = stats.income > 0 ? totalSavings / stats.income : 0;

        return {
          yearMonth,
          income: Math.round(stats.income * 100) / 100,
          expenses: Math.round(stats.expenses * 100) / 100,
          netCashFlow: Math.round((stats.income - stats.expenses) * 100) / 100,
          savingsRate: Math.round(savingsRate * 10000) / 10000, // 4 decimal precision
          savings: {
            retirement: Math.round(stats.retirement * 100) / 100,
            hsa: Math.round(stats.hsa * 100) / 100,
            brokerage: Math.round(stats.brokerage * 100) / 100,
            savingsAccount: Math.round(stats.savingsAccount * 100) / 100,
            cash: Math.round(leftoverCash * 100) / 100,
          },
        };
      })
      .sort((a, b) => a.yearMonth.localeCompare(b.yearMonth));

    logger.info('GET /api/cash-flow/savings-rate', { months, count: result.length });
    return NextResponse.json(result);
  } catch (error) {
    logger.error('Error calculating savings rate', { error });
    return NextResponse.json(
      { error: 'internal_error', message: 'Failed to calculate savings rate data' },
      { status: 500 }
    );
  }
}
