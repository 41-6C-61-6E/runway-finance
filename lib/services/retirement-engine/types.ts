import { DEFAULT_2026_RULES } from '@/lib/constants/retirement-defaults';

export interface EngineAccount {
  id: string;
  name: string;
  type: string; // 'cash' | 'taxable' | 'traditional_ira' | 'roth_ira' | 'traditional_401k' | 'roth_401k' | 'hsa' | 'crypto'
  owner: string;
  balance: number;
  costBasis?: number;
  expectedGrowthRate: number;
  dividendYield: number;
  reinvestDividends: boolean;
  qualifiedDividendRatio?: number;
  rothPercentage?: number;
  // Per-account contribution fields
  contributionMode?: 'none' | 'percentage' | 'fixed_amount' | 'maximize';
  contributionValue?: number; // % of salary or annual $ amount
  contributionSalarySource?: 'primary' | 'spouse';
  companyMatchRate?: number; // e.g., 1.0 = 100% match
  companyMatchLimit?: number; // Max % of salary the match applies to
  isSurplusDestination?: boolean;
}

export interface EngineLiability {
  id: string;
  name: string;
  owner?: string;
  balance: number;
  interestRate: number;
  monthlyPayment: number;
  yearsRemaining: number;
}

export interface EngineEvent {
  id: string;
  name: string;
  category: 'income' | 'expense';
  type: string; // 'salary' | 'passive' | 'pension' | 'social_security' | 'living_expense' | 'healthcare' | 'child_related' | 'lump_sum'
  owner: string;
  amount: number;
  frequency: 'yearly' | 'monthly';
  growthRate: number;
  growthCap?: number;
  adjustForInflation: boolean;
  startTriggerType: string; // 'now' | 'age' | 'year' | 'milestone'
  startTriggerValue?: string;
  endTriggerType: string; // 'age' | 'year' | 'milestone' | 'end_of_plan' | 'retirement'
  endTriggerValue?: string;
  recurrenceInterval?: number;
  inflationPerRecurrence?: number;
}

export interface EngineFlow {
  id: string;
  name: string;
  type: 'invest' | 'save_maintain' | 'pay_debt';
  rank: number;
  targetAccountId: string;
  ruleType: 'percentage' | 'maximize' | 'save_maintain' | 'save_leftover' | 'fixed_amount';
  ruleValue?: number;
  matchRate?: number;
  matchLimit?: number;
  matchAccountId?: string;
  salarySource?: 'primary' | 'spouse' | 'combined';
}

export interface EnginePlan {
  id: string;
  name: string;
  hasSpouse: boolean;
  householdSize?: number;
  primaryBirthYear: number;
  primaryBirthMonth?: number;
  spouseBirthYear?: number;
  spouseBirthMonth?: number;
  spouseName?: string;
  spouseRetirementAge?: number;
  spouseLifeExpectancyAge?: number;
  primarySsMonthlyAmount?: number;
  primarySsStartAge?: number;
  spouseSsMonthlyAmount?: number;
  spouseSsStartAge?: number;
  enableSpousalSsBenefit?: boolean;
  filingStatus: string;
  retirementAge: number;
  lifeExpectancyAge: number;
  withdrawalMethod?: string; // 'textbook' | 'proportional' | 'tax_optimized' | 'custom_order'
  fiTargetMultiplier?: number;
  customWithdrawalOrder?: string[];
  primarySalary?: number;
  spouseSalary?: number;
  primarySalaryYear?: number;
  primarySalaryRaisePct?: number;
  primarySalaryOverrides?: Record<number, number>;
  spouseSalaryYear?: number;
  spouseSalaryRaisePct?: number;
  spouseSalaryOverrides?: Record<number, number>;
  accounts: EngineAccount[];
  liabilities: EngineLiability[];
  events: EngineEvent[];
  flows: EngineFlow[];
  settings?: {
    fixedInflationRate: number;
    yearlyInflationRates?: number[];
    withholdingDeferred?: number;
    withholdingTaxable?: number;
    incomeTaxModifier?: number;
    // ── L-1: optional graduated state table. Absent → the flat
    // incomeTaxModifier behavior (legacy, bit-identical).
    stateTaxBrackets?: Array<{ threshold: number; rate: number }>;
    stateTaxStandardDeduction?: number;
    stateGrossFloorRate?: number;
    stateCode?: string;
    capGainsTaxModifier?: number;
    heirFlatIncomeTaxRate?: number;
    stepUpBasis?: boolean;
    realEstateLiquidationRate?: number;
    administrativeCostRate?: number;
    charitableGiving?: number;
    withdrawalMethod?: 'textbook' | 'proportional' | 'tax_deferred_first' | 'tax_optimized' | 'custom_order';
    enableRothConversions?: boolean;
    rothConversionTargetCeiling?: 'top_of_10' | 'top_of_12' | 'top_of_22' | 'top_of_24' | 'top_of_32' | 'irmaa_tier1';
    avoidIrmaaCliffs?: boolean;
    allowPenaltyWithdrawals?: boolean;
    // ── T-2: 'statutory' reads per-year published rule rows (2024/2025) when
    // available; 'inflationEscalated' (default) inflates the base-year rules —
    // the legacy behavior, bit-identical for existing plans.
    projectionMode?: 'statutory' | 'inflationEscalated';
    // ── T-5: opt-in AMT, default off (bit-identical output when off).
    // Base-year (2025) statutory amounts, escalated at the plan's inflation
    // rate: exemption $85,800 S / $139,000 MFJ (MFS = ½ MFJ), 26% single
    // rate, exemption reduced by 25% for tax base above $699,500 S /
    // $1,399,000 MFJ. Tax base = MAGI (+ HSA ordinary income) + state/local
    // add-back (state tax is non-deductible for AMT, L-2). Only the amount
    // exceeding regular federal income tax (ordinary + gains + NIIT) is
    // charged.
    enableAmt?: boolean;
  };
  rules?: typeof DEFAULT_2026_RULES;
}

