import { isAssetAccount, isLiabilityAccount, filterReportableAccounts } from '@/lib/utils/account-scope';
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
  // Filter reportable accounts to ensure strict parity with /overview and /net-worth
  const reportableAccounts = filterReportableAccounts(accounts);
  const assetsTrace = buildTotalAssetsTrace(reportableAccounts);
  const liabilitiesTrace = buildTotalLiabilitiesTrace(reportableAccounts);
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
    const rawBal = typeof acc.balance === 'string' ? parseFloat(acc.balance) : acc.balance;
    const balance = isNaN(rawBal) ? 0 : rawBal;
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
    const rawBal = typeof acc.balance === 'string' ? parseFloat(acc.balance) : acc.balance;
    const balance = isNaN(rawBal) ? 0 : rawBal;
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
  const ratio = assetsTrace.result > 0
    ? liabilitiesTrace.result / assetsTrace.result
    : (liabilitiesTrace.result > 0 ? Infinity : 0);
  const operationStr = assetsTrace.result > 0
    ? `${liabilitiesTrace.result} / ${assetsTrace.result}`
    : (liabilitiesTrace.result > 0 ? `${liabilitiesTrace.result} / 0 (infinite leverage)` : '0 / 0');

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
      { label: 'Ratio', inputs: { totalLiabilities: liabilitiesTrace.result, totalAssets: assetsTrace.result }, operation: operationStr, output: ratio },
    ],
    result: ratio,
  };
}

/** Convenience wrapper: builds debt-to-asset ratio trace directly from accounts. */
export function buildDebtToAssetTrace(accounts: AccountData[]): CalculationTrace {
  const reportableAccounts = filterReportableAccounts(accounts);
  const assets = buildTotalAssetsTrace(reportableAccounts);
  const liabilities = buildTotalLiabilitiesTrace(reportableAccounts);
  return buildDebtToAssetTraceFrom(assets, liabilities);
}

// ─── Cash Flow Traces ───────────────────────────────────────────

export function buildCashFlowTrace(data: {
  totalIncome?: number;
  totalExpenses?: number;
  netIncome?: number;
  savingsRate?: number;
}): CalculationTrace {
  const inc = data.totalIncome ?? 0;
  const exp = data.totalExpenses ?? 0;
  const net = data.netIncome ?? (inc - exp);
  const savingsRate = data.savingsRate ?? (inc > 0 ? (net / inc) * 100 : 0);

  return {
    id: 'cashFlow',
    title: 'Cash Flow Summary',
    category: 'cashFlow',
    formula: 'Net Income = Total Income − Total Expenses. Savings Rate = Net Income / Total Income × 100',
    dataSource: '/api/cash-flow/summary',
    filters: ['deleted = false', 'pending = false', 'ignored = false', 'excludeFromReports = false', 'categoryType != transfer'],
    typesIncluded: [],
    typesExcluded: [],
    format: 'currency',
    steps: [
      { label: 'Total Income', inputs: {}, operation: 'from monthly cash flow summary', output: inc },
      { label: 'Total Expenses', inputs: {}, operation: 'from monthly cash flow summary', output: exp },
      { label: 'Net Income', inputs: { totalIncome: inc, totalExpenses: exp }, operation: `${inc} − ${exp}`, output: net },
      { label: 'Savings Rate', inputs: { netIncome: net, totalIncome: inc }, operation: inc > 0 ? `${net} / ${inc} × 100` : '0%', output: savingsRate },
    ],
    result: net,
  };
}

// ─── Real Estate Traces ────────────────────────────────────────

