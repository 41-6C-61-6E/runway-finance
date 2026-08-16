import { DEFAULT_2026_RULES, IRS_UNIFORM_LIFETIME_TABLE } from '@/lib/constants/retirement-defaults';
import { isFireEligibleAccount } from '@/lib/utils/account-scope';

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
    withholdingDeferred?: number;
    withholdingTaxable?: number;
    incomeTaxModifier?: number;
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

export function getYearSalary(
  baseSalary: number,
  baseYear: number,
  raisePct: number,
  overrides: Record<number, number> | undefined,
  targetYear: number
): number {
  if (baseSalary <= 0) return 0;

  let effectiveBase = baseSalary;
  let effectiveBaseYear = baseYear;

  if (overrides) {
    const overrideYears = Object.keys(overrides)
      .map(Number)
      .filter((y) => y <= targetYear)
      .sort((a, b) => b - a);
    if (overrideYears.length > 0) {
      const latestOverrideYear = overrideYears[0];
      effectiveBase = overrides[latestOverrideYear];
      effectiveBaseYear = latestOverrideYear;
    }
  }

  const yearDiff = targetYear - effectiveBaseYear;
  if (yearDiff <= 0) return effectiveBase;
  return effectiveBase * Math.pow(1 + raisePct / 100, yearDiff);
}

