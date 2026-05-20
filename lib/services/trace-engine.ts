import { isAssetAccount, isLiabilityAccount } from '@/lib/utils/account-scope';
import { ASSET_ACCOUNT_TYPES, LIABILITY_ACCOUNT_TYPES } from '@/lib/utils/account-scope';
import type { AccountData, CalculationTrace } from '@/lib/types/financial';

function devValidateAccountTypes(accounts: AccountData[]): void {
  if (process.env.NODE_ENV !== 'development') return;
  const unknown = accounts.filter(
    (a) => !isAssetAccount(a.type) && !isLiabilityAccount(a.type)
  );
  for (const a of unknown) {
    console.warn(
      `[FinancialLogic] Account "${a.name}" has unrecognized type "${a.type}". ` +
        'It will be excluded from all financial calculations. ' +
        'If this is a valid account type, add it to ASSET_ACCOUNT_TYPES or LIABILITY_ACCOUNT_TYPES in lib/utils/account-scope.ts'
    );
  }
}

// ─── Net Worth Traces ───────────────────────────────────────────

export function buildNetWorthTraces(accounts: AccountData[]): CalculationTrace[] {
  devValidateAccountTypes(accounts);
  const assetsTrace = buildTotalAssetsTrace(accounts);
  const liabilitiesTrace = buildTotalLiabilitiesTrace(accounts);
  const debtTrace = buildDebtToAssetTraceFrom(assetsTrace, liabilitiesTrace);
  const netWorth: CalculationTrace = {
    id: 'netWorth',
    title: 'Net Worth',
    category: 'netWorth',
    formula: 'Net Worth = Total Assets − Total Liabilities',
    dataSource: '/api/accounts → filterReportableAccounts()',
    filters: ['isHidden = false', 'isExcludedFromNetWorth = false'],
    typesIncluded: [...ASSET_ACCOUNT_TYPES, ...LIABILITY_ACCOUNT_TYPES],
    typesExcluded: [],
    format: 'currency',
    steps: [
      { label: 'Total Assets', inputs: {}, operation: 'sum of all asset account balances', output: assetsTrace.result },
      { label: 'Total Liabilities', inputs: {}, operation: 'sum of absolute liability account balances', output: liabilitiesTrace.result },
      { label: 'Net Worth', inputs: { totalAssets: assetsTrace.result, totalLiabilities: liabilitiesTrace.result }, operation: `${assetsTrace.result} − ${liabilitiesTrace.result}`, output: assetsTrace.result - liabilitiesTrace.result },
    ],
    result: assetsTrace.result - liabilitiesTrace.result,
    children: [assetsTrace, liabilitiesTrace, debtTrace],
  };
  return [assetsTrace, liabilitiesTrace, netWorth, debtTrace];
}

function buildTotalAssetsTrace(accounts: AccountData[]): CalculationTrace {
  const steps: CalculationTrace['steps'] = [];
  let totalAssets = 0;
  const assetAccounts = accounts.filter((a) => isAssetAccount(a.type));
  for (const acc of assetAccounts) {
    const balance = typeof acc.balance === 'string' ? parseFloat(acc.balance) : acc.balance;
    totalAssets += balance;
    steps.push({
      label: `${acc.name || acc.id}`,
      inputs: { balance },
      operation: acc.type,
      output: totalAssets,
    });
  }
  return {
    id: 'totalAssets',
    title: 'Total Assets',
    category: 'netWorth',
    formula: 'Total Assets = Σ balance WHERE type ∈ ASSET_ACCOUNT_TYPES',
    dataSource: '/api/accounts → filterReportableAccounts()',
    filters: ['isHidden = false', 'isExcludedFromNetWorth = false'],
    typesIncluded: [...ASSET_ACCOUNT_TYPES],
    typesExcluded: [...LIABILITY_ACCOUNT_TYPES],
    format: 'currency',
    steps,
    result: totalAssets,
  };
}

