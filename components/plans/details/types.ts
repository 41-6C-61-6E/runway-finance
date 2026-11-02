export type PlanData = Record<string, any>;
export type PlanAccountItem = Record<string, any>;
export type PlanLiabilityItem = Record<string, any>;
export type PlanIncomeItem = Record<string, any>;
export type PlanExpenseItem = Record<string, any>;

export function safeString(val: unknown, fallback = ''): string {
  if (typeof val === 'string') return val;
  if (typeof val === 'number') return String(val);
  if (val && typeof val === 'object' && val !== null) {
    const record = val as Record<string, any>;
    if (typeof record.decrypted === 'string') return record.decrypted;
    if (typeof record.value === 'string') return record.value;
  }
  return fallback;
}

export function getAccountTypeLabel(typeVal: unknown): string {
  const type = safeString(typeVal);
  const labels: Record<string, string> = {
    cash: 'Cash / Savings',
    taxable: 'Taxable Brokerage',
    traditional_ira: 'Traditional IRA',
    traditional_401k: 'Traditional 401(k)',
    roth_ira: 'Roth IRA',
    roth_401k: 'Roth 401(k)',
    hsa: 'HSA',
    529: '529 Plan',
    crypto: 'Crypto Assets',
  };
  return labels[type] || type.replace(/_/g, ' ');
}

export function getAccountTypeColor(typeVal: unknown): string {
  const type = safeString(typeVal);
  if (type.includes('roth')) return 'text-pink-500';
  if (type.includes('traditional')) return 'text-purple-500';
  if (type.includes('taxable')) return 'text-amber-500';
  if (type.includes('hsa')) return 'text-teal-500';
  return 'text-muted-foreground';
}

export function isPreTaxType(type: string): boolean {
  return type === 'traditional_401k' || type === 'traditional_ira' || type === 'hsa';
}

export function hasEmployerPlan(type: string): boolean {
  return type.includes('401k') || type.includes('403b');
}

export function getAccountSalary(acc: PlanAccountItem, plan: PlanData): number {
  const primarySalary = parseFloat(plan?.primarySalary) || 0;
  const spouseSalary = parseFloat(plan?.spouseSalary) || 0;
  const combinedSalary = primarySalary + spouseSalary;
  const source = acc.contributionSalarySource || (safeString(acc.owner) === 'spouse' ? 'spouse' : 'primary');
  if (source === 'spouse') return spouseSalary > 0 ? spouseSalary : primarySalary;
  return primarySalary > 0 ? primarySalary : combinedSalary;
}

export function getContributionAmount(acc: PlanAccountItem, plan: PlanData): number {
  const mode = safeString(acc.contributionMode, 'none');
  if (mode === 'none') return 0;
  const salary = getAccountSalary(acc, plan);
  const val = parseFloat(acc.contributionValue) || 0;
  if (mode === 'percentage') return salary * (val / 100);
  if (mode === 'fixed_amount') return val;
  if (mode === 'maximize') {
    const type = safeString(acc.type);
    if (type.includes('401k')) return 23000;
    if (type === 'hsa') return plan?.hasSpouse ? 8300 : 4150;
    return 7000; // IRA default
  }
  return 0;
}

export function getMatchAmount(acc: PlanAccountItem, plan: PlanData): number {
  const matchRate = parseFloat(acc.companyMatchRate) || 0;
  const matchLimit = parseFloat(acc.companyMatchLimit) || 0;
  if (matchRate <= 0 || matchLimit <= 0) return 0;
  const salary = getAccountSalary(acc, plan);
  const contrib = getContributionAmount(acc, plan);
  const matchable = Math.min(contrib, salary * (matchLimit / 100));
  return matchable * matchRate;
}
