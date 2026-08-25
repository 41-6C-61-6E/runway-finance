export const ASSET_ACCOUNT_TYPES = [
  'checking',
  'savings',
  'investment',
  'other',
  'brokerage',
  'retirement',
  'realestate',
  'vehicle',
  'crypto',
  'metals',
  'otherAsset',
  'otherasset',
  'primaryhome',
  'secondaryhome',
  'rentalproperty',
  'commercial',
  'land',
  'otherrealestate',
  'single-family',
  'condo',
  'townhouse',
  'multi-family',
  'otherinvestment',
  'otherInvestment',
  'rothira',
  'traditionalira',
  '401k',
  '403b',
  'sepira',
  'simpleira',
  '529',
  'hsa',
  'hsachecking',
  'health',
];

import { REAL_ESTATE_SUBTYPES } from '@/lib/constants/account-types';
import { convertCurrency } from '@/lib/constants/currency-rates';
import { roundToCents } from '@/lib/utils/format';

export const REAL_ESTATE_TYPES = REAL_ESTATE_SUBTYPES;

export const SYNCABLE_TYPES = [
  'realestate', 'primaryhome', 'secondaryhome', 'rentalproperty', 'commercial', 'land', 'otherrealestate', 'crypto', 'metals'
] as const;

export const ASSET_CATEGORY_MAP: Record<string, string> = {
  checking: 'Cash & Checking',
  savings: 'Savings',
  hsachecking: 'HSA (Checking)',
  investment: 'Taxable Brokerage',
  brokerage: 'Taxable Brokerage',
  otherinvestment: 'Other Investments',
  retirement: 'Retirement',
  rothira: 'Retirement',
  traditionalira: 'Retirement',
  '401k': 'Retirement',
  '403b': 'Retirement',
  sepira: 'Retirement',
  simpleira: 'Retirement',
  hsa: 'HSA (Investment)',
  health: 'HSA (Investment)',
  realestate: 'Real Estate',
  primaryhome: 'Real Estate',
  secondaryhome: 'Real Estate',
  rentalproperty: 'Real Estate',
  commercial: 'Real Estate',
  land: 'Real Estate',
  otherrealestate: 'Real Estate',
  vehicle: 'Vehicle',
  crypto: 'Other Investments',
  metals: 'Other Investments',
  '529': 'Other Investments',
  otherAsset: 'Other Investments',
  other: 'Other Investments',
};

export const LIABILITY_CATEGORY_MAP: Record<string, string> = {
  credit: 'Credit Cards',
  loan: 'Loans',
  mortgage: 'Mortgages',
  studentloan: 'Student Loans',
  autoloan: 'Auto Loans',
  otherloan: 'Other Loans',
  personal_loan: 'Loans',
  heloc: 'Loans',
  otherLiability: 'Other Debt',
  otherliability: 'Other Debt',
};

export const isInvestmentAccount = (type: string) => ['investment', 'brokerage', 'retirement', 'otherinvestment', 'otherInvestment',
  'rothira', 'traditionalira', '401k', '403b', 'sepira', 'simpleira', '529',
  'hsa', 'health',
].includes(type.toLowerCase());

export const LIABILITY_ACCOUNT_TYPES = [
  'credit',
  'loan',
  'mortgage',
  'otherLiability',
  'otherliability',
  'studentloan',
  'autoloan',
  'otherloan',
  'personal_loan',
  'heloc',
];

export function isAssetAccount(type: string): boolean {
  return ASSET_ACCOUNT_TYPES.includes(type) || ASSET_ACCOUNT_TYPES.includes(type.toLowerCase());
}

export function isLiabilityAccount(type: string): boolean {
  return LIABILITY_ACCOUNT_TYPES.includes(type) || LIABILITY_ACCOUNT_TYPES.includes(type.toLowerCase());
}

/**
 * Normalize a stored transaction amount to the standard "cash-flow" sign
 * convention used across the application:
 *
 *   positive ⇒ money in  (deposit, income, refund/credit)
 *   negative ⇒ money out (charge, purchase, expense)
 *
 * In Runway Finance, all transaction ingestion services (Plaid, SimpleFIN, CSV)
 * store transactions with this consistent orientation across both asset and
 * liability accounts.
 */
