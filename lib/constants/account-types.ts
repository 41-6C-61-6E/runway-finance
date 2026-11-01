import { LIABILITY_ACCOUNT_TYPES, REAL_ESTATE_SUBTYPES } from '@/lib/utils/account-scope';
export { REAL_ESTATE_SUBTYPES };

export const TYPE_HIERARCHY: Record<string, { group: string; subGroup: string; icon: string }> = {
  checking:   { group: 'Banking',       subGroup: 'Cash & Checking',  icon: '🏦' },
  savings:    { group: 'Banking',       subGroup: 'Savings',          icon: '🏦' },
  other:      { group: 'Banking',       subGroup: 'Cash & Checking',  icon: '🏦' },
  credit:     { group: 'Credit',        subGroup: 'Credit Cards',     icon: '💳' },
  investment: { group: 'Investments',   subGroup: 'Taxable Brokerage', icon: '📈' },
  brokerage:  { group: 'Investments',   subGroup: 'Taxable Brokerage', icon: '📈' },
  retirement: { group: 'Investments',   subGroup: 'Retirement',       icon: '📈' },
  otherinvestment: { group: 'Investments', subGroup: 'Other Investments', icon: '📈' },
  rothira:        { group: 'Investments',   subGroup: 'Roth IRA',         icon: '📈' },
  traditionalira: { group: 'Investments',   subGroup: 'Traditional IRA',  icon: '📈' },
  '401k':         { group: 'Investments',   subGroup: '401(k)',           icon: '📈' },
  '403b':         { group: 'Investments',   subGroup: '403(b)',           icon: '📈' },
  sepira:         { group: 'Investments',   subGroup: 'SEP IRA',          icon: '📈' },
  simpleira:      { group: 'Investments',   subGroup: 'Simple IRA',       icon: '📈' },
  529:        { group: 'Investments',   subGroup: '529 Account',      icon: '📈' },
  stock_option:   { group: 'Investments',   subGroup: 'Stock Options & Equity', icon: '📈' },
  otherAsset: { group: 'Assets',        subGroup: 'Other Assets',     icon: '💰' },
  vehicle:    { group: 'Assets',        subGroup: 'Vehicles',         icon: '🚗' },
  crypto:     { group: 'Assets',        subGroup: 'Crypto Currency',  icon: '🪙' },
  metals:     { group: 'Assets',        subGroup: 'Metals',           icon: '🧱' },
  realestate: { group: 'Real Estate',   subGroup: 'Real Estate',      icon: '🏠' },
  primaryhome: { group: 'Real Estate',  subGroup: 'Primary Home',     icon: '🏠' },
  secondaryhome: { group: 'Real Estate', subGroup: 'Secondary Home',  icon: '🏠' },
  rentalproperty: { group: 'Real Estate', subGroup: 'Rental Property', icon: '🏠' },
  commercial:   { group: 'Real Estate', subGroup: 'Commercial',       icon: '🏢' },
  land:         { group: 'Real Estate', subGroup: 'Land',             icon: '🏞️' },
  otherrealestate: { group: 'Real Estate', subGroup: 'Other Real Estate', icon: '🏠' },
  'single-family': { group: 'Real Estate', subGroup: 'Single Family Home', icon: '🏠' },
  condo:           { group: 'Real Estate', subGroup: 'Condo',             icon: '🏢' },
  townhouse:       { group: 'Real Estate', subGroup: 'Townhouse',         icon: '🏠' },
  'multi-family':  { group: 'Real Estate', subGroup: 'Multi-Family',      icon: '🏢' },
  hsa:        { group: 'Investments',   subGroup: 'HSA Account',      icon: '🏥' },
  hsachecking: { group: 'Banking',      subGroup: 'HSA Account',      icon: '🏥' },
  health:     { group: 'Investments',   subGroup: 'HSA Account',      icon: '🏥' },
  loan:       { group: 'Loans',         subGroup: 'Loans',            icon: '📋' },
  mortgage:   { group: 'Loans',         subGroup: 'Mortgages',        icon: '🏠' },
  studentloan: { group: 'Loans',        subGroup: 'Student Loans',    icon: '🎓' },
  autoloan:    { group: 'Loans',        subGroup: 'Auto Loans',       icon: '🚗' },
  otherloan:   { group: 'Loans',        subGroup: 'Other Loans',      icon: '📋' },
  personal_loan: { group: 'Loans',       subGroup: 'Personal Loans',   icon: '📋' },
  heloc:       { group: 'Loans',         subGroup: 'HELOC',            icon: '🏠' },
  otherLiability: { group: 'Liabilities', subGroup: 'Liabilities',    icon: '💳' },
};

export const GROUP_ORDER: string[] = ['Banking', 'Credit', 'Investments', 'Real Estate', 'Loans', 'Liabilities', 'Assets'];

export function getHierarchy(type: string): { group: string; subGroup: string; icon: string } {
  return TYPE_HIERARCHY[type] || { group: 'Other', subGroup: 'Other', icon: '📁' };
}

