import { DEFAULT_2026_RULES, IRS_UNIFORM_LIFETIME_TABLE } from '@/lib/constants/retirement-defaults';

export interface EngineAccount {
  id: string;
  name: string;
  type: string; // 'cash' | 'taxable' | 'traditional_ira' | 'roth_ira' | 'traditional_401k' | 'roth_401k' | 'hsa' | 'crypto'
  owner: string;
  balance: number;
  costBasis: number;
  expectedGrowthRate: number;
  dividendYield: number;
  reinvestDividends: boolean;
  qualifiedDividendRatio: number;
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
  primaryBirthYear: number;
  primaryBirthMonth: number;
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
  withdrawalMethod: string; // 'textbook' | 'proportional' | 'tax_optimized' | 'custom_order'
  fiTargetMultiplier?: number;
  customWithdrawalOrder?: string[];
  primarySalary?: number;
  spouseSalary?: number;
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
    withdrawalMethod?: 'textbook' | 'proportional' | 'tax_optimized' | 'custom_order';
    enableRothConversions?: boolean;
    rothConversionTargetCeiling?: 'top_of_10' | 'top_of_12' | 'top_of_22' | 'irmaa_tier1';
    avoidIrmaaCliffs?: boolean;
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
  magi: number;
  irmaaTier: number;
  irmaaSurchargeAnnual: number;
  irmaaNotice?: { tier: number; surcharge: number; magi: number; threshold: number };
  earlyWithdrawalWarnings?: string[];
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

export function runRetirementSimulation(
  plan: EnginePlan,
  yearGrowthFn?: (yearIndex: number, acc: EngineAccount) => { growth: number; dividend: number }
): SimulationOutput {
  const currentYear = new Date().getFullYear();
  const primaryBirthYear = plan.primaryBirthYear || 1985;
  const startAge = currentYear - primaryBirthYear;
  const maxYears = Math.max(1, (plan.lifeExpectancyAge || 100) - startAge);

  const isMfj = plan.filingStatus === 'married_joint';
  const rules = plan.rules || DEFAULT_2026_RULES;

  // Mutable deep clones of state for simulation loop (with Roth percentage splitting)
  const accountsState: Record<string, EngineAccount> = {};
  for (const acc of plan.accounts) {
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
    if (primaryAge === 50) milestonesReached.push('Catch-up Contribution Limits Unlocked (Age 50)');
    if (primaryAge === 55) milestonesReached.push('Rule of 55 Access & HSA Catch-up Unlocked (Age 55)');
    if (primaryAge === 59 || primaryAge === 60) milestonesReached.push('Penalty-Free Retirement Access (Age 59½)');
    if (primaryAge === 62) milestonesReached.push('Early Social Security Eligibility (Age 62)');
    if (primaryAge === 65) milestonesReached.push('Medicare Eligibility & ACA Transition (Age 65)');
    if (primaryAge === 67) milestonesReached.push('Full Social Security Retirement Age (Age 67)');
    if (primaryAge === 70) milestonesReached.push('Maximum Social Security Benefit Age (Age 70)');
    const rmdStartAge = (primaryBirthYear >= 1960) ? 75 : (rules.secureActRules?.rmdAge || 73);
    if (primaryAge === rmdStartAge) milestonesReached.push(`Mandatory RMD Start Age (${rmdStartAge})`);

    const inflationRate = (plan.settings?.fixedInflationRate ?? 3.0) / 100;
    const compoundInflation = Math.pow(1 + inflationRate, yearOffset);

    // 0. Check IRMAA surcharges triggered from 2 years prior (age 65+)
    const irmaaSurchargeAnnual = primaryAge >= 65 ? irmaaSurchargeQueue[simYear] || 0 : 0;

    // 1. Income Events Calculation (Separate Primary vs Spouse salary)
    let salaryIncome = 0;
    let primarySalaryIncome = 0;
    let spouseSalaryIncome = 0;
    let primarySsIncome = 0;
    let spouseSsIncome = 0;
    let pensionIncome = 0;
    let otherIncome = 0;

    for (const ev of plan.events) {
      if (ev.category !== 'income') continue;
      if (!isEventActive(ev, simYear, primaryAge, plan.retirementAge, spouseAge, plan.spouseRetirementAge)) continue;

      const baseAmt = ev.amount * (ev.frequency === 'monthly' ? 12 : 1);
      const growthMult = Math.pow(1 + ev.growthRate / 100, yearOffset);
      const inflMult = ev.adjustForInflation ? compoundInflation : 1;
      let val = baseAmt * growthMult * inflMult;
      if (ev.growthCap && val > ev.growthCap) val = ev.growthCap;

      if (ev.type === 'salary') {
        salaryIncome += val;
        if (ev.owner === 'spouse') {
          spouseSalaryIncome += val;
        } else {
          primarySalaryIncome += val;
        }
      } else if (ev.type === 'pension') pensionIncome += val;
      else if (ev.type === 'social_security') {
        if (ev.owner === 'spouse') spouseSsIncome += val;
        else primarySsIncome += val;
      } else otherIncome += val;
    }

    // Dynamic Social Security Start Age Overrides if configured in Plan
    if (plan.primarySsMonthlyAmount && primaryAge >= (plan.primarySsStartAge || 67)) {
      const baseMonthly = plan.primarySsMonthlyAmount;
      const startAgeOpt = plan.primarySsStartAge || 67;
      const claimingMult = getSsClaimingMultiplier(startAgeOpt);
      primarySsIncome = baseMonthly * 12 * claimingMult * compoundInflation;
    }

    if (isMfj && plan.spouseSsMonthlyAmount && spouseAge !== undefined && spouseAge >= (plan.spouseSsStartAge || 67)) {
      const spouseMonthly = plan.spouseSsMonthlyAmount;
      const spouseStartOpt = plan.spouseSsStartAge || 67;
      let spouseMult = getSsClaimingMultiplier(spouseStartOpt);

      if (plan.enableSpousalSsBenefit !== false && plan.primarySsMonthlyAmount) {
        const halfPrimary = plan.primarySsMonthlyAmount * 0.5;
        if (halfPrimary > spouseMonthly) {
          spouseSsIncome = halfPrimary * 12 * compoundInflation;
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
      if (!isEventActive(ev, simYear, primaryAge, plan.retirementAge, spouseAge, plan.spouseRetirementAge)) continue;
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
      if (source === 'spouse') return spouseSalaryIncome > 0 ? spouseSalaryIncome : salaryIncome;
      if (source === 'primary') return primarySalaryIncome > 0 ? primarySalaryIncome : salaryIncome;
      return salaryIncome;
    };

    // Helper to get salary base for per-account contributions (uses plan-level salary fields)
    const getAccountSalaryBase = (acc: EngineAccount) => {
      const planPrimarySalary = plan.primarySalary || 0;
      const planSpouseSalary = plan.spouseSalary || 0;
      const source = acc.contributionSalarySource || (acc.owner === 'spouse' ? 'spouse' : 'primary');
      if (source === 'spouse') return planSpouseSalary > 0 ? planSpouseSalary : planPrimarySalary;
      return planPrimarySalary > 0 ? planPrimarySalary : (primarySalaryIncome > 0 ? primarySalaryIncome : salaryIncome);
    };

    // 3. Pre-Tax Savings Contributions (Traditional 401k, Traditional IRA, HSA)
    let surplusSaved = 0;
    let totalPreTaxContrib = 0;
    const sortedFlows = [...plan.flows].sort((a, b) => a.rank - b.rank);

    const isAccumulation = primaryAge < plan.retirementAge;

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

          const isPreTax = targetAcc.type === 'traditional_401k' || targetAcc.type === 'traditional_ira' || targetAcc.type === 'hsa';
          if (!isPreTax) continue;

          const ownerAge = targetAcc.owner === 'spouse' && spouseAge !== undefined ? spouseAge : primaryAge;
          const ownerCatchUp50 = ownerAge >= 50;
          const ownerCatchUp55 = ownerAge >= 55;
          const salaryBase = getAccountSalaryBase(origAcc);

          let requestedAlloc = 0;
          if (origAcc.contributionMode === 'percentage' && origAcc.contributionValue) {
            requestedAlloc = salaryBase * (origAcc.contributionValue / 100);
          } else if (origAcc.contributionMode === 'fixed_amount' && origAcc.contributionValue) {
            requestedAlloc = origAcc.contributionValue * compoundInflation;
          } else if (origAcc.contributionMode === 'maximize') {
            let maxLimit = 7000 + (ownerCatchUp50 ? 1000 : 0);
            if (targetAcc.type.includes('401k')) {
              maxLimit = 23000 + (ownerCatchUp50 ? 7500 : 0);
            } else if (targetAcc.type === 'hsa') {
              maxLimit = (isMfj || targetAcc.owner === 'joint' ? 8300 : 4150) + (ownerCatchUp55 ? 1000 : 0);
            }
            if (isMfj && !targetAcc.type.includes('401k') && targetAcc.type !== 'hsa') {
              maxLimit *= 2;
            }
            requestedAlloc = maxLimit;
          }

          const maxSalaryAvail = Math.max(0, salaryBase - totalPreTaxContrib);
          const alloc = Math.min(maxSalaryAvail, requestedAlloc);
          if (alloc > 0) {
            targetAcc.balance += alloc;
            totalPreTaxContrib += alloc;
            surplusSaved += alloc;

            // Company match
            if (origAcc.companyMatchRate != null && origAcc.companyMatchLimit != null) {
              const matchableContrib = Math.min(alloc, salaryBase * (origAcc.companyMatchLimit / 100));
              const matchAmount = matchableContrib * origAcc.companyMatchRate;
              if (matchAmount > 0) {
                targetAcc.balance += matchAmount;
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

          const isPreTax = targetAcc.type === 'traditional_401k' || targetAcc.type === 'traditional_ira' || targetAcc.type === 'hsa';
          if (!isPreTax) continue;

          const ownerAge = targetAcc.owner === 'spouse' && spouseAge !== undefined ? spouseAge : primaryAge;
          const ownerCatchUp50 = ownerAge >= 50;
          const ownerCatchUp55 = ownerAge >= 55;
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
            let maxLimit = 7000 + (ownerCatchUp50 ? 1000 : 0);
            if (targetAcc.type.includes('401k')) {
              maxLimit = 23000 + (ownerCatchUp50 ? 7500 : 0);
            } else if (targetAcc.type === 'hsa') {
              maxLimit = (isMfj || targetAcc.owner === 'joint' ? 8300 : 4150) + (ownerCatchUp55 ? 1000 : 0);
            }
            if (isMfj && !targetAcc.type.includes('401k') && targetAcc.type !== 'hsa') {
              maxLimit *= 2;
            }
            requestedAlloc = maxLimit;
          }

          const maxSalaryAvail = Math.max(0, salaryBase - totalPreTaxContrib);
          const alloc = Math.min(maxSalaryAvail, requestedAlloc);
          if (alloc > 0) {
            targetAcc.balance += alloc;
            totalPreTaxContrib += alloc;
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
    const taxableSalary = Math.max(0, salaryIncome - totalPreTaxContrib);
    const stdDeductionBase = parseFloat(rules.standardDeduction || '15000');
    const stdDeduction = stdDeductionBase * (isMfj ? 2 : 1) * compoundInflation;

    const ssWageBase = 168600 * compoundInflation;
    const ssTaxableSalary = Math.min(taxableSalary, ssWageBase);
    const ssFica = ssTaxableSalary * 0.062;
    const medicareFica = taxableSalary * 0.0145;
    const addMedicareThresh = isMfj ? 250000 : 200000;
    const addMedicareFica = Math.max(0, taxableSalary - addMedicareThresh) * 0.009;
    const ficaTax = ssFica + medicareFica + addMedicareFica;

    const provisionalIncome = taxableSalary + pensionIncome + otherIncome + totalSsIncome * 0.5;
    const ssTier1 = isMfj ? 32000 : 25000;
    const ssTier2 = isMfj ? 44000 : 34000;

    let taxableSs = 0;
    if (provisionalIncome > ssTier2) {
      taxableSs = Math.min(0.85 * totalSsIncome, 0.50 * (ssTier2 - ssTier1) + 0.85 * (provisionalIncome - ssTier2));
    } else if (provisionalIncome > ssTier1) {
      taxableSs = Math.min(0.50 * totalSsIncome, 0.50 * (provisionalIncome - ssTier1));
    }

    const taxableOrdinaryIncome = Math.max(0, taxableSalary + pensionIncome + otherIncome + taxableSs - stdDeduction);

    let ordinaryTax = 0;
    const bracketMult = isMfj ? 2 : 1;
    for (let i = 0; i < rules.ordinaryTaxBrackets.length; i++) {
      const b = rules.ordinaryTaxBrackets[i];
      const thresh = b.threshold * bracketMult * compoundInflation;
      if (taxableOrdinaryIncome > thresh) {
        const nextB = rules.ordinaryTaxBrackets[i + 1];
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
    let effectiveTaxRate = grossIncome > 0 ? (taxesPaid / grossIncome) * 100 : 0;

    const netCashFlow = grossIncome - totalExpenses - taxesPaid - totalPreTaxContrib;

    let deficitWithdrawn = 0;
    let discretionaryDeficitWithdrawn = 0;
    let rmdMandatoryDrawdown = 0;
    const accountDrawdowns: AccountDrawdownDetail[] = [];
    const drawdownsByType = { cash: 0, taxable: 0, traditional: 0, roth: 0, hsa: 0 };
    const earlyWithdrawalWarnings: string[] = [];
    let rothConversionAmount = 0;
    let totalTaxableGains = 0;

    // Helper for withdrawing from an account with penalty tracking
    const withdrawFromAcc = (acc: EngineAccount, amt: number) => {
      const actual = Math.min(acc.balance, amt);
      if (actual <= 0) return 0;

      const accOwnerAge = acc.owner === 'spouse' && spouseAge !== undefined ? spouseAge : primaryAge;
      const accOwnerRetirementAge = acc.owner === 'spouse' && plan.spouseRetirementAge ? plan.spouseRetirementAge : plan.retirementAge;

      // 10% IRS Early Withdrawal Penalty check for Traditional accounts before 59.5 (Rule of 55 exception check for 401k)
      if (acc.type === 'traditional_ira' || acc.type === 'traditional_401k') {
        const isRuleOf55 = acc.type === 'traditional_401k' && accOwnerAge >= 55 && accOwnerRetirementAge >= 55;
        if (accOwnerAge < 59.5 && !isRuleOf55) {
          const penalty = actual * 0.10;
          earlyPenaltyTax += penalty;
          earlyWithdrawalWarnings.push(
            `Age ${accOwnerAge}: Withdrawal of $${Math.round(actual).toLocaleString()} from ${acc.name} incurred a 10% early withdrawal penalty ($${Math.round(penalty).toLocaleString()}).`
          );
        }
      }

      // 20% Penalty for non-medical HSA withdrawals before age 65
      if (acc.type === 'hsa' && accOwnerAge < 65) {
        const penalty = actual * 0.20;
        earlyPenaltyTax += penalty;
        earlyWithdrawalWarnings.push(
          `Age ${accOwnerAge}: Non-qualified withdrawal of $${Math.round(actual).toLocaleString()} from HSA incurred a 20% early penalty ($${Math.round(penalty).toLocaleString()}).`
        );
      }

      // Track capital gains for taxable account withdrawals
      if ((acc.type === 'taxable' || acc.type === 'crypto') && acc.balance > 0) {
        const gainRatio = Math.max(0, (acc.balance - acc.costBasis) / acc.balance);
        totalTaxableGains += actual * gainRatio;
        acc.costBasis = Math.max(0, acc.costBasis * (1 - actual / acc.balance));
      }

      acc.balance -= actual;
      accountDrawdowns.push({
        accountId: acc.id,
        accountName: acc.name,
        accountType: acc.type,
        amount: actual,
      });
      if (acc.type === 'cash') drawdownsByType.cash += actual;
      else if (acc.type === 'taxable' || acc.type === 'crypto') drawdownsByType.taxable += actual;
      else if (acc.type === 'traditional_ira' || acc.type === 'traditional_401k') drawdownsByType.traditional += actual;
      else if (acc.type === 'roth_ira' || acc.type === 'roth_401k') drawdownsByType.roth += actual;
      else if (acc.type === 'hsa') drawdownsByType.hsa += actual;
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
            if (!origAcc.contributionMode || origAcc.contributionMode === 'none') continue;
            if (origAcc.isSurplusDestination) continue; // Handle sweep last

            let targetAcc = accountsState[origAcc.id];
            if (!targetAcc) {
              targetAcc = accountsState[`${origAcc.id}_roth`] || accountsState[`${origAcc.id}_trad`];
            }
            if (!targetAcc) continue;

            const isPreTax = targetAcc.type === 'traditional_401k' || targetAcc.type === 'traditional_ira' || targetAcc.type === 'hsa';
            if (isPreTax) continue; // Already handled in Phase 1

            const salaryBase = getAccountSalaryBase(origAcc);
            let limit = surplus;
            if (origAcc.contributionMode === 'percentage' && origAcc.contributionValue) {
              limit = salaryBase * (origAcc.contributionValue / 100);
            } else if (origAcc.contributionMode === 'fixed_amount' && origAcc.contributionValue) {
              limit = origAcc.contributionValue * compoundInflation;
            } else if (origAcc.contributionMode === 'maximize') {
              const ownerAge = targetAcc.owner === 'spouse' && spouseAge !== undefined ? spouseAge : primaryAge;
              const ownerCatchUp50 = ownerAge >= 50;
              let maxLimit = 7000 + (ownerCatchUp50 ? 1000 : 0);
              if (targetAcc.type.includes('401k')) maxLimit = 23000 + (ownerCatchUp50 ? 7500 : 0);
              if (isMfj && !targetAcc.type.includes('401k')) maxLimit *= 2;
              limit = Math.min(surplus, maxLimit);
            }

            const alloc = Math.min(surplus, limit);
            if (alloc > 0) {
              targetAcc.balance += alloc;
              surplus -= alloc;
              surplusSaved += alloc;

              // Company match for post-tax accounts (e.g. Roth 401k)
              if (origAcc.companyMatchRate != null && origAcc.companyMatchLimit != null) {
                const matchableContrib = Math.min(alloc, salaryBase * (origAcc.companyMatchLimit / 100));
                const matchAmount = matchableContrib * origAcc.companyMatchRate;
                if (matchAmount > 0) {
                  targetAcc.balance += matchAmount;
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

            const isPreTax = targetAcc.type === 'traditional_401k' || targetAcc.type === 'traditional_ira' || targetAcc.type === 'hsa';
            if (isPreTax) continue;

            const salaryBase = getFlowSalaryBase(flow, targetAcc);
            let limit = surplus;
            if (flow.ruleType === 'percentage' && flow.ruleValue) {
              limit = salaryBase * (flow.ruleValue / 100);
            } else if (flow.ruleType === 'fixed_amount' && flow.ruleValue) {
              limit = flow.ruleValue * compoundInflation;
            } else if (flow.ruleType === 'save_maintain') {
              const targetBal = (flow.ruleValue || 0) * compoundInflation;
              limit = Math.max(0, targetBal - targetAcc.balance);
            } else if (flow.ruleType === 'maximize') {
              const ownerAge = targetAcc.owner === 'spouse' && spouseAge !== undefined ? spouseAge : primaryAge;
              const ownerCatchUp50 = ownerAge >= 50;
              let maxLimit = 7000 + (ownerCatchUp50 ? 1000 : 0);
              if (targetAcc.type.includes('401k')) maxLimit = 23000 + (ownerCatchUp50 ? 7500 : 0);
              if (isMfj && !targetAcc.type.includes('401k')) maxLimit *= 2;
              limit = Math.min(surplus, maxLimit);
            } else if (flow.ruleType === 'save_leftover') {
              limit = surplus;
            }

            const alloc = Math.min(surplus, limit);
            if (alloc > 0) {
              targetAcc.balance += alloc;
              surplus -= alloc;
              surplusSaved += alloc;
            }
          }
        }
      }
    } else if (netCashFlow < 0) {
      let deficit = Math.abs(netCashFlow);
      deficitWithdrawn = deficit;
      discretionaryDeficitWithdrawn = deficit;

      const method = plan.settings?.withdrawalMethod || plan.withdrawalMethod || 'textbook';

      if (method === 'proportional') {
        const eligibleAccs = Object.values(accountsState).filter((a) => a.balance > 0);
        const totalBal = eligibleAccs.reduce((s, a) => s + a.balance, 0);
        if (totalBal > 0) {
          let remDeficit = deficit;
          for (const acc of eligibleAccs) {
            if (remDeficit <= 0) break;
            const propShare = (acc.balance / totalBal) * deficit;
            const w = withdrawFromAcc(acc, propShare);
            remDeficit -= w;
          }
          if (remDeficit > 0) {
            for (const acc of eligibleAccs) {
              if (remDeficit <= 0) break;
              const w = withdrawFromAcc(acc, remDeficit);
              remDeficit -= w;
            }
          }
        }
      } else if (method === 'tax_optimized') {
        const target12Limit = 48475 * (isMfj ? 2 : 1) * compoundInflation;
        const currentTaxable = taxableOrdinaryIncome;
        const bracketRoom = Math.max(0, target12Limit - currentTaxable);

        if (bracketRoom > 0 && deficit > 0) {
          const tradAccs = Object.values(accountsState).filter(
            (a) => (a.type === 'traditional_ira' || a.type === 'traditional_401k') && a.balance > 0
          );
          let tradNeeded = Math.min(deficit, bracketRoom);
          for (const acc of tradAccs) {
            if (tradNeeded <= 0) break;
            const w = withdrawFromAcc(acc, tradNeeded);
            tradNeeded -= w;
            deficit -= w;
          }
        }

        if (deficit > 0) {
          const remOrder = ['cash', 'taxable', 'crypto', 'roth_ira', 'roth_401k', 'hsa'];
          const sortedAccs = Object.values(accountsState)
            .filter((a) => a.balance > 0 && remOrder.includes(a.type))
            .sort((a, b) => remOrder.indexOf(a.type) - remOrder.indexOf(b.type));
          for (const acc of sortedAccs) {
            if (deficit <= 0) break;
            const w = withdrawFromAcc(acc, deficit);
            deficit -= w;
          }
        }
      } else {
        const accountsList = Object.values(accountsState);
        const getDrawdownOrder = () => {
          if (method === 'custom_order' && plan.customWithdrawalOrder?.length) {
            return plan.customWithdrawalOrder.map((id) => accountsState[id]).filter(Boolean);
          }
          const orderMap: Record<string, number> = {
            cash: 1,
            taxable: 2,
            traditional_ira: 3,
            traditional_401k: 3,
            roth_ira: 4,
            roth_401k: 4,
            hsa: 5,
          };
          return accountsList.sort((a, b) => (orderMap[a.type] ?? 9) - (orderMap[b.type] ?? 9));
        };

        const orderedAccounts = getDrawdownOrder();
        for (const acc of orderedAccounts) {
          if (deficit <= 0) break;
          if (acc.balance <= 0) continue;
          const w = withdrawFromAcc(acc, deficit);
          deficit -= w;
        }
      }
    }

    // 5a. RMD Enforcement (Required Minimum Distributions — SECURE Act 2.0)
    const isRetired = primaryAge >= plan.retirementAge;
    if (primaryAge >= rmdStartAge) {
      const tradAccsForRmd = Object.values(accountsState).filter(
        (a) => (a.type === 'traditional_ira' || a.type === 'traditional_401k') && a.balance > 0
      );
      const totalTradBalance = tradAccsForRmd.reduce((s, a) => s + a.balance, 0);
      if (totalTradBalance > 0) {
        const divisor = IRS_UNIFORM_LIFETIME_TABLE[primaryAge] || IRS_UNIFORM_LIFETIME_TABLE[120] || 2.0;
        const totalRmdRequired = totalTradBalance / divisor;
        const alreadyWithdrawn = drawdownsByType.traditional;
        const additionalRmd = Math.max(0, totalRmdRequired - alreadyWithdrawn);

        if (additionalRmd > 0) {
          rmdMandatoryDrawdown = additionalRmd;
          let remRmd = additionalRmd;
          for (const acc of tradAccsForRmd) {
            if (remRmd <= 0) break;
            const accShare = (acc.balance / totalTradBalance) * additionalRmd;
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
            }
          }
        }
      }
    }

    // 5b. Roth Conversion Ladder Engine (Retired, before RMD age)
    if (plan.settings?.enableRothConversions && isRetired && primaryAge < rmdStartAge) {
      let targetCeilingRate = 0.12;
      if (plan.settings.rothConversionTargetCeiling === 'top_of_10') targetCeilingRate = 0.10;
      else if (plan.settings.rothConversionTargetCeiling === 'top_of_22') targetCeilingRate = 0.22;

      const targetBracketIdx = rules.ordinaryTaxBrackets.findIndex((b: any) => Math.abs(b.rate - targetCeilingRate) < 0.01);
      const nextBracketObj = rules.ordinaryTaxBrackets[targetBracketIdx + 1];
      const targetCeilingDollars = (nextBracketObj ? nextBracketObj.threshold : 47150) * bracketMult * compoundInflation;

      const currentTaxable = taxableOrdinaryIncome + drawdownsByType.traditional;
      let convHeadroom = Math.max(0, targetCeilingDollars - currentTaxable);

      if (plan.settings.avoidIrmaaCliffs && primaryAge >= 63) {
        const preConvMagi = salaryIncome + pensionIncome + taxableSs + otherIncome + drawdownsByType.traditional + totalTaxableGains;
        const irmaaGuardList = rules.irmaaThresholds || [];
        for (let idx = 1; idx < irmaaGuardList.length; idx++) {
          const tierObj = irmaaGuardList[idx];
          const irmaaLimit = isMfj ? tierObj.magiJoint : tierObj.magiSingle;
          if (irmaaLimit > 0 && preConvMagi < irmaaLimit) {
            convHeadroom = Math.min(convHeadroom, Math.max(0, irmaaLimit - preConvMagi - 1000));
            break;
          }
        }
      }

      if (convHeadroom > 500) {
        const tradAccs = Object.values(accountsState).filter(
          (a) => (a.type === 'traditional_ira' || a.type === 'traditional_401k') && a.balance > 0
        );
        const rothAcc = Object.values(accountsState).find((a) => a.type === 'roth_ira' || a.type === 'roth_401k');

        if (tradAccs.length > 0 && rothAcc) {
          let remRoom = convHeadroom;
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

    // 5c. Tax Reconciliation — ordinary tax, capital gains tax, and 3.8% NIIT tax
    const additionalOrdinaryIncome = drawdownsByType.traditional + rothConversionAmount;
    if (additionalOrdinaryIncome > 0 || totalTaxableGains > 0) {
      const fullTaxableOrdinary = Math.max(0,
        taxableSalary + pensionIncome + otherIncome + taxableSs + additionalOrdinaryIncome - stdDeduction
      );
      ordinaryTax = 0;
      for (let i = 0; i < rules.ordinaryTaxBrackets.length; i++) {
        const b = rules.ordinaryTaxBrackets[i];
        const thresh = b.threshold * bracketMult * compoundInflation;
        if (fullTaxableOrdinary > thresh) {
          const nextB = rules.ordinaryTaxBrackets[i + 1];
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
      stateTax = fullTaxableOrdinary * stateTaxRate;
    }

    // Compute Net Investment Income Tax (NIIT 3.8%)
    const magi = salaryIncome + pensionIncome + taxableSs + otherIncome + drawdownsByType.traditional + rothConversionAmount + totalTaxableGains;
    const niitThresh = (isMfj ? 250000 : 200000) * compoundInflation;
    if (magi > niitThresh && totalTaxableGains > 0) {
      const excessMagi = magi - niitThresh;
      niitTax = 0.038 * Math.min(totalTaxableGains, excessMagi);
    }

    taxesPaid = ficaTax + ordinaryTax + capGainsTax + stateTax + niitTax + earlyPenaltyTax;
    const totalTaxBase = grossIncome + additionalOrdinaryIncome + totalTaxableGains;
    effectiveTaxRate = totalTaxBase > 0 ? (taxesPaid / totalTaxBase) * 100 : 0;

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

    // 5e. Compute ACA Healthcare Subsidy for Early Retirement (Age < 65)
    let acaSubsidy = 0;
    if (isRetired && primaryAge < 65) {
      const fplBase = parseFloat(rules.fplAmount || '15060');
      const fplHousehold = fplBase * (isMfj ? 1.35 : 1.0) * compoundInflation;
      const fplPercent = (magi / fplHousehold) * 100;

      let premiumCapPct = 0.085;
      const subsTable = rules.acaSubsidyTable || [];
      for (let i = subsTable.length - 1; i >= 0; i--) {
        if (fplPercent <= subsTable[i].fplPercent) {
          premiumCapPct = subsTable[i].premiumCapPercent;
        }
      }

      const benchmarkCost = (isMfj ? 16800 : 8400) * compoundInflation;
      const maxContrib = magi * premiumCapPct;
      acaSubsidy = Math.max(0, benchmarkCost - maxContrib);
    }

    // 5. Asset Growth & Dividend Yield Accrual
    let taxableTotal = 0;
    let taxDeferredTotal = 0;
    let taxFreeTotal = 0;
    let hsaTotal = 0;
    let cashTotal = 0;
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

        const isTaxableType = acc.type === 'taxable' || acc.type === 'crypto' || acc.type === 'brokerage' || acc.type === 'investment';

        if (isTaxableType && divYield > 0) {
          const divAmount = acc.balance * divYield;
          const qualRatio = acc.qualifiedDividendRatio ?? 1.0;
          const qualDivs = divAmount * qualRatio;
          const ordDivs = divAmount * (1 - qualRatio);
          const divTax = (qualDivs * 0.15) + (ordDivs * 0.22);

          if (acc.reinvestDividends) {
            acc.balance = acc.balance * (1 + growth) + Math.max(0, divAmount - divTax);
            acc.costBasis += Math.max(0, divAmount - divTax);
          } else {
            acc.balance = acc.balance * (1 + growth);
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
      magi,
      irmaaTier,
      irmaaSurchargeAnnual,
      irmaaNotice,
      earlyWithdrawalWarnings,
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
    success: endingNetWorth > 0,
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
  spouseRetirementAge?: number
): boolean {
  const isSpouseEvent = ev.owner === 'spouse';
  const evalAge = isSpouseEvent && spouseAge !== undefined ? spouseAge : primaryAge;
  const evalRetirementAge = isSpouseEvent && spouseRetirementAge !== undefined ? spouseRetirementAge : primaryRetirementAge;

  if (ev.startTriggerType === 'age' && ev.startTriggerValue) {
    if (evalAge < parseInt(ev.startTriggerValue, 10)) return false;
  } else if (ev.startTriggerType === 'year' && ev.startTriggerValue) {
    if (simYear < parseInt(ev.startTriggerValue, 10)) return false;
  }

  if (ev.endTriggerType === 'age' && ev.endTriggerValue) {
    if (evalAge > parseInt(ev.endTriggerValue, 10)) return false;
  } else if (ev.endTriggerType === 'year' && ev.endTriggerValue) {
    if (simYear > parseInt(ev.endTriggerValue, 10)) return false;
  } else if (ev.endTriggerType === 'retirement') {
    if (evalAge >= evalRetirementAge) return false;
  }

  return true;
}

function getSsClaimingMultiplier(age: number): number {
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