export function toCashFlowAmount(amount: number, _accountType?: string | null): number {
  if (amount === 0) return 0;
  return amount;
}

export function isReportableAccount(account: {
  type: string;
  isHidden?: boolean | null;
  isExcludedFromNetWorth?: boolean | null;
}): boolean {
  return !account.isHidden && !account.isExcludedFromNetWorth;
}

export function filterReportableAccounts<T extends {
  type: string;
  isHidden?: boolean | null;
  isExcludedFromNetWorth?: boolean | null;
}>(accounts: T[]): T[] {
  return accounts.filter(isReportableAccount);
}

export function isAccountActiveOnDate(
  account: { type: string; metadata?: string | any | null },
  dateStr: string
): boolean {
  const accountType = account.type.toLowerCase();
  let endEventDateStr: string | undefined = undefined;
  if (accountType === 'mortgage' && account.metadata) {
    try {
      const meta = typeof account.metadata === 'string' ? JSON.parse(account.metadata) : account.metadata;
      if (meta) {
        const status = meta.mortgageStatus as string | undefined;
        endEventDateStr = status === 'paid_off' 
          ? (meta.payoffDate as string | undefined) 
          : (status === 'refinanced' ? (meta.refinanceDate as string | undefined) : undefined);
      }
    } catch (err) {
      // Ignore parse errors
    }
  }

  if (endEventDateStr && dateStr > endEventDateStr) {
    return false;
  }
  return true;
}

export function isFireEligibleAccount(acc: any): boolean {
  if (!acc) return false;
  const rawType = (acc.type || '').toLowerCase();
  const rawSubtype = (acc.subtype || '').toLowerCase();
  const rawCategory = (acc.category || '').toLowerCase();
  const rawName = (acc.name || '').toLowerCase();

  // Excluded from FIRE engine: checking accounts, credit cards / credit accounts, real estate / properties, mortgages, and loans/liabilities
  const excludedKeywords = [
    'checking',
    'credit',
    'real_estate',
    'realestate',
    'primaryhome',
    'secondaryhome',
    'rentalproperty',
    'commercial',
    'land',
    'property',
    'mortgage',
    'loan',
    'car_loan',
    'auto_loan',
    'student_loan',
    'personal_loan',
    'liability',
    'hsachecking',
    'vehicle',
    'valuable',
  ];

  if (
    excludedKeywords.some(
      (kw) =>
        rawType.includes(kw) ||
        rawSubtype.includes(kw) ||
        rawCategory.includes(kw) ||
        rawName.includes(kw)
    )
  ) {
    return false;
  }

  // Valid investable asset/savings holdings for FIRE retirement engine
  const validKeywords = [
    'cash',
    'savings',
    'cd',
    'money_market',
    'taxable',
    'brokerage',
    'investment',
    '401k',
    '403b',
    'ira',
    'roth',
    'traditional',
    'sep',
    'simple',
    'retirement',
    'hsa',
    'crypto',
    '529',
    'pension',
    'stock_option',
    'asset',
  ];

  return validKeywords.some(
    (kw) =>
      rawType.includes(kw) ||
      rawSubtype.includes(kw) ||
      rawCategory.includes(kw)
  );
}

export interface NetWorthAccountInput {
  type: string;
  balance?: string | number;
  isHidden?: boolean | null;
  isExcludedFromNetWorth?: boolean | null;
  currency?: string | null;
  metadata?: string | any | null;
}

function getAccountBalance(acc: NetWorthAccountInput): number {
  const raw = acc.balance;
  if (raw == null || raw === '') return 0;
  const num = typeof raw === 'string' ? parseFloat(raw) : raw;
  return Number.isFinite(num) ? num : 0;
}

export interface NetWorthTotals {
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
}

