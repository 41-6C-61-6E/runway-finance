export const TYPE_HIERARCHY: Record<string, { group: string; subGroup: string }> = {
  checking:   { group: 'Banking',       subGroup: 'Cash & Checking' },
  savings:    { group: 'Banking',       subGroup: 'Savings' },
  other:      { group: 'Banking',       subGroup: 'Cash & Checking' },
  credit:     { group: 'Credit',        subGroup: 'Credit Cards' },
  investment: { group: 'Investments',   subGroup: 'Taxable Brokerage' },
  brokerage:  { group: 'Investments',   subGroup: 'Taxable Brokerage' },
  retirement: { group: 'Investments',   subGroup: 'Retirement' },
  otherinvestment: { group: 'Investments', subGroup: 'Other Investments' },
  rothira:        { group: 'Investments',   subGroup: 'Roth IRA' },
  traditionalira: { group: 'Investments',   subGroup: 'Traditional IRA' },
  '401k':         { group: 'Investments',   subGroup: '401(k)' },
  '403b':         { group: 'Investments',   subGroup: '403(b)' },
  sepira:         { group: 'Investments',   subGroup: 'SEP IRA' },
  simpleira:      { group: 'Investments',   subGroup: 'Simple IRA' },
  529:        { group: 'Investments',   subGroup: '529 Account' },
  otherAsset: { group: 'Assets',        subGroup: 'Other Assets' },
  vehicle:    { group: 'Assets',        subGroup: 'Vehicles' },
  crypto:     { group: 'Assets',        subGroup: 'Crypto Currency' },
  metals:     { group: 'Assets',        subGroup: 'Metals' },
  realestate: { group: 'Real Estate',   subGroup: 'Real Estate' },
  primaryhome: { group: 'Real Estate',  subGroup: 'Primary Home' },
  secondaryhome: { group: 'Real Estate', subGroup: 'Secondary Home' },
  rentalproperty: { group: 'Real Estate', subGroup: 'Rental Property' },
  commercial:   { group: 'Real Estate', subGroup: 'Commercial' },
  land:         { group: 'Real Estate', subGroup: 'Land' },
  otherrealestate: { group: 'Real Estate', subGroup: 'Other Real Estate' },
  'single-family': { group: 'Real Estate', subGroup: 'Single Family Home' },
  condo:           { group: 'Real Estate', subGroup: 'Condo' },
  townhouse:       { group: 'Real Estate', subGroup: 'Townhouse' },
  'multi-family':  { group: 'Real Estate', subGroup: 'Multi-Family' },
  hsa:        { group: 'Investments',   subGroup: 'HSA Account' },
  hsachecking: { group: 'Banking',      subGroup: 'HSA Account' },
  health:     { group: 'Investments',   subGroup: 'HSA Account' },
  loan:       { group: 'Loans',         subGroup: 'Loans' },
  mortgage:   { group: 'Loans',         subGroup: 'Mortgages' },
  studentloan: { group: 'Loans',        subGroup: 'Student Loans' },
  autoloan:    { group: 'Loans',        subGroup: 'Auto Loans' },
  otherloan:   { group: 'Loans',        subGroup: 'Other Loans' },
  otherLiability: { group: 'Liabilities', subGroup: 'Liabilities' },
};

export const GROUP_ORDER = ['Banking', 'Credit', 'Investments', 'Real Estate', 'Loans', 'Liabilities', 'Assets'];

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
  otherLiability: 'Other Liability',
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
  INVESTMENTS: ['investment', 'brokerage', 'retirement', 'otherinvestment', 'otherInvestment', 'rothira', 'traditionalira', '401k', '403b', 'sepira', 'simpleira', '529', 'hsa', 'health'],
  CREDIT: ['credit', 'loan', 'mortgage', 'studentloan', 'autoloan', 'otherloan', 'otherLiability'],
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

export const REAL_ESTATE_SUBTYPES = [
  'realestate',
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
] as const;

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

