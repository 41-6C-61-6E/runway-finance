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