/**
 * Single source of truth for "current net worth" from a set of accounts.
 *
 * Rules (mirrored by the net worth snapshot pipeline):
 * - hidden (`isHidden`) and net-worth-excluded (`isExcludedFromNetWorth`)
 *   accounts are NOT included
 * - accounts inactive for the given date (e.g. paid-off/refinanced
 *   mortgages) are NOT included
 * - balances are converted from the account currency to `baseCurrency`
 * - liability balances are always counted as absolute value
 *
 * Used by the live net worth calculation, the dashboard Overview, and the
 * debt breakdown so every surface reports the same figures.
 */
export function computeNetWorthTotals(
  accounts: NetWorthAccountInput[],
  baseCurrency: string = 'USD',
  dateStr: string = new Date().toISOString().split('T')[0]
): NetWorthTotals {
  let totalAssets = 0;
  let totalLiabilities = 0;

  for (const acc of accounts) {
    if (!isReportableAccount(acc)) continue;
    if (!isAccountActiveOnDate(acc, dateStr)) continue;

    const balance = getAccountBalance(acc);
    if (balance === 0) continue;

    const convertedBal = convertCurrency(balance, acc.currency || 'USD', baseCurrency);
    const accountType = acc.type.toLowerCase();

    if (isAssetAccount(accountType)) {
      totalAssets += convertedBal;
    } else if (isLiabilityAccount(accountType)) {
      totalLiabilities += Math.abs(convertedBal);
    }
  }

  totalAssets = roundToCents(totalAssets);
  totalLiabilities = roundToCents(totalLiabilities);

  return {
    totalAssets,
    totalLiabilities,
    netWorth: roundToCents(totalAssets - totalLiabilities),
  };
}

/**
 * Net-worth contribution of a single account balance, with the canonical
 * sign convention: assets count positive, liabilities always count as their
 * absolute value (entering net worth negative).
 *
 * Single source of truth for the asset/liability sign rule — used by the
 * wealth flow and anywhere the "signed" view of a balance is needed.
 */
export function getSignedNetWorthBalance(balance: number, accountType: string): number {
  return isLiabilityAccount(accountType) ? -Math.abs(balance) : balance;
}

/**
 * Per-account-type breakdown over the canonical net-worth scope
 * (reportable + active-on-date), currency-converted to `baseCurrency`,
 * values rounded to cents.
 *
 * Used by every net-worth snapshot writer (sync, manual accounts, full
 * recalculation) and the chart fallback so the stored `breakdown` jsonb
 * always matches the totals exactly.
 */
export function computeCategoryBreakdown(
  accounts: NetWorthAccountInput[],
  baseCurrency: string = 'USD',
  dateStr: string = new Date().toISOString().split('T')[0]
): Record<string, { count: number; value: number }> {
  const breakdown: Record<string, { count: number; value: number }> = {};

  for (const acc of accounts) {
    if (!isReportableAccount(acc)) continue;
    if (!isAccountActiveOnDate(acc, dateStr)) continue;

    const accountType = acc.type.toLowerCase();
    if (!isAssetAccount(accountType) && !isLiabilityAccount(accountType)) continue;

    // Zero-balance accounts still get a breakdown entry (count + value 0)
    // so stored breakdown shape matches the legacy snapshot format.
    const convertedBal = convertCurrency(
      getAccountBalance(acc),
      acc.currency || 'USD',
      baseCurrency
    );

    if (!breakdown[accountType]) {
      breakdown[accountType] = { count: 0, value: 0 };
    }
    breakdown[accountType].count++;
    breakdown[accountType].value += convertedBal;
  }

  for (const key of Object.keys(breakdown)) {
    breakdown[key].value = roundToCents(breakdown[key].value);
  }
  return breakdown;
}

/**
 * An account is relevant to cash-flow (income/expense) analytics when it is
 * reportable for net worth, OR it is a paystub account (paystubs are normally
 * excluded from net worth but must still count toward income).
 */
export function isCashFlowRelevantAccount(account: {
  type: string;
  isHidden?: boolean | null;
  isExcludedFromNetWorth?: boolean | null;
}): boolean {
  return isReportableAccount(account) || account.type === 'paystub';
}
