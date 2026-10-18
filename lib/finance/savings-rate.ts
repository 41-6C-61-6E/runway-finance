import { getDb } from '@/lib/db';
import { accounts, categories } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { decryptRows } from '@/lib/crypto';
import { getUserTransactionsFromCache } from '@/lib/services/search-cache';
import { toCashFlowAmount, isCashFlowRelevantAccount, isReportableAccount } from '@/lib/utils/account-scope';
import type { FinanceContext } from './context';

export interface SavingsRateOptions {
  months?: number;
  excludedAccounts?: Set<string>;
  excludedCategories?: Set<string>;
  savingsComponents?: Set<string>;
  includePaystubRetirement?: boolean;
  includePaystubHsa?: boolean;
  adjustIncomeDenominator?: boolean;
}

export interface SavingsRateMonthPoint {
  yearMonth: string;
  income: number;
  expenses: number;
  netCashFlow: number;
  savingsRate: number;
  savings: {
    retirement: number;
    hsa: number;
    brokerage: number;
    savingsAccount: number;
    cash: number;
  };
  details: {
    retirement: Array<{ description: string; date: string; amount: number; accountName: string }>;
    hsa: Array<{ description: string; date: string; amount: number; accountName: string }>;
    brokerage: Array<{ description: string; date: string; amount: number; accountName: string }>;
    savingsAccount: Array<{ description: string; date: string; amount: number; accountName: string }>;
    income: Array<{ description: string; date: string; amount: number; accountName: string }>;
    expenses: Array<{ description: string; date: string; amount: number; accountName: string }>;
  };
}

