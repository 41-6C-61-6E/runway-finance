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
  hsa:        { group: 'Health',        subGroup: 'Health Accounts' },
  health:     { group: 'Health',        subGroup: 'Health Accounts' },
  loan:       { group: 'Loans',         subGroup: 'Loans' },
  mortgage:   { group: 'Loans',         subGroup: 'Mortgages' },
  otherLiability: { group: 'Liabilities', subGroup: 'Liabilities' },
};

export const GROUP_ORDER = ['Banking', 'Credit', 'Investments', 'Real Estate', 'Health', 'Loans', 'Liabilities', 'Assets'];

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
  hsa: 'HSA',
  health: 'Health',
  mortgage: 'Mortgage',
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