function buildTotalLiabilitiesTrace(accounts: AccountData[]): CalculationTrace {
  const steps: CalculationTrace['steps'] = [];
  let totalLiabilities = 0;
  const liabilityAccounts = accounts.filter((a) => isLiabilityAccount(a.type));
  for (const acc of liabilityAccounts) {
    const balance = typeof acc.balance === 'string' ? parseFloat(acc.balance) : acc.balance;
    const absBalance = Math.abs(balance);
    totalLiabilities += absBalance;
    steps.push({
      label: `${acc.name || acc.id}`,
      inputs: { balance, absBalance },
      operation: `abs(${balance}) = ${absBalance}`,
      output: totalLiabilities,
    });
  }
  return {
    id: 'totalLiabilities',
    title: 'Total Liabilities',
    category: 'netWorth',
    formula: 'Total Liabilities = Σ |balance| WHERE type ∈ LIABILITY_ACCOUNT_TYPES',
    dataSource: '/api/accounts → filterReportableAccounts()',
    filters: ['isHidden = false', 'isExcludedFromNetWorth = false'],
    typesIncluded: [...LIABILITY_ACCOUNT_TYPES],
    typesExcluded: [...ASSET_ACCOUNT_TYPES],
    format: 'currency',
    steps,
    result: totalLiabilities,
  };
}

/** Builds a debt-to-asset ratio trace from pre-computed asset/liability traces (internal). */
function buildDebtToAssetTraceFrom(assetsTrace: CalculationTrace, liabilitiesTrace: CalculationTrace): CalculationTrace {
  const ratio = assetsTrace.result > 0 ? liabilitiesTrace.result / assetsTrace.result : 0;
  return {
    id: 'debtToAsset',
    title: 'Debt-to-Asset Ratio',
    category: 'netWorth',
    formula: 'Ratio = Total Liabilities / Total Assets',
    dataSource: '/api/accounts → filterReportableAccounts()',
    filters: ['isHidden = false', 'isExcludedFromNetWorth = false'],
    typesIncluded: [...ASSET_ACCOUNT_TYPES, ...LIABILITY_ACCOUNT_TYPES],
    typesExcluded: [],
    format: 'ratio',
    steps: [
      { label: 'Total Assets', inputs: { totalAssets: assetsTrace.result }, operation: 'from account balances', output: assetsTrace.result },
      { label: 'Total Liabilities', inputs: { totalLiabilities: liabilitiesTrace.result }, operation: 'from account balances', output: liabilitiesTrace.result },
      { label: 'Ratio', inputs: { totalLiabilities: liabilitiesTrace.result, totalAssets: assetsTrace.result }, operation: `${liabilitiesTrace.result} / ${assetsTrace.result}`, output: ratio },
    ],
    result: ratio,
  };
}

/** Convenience wrapper: builds debt-to-asset ratio trace directly from accounts. */
export function buildDebtToAssetTrace(accounts: AccountData[]): CalculationTrace {
  const assets = buildTotalAssetsTrace(accounts);
  const liabilities = buildTotalLiabilitiesTrace(accounts);
  return buildDebtToAssetTraceFrom(assets, liabilities);
}

// ─── Cash Flow Traces ───────────────────────────────────────────