export async function getSavingsRate(
  ctx: FinanceContext,
  options?: SavingsRateOptions
): Promise<SavingsRateMonthPoint[]> {
  const months = options?.months ?? 12;
  const excludedAccounts = options?.excludedAccounts ?? new Set<string>();
  const excludedCategories = options?.excludedCategories ?? new Set<string>();
  const savingsComponents =
    options?.savingsComponents ??
    new Set(['retirement', 'hsa', 'brokerage', 'savingsAccount', 'cash']);
  const includePaystubRetirement = options?.includePaystubRetirement !== false;
  const includePaystubHsa = options?.includePaystubHsa !== false;
  const adjustIncomeDenominator = options?.adjustIncomeDenominator === true;

  const now = ctx.now;
  const startDate = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);
  const startYearMonth = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`;

  const db = getDb();

  // 1. Fetch user accounts & decrypt
  const allAccounts = await db
    .select()
    .from(accounts)
    .where(eq(accounts.userId, ctx.dataUserId));
  const decryptedAccounts = await decryptRows('accounts', allAccounts, ctx.dek);
  const accountMap = new Map<string, typeof decryptedAccounts[0]>();
  for (const acc of decryptedAccounts) {
    accountMap.set(acc.id, acc);
  }

  // 2. Fetch categories & decrypt
  const allCategories = await db
    .select()
    .from(categories)
    .where(eq(categories.userId, ctx.dataUserId));
  const decryptedCategories = await decryptRows('categories', allCategories, ctx.dek);
  const categoryMap = new Map<string, typeof decryptedCategories[0]>();
  for (const cat of decryptedCategories) {
    categoryMap.set(cat.id, cat);
  }

  // 3. User settings
  const isPaystubEnabled = ctx.settings?.paystubEnabled ?? false;

  // Filter active accounts
  const activeAccounts = decryptedAccounts.filter(
    (a: any) => isCashFlowRelevantAccount(a) && !excludedAccounts.has(a.id)
  );
  const activeAccountIds = new Set(activeAccounts.map((a) => a.id));

  // 4. Fetch decrypted transactions from cache
  const decryptedTxns = await getUserTransactionsFromCache(ctx.dataUserId, ctx.dek);

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
      hasPaystubEarnings: boolean;
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

    const cfAmount = toCashFlowAmount(amount, accountMap.get(tx.accountId)?.type);

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
        hasPaystubEarnings: false,
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

    let excluded = (category?.excludeFromReports ?? false) || (category && excludedCategories.has(category.id)) || false;
    if (category?.parentId && excludedCategories.has(category.parentId)) {
      excluded = true;
    }
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
      } else if (cfAmount > 0) {
        if (tx.source === 'paystub') {
          stats.hasPaystubEarnings = true;
        }
        if (category && !category.isIncome) {
          stats.expenses -= cfAmount;
          addDetail(stats, 'expenses', tx.description, tx.date, -cfAmount, acc?.name || 'Account');
        } else {
          stats.income += cfAmount;
          addDetail(stats, 'income', tx.description, tx.date, cfAmount, acc?.name || 'Account');
        }
      } else if (cfAmount < 0) {
        const absAmt = Math.abs(cfAmount);
        if (category && category.isIncome) {
          stats.income -= absAmt;
          addDetail(stats, 'income', tx.description, tx.date, -absAmt, acc?.name || 'Account');
        } else {
          stats.expenses += absAmt;
          addDetail(stats, 'expenses', tx.description, tx.date, absAmt, acc?.name || 'Account');
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

    // Case 1: Paystub Virtual Accounts
    if (tx.source === 'paystub' && amount < 0) {
      const absAmt = Math.abs(amount);
      if (isRetirementCategory) {
        if (includePaystubRetirement) {
          stats.retirement += absAmt;
          stats.paystubRetirement += absAmt;
          addDetail(stats, 'retirement', categoryName || tx.description || 'Pre-tax Retirement Deduction', tx.date, absAmt, acc?.name || 'Paycheck');
        }
      } else if (isHsaCategory) {
        if (includePaystubHsa) {
          stats.hsa += absAmt;
          stats.paystubHsa += absAmt;
          addDetail(stats, 'hsa', categoryName || tx.description || 'Pre-tax HSA Deduction', tx.date, absAmt, acc?.name || 'Paycheck');
        }
      }
    }
    // Case 2: Standard Bank/Asset Accounts
    else {
      if (['retirement', 'rothira', 'traditionalira', '401k', '403b', 'sepira', 'simpleira'].includes(accountType)) {
        if (amount > 0) {
          stats.retirement += amount;
          addDetail(stats, 'retirement', tx.description, tx.date, amount, acc?.name || 'Retirement');
        } else {
          stats.retirement -= Math.abs(amount);
          addDetail(stats, 'retirement', tx.description, tx.date, amount, acc?.name || 'Retirement');
        }
      } else if (['hsa', 'health'].includes(accountType)) {
        if (amount > 0) {
          stats.hsa += amount;
          addDetail(stats, 'hsa', tx.description, tx.date, amount, acc?.name || 'HSA');
        } else {
          stats.hsa -= Math.abs(amount);
          addDetail(stats, 'hsa', tx.description, tx.date, amount, acc?.name || 'HSA');
        }
      } else if (['investment', 'brokerage', 'crypto', 'metals', '529', 'otherinvestment', 'otherInvestment'].includes(accountType)) {
        if (amount > 0) {
          stats.brokerage += amount;
          addDetail(stats, 'brokerage', tx.description, tx.date, amount, acc?.name || 'Brokerage');
        } else {
          stats.brokerage -= Math.abs(amount);
          addDetail(stats, 'brokerage', tx.description, tx.date, amount, acc?.name || 'Brokerage');
        }
      } else if (accountType === 'savings') {
        if (amount > 0) {
          stats.savingsAccount += amount;
          addDetail(stats, 'savingsAccount', tx.description, tx.date, amount, acc?.name || 'Savings');
        } else {
          stats.savingsAccount -= Math.abs(amount);
          addDetail(stats, 'savingsAccount', tx.description, tx.date, amount, acc?.name || 'Savings');
        }
      } else if (['checking', 'cash'].includes(accountType) && amount < 0) {
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

  function hasConnectedSavingsAccountsWithTx(accountsList: any[]) {
    return accountsList.some(a => a.type === 'savings' && isReportableAccount(a) && accountsWithTransactions.has(a.id));
  }
  function hasConnectedInvestmentAccountsWithTx(accountsList: any[]) {
    return accountsList.some(a =>
      ['investment', 'brokerage', 'crypto', 'metals', '529', 'otherinvestment', 'otherInvestment'].includes(a.type) &&
      isReportableAccount(a) &&
      accountsWithTransactions.has(a.id)
    );
  }
  function hasConnectedRetirementAccountsWithTx(accountsList: any[]) {
    return accountsList.some(a =>
      ['retirement', 'rothira', 'traditionalira', '401k', '403b', 'sepira', 'simpleira'].includes(a.type) &&
      isReportableAccount(a) &&
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

  return Object.entries(monthlyStats)
    .map(([yearMonth, stats]) => {
      const totalSavings = (stats.income - stats.expenses) + stats.paystubRetirement + stats.paystubHsa;
      const leftoverCash = totalSavings - stats.retirement - stats.hsa - stats.brokerage - stats.savingsAccount;

      const retirementVal = savingsComponents.has('retirement') ? stats.retirement : 0;
      const hsaVal = savingsComponents.has('hsa') ? stats.hsa : 0;
      const brokerageVal = savingsComponents.has('brokerage') ? stats.brokerage : 0;
      const savingsAccountVal = savingsComponents.has('savingsAccount') ? stats.savingsAccount : 0;
      const cashVal = savingsComponents.has('cash') ? leftoverCash : 0;

      const selectedSavings = retirementVal + hsaVal + brokerageVal + savingsAccountVal + cashVal;

      let denominator = stats.income;
      if (adjustIncomeDenominator && !stats.hasPaystubEarnings) {
        if (includePaystubRetirement) denominator += stats.paystubRetirement;
        if (includePaystubHsa) denominator += stats.paystubHsa;
      }

      const savingsRate = denominator > 0 ? selectedSavings / denominator : 0;

      return {
        yearMonth,
        income: Math.round(stats.income * 100) / 100,
        expenses: Math.round(stats.expenses * 100) / 100,
        netCashFlow: Math.round((stats.income - stats.expenses) * 100) / 100,
        savingsRate: Math.round(savingsRate * 10000) / 10000,
        savings: {
          retirement: Math.round(retirementVal * 100) / 100,
          hsa: Math.round(hsaVal * 100) / 100,
          brokerage: Math.round(brokerageVal * 100) / 100,
          savingsAccount: Math.round(savingsAccountVal * 100) / 100,
          cash: Math.round(cashVal * 100) / 100,
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
}
