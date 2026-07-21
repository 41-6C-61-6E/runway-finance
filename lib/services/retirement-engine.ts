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
}

export interface EngineLiability {
  id: string;
  name: string;
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
  ruleType: 'percentage' | 'maximize' | 'save_maintain' | 'save_leftover';
  ruleValue?: number;
  matchRate?: number;
  matchLimit?: number;
  matchAccountId?: string;
}

export interface EnginePlan {
  id: string;
  name: string;
  hasSpouse: boolean;
  primaryBirthYear: number;
  primaryBirthMonth: number;
  spouseBirthYear?: number;
  spouseBirthMonth?: number;
  filingStatus: string;
  retirementAge: number;
  lifeExpectancyAge: number;
  withdrawalMethod: string; // 'textbook' | 'proportional' | 'custom_order'
  customWithdrawalOrder?: string[];
  accounts: EngineAccount[];
  liabilities: EngineLiability[];
  events: EngineEvent[];
  flows: EngineFlow[];
  settings: {
    fixedInflationRate: number;
    withholdingDeferred: number;
    withholdingTaxable: number;
    incomeTaxModifier: number;
    capGainsTaxModifier: number;
    heirFlatIncomeTaxRate: number;
    stepUpBasis: boolean;
    realEstateLiquidationRate: number;
    administrativeCostRate: number;
    charitableGiving: number;
  };
  rules?: typeof DEFAULT_2026_RULES;
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
  ssIncome: number;
  pensionIncome: number;
  otherIncome: number;
  totalExpenses: number;
  livingExpenses: number;
  debtPayments: number;
  taxesPaid: number;
  ordinaryTax: number;
  capGainsTax: number;
  ficaTax: number;
  effectiveTaxRate: number;
  netCashFlow: number;
  surplusSaved: number;
  deficitWithdrawn: number;
  portfolioBreakdown: {
    taxable: number;
    taxDeferred: number;
    taxFree: number;
    hsa: number;
    cash: number;
  };
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

export type YearGrowthFn = (yearOffset: number, acc: EngineAccount) => { growth: number; dividend: number };

export function runRetirementSimulation(plan: EnginePlan, yearGrowthFn?: YearGrowthFn): SimulationOutput {
  const currentCalendarYear = new Date().getFullYear();
  const primaryBirthYear = plan.primaryBirthYear || 1985;
  const currentAge = currentCalendarYear - primaryBirthYear;
  const totalYears = Math.max(1, plan.lifeExpectancyAge - currentAge);

  const rules = plan.rules || DEFAULT_2026_RULES;
  const inflationRate = (plan.settings?.fixedInflationRate ?? 3.0) / 100;

  // Initialize account state balances
  const accountsState: Record<string, EngineAccount> = {};
  for (const acc of plan.accounts) {
    accountsState[acc.id] = { ...acc };
  }

  // Initialize liabilities
  const liabilitiesState: Record<string, EngineLiability> = {};
  for (const liab of plan.liabilities) {
    liabilitiesState[liab.id] = { ...liab };
  }

  const yearlyResults: YearlySimulationResult[] = [];
  let depletionAge: number | undefined = undefined;

  for (let yearOffset = 0; yearOffset < totalYears; yearOffset++) {
    const simYear = currentCalendarYear + yearOffset;
    const primaryAge = currentAge + yearOffset;
    const spouseAge = plan.spouseBirthYear ? simYear - plan.spouseBirthYear : undefined;

    const milestonesReached: string[] = [];
    if (primaryAge === plan.retirementAge) milestonesReached.push('Retirement Age');
    if (primaryAge === 50) milestonesReached.push('Age 50 Catch-up Limits');
    if (primaryAge === 55) milestonesReached.push('Age 55 Rule of 55');
    if (primaryAge === 59) milestonesReached.push('Age 59.5 Penalty Free');
    if (primaryAge === 62) milestonesReached.push('Age 62 Early Social Security');
    if (primaryAge === 65) milestonesReached.push('Age 65 Medicare Eligibility');
    if (primaryAge === 67) milestonesReached.push('Age 67 Full SS Retirement Age');
    if (primaryAge === 70) milestonesReached.push('Age 70 Max Social Security');
    if (primaryAge === 73) milestonesReached.push('Age 73 RMD Age');

    const compoundInflation = Math.pow(1 + inflationRate, yearOffset);

    // 1. Calculate Gross Inflows
    let salaryIncome = 0;
    let ssIncome = 0;
    let pensionIncome = 0;
    let otherIncome = 0;

    for (const ev of plan.events.filter((e) => e.category === 'income')) {
      if (!isEventActive(ev, simYear, primaryAge, plan.retirementAge)) continue;
      const baseAmt = ev.amount * (ev.frequency === 'monthly' ? 12 : 1);
      const growthMult = Math.pow(1 + ev.growthRate / 100, yearOffset);
      const inflMult = ev.adjustForInflation ? compoundInflation : 1;
      let val = baseAmt * growthMult * inflMult;
      if (ev.growthCap && val > ev.growthCap) val = ev.growthCap;

      if (ev.type === 'salary') salaryIncome += val;
      else if (ev.type === 'social_security') ssIncome += val;
      else if (ev.type === 'pension') pensionIncome += val;
      else otherIncome += val;
    }

    const grossIncome = salaryIncome + ssIncome + pensionIncome + otherIncome;

    // 2. Calculate Scheduled Outflows
    let livingExpenses = 0;
    for (const ev of plan.events.filter((e) => e.category === 'expense')) {
      if (!isEventActive(ev, simYear, primaryAge, plan.retirementAge)) continue;
      const baseAmt = ev.amount * (ev.frequency === 'monthly' ? 12 : 1);
      const growthMult = Math.pow(1 + ev.growthRate / 100, yearOffset);
      const inflMult = ev.adjustForInflation ? compoundInflation : 1;
      let val = baseAmt * growthMult * inflMult;
      if (ev.growthCap && val > ev.growthCap) val = ev.growthCap;
      livingExpenses += val;
    }

    // Debt Payments
    let debtPayments = 0;
    for (const liabId in liabilitiesState) {
      const liab = liabilitiesState[liabId];
      if (liab.balance > 0) {
        const annualPay = liab.monthlyPayment * 12;
        const pay = Math.min(liab.balance, annualPay);
        debtPayments += pay;
        liab.balance = Math.max(0, liab.balance - (pay - liab.balance * (liab.interestRate / 100)));
      }
    }

    const totalExpenses = livingExpenses + debtPayments;

    // 3. Tax Estimation
    const stdDeduction = parseFloat(rules.standardDeduction || '15000') * compoundInflation;
    const ficaTax = salaryIncome * 0.0765; // 6.2% SS + 1.45% Medicare
    const taxableOrdinaryIncome = Math.max(0, salaryIncome + pensionIncome + otherIncome + ssIncome * 0.5 - stdDeduction);

    let ordinaryTax = 0;
    for (const b of rules.ordinaryTaxBrackets) {
      const thresh = b.threshold * compoundInflation;
      if (taxableOrdinaryIncome > thresh) {
        const taxableChunk = (b.threshold === rules.ordinaryTaxBrackets[rules.ordinaryTaxBrackets.length - 1].threshold)
          ? taxableOrdinaryIncome - thresh
          : Math.min(taxableOrdinaryIncome - thresh, (rules.ordinaryTaxBrackets[rules.ordinaryTaxBrackets.indexOf(b) + 1]?.threshold ?? thresh) * compoundInflation - thresh);
        ordinaryTax += taxableChunk * b.rate;
      }
    }

    const capGainsTax = 0;
    const taxesPaid = ficaTax + ordinaryTax + capGainsTax;
    const effectiveTaxRate = grossIncome > 0 ? (taxesPaid / grossIncome) * 100 : 0;

    const netCashFlow = grossIncome - totalExpenses - taxesPaid;

    let surplusSaved = 0;
    let deficitWithdrawn = 0;

    // 4. Surplus Savings Routing or Deficit Drawdown
    if (netCashFlow > 0) {
      let surplus = netCashFlow;
      const sortedFlows = [...plan.flows].sort((a, b) => a.rank - b.rank);
      for (const flow of sortedFlows) {
        if (surplus <= 0) break;
        const targetAcc = accountsState[flow.targetAccountId];
        if (!targetAcc) continue;

        let limit = surplus;
        if (flow.ruleType === 'percentage' && flow.ruleValue) {
          limit = salaryIncome * (flow.ruleValue / 100);
        } else if (flow.ruleType === 'maximize') {
          const isAge50 = primaryAge >= 50;
          let maxLimit = 7000 + (isAge50 ? 1000 : 0);
          if (targetAcc.type.includes('401k')) maxLimit = 23000 + (isAge50 ? 7500 : 0);
          else if (targetAcc.type === 'hsa') maxLimit = 4150 + (primaryAge >= 55 ? 1000 : 0);
          limit = Math.min(surplus, maxLimit);
        }

        const alloc = Math.min(surplus, limit);
        targetAcc.balance += alloc;
        surplus -= alloc;
        surplusSaved += alloc;
      }

      // Default leftover surplus to taxable account or cash
      if (surplus > 0) {
        const taxableAcc = Object.values(accountsState).find((a) => a.type === 'taxable' || a.type === 'cash');
        if (taxableAcc) taxableAcc.balance += surplus;
        surplusSaved += surplus;
      }
    } else if (netCashFlow < 0) {
      let deficit = Math.abs(netCashFlow);
      deficitWithdrawn = deficit;

      const accountsList = Object.values(accountsState);
      const getDrawdownOrder = () => {
        if (plan.withdrawalMethod === 'custom_order' && plan.customWithdrawalOrder?.length) {
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

        const withdrawal = Math.min(acc.balance, deficit);
        acc.balance -= withdrawal;
        deficit -= withdrawal;
      }
    }

    // 5. Asset Growth & Dividend Yield Accrual
    let taxableTotal = 0;
    let taxDeferredTotal = 0;
    let taxFreeTotal = 0;
    let hsaTotal = 0;
    let cashTotal = 0;

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

        acc.balance = acc.balance * (1 + growth + divYield);

        if (acc.type === 'taxable' || acc.type === 'crypto') taxableTotal += acc.balance;
        else if (acc.type === 'traditional_ira' || acc.type === 'traditional_401k') taxDeferredTotal += acc.balance;
        else if (acc.type === 'roth_ira' || acc.type === 'roth_401k') taxFreeTotal += acc.balance;
        else if (acc.type === 'hsa') hsaTotal += acc.balance;
        else cashTotal += acc.balance;
      }
    }

    const totalLiabilities = Object.values(liabilitiesState).reduce((sum, l) => sum + l.balance, 0);
    const totalAssets = taxableTotal + taxDeferredTotal + taxFreeTotal + hsaTotal + cashTotal;
    const netWorth = totalAssets - totalLiabilities;
    const liquidNetWorth = taxableTotal + taxFreeTotal + cashTotal;

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
      ssIncome,
      pensionIncome,
      otherIncome,
      totalExpenses,
      livingExpenses,
      debtPayments,
      taxesPaid,
      ordinaryTax,
      capGainsTax: 0,
      ficaTax,
      effectiveTaxRate,
      netCashFlow,
      surplusSaved,
      deficitWithdrawn,
      portfolioBreakdown: {
        taxable: taxableTotal,
        taxDeferred: taxDeferredTotal,
        taxFree: taxFreeTotal,
        hsa: hsaTotal,
        cash: cashTotal,
      },
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

function isEventActive(ev: EngineEvent, simYear: number, primaryAge: number, retirementAge: number): boolean {
  if (ev.startTriggerType === 'age' && ev.startTriggerValue) {
    if (primaryAge < parseInt(ev.startTriggerValue, 10)) return false;
  } else if (ev.startTriggerType === 'year' && ev.startTriggerValue) {
    if (simYear < parseInt(ev.startTriggerValue, 10)) return false;
  }

  if (ev.endTriggerType === 'age' && ev.endTriggerValue) {
    if (primaryAge > parseInt(ev.endTriggerValue, 10)) return false;
  } else if (ev.endTriggerType === 'year' && ev.endTriggerValue) {
    if (simYear > parseInt(ev.endTriggerValue, 10)) return false;
  } else if (ev.endTriggerType === 'retirement') {
    if (primaryAge >= retirementAge) return false;
  }

  return true;
}