export function runRetirementSimulation(
  plan: EnginePlan,
  yearGrowthFn?: (yearIndex: number, acc: EngineAccount) => { growth: number; dividend: number }
): SimulationOutput {
  const currentYear = new Date().getFullYear();
  const primaryBirthYear = plan.primaryBirthYear || 1985;
  const startAge = currentYear - primaryBirthYear;
  const maxYears = Math.max(1, (plan.lifeExpectancyAge || 100) - startAge);

  const filingStatus = plan.filingStatus || 'single';
  const isMfj = filingStatus === 'married_joint';
  const isMfs = filingStatus === 'married_separate';
  const isHoH = filingStatus === 'head_of_household';
  const rules = plan.rules || DEFAULT_2026_RULES;

  // Mutable deep clones of state for simulation loop (with Roth percentage splitting)
  const accountsState: Record<string, EngineAccount> = {};
  const eligibleAccounts = (plan.accounts || []).filter((a) => (a as any).isIncluded !== false && isFireEligibleAccount(a));
  for (const acc of eligibleAccounts) {
    if (acc.rothPercentage !== undefined && acc.rothPercentage > 0 && acc.rothPercentage < 100) {
      const rothPct = acc.rothPercentage / 100;
      const tradPct = 1 - rothPct;
      const is401k = acc.type.includes('401k');
      const tradId = `${acc.id}_trad`;
      const rothId = `${acc.id}_roth`;

      accountsState[tradId] = {
        ...acc,
        id: tradId,
        name: `${acc.name} (Pre-Tax Traditional)`,
        type: is401k ? 'traditional_401k' : 'traditional_ira',
        balance: acc.balance * tradPct,
        costBasis: acc.costBasis * tradPct,
        rothPercentage: undefined,
      };

      accountsState[rothId] = {
        ...acc,
        id: rothId,
        name: `${acc.name} (Tax-Free Roth)`,
        type: is401k ? 'roth_401k' : 'roth_ira',
        balance: acc.balance * rothPct,
        costBasis: acc.costBasis * rothPct,
        rothPercentage: undefined,
      };
    } else if (acc.rothPercentage === 100) {
      const is401k = acc.type.includes('401k');
      accountsState[acc.id] = {
        ...acc,
        type: is401k ? 'roth_401k' : (acc.type.includes('ira') ? 'roth_ira' : acc.type),
      };
    } else {
      accountsState[acc.id] = { ...acc };
    }
  }

  const liabilitiesState: Record<string, EngineLiability> = {};
  for (const liab of plan.liabilities) {
    liabilitiesState[liab.id] = { ...liab };
  }

  const yearlyResults: YearlySimulationResult[] = [];
  let depletionAge: number | undefined;

  // Track IRMAA surcharges queue (2-year lookback)
  const irmaaSurchargeQueue: Record<number, number> = {};

  for (let yearOffset = 0; yearOffset < maxYears; yearOffset++) {
    const simYear = currentYear + yearOffset;
    const primaryAge = startAge + yearOffset;
    const spouseAge = plan.spouseBirthYear ? simYear - plan.spouseBirthYear : undefined;

    const milestonesReached: string[] = [];
    if (primaryAge === plan.retirementAge) milestonesReached.push('Primary Target Retirement Age');
    if (spouseAge !== undefined && plan.spouseRetirementAge && spouseAge === plan.spouseRetirementAge) {
      milestonesReached.push(`${plan.spouseName || 'Spouse'} Target Retirement Age`);
    }

    // Additional Milestones
    if (primaryAge === plan.retirementAge && primaryAge < 65) milestonesReached.push(`ACA Premium Tax Credit Subsidy Window Begins (Age ${primaryAge})`);
    if (primaryAge === 50) milestonesReached.push('Catch-up Contribution Limits Unlocked (Age 50)');
    if (primaryAge === 55) milestonesReached.push('Rule of 55 Access & HSA Catch-up Unlocked (Age 55)');
    if (primaryAge === 60) milestonesReached.push('Penalty-Free Retirement Access (Age 59½)');
    if (primaryAge === 62) milestonesReached.push('Early Social Security Eligibility (Age 62)');
    if (primaryAge === 63) milestonesReached.push('Medicare IRMAA 2-Year MAGI Lookback Window Begins (Age 63)');
    if (primaryAge === 65) milestonesReached.push('Medicare Eligibility & ACA Transition (Age 65)');
    if (primaryAge === 67) milestonesReached.push('Full Social Security Retirement Age (Age 67)');
    if (primaryAge === 70) milestonesReached.push('Maximum Social Security Benefit Age (Age 70)');
    const rmdStartAge = (primaryBirthYear >= 1960) ? 75 : (rules.secureActRules?.rmdAge || 73);
    if (primaryAge === rmdStartAge) milestonesReached.push(`Mandatory RMD Start Age (${rmdStartAge})`);

    const inflationRate = (plan.settings?.fixedInflationRate ?? 3.0) / 100;
    const compoundInflation = Math.pow(1 + inflationRate, yearOffset);

    // 0. Check IRMAA surcharges triggered from 2 years prior (age 65+)
    const irmaaSurchargeAnnual = primaryAge >= 65 ? irmaaSurchargeQueue[simYear] || 0 : 0;

    // 1. Income Calculation — primary/spouse salary from plan-level fields, events for other income
    const isPrimaryWorking = primaryAge < plan.retirementAge;
    const isSpouseWorking = isMfj && spouseAge !== undefined && spouseAge < (plan.spouseRetirementAge || plan.retirementAge);

    const adjustedPrimarySalary = isPrimaryWorking
      ? getYearSalary(plan.primarySalary || 0, plan.primarySalaryYear || currentYear, plan.primarySalaryRaisePct || 0, plan.primarySalaryOverrides, simYear)
      : 0;
    const adjustedSpouseSalary = isSpouseWorking
      ? getYearSalary(plan.spouseSalary || 0, plan.spouseSalaryYear || currentYear, plan.spouseSalaryRaisePct || 0, plan.spouseSalaryOverrides, simYear)
      : 0;

    let salaryIncome = adjustedPrimarySalary + adjustedSpouseSalary;
    let primarySalaryIncome = adjustedPrimarySalary;
    let spouseSalaryIncome = adjustedSpouseSalary;
    let primarySsIncome = 0;
    let spouseSsIncome = 0;
    let pensionIncome = 0;
    let otherIncome = 0;

    for (const ev of plan.events) {
      if (ev.category !== 'income') continue;
      if (ev.type === 'salary') continue; // Primary/spouse salary comes from plan-level fields
      if (!isEventActive(ev, simYear, primaryAge, plan.retirementAge, spouseAge, plan.spouseRetirementAge, yearOffset)) continue;

      const baseAmt = ev.amount * (ev.frequency === 'monthly' ? 12 : 1);
      const growthMult = Math.pow(1 + ev.growthRate / 100, yearOffset);
      const inflMult = ev.adjustForInflation ? compoundInflation : 1;
      let val = baseAmt * growthMult * inflMult;
      if (ev.growthCap && val > ev.growthCap) val = ev.growthCap;

      if (ev.type === 'pension') pensionIncome += val;
      else if (ev.type === 'social_security') {
        if (ev.owner === 'spouse') spouseSsIncome += val;
        else primarySsIncome += val;
      } else otherIncome += val;
    }

    // Dynamic Social Security Start Age Overrides if configured in Plan
    if (plan.primarySsMonthlyAmount && primaryAge >= (plan.primarySsStartAge || 67)) {
      const baseMonthly = plan.primarySsMonthlyAmount;
      const startAgeOpt = plan.primarySsStartAge || 67;
      const claimingMult = getSsClaimingMultiplier(startAgeOpt, rules);
      primarySsIncome = baseMonthly * 12 * claimingMult * compoundInflation;
    }

    if (isMfj && plan.spouseSsMonthlyAmount && spouseAge !== undefined && spouseAge >= (plan.spouseSsStartAge || 67)) {
      const spouseMonthly = plan.spouseSsMonthlyAmount;
      const spouseStartOpt = plan.spouseSsStartAge || 67;
      let spouseMult = getSsClaimingMultiplier(spouseStartOpt, rules);

      if (plan.enableSpousalSsBenefit !== false && plan.primarySsMonthlyAmount) {
        const halfPrimary = plan.primarySsMonthlyAmount * 0.5;
        if (halfPrimary > spouseMonthly) {
          spouseSsIncome = halfPrimary * 12 * spouseMult * compoundInflation;
        } else {
          spouseSsIncome = spouseMonthly * 12 * spouseMult * compoundInflation;
        }
      } else {
        spouseSsIncome = spouseMonthly * 12 * spouseMult * compoundInflation;
      }
    }

    const totalSsIncome = primarySsIncome + spouseSsIncome;
    const grossIncome = salaryIncome + pensionIncome + totalSsIncome + otherIncome;

    // 2. Expense Events Calculation
    let livingExpenses = irmaaSurchargeAnnual;
    for (const ev of plan.events) {
      if (ev.category !== 'expense') continue;
      if (!isEventActive(ev, simYear, primaryAge, plan.retirementAge, spouseAge, plan.spouseRetirementAge, yearOffset)) continue;
      const baseAmt = ev.amount * (ev.frequency === 'monthly' ? 12 : 1);
      const growthMult = Math.pow(1 + ev.growthRate / 100, yearOffset);
      const inflMult = ev.adjustForInflation ? compoundInflation : 1;
      let val = baseAmt * growthMult * inflMult;
      if (ev.growthCap && val > ev.growthCap) val = ev.growthCap;
      livingExpenses += val;
    }

    // Debt Payments (amortization)
    let debtPayments = 0;
    for (const liabId in liabilitiesState) {
      const liab = liabilitiesState[liabId];
      if (liab.balance > 0) {
        const annualInterest = liab.balance * (liab.interestRate / 100);
        const annualPay = liab.monthlyPayment * 12;
        const pay = Math.min(liab.balance + annualInterest, annualPay);
        const principalPaid = Math.max(0, pay - annualInterest);
        debtPayments += pay;
        liab.balance = Math.max(0, liab.balance - principalPaid);
      }
    }

    const totalExpenses = livingExpenses + debtPayments;

    // Helper to get applicable salary base for a flow (Primary vs Spouse vs Combined)
    const getFlowSalaryBase = (flow: EngineFlow, targetAcc: EngineAccount) => {
      const source = flow.salarySource || (targetAcc.owner === 'spouse' ? 'spouse' : targetAcc.owner === 'primary' ? 'primary' : 'combined');
      if (source === 'spouse') {
        if (adjustedSpouseSalary > 0) return adjustedSpouseSalary;
        if (adjustedPrimarySalary > 0) return adjustedPrimarySalary;
        return salaryIncome > 0 ? salaryIncome : grossIncome;
      }
      if (source === 'primary') {
        if (adjustedPrimarySalary > 0) return adjustedPrimarySalary;
        if (adjustedSpouseSalary > 0) return adjustedSpouseSalary;
        return salaryIncome > 0 ? salaryIncome : grossIncome;
      }
      const combined = adjustedPrimarySalary + adjustedSpouseSalary;
      if (combined > 0) return combined;
      return salaryIncome > 0 ? salaryIncome : grossIncome;
    };

    // Helper to get salary base for per-account contributions
    const getAccountSalaryBase = (acc: EngineAccount) => {
      const source = acc.contributionSalarySource || (acc.owner === 'spouse' ? 'spouse' : acc.owner === 'joint' || acc.owner === 'combined' ? 'combined' : 'primary');
      if (source === 'spouse') {
        if (adjustedSpouseSalary > 0) return adjustedSpouseSalary;
        if (adjustedPrimarySalary > 0) return adjustedPrimarySalary;
        return salaryIncome > 0 ? salaryIncome : grossIncome;
      }
      if (source === 'combined') {
        const combined = adjustedPrimarySalary + adjustedSpouseSalary;
        if (combined > 0) return combined;
        return salaryIncome > 0 ? salaryIncome : grossIncome;
      }
      if (adjustedPrimarySalary > 0) return adjustedPrimarySalary;
      if (adjustedSpouseSalary > 0) return adjustedSpouseSalary;
      return salaryIncome > 0 ? salaryIncome : grossIncome;
    };

    // Helper to get match target account (redirects Roth 401k employer match to Traditional 401k)
    const getMatchTarget = (origAcc: EngineAccount, targetAcc: EngineAccount): EngineAccount => {
      if (targetAcc.type !== 'roth_401k') return targetAcc;
      const tradId = `${origAcc.id}_trad`;
      if (accountsState[tradId]) return accountsState[tradId];
      const existingTrad = Object.values(accountsState).find(a => a.type === 'traditional_401k' && a.owner === targetAcc.owner);
      if (existingTrad) return existingTrad;
      accountsState[tradId] = {
        id: tradId,
        name: `${origAcc.name} (Pre-Tax Employer Match)`,
        type: 'traditional_401k',
        owner: targetAcc.owner || 'primary',
        balance: 0,
        costBasis: 0,
        expectedGrowthRate: targetAcc.expectedGrowthRate,
        dividendYield: targetAcc.dividendYield,
        reinvestDividends: targetAcc.reinvestDividends,
        qualifiedDividendRatio: targetAcc.qualifiedDividendRatio,
      };
      return accountsState[tradId];
    };

    // Helper to get statutory contribution cap per owner & account type
    const getOwnerCap = (owner: string, accType: string) => {
      const ownerAge = owner === 'spouse' && spouseAge !== undefined ? spouseAge : primaryAge;
      const ownerCatchUp50 = ownerAge >= 50;
      const ownerCatchUp55 = ownerAge >= 55;
      const t = (accType || '').toLowerCase();

      if (t.includes('401k') || t.includes('403b') || t.includes('sep') || t.includes('simple')) {
        const base = rules.contributionLimits?.k401 ?? 23500;
        const catchup = ownerCatchUp50 ? (rules.contributionLimits?.k401CatchUp ?? 7500) : 0;
        return base + catchup;
      }
      if (t === 'hsa') {
        const hsaBase = (isMfj || owner === 'joint')
          ? (rules.contributionLimits?.hsaFamily ?? 8550)
          : (rules.contributionLimits?.hsaSingle ?? 4300);
        const catchup = ownerCatchUp55 ? (rules.contributionLimits?.hsaCatchUp ?? 1000) : 0;
        return hsaBase + catchup;
      }
      if (t.includes('ira')) {
        const base = rules.contributionLimits?.ira ?? 7000;
        const catchup = ownerCatchUp50 ? (rules.contributionLimits?.iraCatchUp ?? 1000) : 0;
        return base + catchup;
      }
      return Infinity;
    };

    // Track cumulative annual contributions per owner across tax-advantaged categories
    const owner401kContribs: Record<string, number> = { primary: 0, spouse: 0, joint: 0 };
    const ownerIraContribs: Record<string, number> = { primary: 0, spouse: 0, joint: 0 };
    let totalHsaContrib = 0;

    // 3. Pre-Tax Savings Contributions (Traditional 401k, Traditional IRA, HSA)
    let surplusSaved = 0;
    let totalPreTaxContrib = 0;
    let hsaPreTaxContrib = 0;
    const sortedFlows = [...plan.flows].sort((a, b) => a.rank - b.rank);

    const isPrimaryAccumulation = primaryAge < plan.retirementAge;
    const isSpouseAccumulation = isMfj && spouseAge !== undefined && spouseAge < (plan.spouseRetirementAge || plan.retirementAge);
    const isAccumulation = isPrimaryAccumulation || isSpouseAccumulation;

    // Determine if we use per-account contributions or legacy flows
    const hasAccountContributions = plan.accounts.some(a => a.contributionMode && a.contributionMode !== 'none');

    if (isAccumulation && (salaryIncome > 0 || hasAccountContributions)) {
      if (hasAccountContributions) {
        // ── Per-Account Contribution Mode (new) ──
        // Phase 1: Pre-tax accounts
        for (const origAcc of plan.accounts) {
          if (!origAcc.contributionMode || origAcc.contributionMode === 'none') continue;
          let targetAcc = accountsState[origAcc.id];
          if (!targetAcc) {
            targetAcc = accountsState[`${origAcc.id}_trad`] || accountsState[`${origAcc.id}_roth`];
          }
          if (!targetAcc) continue;

          const accOwnerStillWorking = targetAcc.owner === 'spouse' ? isSpouseAccumulation : isPrimaryAccumulation;
          if (!accOwnerStillWorking) continue;

          const cat = getAccountCategory(targetAcc.type);
          const isPreTax = cat === 'taxDeferred' || targetAcc.type === 'hsa';
          if (!isPreTax) continue;

          const owner = targetAcc.owner || 'primary';
          const salaryBase = getAccountSalaryBase(origAcc);
          const isSplit = origAcc.rothPercentage !== undefined && origAcc.rothPercentage > 0 && origAcc.rothPercentage < 100;
          const tradShare = isSplit ? (100 - origAcc.rothPercentage!) / 100 : 1;

          let requestedAlloc = 0;
          const contribVal = Number(origAcc.contributionValue || 0);
          if (origAcc.contributionMode === 'percentage' && contribVal > 0) {
            const pct = contribVal <= 1 ? contribVal * 100 : contribVal;
            requestedAlloc = salaryBase * (pct / 100) * tradShare;
          } else if (origAcc.contributionMode === 'fixed_amount' && contribVal > 0) {
            requestedAlloc = contribVal * compoundInflation * tradShare;
          } else if (origAcc.contributionMode === 'maximize') {
            if (targetAcc.type.includes('401k')) {
              const remCap = Math.max(0, getOwnerCap(owner, targetAcc.type) - (owner401kContribs[owner] || 0));
              requestedAlloc = remCap * tradShare;
            } else if (targetAcc.type === 'hsa') {
              const remCap = Math.max(0, getOwnerCap(owner, 'hsa') - totalHsaContrib);
              requestedAlloc = remCap;
            } else {
              const remCap = Math.max(0, getOwnerCap(owner, targetAcc.type) - (ownerIraContribs[owner] || 0));
              requestedAlloc = remCap * tradShare;
            }
          }

          // Enforce per-owner category limits
          let capLimit = Infinity;
          if (targetAcc.type.includes('401k')) {
            capLimit = Math.max(0, getOwnerCap(owner, targetAcc.type) - (owner401kContribs[owner] || 0));
          } else if (targetAcc.type === 'hsa') {
            capLimit = Math.max(0, getOwnerCap(owner, 'hsa') - totalHsaContrib);
          } else if (targetAcc.type.includes('ira')) {
            capLimit = Math.max(0, getOwnerCap(owner, targetAcc.type) - (ownerIraContribs[owner] || 0));
          }

          const maxSalaryAvail = Math.max(0, salaryBase - totalPreTaxContrib);
          const alloc = Math.min(maxSalaryAvail, Math.min(capLimit, requestedAlloc));
          if (alloc > 0) {
            targetAcc.balance += alloc;
            totalPreTaxContrib += alloc;
            if (targetAcc.type.includes('401k')) owner401kContribs[owner] = (owner401kContribs[owner] || 0) + alloc;
            else if (targetAcc.type.includes('ira')) ownerIraContribs[owner] = (ownerIraContribs[owner] || 0) + alloc;
            else if (targetAcc.type === 'hsa') {
              hsaPreTaxContrib += alloc;
              totalHsaContrib += alloc;
            }
            surplusSaved += alloc;

            // Company match (pre-tax employer match goes to Traditional 401(k))
            if (origAcc.companyMatchRate != null && origAcc.companyMatchLimit != null) {
              const matchLimitPct = origAcc.companyMatchLimit <= 1 ? origAcc.companyMatchLimit * 100 : origAcc.companyMatchLimit;
              const matchableContrib = Math.min(alloc, salaryBase * (matchLimitPct / 100));
              const matchAmount = matchableContrib * origAcc.companyMatchRate;
              if (matchAmount > 0) {
                const matchTarget = getMatchTarget(origAcc, targetAcc);
                matchTarget.balance += matchAmount;
                surplusSaved += matchAmount;
              }
            }
          }
        }
      } else if (salaryIncome > 0) {
        // ── Legacy Flow Waterfall Mode (backward compat) ──
        for (const flow of sortedFlows) {
          let targetAcc = accountsState[flow.targetAccountId];
          if (!targetAcc) {
            targetAcc = accountsState[`${flow.targetAccountId}_trad`] || accountsState[`${flow.targetAccountId}_roth`];
          }
          if (!targetAcc) continue;

          const accOwnerStillWorking = targetAcc.owner === 'spouse' ? isSpouseAccumulation : isPrimaryAccumulation;
          if (!accOwnerStillWorking) continue;

          const isPreTax = targetAcc.type === 'traditional_401k' || targetAcc.type === 'traditional_ira' || targetAcc.type === 'hsa';
          if (!isPreTax) continue;

          const owner = targetAcc.owner || 'primary';
          const salaryBase = getFlowSalaryBase(flow, targetAcc);

          let requestedAlloc = 0;
          if (flow.ruleType === 'percentage' && flow.ruleValue) {
            const pct = flow.ruleValue <= 1 ? flow.ruleValue * 100 : flow.ruleValue;
            requestedAlloc = salaryBase * (pct / 100);
          } else if (flow.ruleType === 'fixed_amount' && flow.ruleValue) {
            requestedAlloc = flow.ruleValue * compoundInflation;
          } else if (flow.ruleType === 'save_maintain') {
            const targetBal = (flow.ruleValue || 0) * compoundInflation;
            requestedAlloc = Math.max(0, targetBal - targetAcc.balance);
          } else if (flow.ruleType === 'maximize') {
            if (targetAcc.type.includes('401k')) {
              requestedAlloc = Math.max(0, getOwnerCap(owner, targetAcc.type) - (owner401kContribs[owner] || 0));
            } else if (targetAcc.type === 'hsa') {
              requestedAlloc = Math.max(0, getOwnerCap(owner, 'hsa') - totalHsaContrib);
            } else {
              requestedAlloc = Math.max(0, getOwnerCap(owner, targetAcc.type) - (ownerIraContribs[owner] || 0));
            }
          }

          let capLimit = Infinity;
          if (targetAcc.type.includes('401k')) {
            capLimit = Math.max(0, getOwnerCap(owner, targetAcc.type) - (owner401kContribs[owner] || 0));
          } else if (targetAcc.type === 'hsa') {
            capLimit = Math.max(0, getOwnerCap(owner, 'hsa') - totalHsaContrib);
          } else if (targetAcc.type.includes('ira')) {
            capLimit = Math.max(0, getOwnerCap(owner, targetAcc.type) - (ownerIraContribs[owner] || 0));
          }

          const maxSalaryAvail = Math.max(0, salaryBase - totalPreTaxContrib);
          const alloc = Math.min(maxSalaryAvail, Math.min(capLimit, requestedAlloc));
          if (alloc > 0) {
            targetAcc.balance += alloc;
            totalPreTaxContrib += alloc;
            if (targetAcc.type.includes('401k')) owner401kContribs[owner] = (owner401kContribs[owner] || 0) + alloc;
            else if (targetAcc.type.includes('ira')) ownerIraContribs[owner] = (ownerIraContribs[owner] || 0) + alloc;
            else if (targetAcc.type === 'hsa') {
              hsaPreTaxContrib += alloc;
              totalHsaContrib += alloc;
            }
            surplusSaved += alloc;

            if (flow.matchRate != null && flow.matchLimit != null) {
              const matchableContrib = Math.min(alloc, salaryBase * (flow.matchLimit / 100));
              const matchAmount = matchableContrib * flow.matchRate;
              let matchTarget = flow.matchAccountId ? (accountsState[flow.matchAccountId] || accountsState[`${flow.matchAccountId}_trad`]) : targetAcc;
              if (matchTarget && matchAmount > 0) {
                matchTarget.balance += matchAmount;
                surplusSaved += matchAmount;
              }
            }
          }
        }
      }
    }

    // 4. Tax Estimation (MFJ & Pre-Tax Deduction Aware)
    // Federal & state ordinary income tax is reduced by total pre-tax contributions (401k, IRA, HSA)
    const taxableSalary = Math.max(0, salaryIncome - totalPreTaxContrib);
    // Under IRC Section 3121, FICA tax (Social Security & Medicare) is reduced ONLY by HSA (cafeteria plan) contributions, NOT 401k/IRA contributions
    const ficaTaxableSalary = Math.max(0, salaryIncome - hsaPreTaxContrib);

    const stdDeductionBase = isHoH
      ? parseFloat(rules.standardDeductionHoH || '22500')
      : (isMfj
          ? parseFloat(rules.standardDeductionMfj || '30000')
          : (isMfs
              ? parseFloat(rules.standardDeductionMfs || '15000')
              : parseFloat(rules.standardDeductionSingle || rules.standardDeduction || '15000')));
    let stdDeduction = stdDeductionBase * compoundInflation;
    const age65Boost = rules.additionalStdDeduction65Plus;
    if (age65Boost) {
      if (primaryAge >= 65) {
        stdDeduction += (isMfj ? age65Boost.marriedPerPerson : age65Boost.singleOrHoH) * compoundInflation;
      }
      if (isMfj && spouseAge !== undefined && spouseAge >= 65) {
        stdDeduction += age65Boost.marriedPerPerson * compoundInflation;
      }
    }

    const ficaRules = rules.ficaRules || DEFAULT_2026_RULES.ficaRules;
    const ssWageBase = (ficaRules.ssWageBaseCap ?? 176100) * compoundInflation;
    const ssTaxableSalary = Math.min(ficaTaxableSalary, ssWageBase);
    const ssFica = ssTaxableSalary * (ficaRules.ssTaxRate ?? 0.062);
    const medicareFica = ficaTaxableSalary * (ficaRules.medicareTaxRate ?? 0.0145);
    const addMedicareThresh = isMfj
      ? (ficaRules.addMedicareThresholdMfj ?? 250000)
      : (isMfs ? (ficaRules.addMedicareThresholdMfs ?? 125000) : (ficaRules.addMedicareThresholdSingle ?? 200000));
    const addMedicareFica = Math.max(0, ficaTaxableSalary - addMedicareThresh) * (ficaRules.addMedicareTaxRate ?? 0.009);
    const ficaTax = ssFica + medicareFica + addMedicareFica;

    const provisionalIncome = taxableSalary + pensionIncome + otherIncome + totalSsIncome * 0.5;
    const ssThresholds = rules.ssTaxationThresholds || DEFAULT_2026_RULES.ssTaxationThresholds;
    const ssSingleTiers = ssThresholds.single || { tier1: 25000, tier2: 34000 };
    const ssJointTiers = ssThresholds.married_joint || { tier1: 32000, tier2: 44000 };
    const ssTier1 = isMfs ? 0 : (isMfj ? ssJointTiers.tier1 : ssSingleTiers.tier1);
    const ssTier2 = isMfs ? 0 : (isMfj ? ssJointTiers.tier2 : ssSingleTiers.tier2);

    let taxableSs = 0;
    if (isMfs) {
      taxableSs = Math.min(0.85 * totalSsIncome, 0.85 * provisionalIncome);
    } else if (provisionalIncome > ssTier2) {
      taxableSs = Math.min(0.85 * totalSsIncome, 0.50 * (ssTier2 - ssTier1) + 0.85 * (provisionalIncome - ssTier2));
    } else if (provisionalIncome > ssTier1) {
      taxableSs = Math.min(0.50 * totalSsIncome, 0.50 * (provisionalIncome - ssTier1));
    }

    const taxableOrdinaryIncome = Math.max(0, taxableSalary + pensionIncome + otherIncome + taxableSs - stdDeduction);

    let ordinaryTax = 0;
    const bracketMult = isMfj ? 2 : 1;
    const activeOrdinaryBrackets = (isHoH && rules.headOfHouseholdBrackets) ? rules.headOfHouseholdBrackets : rules.ordinaryTaxBrackets;

    for (let i = 0; i < activeOrdinaryBrackets.length; i++) {
      const b = activeOrdinaryBrackets[i];
      const thresh = b.threshold * bracketMult * compoundInflation;
      if (taxableOrdinaryIncome > thresh) {
        const nextB = activeOrdinaryBrackets[i + 1];
        const nextThresh = nextB ? nextB.threshold * bracketMult * compoundInflation : Infinity;
        const taxableChunk = Math.min(taxableOrdinaryIncome - thresh, nextThresh - thresh);
        ordinaryTax += taxableChunk * b.rate;
      }
    }

    let capGainsTax = 0;
    let niitTax = 0;
    let earlyPenaltyTax = 0;
    const stateTaxRate = (plan.settings?.incomeTaxModifier || 0) / 100;
    let stateTax = taxableOrdinaryIncome * stateTaxRate;
    let taxesPaid = ficaTax + ordinaryTax + capGainsTax + stateTax;
    const initialTaxesPaid = taxesPaid;
    let effectiveTaxRate = grossIncome > 0 ? (taxesPaid / grossIncome) * 100 : 0;

    const netCashFlow = grossIncome - totalExpenses - taxesPaid - totalPreTaxContrib;

    let deficitWithdrawn = 0;
    let discretionaryDeficitWithdrawn = 0;
    let rmdMandatoryDrawdown = 0;
    let shortfall = 0;
    const accountDrawdowns: AccountDrawdownDetail[] = [];
    const drawdownsByType = { cash: 0, taxable: 0, traditional: 0, roth: 0, hsa: 0 };
    const earlyWithdrawalWarnings: string[] = [];
    const earlyPenaltyDetails: { age: number; accountId: string; accountName: string; accountType: string; amount: number; penalty: number }[] = [];
    let rothConversionAmount = 0;
    let totalTaxableGains = 0;
    let totalNonQualifiedRothEarnings = 0;

    // Dynamic Penalty Rules from DB
    const penaltyRules = rules.earlyPenaltyRules || DEFAULT_2026_RULES.earlyPenaltyRules;
    const ira401kPenAge = penaltyRules.ira401kPenaltyAge ?? 59.5;
    const ruleOf55PenAge = penaltyRules.ruleOf55Age ?? 55;
    const hsaPenAge = penaltyRules.hsaPenaltyAge ?? 65;
    const ira401kPenRate = penaltyRules.ira401kPenaltyRate ?? 0.10;
    const hsaPenRate = penaltyRules.hsaPenaltyRate ?? 0.20;

    // Helper: check if an account would incur an early withdrawal penalty
    const wouldIncurPenalty = (acc: EngineAccount): boolean => {
      const accOwnerAge = acc.owner === 'spouse' && spouseAge !== undefined ? spouseAge : primaryAge;
      const accOwnerRetirementAge = acc.owner === 'spouse' && plan.spouseRetirementAge ? plan.spouseRetirementAge : plan.retirementAge;
      const cat = getAccountCategory(acc.type);
      const is401k = acc.type.includes('401k') || acc.type.includes('403b');

      if (cat === 'taxDeferred') {
        const isRuleOf55 = is401k && accOwnerAge >= ruleOf55PenAge && accOwnerRetirementAge >= ruleOf55PenAge;
        return accOwnerAge < ira401kPenAge && !isRuleOf55;
      }
      if (cat === 'taxFree') {
        return accOwnerAge < ira401kPenAge && acc.balance > (acc.costBasis || 0);
      }
      if (cat === 'hsa') return accOwnerAge < hsaPenAge;
      return false;
    };

    // Helper for withdrawing from an account with penalty tracking
    const withdrawFromAcc = (acc: EngineAccount, amt: number, allowPenalty: boolean = true) => {
      let maxAvail = acc.balance;
      const accOwnerAge = acc.owner === 'spouse' && spouseAge !== undefined ? spouseAge : primaryAge;
      const accOwnerRetirementAge = acc.owner === 'spouse' && plan.spouseRetirementAge ? plan.spouseRetirementAge : plan.retirementAge;
      const cat = getAccountCategory(acc.type);
      const is401k = acc.type.includes('401k') || acc.type.includes('403b');

      if (!allowPenalty) {
        if (cat === 'taxDeferred') {
          const isRuleOf55 = is401k && accOwnerAge >= ruleOf55PenAge && accOwnerRetirementAge >= ruleOf55PenAge;
          if (accOwnerAge < ira401kPenAge && !isRuleOf55) {
            maxAvail = 0;
          }
        } else if (cat === 'taxFree' && accOwnerAge < ira401kPenAge) {
          maxAvail = Math.min(acc.balance, Math.max(0, acc.costBasis || 0));
        } else if (cat === 'hsa' && accOwnerAge < hsaPenAge) {
          maxAvail = 0;
        }
      }

      const actual = Math.min(maxAvail, amt);
      if (actual <= 0) return 0;

      // Early Withdrawal Penalty check for Traditional accounts before ira401kPenAge
      if (cat === 'taxDeferred') {
        const isRuleOf55 = is401k && accOwnerAge >= ruleOf55PenAge && accOwnerRetirementAge >= ruleOf55PenAge;
        if (accOwnerAge < ira401kPenAge && !isRuleOf55) {
          const penalty = actual * ira401kPenRate;
          earlyPenaltyTax += penalty;
          earlyWithdrawalWarnings.push(
            `Age ${accOwnerAge}: Withdrawal of $${Math.round(actual).toLocaleString()} from ${acc.name} incurred a ${(ira401kPenRate * 100).toFixed(0)}% early withdrawal penalty ($${Math.round(penalty).toLocaleString()}).`
          );
          earlyPenaltyDetails.push({ age: accOwnerAge, accountId: acc.id, accountName: acc.name, accountType: acc.type, amount: actual, penalty });
        }
      }

      // Roth IRA / Roth 401(k) Ordering Rules
      if (cat === 'taxFree' && accOwnerAge < ira401kPenAge) {
        const availableBasis = Math.max(0, acc.costBasis || 0);
        if (actual > availableBasis) {
          const earningsWithdrawn = actual - availableBasis;
          const penalty = earningsWithdrawn * ira401kPenRate;
          earlyPenaltyTax += penalty;
          totalNonQualifiedRothEarnings += earningsWithdrawn;
          earlyWithdrawalWarnings.push(
            `Age ${accOwnerAge}: Non-qualified Roth earnings withdrawal of $${Math.round(earningsWithdrawn).toLocaleString()} from ${acc.name} incurred a ${(ira401kPenRate * 100).toFixed(0)}% early penalty ($${Math.round(penalty).toLocaleString()}).`
          );
          earlyPenaltyDetails.push({ age: accOwnerAge, accountId: acc.id, accountName: acc.name, accountType: acc.type, amount: earningsWithdrawn, penalty });
        }
        acc.costBasis = Math.max(0, availableBasis - actual);
      } else if (acc.costBasis && acc.costBasis > 0) {
        acc.costBasis = Math.max(0, acc.costBasis - actual);
      }

      // Penalty for non-medical HSA withdrawals before hsaPenAge
      if (cat === 'hsa' && accOwnerAge < hsaPenAge) {
        const penalty = actual * hsaPenRate;
        earlyPenaltyTax += penalty;
        earlyWithdrawalWarnings.push(
          `Age ${accOwnerAge}: Non-qualified withdrawal of $${Math.round(actual).toLocaleString()} from HSA incurred a ${(hsaPenRate * 100).toFixed(0)}% early penalty ($${Math.round(penalty).toLocaleString()}).`
        );
        earlyPenaltyDetails.push({ age: accOwnerAge, accountId: acc.id, accountName: acc.name, accountType: acc.type, amount: actual, penalty });
      }

      // Track capital gains for taxable account withdrawals
      if (cat === 'taxable' && acc.balance > 0) {
        const costBasis = Math.max(0, acc.costBasis || 0);
        const gainRatio = Math.max(0, (acc.balance - costBasis) / acc.balance);
        totalTaxableGains += actual * gainRatio;
        acc.costBasis = Math.max(0, costBasis * (1 - actual / acc.balance));
      }

      acc.balance -= actual;
      accountDrawdowns.push({
        accountId: acc.id,
        accountName: acc.name,
        accountType: acc.type,
        amount: actual,
      });
      if (acc.type === 'cash') drawdownsByType.cash += actual;
      else if (cat === 'taxable') drawdownsByType.taxable += actual;
      else if (acc.type === 'traditional_ira' || acc.type === 'traditional_401k' || cat === 'taxDeferred') drawdownsByType.traditional += actual;
      else if (acc.type === 'roth_ira' || acc.type === 'roth_401k' || cat === 'taxFree') drawdownsByType.roth += actual;
      else if (acc.type === 'hsa' || cat === 'hsa') drawdownsByType.hsa += actual;
      return actual;
    };

    // 5. Post-Tax Savings Routing or Deficit Drawdown
    if (netCashFlow > 0) {
      let surplus = netCashFlow;

      if (isAccumulation) {
        if (hasAccountContributions) {
          // ── Per-Account Contribution Mode (new): Post-tax accounts ──
          for (const origAcc of plan.accounts) {
            if (surplus <= 0) break;
            if (!origAcc.contributionMode || origAcc.contributionMode === 'none') {
              continue;
            }

            let targetAcc = accountsState[origAcc.id];
            if (!targetAcc) {
              targetAcc = accountsState[`${origAcc.id}_roth`] || accountsState[`${origAcc.id}_trad`];
            }
            if (!targetAcc) continue;

            const accOwnerStillWorking = targetAcc.owner === 'spouse' ? isSpouseAccumulation : isPrimaryAccumulation;
            if (!accOwnerStillWorking) continue;

            const cat = getAccountCategory(targetAcc.type);
            const isPreTax = cat === 'taxDeferred' || targetAcc.type === 'hsa';
            if (isPreTax) continue; // Already handled in Phase 1

            const owner = targetAcc.owner || 'primary';
            const salaryBase = getAccountSalaryBase(origAcc);
            const isSplit = origAcc.rothPercentage !== undefined && origAcc.rothPercentage > 0 && origAcc.rothPercentage < 100;
            const rothShare = isSplit ? origAcc.rothPercentage! / 100 : 1;

            let requestedAlloc = 0;
            const contribVal = Number(origAcc.contributionValue || 0);
            if (origAcc.contributionMode === 'percentage' && contribVal > 0) {
              const pct = contribVal <= 1 ? contribVal * 100 : contribVal;
              requestedAlloc = salaryBase * (pct / 100) * rothShare;
            } else if (origAcc.contributionMode === 'fixed_amount' && contribVal > 0) {
              requestedAlloc = contribVal * compoundInflation * rothShare;
            } else if (origAcc.contributionMode === 'maximize') {
              if (targetAcc.type.includes('401k')) {
                requestedAlloc = Math.max(0, getOwnerCap(owner, targetAcc.type) - (owner401kContribs[owner] || 0));
              } else if (targetAcc.type.includes('ira')) {
                requestedAlloc = Math.max(0, getOwnerCap(owner, targetAcc.type) - (ownerIraContribs[owner] || 0));
              } else {
                requestedAlloc = surplus;
              }
            } else {
              continue;
            }

            let capLimit = surplus;
            if (targetAcc.type.includes('401k')) {
              capLimit = Math.min(surplus, Math.max(0, getOwnerCap(owner, targetAcc.type) - (owner401kContribs[owner] || 0)));
            } else if (targetAcc.type.includes('ira')) {
              capLimit = Math.min(surplus, Math.max(0, getOwnerCap(owner, targetAcc.type) - (ownerIraContribs[owner] || 0)));
            }

            const alloc = Math.min(surplus, Math.min(capLimit, requestedAlloc));
            if (alloc > 0) {
              targetAcc.balance += alloc;
              if (targetAcc.type.includes('401k')) owner401kContribs[owner] = (owner401kContribs[owner] || 0) + alloc;
              else if (targetAcc.type.includes('ira')) ownerIraContribs[owner] = (ownerIraContribs[owner] || 0) + alloc;

              if (cat === 'taxable' || cat === 'taxFree') {
                targetAcc.costBasis = (targetAcc.costBasis || 0) + alloc;
              }
              surplus -= alloc;
              surplusSaved += alloc;

              if (origAcc.companyMatchRate != null && origAcc.companyMatchLimit != null) {
                const matchLimitPct = origAcc.companyMatchLimit <= 1 ? origAcc.companyMatchLimit * 100 : origAcc.companyMatchLimit;
                const matchableContrib = Math.min(alloc, salaryBase * (matchLimitPct / 100));
                const matchAmount = matchableContrib * origAcc.companyMatchRate;
                if (matchAmount > 0) {
                  const matchTarget = getMatchTarget(origAcc, targetAcc);
                  matchTarget.balance += matchAmount;
                  const targetCat = getAccountCategory(matchTarget.type);
                  if (targetCat === 'taxable' || targetCat === 'taxFree') {
                    matchTarget.costBasis = (matchTarget.costBasis || 0) + matchAmount;
                  }
                  surplusSaved += matchAmount;
                }
              }
            }
          }

          // Sweep remaining surplus to designated surplus destination account
          if (surplus > 0) {
            const surplusAcc = plan.accounts.find(a => a.isSurplusDestination);
            if (surplusAcc) {
              let targetAcc = accountsState[surplusAcc.id];
              if (!targetAcc) {
                targetAcc = accountsState[`${surplusAcc.id}_roth`] || accountsState[`${surplusAcc.id}_trad`];
              }
              if (targetAcc) {
                targetAcc.balance += surplus;
                const targetCat = getAccountCategory(targetAcc.type);
                if (targetCat === 'taxable' || targetCat === 'taxFree') {
                  targetAcc.costBasis = (targetAcc.costBasis || 0) + surplus;
                }
                surplusSaved += surplus;
                surplus = 0;
              }
            }
          }
        } else {
          // ── Legacy Flow Waterfall Mode (backward compat): Post-tax ──
          for (const flow of sortedFlows) {
            if (surplus <= 0) break;
            let targetAcc = accountsState[flow.targetAccountId];
            if (!targetAcc) {
              targetAcc = accountsState[`${flow.targetAccountId}_roth`] || accountsState[`${flow.targetAccountId}_trad`];
            }
            if (!targetAcc) continue;

            const accOwnerStillWorking = targetAcc.owner === 'spouse' ? isSpouseAccumulation : isPrimaryAccumulation;
            if (!accOwnerStillWorking) continue;

            const isPreTax = targetAcc.type === 'traditional_401k' || targetAcc.type === 'traditional_ira' || targetAcc.type === 'hsa';
            if (isPreTax) continue;

            const owner = targetAcc.owner || 'primary';
            const salaryBase = getFlowSalaryBase(flow, targetAcc);
            let requestedAlloc = 0;
            if (flow.ruleType === 'percentage' && flow.ruleValue) {
              requestedAlloc = salaryBase * (flow.ruleValue / 100);
            } else if (flow.ruleType === 'fixed_amount' && flow.ruleValue) {
              requestedAlloc = flow.ruleValue * compoundInflation;
            } else if (flow.ruleType === 'save_maintain') {
              const targetBal = (flow.ruleValue || 0) * compoundInflation;
              requestedAlloc = Math.max(0, targetBal - targetAcc.balance);
            } else if (flow.ruleType === 'maximize') {
              if (targetAcc.type.includes('401k')) {
                requestedAlloc = Math.max(0, getOwnerCap(owner, targetAcc.type) - (owner401kContribs[owner] || 0));
              } else if (targetAcc.type.includes('ira')) {
                requestedAlloc = Math.max(0, getOwnerCap(owner, targetAcc.type) - (ownerIraContribs[owner] || 0));
              } else {
                requestedAlloc = surplus;
              }
            } else if (flow.ruleType === 'save_leftover') {
              requestedAlloc = surplus;
            }

            let capLimit = surplus;
            if (targetAcc.type.includes('401k')) {
              capLimit = Math.min(surplus, Math.max(0, getOwnerCap(owner, targetAcc.type) - (owner401kContribs[owner] || 0)));
            } else if (targetAcc.type.includes('ira')) {
              capLimit = Math.min(surplus, Math.max(0, getOwnerCap(owner, targetAcc.type) - (ownerIraContribs[owner] || 0)));
            }

            const alloc = Math.min(surplus, Math.min(capLimit, requestedAlloc));
            if (alloc > 0) {
              targetAcc.balance += alloc;
              if (targetAcc.type.includes('401k')) owner401kContribs[owner] = (owner401kContribs[owner] || 0) + alloc;
              else if (targetAcc.type.includes('ira')) ownerIraContribs[owner] = (ownerIraContribs[owner] || 0) + alloc;

              const targetCat = getAccountCategory(targetAcc.type);
              if (targetCat === 'taxable' || targetCat === 'taxFree') {
                targetAcc.costBasis = (targetAcc.costBasis || 0) + alloc;
              }
              surplus -= alloc;
              surplusSaved += alloc;
            }
          }
        }
      } else {
        // Distribution phase with surplus — invest in surplus destination or cash/taxable account
        if (surplus > 0) {
          const surplusAcc = plan.accounts.find(a => a.isSurplusDestination);
          let destAcc = surplusAcc ? (accountsState[surplusAcc.id] || accountsState[`${surplusAcc.id}_roth`] || accountsState[`${surplusAcc.id}_trad`]) : null;
          if (!destAcc) {
            destAcc = Object.values(accountsState).find(a => a.type === 'cash')
              || Object.values(accountsState).find(a => a.type === 'taxable');
          }
          if (destAcc) {
            destAcc.balance += surplus;
            const destCat = getAccountCategory(destAcc.type);
            if (destCat === 'taxable' || destCat === 'taxFree') {
              destAcc.costBasis = (destAcc.costBasis || 0) + surplus;
            }
            surplusSaved += surplus;
          }
        }
      }
    } else if (netCashFlow < 0) {
      let deficit = Math.abs(netCashFlow);
      deficitWithdrawn = deficit;
      discretionaryDeficitWithdrawn = deficit;

      const allowPenalty = plan.settings?.allowPenaltyWithdrawals !== false;
      const method = plan.withdrawalMethod || plan.settings?.withdrawalMethod || 'textbook';

      if (method === 'proportional') {
        // Prefer non-penalized accounts first; fall back to penalized only if deficit remains and allowed
        const safeAccs = Object.values(accountsState).filter((a) => a.balance > 0 && !wouldIncurPenalty(a));
        const penaltyAccs = allowPenalty ? Object.values(accountsState).filter((a) => a.balance > 0 && wouldIncurPenalty(a)) : [];
        const totalSafeBal = safeAccs.reduce((s, a) => s + a.balance, 0);

        let remDeficit = deficit;

        // First pass: proportional draw from non-penalized accounts
        if (totalSafeBal > 0) {
          for (const acc of safeAccs) {
            if (remDeficit <= 0) break;
            const propShare = (acc.balance / totalSafeBal) * deficit;
            const w = withdrawFromAcc(acc, propShare, allowPenalty);
            remDeficit -= w;
          }
          // Catch-up pass for rounding gaps
          for (const acc of safeAccs) {
            if (remDeficit <= 0) break;
            const w = withdrawFromAcc(acc, remDeficit, allowPenalty);
            remDeficit -= w;
          }
        }

        // Second pass: proportional from penalized accounts only if safe accounts couldn't cover deficit
        if (remDeficit > 0 && penaltyAccs.length > 0) {
          const totalPenaltyBal = penaltyAccs.reduce((s, a) => s + a.balance, 0);
          if (totalPenaltyBal > 0) {
            for (const acc of penaltyAccs) {
              if (remDeficit <= 0) break;
              const propShare = (acc.balance / totalPenaltyBal) * remDeficit;
              const w = withdrawFromAcc(acc, propShare, allowPenalty);
              remDeficit -= w;
            }
            for (const acc of penaltyAccs) {
              if (remDeficit <= 0) break;
              const w = withdrawFromAcc(acc, remDeficit, allowPenalty);
              remDeficit -= w;
            }
          }
        }

        if (remDeficit > 0) shortfall = remDeficit;
      } else if (method === 'tax_optimized') {
        const target12Bracket = rules.ordinaryTaxBrackets?.find((b: any) => Math.abs(b.rate - 0.12) < 0.01)
          || rules.ordinaryTaxBrackets?.[1]
          || { threshold: 48475 };
        const target12Limit = target12Bracket.threshold * (isMfj ? 2 : 1) * compoundInflation;
        const currentTaxable = taxableOrdinaryIncome;
        const bracketRoom = Math.max(0, target12Limit - currentTaxable);

        // Only fill 12% bracket with traditional accounts if allowed or non-penalized
        const tradAccs = Object.values(accountsState).filter(
          (a) => getAccountCategory(a.type) === 'taxDeferred' && a.balance > 0
        );
        const tradHasPenaltyRisk = tradAccs.some((a) => wouldIncurPenalty(a));

        if (bracketRoom > 0 && deficit > 0 && (!tradHasPenaltyRisk || allowPenalty)) {
          let tradNeeded = Math.min(deficit, bracketRoom);
          for (const acc of tradAccs) {
            if (tradNeeded <= 0) break;
            const w = withdrawFromAcc(acc, tradNeeded, allowPenalty);
            tradNeeded -= w;
            deficit -= w;
          }
        }

        if (deficit > 0) {
          const categoryPriority: Record<string, number> = {
            cash: 1,
            taxable: 2,
            taxFree: 3,
            hsa: 4,
            taxDeferred: 5,
          };
          const sortedAccs = Object.values(accountsState)
            .filter((a) => a.balance > 0 && getAccountCategory(a.type) !== 'taxDeferred')
            .sort((a, b) => (categoryPriority[getAccountCategory(a.type)] || 99) - (categoryPriority[getAccountCategory(b.type)] || 99));
          for (const acc of sortedAccs) {
            if (deficit <= 0) break;
            const w = withdrawFromAcc(acc, deficit, allowPenalty);
            deficit -= w;
          }
          if (deficit > 0) shortfall = deficit;
        }
      } else {
        const accountsList = Object.values(accountsState);
        const getDrawdownOrder = () => {
          if (method === 'custom_order' && plan.customWithdrawalOrder?.length) {
            return plan.customWithdrawalOrder.flatMap((id) => [
              accountsState[id],
              accountsState[`${id}_trad`],
              accountsState[`${id}_roth`],
            ]).filter((a): a is EngineAccount => Boolean(a));
          }
          const categoryOrder: Record<string, number> =
            method === 'tax_deferred_first'
              ? {
                  cash: 1,
                  taxDeferred: 2,
                  taxable: 3,
                  taxFree: 4,
                  hsa: 5,
                }
              : {
                  cash: 1,
                  taxable: 2,
                  taxDeferred: 3,
                  taxFree: 4,
                  hsa: 5,
                };
          return accountsList
            .sort((a, b) => (categoryOrder[getAccountCategory(a.type)] ?? 9) - (categoryOrder[getAccountCategory(b.type)] ?? 9));
        };

        const orderedAccounts = getDrawdownOrder();
        for (const acc of orderedAccounts) {
          if (deficit <= 0) break;
          if (acc.balance <= 0) continue;
          const w = withdrawFromAcc(acc, deficit, allowPenalty);
          deficit -= w;
        }
        if (deficit > 0) shortfall = deficit;
      }
    }

    // 5a. RMD Enforcement (Required Minimum Distributions — SECURE Act 2.0)
    const isRetired = primaryAge >= plan.retirementAge;
    const rmdOwners: Array<{ owner: string; age: number; rmdAge: number }> = [
      { owner: 'primary', age: primaryAge, rmdAge: rmdStartAge },
    ];
    if (isMfj && spouseAge !== undefined) {
      const spouseBirthYear = plan.spouseBirthYear || (simYear - spouseAge);
      const spouseRmdStartAge = (spouseBirthYear >= 1960) ? 75 : (rules.secureActRules?.rmdAge || 73);
      rmdOwners.push({ owner: 'spouse', age: spouseAge, rmdAge: spouseRmdStartAge });
    }

    for (const o of rmdOwners) {
      if (o.age >= o.rmdAge) {
        const tradAccsForOwner = Object.values(accountsState).filter(
          (a) =>
            (a.owner === o.owner || (!a.owner && o.owner === 'primary')) &&
            (a.type === 'traditional_ira' || a.type === 'traditional_401k' || a.type.includes('traditional') || getAccountCategory(a.type) === 'taxDeferred') &&
            a.balance > 0
        );
        const currentTradBalance = tradAccsForOwner.reduce((s, a) => s + a.balance, 0);
        const ownerAlreadyWithdrawn = accountDrawdowns
          .filter((d) => tradAccsForOwner.some((a) => a.id === d.accountId))
          .reduce((sum, d) => sum + d.amount, 0);
        const startOfYearTradBalance = currentTradBalance + ownerAlreadyWithdrawn;

        if (startOfYearTradBalance > 0) {
          const divisor = IRS_UNIFORM_LIFETIME_TABLE[o.age] || IRS_UNIFORM_LIFETIME_TABLE[120] || 2.0;
          const totalRmdRequired = startOfYearTradBalance / divisor;
          const additionalRmd = Math.max(0, totalRmdRequired - ownerAlreadyWithdrawn);
          rmdMandatoryDrawdown += totalRmdRequired;

          if (additionalRmd > 0 && currentTradBalance > 0) {
            let remRmd = additionalRmd;
            for (const acc of tradAccsForOwner) {
              if (remRmd <= 0) break;
              const accShare = (acc.balance / currentTradBalance) * additionalRmd;
              const actual = Math.min(acc.balance, Math.min(remRmd, accShare));
              if (actual > 0) {
                acc.balance -= actual;
                remRmd -= actual;
                drawdownsByType.traditional += actual;
                accountDrawdowns.push({
                  accountId: acc.id,
                  accountName: acc.name,
                  accountType: acc.type,
                  amount: actual,
                });

                // Preserve net RMD proceeds in Cash / Taxable Brokerage account
                let destAcc = Object.values(accountsState).find((a) => (a.owner === o.owner || a.owner === 'joint' || (!a.owner && o.owner === 'primary')) && a.type === 'cash')
                  || Object.values(accountsState).find((a) => (a.owner === o.owner || a.owner === 'joint' || (!a.owner && o.owner === 'primary')) && (getAccountCategory(a.type) === 'taxable' || a.type === 'cash'));

                if (!destAcc) {
                  const newCashId = `rmd_cash_sweep_target_${o.owner}`;
                  accountsState[newCashId] = {
                    id: newCashId,
                    name: `${o.owner === 'spouse' ? (plan.spouseName || 'Spouse') : 'Primary'} Cash / Taxable Savings`,
                    type: 'cash',
                    owner: o.owner,
                    balance: 0,
                    costBasis: 0,
                    expectedGrowthRate: 2.0,
                    dividendYield: 0,
                    reinvestDividends: true,
                    qualifiedDividendRatio: 1.0,
                  };
                  destAcc = accountsState[newCashId];
                }

                destAcc.balance += actual;
                const destCat = getAccountCategory(destAcc.type);
                if (destCat === 'taxable' || destCat === 'taxFree') {
                  destAcc.costBasis = (destAcc.costBasis || 0) + actual;
                }
              }
            }
          }
        }
      }
    }

    // 5b. Roth Conversion Ladder Engine (Retired, before RMD age)
    let rothBracketHeadroom = 0;
    if (plan.settings?.enableRothConversions && isRetired && primaryAge < rmdStartAge) {
      const ceilingSetting = plan.settings.rothConversionTargetCeiling || 'top_of_12';
      let convHeadroom = 0;

      if (ceilingSetting === 'irmaa_tier1') {
        const irmaaList = rules.irmaaThresholds || [];
        if (irmaaList.length > 1) {
          const tier1 = irmaaList[1];
          const baseIrmaaLimit = isMfj ? tier1.magiJoint : tier1.magiSingle;
          const irmaaLimit = baseIrmaaLimit * compoundInflation;
          const preConvMagi = salaryIncome + pensionIncome + (totalSsIncome * 0.5) + otherIncome + drawdownsByType.traditional + totalTaxableGains;
          convHeadroom = Math.max(0, irmaaLimit - preConvMagi - 1000);
        }
      } else {
        let targetCeilingRate = 0.12;
        if (ceilingSetting === 'top_of_10') targetCeilingRate = 0.10;
        else if (ceilingSetting === 'top_of_12') targetCeilingRate = 0.12;
        else if (ceilingSetting === 'top_of_22') targetCeilingRate = 0.22;
        else if (ceilingSetting === 'top_of_24') targetCeilingRate = 0.24;
        else if (ceilingSetting === 'top_of_32') targetCeilingRate = 0.32;

        const targetBracketIdx = rules.ordinaryTaxBrackets.findIndex((b: any) => Math.abs(b.rate - targetCeilingRate) < 0.01);
        const nextBracketObj = rules.ordinaryTaxBrackets[targetBracketIdx + 1];
        const targetCeilingDollars = (nextBracketObj ? nextBracketObj.threshold : 47150) * bracketMult * compoundInflation;

        const currentTaxable = taxableOrdinaryIncome + drawdownsByType.traditional;
        convHeadroom = Math.max(0, targetCeilingDollars - currentTaxable);
      }

      if (ceilingSetting !== 'irmaa_tier1' && plan.settings.avoidIrmaaCliffs && primaryAge >= 63) {
        const preConvMagi = salaryIncome + pensionIncome + (totalSsIncome * 0.5) + otherIncome + drawdownsByType.traditional + totalTaxableGains;
        const irmaaGuardList = rules.irmaaThresholds || [];
        for (let idx = 1; idx < irmaaGuardList.length; idx++) {
          const tierObj = irmaaGuardList[idx];
          const baseIrmaaLimit = isMfj ? tierObj.magiJoint : tierObj.magiSingle;
          const irmaaLimit = baseIrmaaLimit * compoundInflation;
          if (irmaaLimit > 0 && preConvMagi < irmaaLimit) {
            convHeadroom = Math.min(convHeadroom, Math.max(0, irmaaLimit - preConvMagi - 1000));
            break;
          }
        }
      }

      rothBracketHeadroom = convHeadroom;

      if (convHeadroom > 500) {
        const ownersToConvert = ['primary'];
        if (isMfj && spouseAge !== undefined) ownersToConvert.push('spouse');

        const headroomPerOwner = convHeadroom / ownersToConvert.length;
        for (const owner of ownersToConvert) {
          const tradAccs = Object.values(accountsState).filter(
            (a) => (a.owner === owner || (!a.owner && owner === 'primary')) &&
              getAccountCategory(a.type) === 'taxDeferred' &&
              a.balance > 0
          );
          if (tradAccs.length === 0) continue;

          let rothAcc = Object.values(accountsState).find(
            (a) => (a.owner === owner || (!a.owner && owner === 'primary')) &&
              getAccountCategory(a.type) === 'taxFree'
          );

          if (!rothAcc && tradAccs.length > 0) {
            const newRothId = `roth_conversion_target_acc_${owner}`;
            accountsState[newRothId] = {
              id: newRothId,
              name: `${owner === 'spouse' ? (plan.spouseName || 'Spouse') : 'Primary'} Roth IRA (Conversion Target)`,
              type: 'roth_ira',
              owner: owner,
              balance: 0,
              costBasis: 0,
              expectedGrowthRate: 6.0,
              dividendYield: 2.5,
              reinvestDividends: true,
              qualifiedDividendRatio: 1.0,
            };
            rothAcc = accountsState[newRothId];
          }

          if (tradAccs.length > 0 && rothAcc) {
            let remRoom = headroomPerOwner;
            for (const tradAcc of tradAccs) {
              if (remRoom <= 0) break;
              const convAmt = Math.min(tradAcc.balance, remRoom);
              tradAcc.balance -= convAmt;
              rothAcc.balance += convAmt;
              remRoom -= convAmt;
              rothConversionAmount += convAmt;
            }
          }
        }
      }
    }

    // 5c. Tax Reconciliation — ordinary tax, capital gains tax, and 3.8% NIIT tax
    let finalTaxableOrdinary = taxableOrdinaryIncome;
    const hsaOrdinaryIncome = drawdownsByType.hsa;
    const additionalOrdinaryIncome = drawdownsByType.traditional + rothConversionAmount + totalNonQualifiedRothEarnings + hsaOrdinaryIncome;
    if (additionalOrdinaryIncome > 0 || totalTaxableGains > 0) {
      // Recalculate provisional income & taxable Social Security incorporating traditional drawdowns & conversions (IRS Pub 915)
      const updatedProvisional = taxableSalary + pensionIncome + otherIncome + additionalOrdinaryIncome + totalTaxableGains + totalSsIncome * 0.5;
      if (isMfs) {
        taxableSs = Math.min(0.85 * totalSsIncome, 0.85 * updatedProvisional);
      } else if (updatedProvisional > ssTier2) {
        taxableSs = Math.min(0.85 * totalSsIncome, 0.50 * (ssTier2 - ssTier1) + 0.85 * (updatedProvisional - ssTier2));
      } else if (updatedProvisional > ssTier1) {
        taxableSs = Math.min(0.50 * totalSsIncome, 0.50 * (updatedProvisional - ssTier1));
      } else {
        taxableSs = 0;
      }

      const fullTaxableOrdinary = Math.max(0,
        taxableSalary + pensionIncome + otherIncome + taxableSs + additionalOrdinaryIncome - stdDeduction
      );
      finalTaxableOrdinary = fullTaxableOrdinary;
      ordinaryTax = 0;
      for (let i = 0; i < activeOrdinaryBrackets.length; i++) {
        const b = activeOrdinaryBrackets[i];
        const thresh = b.threshold * bracketMult * compoundInflation;
        if (fullTaxableOrdinary > thresh) {
          const nextB = activeOrdinaryBrackets[i + 1];
          const nextThresh = nextB ? nextB.threshold * bracketMult * compoundInflation : Infinity;
          const taxableChunk = Math.min(fullTaxableOrdinary - thresh, nextThresh - thresh);
          ordinaryTax += taxableChunk * b.rate;
        }
      }

      if (totalTaxableGains > 0 && rules.capitalGainsBrackets) {
        const capBrackets = rules.capitalGainsBrackets;
        const ordinaryBase = fullTaxableOrdinary;
        for (let i = 0; i < capBrackets.length; i++) {
          const b = capBrackets[i];
          const thresh = b.threshold * bracketMult * compoundInflation;
          const nextB = capBrackets[i + 1];
          const nextThresh = nextB ? nextB.threshold * bracketMult * compoundInflation : Infinity;
          const bracketStart = Math.max(thresh, ordinaryBase);
          const bracketEnd = Math.min(nextThresh, ordinaryBase + totalTaxableGains);
          if (bracketEnd > bracketStart) {
            capGainsTax += (bracketEnd - bracketStart) * b.rate;
          }
        }
      }

      const totalTaxableIncome = grossIncome + additionalOrdinaryIncome + totalTaxableGains;
      stateTax = (fullTaxableOrdinary + totalTaxableGains) * stateTaxRate;
    }

    // Compute Net Investment Income Tax (NIIT)
    const magi = salaryIncome + pensionIncome + taxableSs + otherIncome + drawdownsByType.traditional + rothConversionAmount + totalTaxableGains;
    const niitRules = rules.niitRules || DEFAULT_2026_RULES.niitRules;
    const niitRate = niitRules.rate ?? 0.038;
    const niitThreshBase = isMfj ? (niitRules.thresholdMfj ?? 250000) : (isMfs ? (niitRules.thresholdMfs ?? 125000) : (niitRules.thresholdSingle ?? 200000));
    const niitThresh = niitThreshBase * compoundInflation;
    if (magi > niitThresh && totalTaxableGains > 0) {
      const excessMagi = magi - niitThresh;
      niitTax = niitRate * Math.min(totalTaxableGains, excessMagi);
    }

    taxesPaid = ficaTax + ordinaryTax + capGainsTax + stateTax + niitTax;

    // Deduct incremental taxes resulting from drawdowns and Roth conversions from cash/taxable accounts
    const taxDelta = Math.max(0, taxesPaid - initialTaxesPaid);
    if (taxDelta > 0) {
      let remTaxDelta = taxDelta;
      const liquidAccs = Object.values(accountsState).filter(
        (a) => a.balance > 0 && (a.type === 'cash' || a.type === 'taxable' || a.type === 'brokerage' || a.type === 'crypto')
      );
      for (const acc of liquidAccs) {
        if (remTaxDelta <= 0) break;
        const w = Math.min(acc.balance, remTaxDelta);
        acc.balance -= w;
        remTaxDelta -= w;
      }
    }
    const totalTaxBase = grossIncome + additionalOrdinaryIncome + totalTaxableGains;
    effectiveTaxRate = totalTaxBase > 0 ? ((taxesPaid + earlyPenaltyTax) / totalTaxBase) * 100 : 0;

    // 5d. Compute MAGI & Queue IRMAA Surcharges for Year Y+2
    let irmaaTier = 0;
    let irmaaNotice: { tier: number; surcharge: number; magi: number; threshold: number } | undefined;
    const irmaaList = rules.irmaaThresholds || [];
    for (let idx = irmaaList.length - 1; idx >= 0; idx--) {
      const tierObj = irmaaList[idx];
      const limit = isMfj ? tierObj.magiJoint : tierObj.magiSingle;
      if (magi >= limit && limit > 0) {
        irmaaTier = idx;
        const annualSurcharge = (tierObj.partBMonthly + tierObj.partDMonthly) * 12 * (isMfj ? 2 : 1);
        irmaaSurchargeQueue[simYear + 2] = annualSurcharge;
        irmaaNotice = {
          tier: irmaaTier,
          surcharge: annualSurcharge,
          magi,
          threshold: limit,
        };
        milestonesReached.push(`IRMAA Tier ${irmaaTier} Threshold Breached (MAGI $${Math.round(magi).toLocaleString()})`);
        break;
      }
    }

    // 5e. Compute ACA Healthcare Subsidy for Early Retirement (Age < HSA Penalty Age / 65)
    let acaSubsidy = 0;
    const hsaExemptAge = rules.earlyPenaltyRules?.hsaPenaltyAge ?? 65;
    if (isRetired && primaryAge < hsaExemptAge) {
      const acaRules = rules.acaRules || DEFAULT_2026_RULES.acaRules;
      const fplBase = parseFloat(rules.fplAmount || String(acaRules.fplBaseSingle ?? 15060));
      const fplHousehold = fplBase * (isMfj ? (acaRules.fplMfjMultiplier ?? 1.35) : 1.0) * compoundInflation;
      const fplPercent = (magi / fplHousehold) * 100;

      let premiumCapPct = 0.085;
      const subsTable = rules.acaSubsidyTable || [];
      for (let i = subsTable.length - 1; i >= 0; i--) {
        if (fplPercent <= subsTable[i].fplPercent) {
          premiumCapPct = subsTable[i].premiumCapPercent;
        }
      }

      const benchmarkCost = (isMfj ? (acaRules.benchmarkCostMfj ?? 16800) : (acaRules.benchmarkCostSingle ?? 8400)) * compoundInflation;
      const maxContrib = magi * premiumCapPct;
      acaSubsidy = Math.max(0, benchmarkCost - maxContrib);
    }

    // 5. Asset Growth & Dividend Yield Accrual
    let taxableTotal = 0;
    let taxDeferredTotal = 0;
    let taxFreeTotal = 0;
    let hsaTotal = 0;
    let cashTotal = 0;
    let totalDivTax = 0;
    const accountBalances: YearlyAccountBalance[] = [];

    for (const accId in accountsState) {
      const acc = accountsState[accId];
      if (acc.balance > 0) {
        let growth: number;
        let divYield: number;

        if (yearGrowthFn) {
          const res = yearGrowthFn(yearOffset, acc);
          growth = res.growth;
          divYield = res.dividend;
        } else {
          growth = acc.expectedGrowthRate / 100;
          divYield = acc.dividendYield / 100;
        }

        const isTaxableType = acc.type === 'taxable' || acc.type === 'crypto' || acc.type === 'brokerage' || acc.type === 'investment' || getAccountCategory(acc.type) === 'taxable';

        if (isTaxableType && divYield > 0) {
          const divAmount = acc.balance * divYield;
          const qualRatio = acc.qualifiedDividendRatio ?? 1.0;
          const qualDivs = divAmount * qualRatio;
          const ordDivs = divAmount * (1 - qualRatio);

          let qualDivTax = 0;
          if (rules.capitalGainsBrackets && qualDivs > 0) {
            const capBrackets = rules.capitalGainsBrackets;
            const ordinaryBase = finalTaxableOrdinary;
            for (let i = 0; i < capBrackets.length; i++) {
              const b = capBrackets[i];
              const thresh = b.threshold * bracketMult * compoundInflation;
              const nextB = capBrackets[i + 1];
              const nextThresh = nextB ? nextB.threshold * bracketMult * compoundInflation : Infinity;
              const bracketStart = Math.max(thresh, ordinaryBase);
              const bracketEnd = Math.min(nextThresh, ordinaryBase + qualDivs);
              if (bracketEnd > bracketStart) {
                qualDivTax += (bracketEnd - bracketStart) * b.rate;
              }
            }
          } else {
            qualDivTax = qualDivs * 0.15;
          }

          let ordDivTax = 0;
          if (ordDivs > 0) {
            const topMarginalRate = (() => {
              const ordBase = finalTaxableOrdinary;
              for (let i = rules.ordinaryTaxBrackets.length - 1; i >= 0; i--) {
                const b = rules.ordinaryTaxBrackets[i];
                if (ordBase >= b.threshold * bracketMult * compoundInflation) return b.rate;
              }
              return 0.10;
            })();
            ordDivTax = ordDivs * topMarginalRate;
          }

          const divTax = qualDivTax + ordDivTax;
          totalDivTax += divTax;

          if (acc.reinvestDividends) {
            acc.balance = acc.balance * (1 + growth) + Math.max(0, divAmount - divTax);
            acc.costBasis = (acc.costBasis || 0) + Math.max(0, divAmount - divTax);
          } else {
            acc.balance = acc.balance * (1 + growth);
            const netDiv = Math.max(0, divAmount - divTax);
            cashTotal += netDiv;
          }
        } else {
          acc.balance = acc.balance * (1 + growth + divYield);
        }

        const cat = getAccountCategory(acc.type);
        if (cat === 'taxable') taxableTotal += acc.balance;
        else if (cat === 'taxDeferred') taxDeferredTotal += acc.balance;
        else if (cat === 'taxFree') taxFreeTotal += acc.balance;
        else if (cat === 'hsa') hsaTotal += acc.balance;
        else cashTotal += acc.balance;

        accountBalances.push({
          id: acc.id,
          name: acc.name,
          type: acc.type,
          category: cat,
          owner: acc.owner || 'primary',
          balance: acc.balance,
        });
      }
    }

    const totalLiabilities = Object.values(liabilitiesState).reduce((sum, l) => sum + l.balance, 0);
    const totalAssets = taxableTotal + taxDeferredTotal + taxFreeTotal + hsaTotal + cashTotal;
    const netWorth = totalAssets - totalLiabilities;
    const liquidNetWorth = taxableTotal + taxFreeTotal + cashTotal;

    // FI Target Check
    const targetFiMultiplier = plan.fiTargetMultiplier || 25;
    if (liquidNetWorth >= targetFiMultiplier * livingExpenses && livingExpenses > 0) {
      if (!milestonesReached.some((m) => m.includes('FI Target'))) {
        milestonesReached.push(`FI Target Achieved (${targetFiMultiplier}× Expenses)`);
      }
    }

    if (netWorth <= 0 && depletionAge === undefined) {
      depletionAge = primaryAge;
    }

    // 0% Long-Term Capital Gains tax headroom and NIIT headroom
    const ltcg15Bracket = rules.capitalGainsBrackets?.find((b: any) => b.rate === 0.15)
      || rules.capitalGainsBrackets?.[1]
      || { threshold: 50600 };
    const ltcg0PctCeiling = ltcg15Bracket.threshold * bracketMult * compoundInflation;
    const capitalGains0PctRoom = Math.max(0, ltcg0PctCeiling - finalTaxableOrdinary);
    const niitHeadroom = Math.max(0, niitThresh - magi);

    taxesPaid = ficaTax + ordinaryTax + capGainsTax + stateTax + niitTax + totalDivTax;
    effectiveTaxRate = totalTaxBase > 0 ? ((taxesPaid + earlyPenaltyTax) / totalTaxBase) * 100 : 0;

    yearlyResults.push({
      year: simYear,
      primaryAge,
      spouseAge,
      totalAssets,
      totalLiabilities,
      netWorth,
      liquidNetWorth,
      grossIncome,
      salaryIncome,
      primarySalaryIncome,
      spouseSalaryIncome,
      ssIncome: totalSsIncome,
      primarySsIncome,
      spouseSsIncome,
      pensionIncome,
      otherIncome,
      totalExpenses,
      livingExpenses,
      debtPayments,
      taxesPaid,
      ordinaryTax,
      capGainsTax,
      divTax: totalDivTax,
      stateTax,
      ficaTax,
      niitTax,
      earlyPenaltyTax,
      acaSubsidy,
      effectiveTaxRate,
      netCashFlow,
      surplusSaved,
      deficitWithdrawn,
      discretionaryDeficitWithdrawn,
      rmdMandatoryDrawdown,
      portfolioBreakdown: {
        taxable: taxableTotal,
        taxDeferred: taxDeferredTotal,
        taxFree: taxFreeTotal,
        hsa: hsaTotal,
        cash: cashTotal,
      },
      accountBalances,
      accountDrawdowns,
      drawdownsByType,
      rothConversionAmount,
      rothBracketHeadroom,
      magi,
      irmaaTier,
      irmaaSurchargeAnnual,
      irmaaNotice,
      capitalGains0PctRoom,
      niitHeadroom,
      earlyWithdrawalWarnings,
      earlyPenaltyDetails,
      shortfall: shortfall > 0 ? shortfall : undefined,
      milestonesReached,
    });
  }

  const endingNetWorth = yearlyResults.length > 0 ? yearlyResults[yearlyResults.length - 1].netWorth : 0;

  const heirTaxRate = (plan.settings?.heirFlatIncomeTaxRate ?? 25.0) / 100;
  const adminCostRate = (plan.settings?.administrativeCostRate ?? 1.0) / 100;
  const finalResult = yearlyResults[yearlyResults.length - 1];

  const deferredDrag = (finalResult?.portfolioBreakdown.taxDeferred ?? 0) * heirTaxRate;
  const adminDrag = (finalResult?.totalAssets ?? 0) * adminCostRate;
  const netLegacy = Math.max(0, endingNetWorth - deferredDrag - adminDrag);

  return {
    planId: plan.id,
    yearlyResults,
    success: endingNetWorth > 0 && depletionAge === undefined,
    endingNetWorth,
    netLegacy,
    depletionAge,
  };
}