export function buildRealEstateTrace(data: {
  totalValue?: number;
  totalMortgage?: number;
  totalEquity?: number;
  overallLtv?: number;
  properties?: Array<{ name: string; value: number; mortgageBalance: number; equity: number; isSynthetic?: boolean }>;
}): CalculationTrace {
  const propertySteps = (data.properties ?? []).map((p) => ({
    label: p.name,
    inputs: { value: p.value, mortgage: p.mortgageBalance, equity: p.equity },
    operation: `${p.value} − ${p.mortgageBalance} = ${p.equity}`,
    output: p.equity,
    isEstimate: !!p.isSynthetic,
  }));
  const totVal = data.totalValue ?? 0;
  const totMtg = data.totalMortgage ?? 0;
  const totEq = data.totalEquity ?? (totVal - totMtg);
  const ltv = data.overallLtv ?? (totVal > 0 ? (totMtg / totVal) * 100 : 0);

  return {
    id: 'realEstate',
    title: 'Real Estate Summary',
    category: 'realEstate',
    formula: 'Total Value = Σ property values. Total Mortgage = Σ |linked mortgage balances|. Total Equity = Σ (value − |mortgage|). LTV = Total Mortgage / Total Value × 100',
    dataSource: '/api/real-estate',
    filters: ['isHidden = false', 'isExcludedFromNetWorth = false', 'type = realestate or mortgage (linked)'],
    typesIncluded: [
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
      'mortgage',
    ],
    typesExcluded: [],
    format: 'currency',
    steps: [
      ...propertySteps,
      { label: 'Total Value', inputs: {}, operation: 'sum of all property values', output: totVal },
      { label: 'Total Mortgage', inputs: {}, operation: 'sum of linked absolute mortgage balances', output: totMtg },
      { label: 'Total Equity', inputs: { totalValue: totVal, totalMortgage: totMtg }, operation: `${totVal} − ${totMtg}`, output: totEq },
      { label: 'LTV Ratio', inputs: { totalMortgage: totMtg, totalValue: totVal }, operation: totVal > 0 ? `${totMtg} / ${totVal} × 100` : '0%', output: ltv },
    ],
    result: totEq,
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
  const expenses = data.targetAnnualExpenses ?? 0;
  const swr = data.safeWithdrawalRate ?? 0.04;
  const fireNum = data.fireNumber ?? (swr > 0 ? expenses / swr : 0);
  const assets = data.currentInvestableAssets ?? 0;
  const pct = data.percentToFire ?? (fireNum > 0 ? (assets / fireNum) * 100 : 0);
  const years = data.yearsToFI ?? 0;

  return {
    id: 'fire',
    title: 'FIRE Metrics',
    category: 'fire',
    formula: 'FIRE Number = Target Annual Expenses / Safe Withdrawal Rate. % to FIRE = Current Investable Assets / FIRE Number × 100. Years to FI uses logarithmic compound growth formula.',
    dataSource: 'user settings + account balances (FIRE-eligible accounts)',
    filters: ['isHidden = false', 'isExcludedFromNetWorth = false', 'isFireEligibleAccount = true'],
    typesIncluded: [
      'checking',
      'savings',
      'investment',
      'brokerage',
      'retirement',
      'rothira',
      'traditionalira',
      '401k',
      '403b',
      'sepira',
      'simpleira',
      '529',
      'hsa',
      'health',
      'crypto',
    ],
    typesExcluded: ['realestate', 'mortgage', 'credit', 'loan', 'autoloan', 'studentloan', 'vehicle'],
    format: 'percentage',
    steps: [
      { label: 'FIRE Number', inputs: { targetAnnualExpenses: expenses, safeWithdrawalRate: swr }, operation: swr > 0 ? `${expenses} / ${swr}` : '0', output: fireNum },
      { label: 'Current Investable Assets', inputs: {}, operation: 'sum of FIRE-eligible investable account balances', output: assets },
      { label: '% to FIRE', inputs: { currentInvestableAssets: assets, fireNumber: fireNum }, operation: fireNum > 0 ? `(${assets} / ${fireNum}) × 100` : '0%', output: pct },
      { label: 'Years to FI', inputs: {}, operation: 'logarithmic compound growth formula with annual savings', output: years, isEstimate: true },
    ],
    result: pct,
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
  const budgeted = data.totalBudgeted ?? 0;
  const actual = data.totalActual ?? 0;
  const remaining = data.remaining ?? (data.type === 'income' ? actual - budgeted : budgeted - actual);
  const percentUsed = data.percentUsed ?? (budgeted > 0 ? (actual / budgeted) * 100 : 0);

  const formula = data.type === 'income'
    ? 'Variance = Actual − Budgeted. % Achieved = Actual / Budgeted × 100'
    : 'Remaining = Available Budget − Actual. % Used = Actual / Available Budget × 100';

  const percentStepOp = budgeted > 0
    ? `${actual} / ${budgeted} × 100`
    : (actual > 0 ? 'N/A (unbudgeted spending)' : '0%');

  return {
    id,
    title,
    category: 'budgets',
    formula,
    dataSource: '/api/budgets or /api/cash-flow/budgets',
    filters: ['excludeFromReports = false', 'deleted = false', 'ignored = false'],
    typesIncluded: [],
    typesExcluded: [],
    format: 'currency',
    steps: [
      { label: 'Budgeted', inputs: {}, operation: 'sum of active budget items (scaled by period)', output: budgeted },
      { label: 'Actual', inputs: {}, operation: 'from category transaction spending summaries', output: actual },
      {
        label: data.type === 'income' ? 'Variance' : 'Remaining',
        inputs: { budgeted, actual },
        operation: data.type === 'income' ? `${actual} − ${budgeted}` : `${budgeted} − ${actual}`,
        output: remaining,
      },
      {
        label: data.type === 'income' ? '% Achieved' : '% Used',
        inputs: { actual, budgeted },
        operation: percentStepOp,
        output: percentUsed,
      },
    ],
    result: remaining,
  };
}

// ─── Goal Traces ────────────────────────────────────────────────

export function buildGoalsTrace(data: {
  totalTarget?: number;
  totalCurrent?: number;
  overallProgress?: number;
  count?: number;
}): CalculationTrace {
  const target = data.totalTarget ?? 0;
  const current = data.totalCurrent ?? 0;
  const progress = data.overallProgress ?? (target > 0 ? Math.min((current / target) * 100, 100) : 0);

  return {
    id: 'goals',
    title: 'Goals Summary',
    category: 'goals',
    formula: 'Overall Progress = min(Total Saved / Total Target × 100, 100%)',
    dataSource: '/api/financial-goals',
    filters: ['status != archived'],
    typesIncluded: [],
    typesExcluded: [],
    format: 'percentage',
    steps: [
      { label: 'Total Target', inputs: {}, operation: 'sum of active goal target amounts', output: target },
      { label: 'Total Saved', inputs: {}, operation: 'sum of dynamic allocated/saved amounts across linked accounts', output: current },
      {
        label: 'Overall Progress',
        inputs: { totalCurrent: current, totalTarget: target },
        operation: target > 0 ? `min((${current} / ${target}) × 100, 100%)` : '0%',
        output: progress,
      },
    ],
    result: progress,
  };
}

// ─── Investments Traces ──────────────────────────────────────────

export function buildInvestmentsTrace(data: {
  accounts: any[];
  holdings: any[];
  summary: {
    totalBalance: number;
    totalCostBasis: number | null;
    totalUnrealizedGainLoss: number | null;
    totalUnrealizedReturnPct: number | null;
    holdingsCount: number;
  };
}): CalculationTrace {
  const steps: CalculationTrace['steps'] = [
    {
      label: 'Total Balance',
      inputs: {},
      operation: 'sum of all investment account balances',
      output: data.summary.totalBalance ?? 0,
    },
  ];

  if (data.summary.totalCostBasis != null) {
    steps.push({
      label: 'Total Cost Basis',
      inputs: {},
      operation: 'sum of cost basis of holdings with cost basis data',
      output: data.summary.totalCostBasis,
    });
  }

  if (data.summary.totalUnrealizedGainLoss != null && data.summary.totalCostBasis != null) {
    const totalValueForCostBasis = data.summary.totalCostBasis + data.summary.totalUnrealizedGainLoss;
    steps.push({
      label: 'Unrealized Gain/Loss',
      inputs: {
        totalValueForCostBasis,
        totalCostBasis: data.summary.totalCostBasis,
      },
      operation: `${totalValueForCostBasis} − ${data.summary.totalCostBasis}`,
      output: data.summary.totalUnrealizedGainLoss,
    });

    if (data.summary.totalUnrealizedReturnPct != null) {
      steps.push({
        label: 'Unrealized Return %',
        inputs: {
          totalUnrealizedGainLoss: data.summary.totalUnrealizedGainLoss,
          totalCostBasis: data.summary.totalCostBasis,
        },
        operation: `(${data.summary.totalUnrealizedGainLoss} / ${data.summary.totalCostBasis}) × 100`,
        output: data.summary.totalUnrealizedReturnPct,
      });
    }
  }

  const children: CalculationTrace[] = (data.accounts ?? []).map((acc) => {
    const accHoldings = (data.holdings ?? []).filter((h) => h.accountId === acc.id);
    const accCostBasis = accHoldings.reduce((sum, h) => sum + (h.costBasis ?? 0), 0);
    const accGainLoss = accHoldings.reduce((sum, h) => sum + (h.unrealizedGainLoss ?? 0), 0);
    const accReturnPct = accCostBasis > 0 ? (accGainLoss / accCostBasis) * 100 : 0;
    const accValueForCostBasis = accCostBasis + accGainLoss;

    const accSteps: CalculationTrace['steps'] = [
      {
        label: 'Balance',
        inputs: {},
        operation: 'account balance',
        output: acc.balance,
      },
    ];

    if (accCostBasis > 0) {
      accSteps.push({
        label: 'Holdings Cost Basis',
        inputs: {},
        operation: 'sum of cost basis of holdings in account',
        output: accCostBasis,
      });
      accSteps.push({
        label: 'Unrealized Gain/Loss',
        inputs: { value: accValueForCostBasis, cost: accCostBasis },
        operation: `${accValueForCostBasis} − ${accCostBasis}`,
        output: accGainLoss,
      });
      accSteps.push({
        label: 'Unrealized Return %',
        inputs: { gainLoss: accGainLoss, cost: accCostBasis },
        operation: `(${accGainLoss} / ${accCostBasis}) × 100`,
        output: accReturnPct,
      });
    }

    return {
      id: `investmentAccount_${acc.id}`,
      title: `${acc.name} (${acc.institution || 'Brokerage'})`,
      category: 'investments',
      formula: 'Unrealized Gain/Loss = Value of Holdings with Cost Basis − Cost Basis',
      dataSource: `/api/investments → account ${acc.id}`,
      filters: [],
      typesIncluded: [acc.type],
      typesExcluded: [],
      format: 'currency',
      steps: accSteps,
      result: acc.balance,
    };
  });

  return {
    id: 'investments',
    title: 'Investments Summary',
    category: 'investments',
    formula: 'Total Balance = Σ investment account balances. Unrealized Gain/Loss = Value − Cost Basis. Return % = Gain/Loss / Cost Basis × 100',
    dataSource: '/api/investments',
    filters: ['isHidden = false', 'isExcludedFromNetWorth = false'],
    typesIncluded: [
      'investment',
      'brokerage',
      'retirement',
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
      'health',
    ],
    typesExcluded: [],
    format: 'currency',
    steps,
    result: data.summary.totalBalance ?? 0,
    children,
  };
}
