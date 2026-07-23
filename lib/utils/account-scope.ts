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
  'other',
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

export const isInvestmentAccount = (type: string) => ['investment', 'brokerage', 'retirement', 'otherinvestment', 'otherInvestment',
  'rothira', 'traditionalira', '401k', '403b', 'sepira', 'simpleira', '529',
  'hsa', 'health',
].includes(type.toLowerCase());

export const LIABILITY_ACCOUNT_TYPES = [
  'credit',
  'loan',
  'mortgage',
  'otherLiability',
  'studentloan',
  'autoloan',
  'otherloan',
];

export function isAssetAccount(type: string): boolean {
  return ASSET_ACCOUNT_TYPES.includes(type) || ASSET_ACCOUNT_TYPES.includes(type.toLowerCase());
}

export function isLiabilityAccount(type: string): boolean {
  return LIABILITY_ACCOUNT_TYPES.includes(type) || LIABILITY_ACCOUNT_TYPES.includes(type.toLowerCase());
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

