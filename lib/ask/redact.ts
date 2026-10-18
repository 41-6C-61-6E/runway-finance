/**
 * Data redaction and label sanitization for Ask prompts.
 * Strictly enforces that no individual transactions, payee names, merchant names,
 * employer names, account numbers, or institutions reach LLM prompts.
 */

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  checking: 'Checking',
  savings: 'Savings',
  hsachecking: 'HSA Checking',
  hsa: 'HSA',
  health: 'HSA',
  brokerage: 'Brokerage',
  investment: 'Brokerage',
  retirement: 'Retirement',
  rothira: 'Roth IRA',
  traditionalira: 'Traditional IRA',
  '401k': '401(k)',
  '403b': '403(b)',
  sepira: 'SEP IRA',
  simpleira: 'SIMPLE IRA',
  '529': '529 Education',
  crypto: 'Crypto',
  metals: 'Precious Metals',
  realestate: 'Real Estate',
  primaryhome: 'Primary Home',
  secondaryhome: 'Secondary Property',
  rentalproperty: 'Rental Property',
  commercial: 'Commercial Property',
  land: 'Land',
  vehicle: 'Vehicle',
  otherasset: 'Other Asset',
  otherAsset: 'Other Asset',
  credit: 'Credit Card',
  loan: 'Personal Loan',
  mortgage: 'Mortgage',
  studentloan: 'Student Loan',
  autoloan: 'Auto Loan',
  otherloan: 'Other Loan',
  otherliability: 'Other Debt',
  otherLiability: 'Other Debt',
};

export function formatAccountTypeLabel(type: string): string {
  const norm = (type || '').toLowerCase();
  return ACCOUNT_TYPE_LABELS[norm] || 'Account';
}

/**
 * Builds an account label conforming to the data exposure policy.
 * When includeAccountNames is false, uses generic labels like 'Checking #1' or '401(k) (spouse) #1'.
 */
export function buildAccountLabel(
  account: { id: string; type: string; name?: string | null; owner?: string | null },
  includeAccountNames: boolean,
  typeIndexMap: Map<string, number> = new Map()
): string {
  if (includeAccountNames && account.name) {
    return account.name;
  }

  const baseType = formatAccountTypeLabel(account.type);
  const isSpouse = (account.owner || '').toLowerCase() === 'spouse';
  const groupKey = `${account.type}:${isSpouse ? 'spouse' : 'primary'}`;

  const currentIdx = (typeIndexMap.get(groupKey) || 0) + 1;
  typeIndexMap.set(groupKey, currentIdx);

  if (isSpouse) {
    return `${baseType} (spouse) #${currentIdx}`;
  }
  return `${baseType} #${currentIdx}`;
}

/**
 * Formats a number as whole-dollar currency string (e.g. $12,345 or -$1,200).
 */
export function formatDollar(amount: number): string {
  const rounded = Math.round(amount);
  const sign = rounded < 0 ? '-' : '';
  const abs = Math.abs(rounded).toLocaleString('en-US');
  return `${sign}$${abs}`;
}

/**
 * Formats a percentage string (e.g. 15.2%).
 */
export function formatPercent(pct: number): string {
  return `${(Math.round(pct * 10) / 10).toFixed(1)}%`;
}
