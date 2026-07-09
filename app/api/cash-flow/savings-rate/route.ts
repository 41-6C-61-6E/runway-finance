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

    // Precompute which accounts have transactions in our dataset to handle manual/un-synced accounts cleanly
    const accountsWithTransactions = new Set<string>();
    for (const tx of decryptedTxns) {
      if (!tx.ignored) {
        accountsWithTransactions.add(tx.accountId);
      }
    }

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
        details: {
          retirement: Array<{ description: string; date: string; amount: number; accountName: string }>;
          hsa: Array<{ description: string; date: string; amount: number; accountName: string }>;
          brokerage: Array<{ description: string; date: string; amount: number; accountName: string }>;
          savingsAccount: Array<{ description: string; date: string; amount: number; accountName: string }>;
          income: Array<{ description: string; date: string; amount: number; accountName: string }>;
          expenses: Array<{ description: string; date: string; amount: number; accountName: string }>;
        };
      }
    > = {};

    const addDetail = (
      stats: typeof monthlyStats[string],
      bucket: 'retirement' | 'hsa' | 'brokerage' | 'savingsAccount' | 'income' | 'expenses',
      description: string,
      date: string,
      amount: number,
      accountName: string
    ) => {
      stats.details[bucket].push({
        description: description || 'Transfer',
        date,
        amount: Math.round(amount * 100) / 100,
        accountName: accountName || 'Unknown Account',
      });
    };

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
          details: {
            retirement: [],
            hsa: [],
            brokerage: [],
            savingsAccount: [],
            income: [],
            expenses: [],
          },
        };
      }
      const stats = monthlyStats[yearMonth];

      const category = tx.categoryId ? categoryMap.get(tx.categoryId) : undefined;

      // Skip report-excluded categories only for standard income/expenses cash flows
      let excluded = category?.excludeFromReports ?? false;
      if (!excluded && category?.parentId) {
        const parent = categoryMap.get(category.parentId);
        if (parent?.excludeFromReports) excluded = true;
      }

      // A. Standard Cash Flow Income / Expenses
      if (!excluded && category?.categoryType !== 'transfer') {
        const acc = accountMap.get(tx.accountId);
        if (category?.categoryType === 'compound') {
          const absAmt = Math.abs(amount);
          stats.income += absAmt;
          stats.expenses += absAmt;
          addDetail(stats, 'income', tx.description, tx.date, absAmt, acc?.name || 'Account');
          addDetail(stats, 'expenses', tx.description, tx.date, absAmt, acc?.name || 'Account');
        } else if (amount > 0) {
          if (category && !category.isIncome) {
            stats.expenses -= amount;
            addDetail(stats, 'expenses', tx.description, tx.date, -amount, acc?.name || 'Account');
          } else {
            stats.income += amount;
            addDetail(stats, 'income', tx.description, tx.date, amount, acc?.name || 'Account');
          }
        } else if (amount < 0) {
          const absAmt = Math.abs(amount);
          if (category && category.isIncome) {
            stats.income -= absAmt;
            addDetail(stats, 'income', tx.description, tx.date, -absAmt, acc?.name || 'Account');
          } else {
            stats.expenses += absAmt;
            addDetail(stats, 'expenses', tx.description, tx.date, absAmt, acc?.name || 'Account');
          }
        }
      }

      // B. Savings Flow Analysis (Runs even if category is excluded-from-reports)
      const acc = accountMap.get(tx.accountId);
      const accountType = acc?.type?.toLowerCase() || '';
      const categoryName = category?.name || '';
      const categoryParentId = category?.parentId;
      const parentCategory = categoryParentId ? categoryMap.get(categoryParentId) : undefined;
      const parentCategoryName = parentCategory?.name || '';

      const isRetirementCategory =
        categoryName.toLowerCase().includes('retirement') ||
        categoryName.toLowerCase().includes('401k') ||
        categoryName.toLowerCase().includes('ira') ||
        categoryName.toLowerCase().includes('pension') ||
        parentCategoryName.toLowerCase().includes('retirement');

      const isHsaCategory =
        categoryName.toLowerCase().includes('hsa') ||
        categoryName.toLowerCase().includes('fsa') ||
        (parentCategoryName.toLowerCase().includes('health & medical') && categoryName.toLowerCase().includes('contribution'));

      const isSavingsTransferCategory =
        categoryName.toLowerCase().includes('savings') &&
        category?.categoryType === 'transfer';

      const isInvestmentTransferCategory =
        categoryName.toLowerCase().includes('investment') ||
        categoryName.toLowerCase().includes('brokerage') ||
        categoryName.toLowerCase().includes('investing') ||
        categoryName.toLowerCase().includes('stock') ||
        (category?.categoryType === 'transfer' && (
          categoryName.toLowerCase().includes('vanguard') ||
          categoryName.toLowerCase().includes('fidelity') ||
          categoryName.toLowerCase().includes('schwab')
        ));

      // Case 1: Paystub Virtual Accounts (pre-tax paycheck deductions)
      if (tx.source === 'paystub' && amount < 0) {
        const absAmt = Math.abs(amount);
        if (isRetirementCategory) {
          stats.retirement += absAmt;
          stats.paystubRetirement += absAmt;
          addDetail(stats, 'retirement', categoryName || tx.description || 'Pre-tax Retirement Deduction', tx.date, absAmt, acc?.name || 'Paycheck');
        } else if (isHsaCategory) {
          stats.hsa += absAmt;
          stats.paystubHsa += absAmt;
          addDetail(stats, 'hsa', categoryName || tx.description || 'Pre-tax HSA Deduction', tx.date, absAmt, acc?.name || 'Paycheck');
        }
      }
      // Case 2: Standard Bank/Asset Accounts
      else {
        // Retirement Accounts
        if (['retirement', 'rothira', 'traditionalira', '401k', '403b', 'sepira', 'simpleira'].includes(accountType)) {
          if (amount > 0) {
            stats.retirement += amount;
            addDetail(stats, 'retirement', tx.description, tx.date, amount, acc?.name || 'Retirement');
          } else {
            stats.retirement -= Math.abs(amount);
            addDetail(stats, 'retirement', tx.description, tx.date, amount, acc?.name || 'Retirement');
          }
        }
        // HSA Accounts
        else if (['hsa', 'health'].includes(accountType)) {
          if (amount > 0) {
            stats.hsa += amount;
            addDetail(stats, 'hsa', tx.description, tx.date, amount, acc?.name || 'HSA');
          } else {
            stats.hsa -= Math.abs(amount);
            addDetail(stats, 'hsa', tx.description, tx.date, amount, acc?.name || 'HSA');
          }
        }
        // Brokerage Accounts
        else if (['investment', 'brokerage', 'crypto', 'metals', '529', 'otherinvestment', 'otherInvestment'].includes(accountType)) {
          if (amount > 0) {
            stats.brokerage += amount;
            addDetail(stats, 'brokerage', tx.description, tx.date, amount, acc?.name || 'Brokerage');
          } else {
            stats.brokerage -= Math.abs(amount);
            addDetail(stats, 'brokerage', tx.description, tx.date, amount, acc?.name || 'Brokerage');
          }
        }
        // Savings Accounts
        else if (accountType === 'savings') {
          if (amount > 0) {
            stats.savingsAccount += amount;
            addDetail(stats, 'savingsAccount', tx.description, tx.date, amount, acc?.name || 'Savings');
          } else {
            stats.savingsAccount -= Math.abs(amount);
            addDetail(stats, 'savingsAccount', tx.description, tx.date, amount, acc?.name || 'Savings');
          }
        }
        // Depository (Checking/Cash) Outflows to Unconnected or Un-synced/Manual Destination Accounts
        else if (['checking', 'cash'].includes(accountType) && amount < 0) {
          const absAmt = Math.abs(amount);
          if (isRetirementCategory && !hasConnectedRetirementAccountsWithTx(decryptedAccounts)) {
            stats.retirement += absAmt;
            addDetail(stats, 'retirement', tx.description, tx.date, absAmt, acc?.name || 'Checking');
          } else if (isHsaCategory && !hasConnectedHsaAccountsWithTx(decryptedAccounts)) {
            stats.hsa += absAmt;
            addDetail(stats, 'hsa', tx.description, tx.date, absAmt, acc?.name || 'Checking');
          } else if (isSavingsTransferCategory && !hasConnectedSavingsAccountsWithTx(decryptedAccounts)) {
            stats.savingsAccount += absAmt;
            addDetail(stats, 'savingsAccount', tx.description, tx.date, absAmt, acc?.name || 'Checking');
          } else if (isInvestmentTransferCategory && !hasConnectedInvestmentAccountsWithTx(decryptedAccounts)) {
            stats.brokerage += absAmt;
            addDetail(stats, 'brokerage', tx.description, tx.date, absAmt, acc?.name || 'Checking');
          }
        }
      }
    }

    // Helper functions to check connected account types (requiring at least one synced transaction)
    function hasConnectedSavingsAccountsWithTx(accountsList: any[]) {
      return accountsList.some(a => a.type === 'savings' && !a.isHidden && !a.isExcludedFromNetWorth && accountsWithTransactions.has(a.id));
    }
    function hasConnectedInvestmentAccountsWithTx(accountsList: any[]) {
      return accountsList.some(a =>
        ['investment', 'brokerage', 'crypto', 'metals', '529', 'otherinvestment', 'otherInvestment'].includes(a.type) &&
        !a.isHidden &&
        !a.isExcludedFromNetWorth &&
        accountsWithTransactions.has(a.id)
      );
    }
    function hasConnectedRetirementAccountsWithTx(accountsList: any[]) {
      return accountsList.some(a =>
        ['retirement', 'rothira', 'traditionalira', '401k', '403b', 'sepira', 'simpleira'].includes(a.type) &&
        !a.isHidden &&
        !a.isExcludedFromNetWorth &&
        accountsWithTransactions.has(a.id)
      );
    }
    function hasConnectedHsaAccountsWithTx(accountsList: any[]) {
      return accountsList.some(a =>
        ['hsa', 'health'].includes(a.type) &&
        !a.isHidden &&
        !a.isExcludedFromNetWorth &&
        accountsWithTransactions.has(a.id)
      );
    }

    // Convert aggregated map to a sorted list and finalize leftover cash / savings rate
    const result = Object.entries(monthlyStats)
      .map(([yearMonth, stats]) => {
        // Total savings is standard net cash flow (surplus) + pre-tax paycheck savings
        const totalSavings = (stats.income - stats.expenses) + stats.paystubRetirement + stats.paystubHsa;

        // Leftover cash is total savings minus all specific tracked savings categories
        const leftoverCash = totalSavings - stats.retirement - stats.hsa - stats.brokerage - stats.savingsAccount;

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
          details: {
            retirement: stats.details.retirement,
            hsa: stats.details.hsa,
            brokerage: stats.details.brokerage,
            savingsAccount: stats.details.savingsAccount,
            income: stats.details.income,
            expenses: stats.details.expenses,
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