export function buildCashFlowTrace(data: {
  totalIncome?: number;
  totalExpenses?: number;
  netIncome?: number;
  savingsRate?: number;
}): CalculationTrace {
  return {
    id: 'cashFlow',
    title: 'Cash Flow Summary',
    category: 'cashFlow',
    formula: 'Net Income = Total Income − Total Expenses. Savings Rate = Net Income / Total Income × 100',
    dataSource: '/api/cash-flow/summary',
    filters: [],
    typesIncluded: [],
    typesExcluded: [],
    format: 'currency',
    steps: [
      { label: 'Total Income', inputs: {}, operation: 'from monthly cash flow summary', output: data.totalIncome ?? 0 },
      { label: 'Total Expenses', inputs: {}, operation: 'from monthly cash flow summary', output: data.totalExpenses ?? 0 },
      { label: 'Net Income', inputs: { totalIncome: data.totalIncome ?? 0, totalExpenses: data.totalExpenses ?? 0 }, operation: `${data.totalIncome ?? 0} − ${data.totalExpenses ?? 0}`, output: data.netIncome ?? 0 },
      { label: 'Savings Rate', inputs: { netIncome: data.netIncome ?? 0, totalIncome: data.totalIncome ?? 0 }, operation: `${data.netIncome ?? 0} / ${data.totalIncome ?? 0} × 100`, output: data.savingsRate ?? 0 },
    ],
    result: data.netIncome ?? 0,
  };
}

// ─── Real Estate Traces ────────────────────────────────────────

export function buildRealEstateTrace(data: {
  totalValue?: number;
  totalMortgage?: number;
  totalEquity?: number;
  overallLtv?: number;
  properties?: Array<{ name: string; value: number; mortgageBalance: number; equity: number }>;
}): CalculationTrace {
  const propertySteps = (data.properties ?? []).map((p) => ({
    label: p.name,
    inputs: { value: p.value, mortgage: p.mortgageBalance, equity: p.equity },
    operation: `${p.value} − ${p.mortgageBalance} = ${p.equity}`,
    output: p.equity,
  }));
  return {
    id: 'realEstate',
    title: 'Real Estate Summary',
    category: 'realEstate',
    formula: 'Total Value = Σ property values. Total Mortgage = Σ |mortgage balances|. Total Equity = Σ (value − |mortgage|). LTV = Total Mortgage / Total Value × 100',
    dataSource: '/api/real-estate',
    filters: ['isHidden = false', 'isExcludedFromNetWorth = false', 'type = realestate or mortgage'],
    typesIncluded: ['realestate', 'mortgage'],
    typesExcluded: [],
    format: 'currency',
    steps: [
      ...propertySteps,
      { label: 'Total Value', inputs: {}, operation: 'sum of all property balances', output: data.totalValue ?? 0 },
      { label: 'Total Mortgage', inputs: {}, operation: 'sum of absolute mortgage balances', output: data.totalMortgage ?? 0 },
      { label: 'Total Equity', inputs: { totalValue: data.totalValue ?? 0, totalMortgage: data.totalMortgage ?? 0 }, operation: `${data.totalValue ?? 0} − ${data.totalMortgage ?? 0}`, output: data.totalEquity ?? 0 },
      { label: 'LTV Ratio', inputs: { totalMortgage: data.totalMortgage ?? 0, totalValue: data.totalValue ?? 0 }, operation: `${data.totalMortgage ?? 0} / ${data.totalValue ?? 0} × 100`, output: data.overallLtv ?? 0 },
    ],
    result: data.totalEquity ?? 0,
  };
}

// ─── FIRE Traces ────────────────────────────────────────────────

export function buildFireTrace(data: {
  fireNumber?: number;
  currentInvestableAssets?: number;
  percentToFire?: number;
  yearsToFI?: number;
  safeWithdrawalRate?: number;
  targetAnnualExpenses?: number;
}): CalculationTrace {
  return {
    id: 'fire',
    title: 'FIRE Metrics',
    category: 'fire',
    formula: 'FIRE Number = Target Annual Expenses / Safe Withdrawal Rate. % to FIRE = Current Investable Assets / FIRE Number × 100. Years to FI uses logarithmic future value formula.',
    dataSource: 'user settings + account balances (investment accounts)',
    filters: [],
    typesIncluded: [],
    typesExcluded: [],
    format: 'percentage',
    steps: [
      { label: 'FIRE Number', inputs: { targetAnnualExpenses: data.targetAnnualExpenses ?? 0, safeWithdrawalRate: data.safeWithdrawalRate ?? 0 }, operation: `${data.targetAnnualExpenses ?? 0} / ${data.safeWithdrawalRate ?? 0}`, output: data.fireNumber ?? 0 },
      { label: 'Current Investable Assets', inputs: {}, operation: 'sum of investment account balances', output: data.currentInvestableAssets ?? 0 },
      { label: '% to FIRE', inputs: { currentInvestableAssets: data.currentInvestableAssets ?? 0, fireNumber: data.fireNumber ?? 0 }, operation: `${data.currentInvestableAssets ?? 0} / ${data.fireNumber ?? 0} × 100`, output: data.percentToFire ?? 0 },
      { label: 'Years to FI', inputs: {}, operation: 'logarithmic future value formula', output: data.yearsToFI ?? 0 },
    ],
    result: data.percentToFire ?? 0,
  };
}