function isEventActive(
  ev: EngineEvent,
  simYear: number,
  primaryAge: number,
  primaryRetirementAge: number,
  spouseAge?: number,
  spouseRetirementAge?: number,
  yearOffset: number = 0
): boolean {
  const isSpouseEvent = ev.owner === 'spouse';
  const evalAge = isSpouseEvent && spouseAge !== undefined ? spouseAge : primaryAge;
  const evalRetirementAge = isSpouseEvent && spouseRetirementAge !== undefined ? spouseRetirementAge : primaryRetirementAge;

  if (ev.startTriggerType === 'age' && ev.startTriggerValue) {
    if (evalAge < parseInt(ev.startTriggerValue, 10)) return false;
  } else if (ev.startTriggerType === 'year' && ev.startTriggerValue) {
    if (simYear < parseInt(ev.startTriggerValue, 10)) return false;
  } else if (ev.startTriggerType === 'retirement') {
    if (evalAge < evalRetirementAge) return false;
  }

  if (ev.endTriggerType === 'age' && ev.endTriggerValue) {
    if (evalAge > parseInt(ev.endTriggerValue, 10)) return false;
  } else if (ev.endTriggerType === 'year' && ev.endTriggerValue) {
    if (simYear > parseInt(ev.endTriggerValue, 10)) return false;
  } else if (ev.endTriggerType === 'retirement') {
    if (evalAge >= evalRetirementAge) return false;
  } else if ((ev.endTriggerType === 'after_n_years' || ev.endTriggerType === 'duration') && ev.endTriggerValue) {
    const duration = parseInt(ev.endTriggerValue, 10);
    if (!isNaN(duration) && duration > 0) {
      if (ev.startTriggerType === 'retirement') {
        if (evalAge >= evalRetirementAge + duration) return false;
      } else if (ev.startTriggerType === 'age' && ev.startTriggerValue) {
        const startAge = parseInt(ev.startTriggerValue, 10);
        if (evalAge >= startAge + duration) return false;
      } else if (ev.startTriggerType === 'year' && ev.startTriggerValue) {
        const startYear = parseInt(ev.startTriggerValue, 10);
        if (simYear >= startYear + duration) return false;
      } else {
        if (yearOffset >= duration) return false;
      }
    }
  }

  return true;
}

function getSsClaimingMultiplier(age: number, rules?: any): number {
  const customTable = rules?.socialSecurityRules?.claimingMultipliers;
  if (customTable && customTable[age] !== undefined) {
    return customTable[age];
  }
  if (age <= 62) return 0.70;
  if (age === 63) return 0.75;
  if (age === 64) return 0.80;
  if (age === 65) return 0.8667;
  if (age === 66) return 0.9333;
  if (age === 67) return 1.00;
  if (age === 68) return 1.08;
  if (age === 69) return 1.16;
  return 1.24;
}
