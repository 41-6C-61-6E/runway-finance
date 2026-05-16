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
];

export const LIABILITY_ACCOUNT_TYPES = [
  'credit',
  'loan',
  'mortgage',
  'otherLiability',
];

export type AccountScopeFields = {
  type: string;
  isHidden?: boolean | null;
  isExcludedFromNetWorth?: boolean | null;
};

export function isAssetAccount(type: string): boolean {
  return ASSET_ACCOUNT_TYPES.includes(type) || ASSET_ACCOUNT_TYPES.includes(type.toLowerCase());
}

export function isLiabilityAccount(type: string): boolean {
  return LIABILITY_ACCOUNT_TYPES.includes(type) || LIABILITY_ACCOUNT_TYPES.includes(type.toLowerCase());
}

export function isReportableAccount(account: AccountScopeFields): boolean {
  return !account.isHidden && !account.isExcludedFromNetWorth;
}

export function filterReportableAccounts<T extends AccountScopeFields>(accounts: T[]): T[] {
  return accounts.filter(isReportableAccount);
}