// ─── Budget Traces ──────────────────────────────────────────────

export function buildBudgetTrace(data: {
  totalBudgeted?: number;
  totalActual?: number;
  remaining?: number;
  percentUsed?: number;
  type: 'income' | 'expense';
}): CalculationTrace {
  const id = data.type === 'income' ? 'budgetIncome' : 'budgetExpenses';
  const title = data.type === 'income' ? 'Budget Income' : 'Budget Expenses';
  const formula = data.type === 'income'
    ? 'Variance = Actual − Budgeted. % Achieved = Actual / Budgeted × 100'
    : 'Remaining = Budgeted − Actual. % Used = Actual / Budgeted × 100';
  return {
    id,
    title,
    category: 'budgets',
    formula,
    dataSource: '/api/budgets or /api/cash-flow/budgets',
    filters: [],
    typesIncluded: [],
    typesExcluded: [],
    format: 'currency',
    steps: [
      { label: 'Budgeted', inputs: {}, operation: 'sum of all budget items', output: data.totalBudgeted ?? 0 },
      { label: 'Actual', inputs: {}, operation: 'from category spending summaries', output: data.totalActual ?? 0 },
      { label: data.type === 'income' ? 'Variance' : 'Remaining', inputs: { budgeted: data.totalBudgeted ?? 0, actual: data.totalActual ?? 0 }, operation: data.type === 'income' ? `${data.totalActual ?? 0} − ${data.totalBudgeted ?? 0}` : `${data.totalBudgeted ?? 0} − ${data.totalActual ?? 0}`, output: data.remaining ?? 0 },
      { label: data.type === 'income' ? '% Achieved' : '% Used', inputs: { actual: data.totalActual ?? 0, budgeted: data.totalBudgeted ?? 0 }, operation: `${data.totalActual ?? 0} / ${data.totalBudgeted ?? 0} × 100`, output: data.percentUsed ?? 0 },
    ],
    result: data.remaining ?? 0,
  };
}

// ─── Goal Traces ────────────────────────────────────────────────

export function buildGoalsTrace(data: {
  totalTarget?: number;
  totalCurrent?: number;
  overallProgress?: number;
  count?: number;
}): CalculationTrace {
  return {
    id: 'goals',
    title: 'Goals Summary',
    category: 'goals',
    formula: 'Overall Progress = Total Current / Total Target × 100 (capped at 100%)',
    dataSource: '/api/financial-goals',
    filters: [],
    typesIncluded: [],
    typesExcluded: [],
    format: 'percentage',
    steps: [
      { label: 'Total Target', inputs: {}, operation: 'sum of all goal target amounts', output: data.totalTarget ?? 0 },
      { label: 'Total Saved', inputs: {}, operation: 'sum of all goal current amounts', output: data.totalCurrent ?? 0 },
      { label: 'Overall Progress', inputs: { totalCurrent: data.totalCurrent ?? 0, totalTarget: data.totalTarget ?? 0 }, operation: `${data.totalCurrent ?? 0} / ${data.totalTarget ?? 0} × 100`, output: data.overallProgress ?? 0 },
    ],
    result: data.overallProgress ?? 0,
  };
}