export const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  checking: 'Checking',
  savings: 'Savings',
  other: 'Other',
  credit: 'Credit',
  loan: 'Loan',
  investment: 'Investment',
  brokerage: 'Brokerage',
  retirement: 'Retirement',
  otherinvestment: 'Other Investments',
  rothira: 'Roth IRA',
  traditionalira: 'Traditional IRA',
  '401k': '401(k)',
  '403b': '403(b)',
  sepira: 'SEP IRA',
  simpleira: 'Simple IRA',
  '529': '529 Account',
  stock_option: 'Stock Options & Equity',
  otherAsset: 'Other Asset',
  otherasset: 'Other Asset',
  otherInvestment: 'Other Investments',
  vehicle: 'Vehicle',
  crypto: 'Crypto',
  metals: 'Metals',
  realestate: 'Real Estate',
  primaryhome: 'Primary Home',
  secondaryhome: 'Secondary Home',
  rentalproperty: 'Rental Property',
  commercial: 'Commercial',
  land: 'Land',
  otherrealestate: 'Other Real Estate',
  'single-family': 'Single Family Home',
  condo: 'Condo',
  townhouse: 'Townhouse',
  'multi-family': 'Multi-Family',
  hsa: 'HSA',
  hsachecking: 'HSA (Checking)',
  health: 'HSA',
  mortgage: 'Mortgage',
  studentloan: 'Student Loan',
  autoloan: 'Auto Loan',
  otherloan: 'Other Loan',
  personal_loan: 'Personal Loan',
  heloc: 'HELOC',
  otherLiability: 'Other Liability',
  otherliability: 'Other Liability',
};

export function getTypesByGroup(): { group: string; types: { value: string; label: string }[] }[] {
  const groupMap: Record<string, { value: string; label: string }[]> = {};

  for (const [type, { group }] of Object.entries(TYPE_HIERARCHY)) {
    if (!groupMap[group]) groupMap[group] = [];
    groupMap[group].push({ value: type, label: ACCOUNT_TYPE_LABELS[type] ?? type });
  }

  const ordered: { group: string; types: { value: string; label: string }[] }[] = [];
  const seen = new Set<string>();

  for (const g of GROUP_ORDER) {
    if (groupMap[g]) {
      ordered.push({ group: g, types: groupMap[g] });
      seen.add(g);
    }
  }

  for (const [group, types] of Object.entries(groupMap)) {
    if (!seen.has(group)) {
      ordered.push({ group, types });
    }
  }

  return ordered;
}

export const ACCOUNT_GROUP_MAP: Record<string, string[]> = {
  BANKING: ['checking', 'savings', 'cash', 'other', 'hsachecking'],
  INVESTMENTS: ['investment', 'brokerage', 'retirement', 'otherinvestment', 'otherInvestment', 'rothira', 'traditionalira', '401k', '403b', 'sepira', 'simpleira', '529', 'hsa', 'health', 'stock_option'],
  CREDIT: [...LIABILITY_ACCOUNT_TYPES],
  ASSETS: ['vehicle', 'crypto', 'metals', 'realestate', 'primaryhome', 'secondaryhome', 'rentalproperty', 'commercial', 'land', 'otherrealestate', 'single-family', 'condo', 'townhouse', 'multi-family', 'otherAsset', 'otherasset'],
};

export function getAccountGroupTypes(groupKey: string): string[] {
  const normalized = groupKey.toUpperCase();
  return ACCOUNT_GROUP_MAP[normalized] || [];
}

export function getAccountGroupKey(type?: string | null): 'BANKING' | 'INVESTMENTS' | 'CREDIT' | 'ASSETS' {
  if (!type) return 'BANKING';
  const t = type.toLowerCase();
  if (ACCOUNT_GROUP_MAP.BANKING.includes(t)) return 'BANKING';
  if (ACCOUNT_GROUP_MAP.INVESTMENTS.map(x => x.toLowerCase()).includes(t)) return 'INVESTMENTS';
  if (ACCOUNT_GROUP_MAP.CREDIT.map(x => x.toLowerCase()).includes(t)) return 'CREDIT';
  if (ACCOUNT_GROUP_MAP.ASSETS.map(x => x.toLowerCase()).includes(t)) return 'ASSETS';
  return 'BANKING';
}

export function isRealEstateType(type?: string | null): boolean {
  if (!type) return false;
  const t = type.toLowerCase();
  return (REAL_ESTATE_SUBTYPES as readonly string[]).includes(t);
}

export function parseAccountMetadata<T = Record<string, any>>(metadata: unknown): T {
  if (!metadata) return {} as T;
  if (typeof metadata === 'string') {
    try {
      return JSON.parse(metadata) as T;
    } catch {
      return {} as T;
    }
  }
  if (typeof metadata === 'object' && metadata !== null) {
    return metadata as T;
  }
  return {} as T;
}