export function getAccountCategory(type: string): 'taxable' | 'taxDeferred' | 'taxFree' | 'hsa' | 'cash' {
  const t = (type || '').toLowerCase();
  if (t === 'hsa') return 'hsa';
  if (t.includes('roth')) return 'taxFree';
  if (
    t.includes('401k') ||
    t.includes('403b') ||
    t.includes('ira') ||
    t.includes('pension') ||
    t.includes('traditional') ||
    t.includes('sep') ||
    t.includes('simple')
  ) {
    return 'taxDeferred';
  }
  if (
    t === 'taxable' ||
    t === 'brokerage' ||
    t === 'investment' ||
    t === 'crypto' ||
    t === 'asset' ||
    t === 'stock_option'
  ) {
    return 'taxable';
  }
  return 'cash';
}

export interface AccountDrawdownDetail {
  accountId: string;
  accountName: string;
  accountType: string;
  amount: number;
}

export interface YearlyAccountBalance {
  id: string;
  name: string;
  type: string;
  category: 'taxable' | 'taxDeferred' | 'taxFree' | 'hsa' | 'cash';
  owner: string;
  balance: number;
  costBasis?: number;
}

export interface YearlySimulationResult {
  year: number;
  primaryAge: number;
  spouseAge?: number;
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  liquidNetWorth: number;
  grossIncome: number;
  salaryIncome: number;
  primarySalaryIncome?: number;
  spouseSalaryIncome?: number;
  ssIncome: number;
  taxableSs?: number;
  primarySsIncome?: number;
  spouseSsIncome?: number;
  pensionIncome: number;
  otherIncome: number;
  totalExpenses: number;
  livingExpenses: number;
  debtPayments: number;
  taxesPaid: number;
  ordinaryTax: number;
  capGainsTax: number;
  divTax?: number;
  stateTax: number;
  ficaTax: number;
  niitTax?: number;
  amtTax?: number;
  earlyPenaltyTax?: number;
  acaSubsidy: number;
  effectiveTaxRate: number;
  netCashFlow: number;
  surplusSaved: number;
  deficitWithdrawn: number;
  discretionaryDeficitWithdrawn?: number;
  rmdMandatoryDrawdown?: number;
  portfolioBreakdown: {
    taxable: number;
    taxDeferred: number;
    taxFree: number;
    hsa: number;
    cash: number;
  };
  accountBalances: YearlyAccountBalance[];
  accountDrawdowns: AccountDrawdownDetail[];
  drawdownsByType: {
    cash: number;
    taxable: number;
    traditional: number;
    roth: number;
    hsa: number;
  };
  rothConversionAmount: number;
  rothBracketHeadroom?: number;
  magi: number;
  irmaaTier: number;
  irmaaSurchargeAnnual: number;
  irmaaNotice?: { tier: number; surcharge: number; magi: number; threshold: number };
  capitalGains0PctRoom?: number;
  niitHeadroom?: number;
  earlyWithdrawalWarnings?: string[];
  earlyPenaltyDetails?: { age: number; accountId: string; accountName: string; accountType: string; amount: number; penalty: number }[];
  shortfall?: number;
  milestonesReached: string[];
}

export interface SimulationOutput {
  planId: string;
  yearlyResults: YearlySimulationResult[];
  success: boolean;
  endingNetWorth: number;
  netLegacy: number;
  depletionAge?: number;
}

