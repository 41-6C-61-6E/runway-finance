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
    withdrawalMethod?: 'textbook' | 'proportional' | 'tax_optimized' | 'custom_order';
    enableRothConversions?: boolean;
    rothConversionTargetCeiling?: 'top_of_10' | 'top_of_12' | 'top_of_22' | 'irmaa_tier1';
    avoidIrmaaCliffs?: boolean;
  };
  rules?: typeof DEFAULT_2026_RULES;
}

export interface AccountDrawdownDetail {
  accountId: string;
  accountName: string;
  accountType: string;
  amount: number;
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

  // Mutable deep clones of state for simulation loop
  const accountsState: Record<string, EngineAccount> = {};
  for (const acc of plan.accounts) {
    accountsState[acc.id] = { ...acc };
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

    const inflationRate = (plan.settings?.fixedInflationRate ?? 3.0) / 100;
    const compoundInflation = Math.pow(1 + inflationRate, yearOffset);

    // 0. Check IRMAA surcharges triggered from 2 years prior (age 65+)
    const irmaaSurchargeAnnual = primaryAge >= 65 ? irmaaSurchargeQueue[simYear] || 0 : 0;

    // 1. Income Events Calculation
    let salaryIncome = 0;
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

      if (ev.type === 'salary') salaryIncome += val;
      else if (ev.type === 'pension') pensionIncome += val;
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

    // 3. Tax Estimation (MFJ Aware)
    const stdDeductionBase = parseFloat(rules.standardDeduction || '15000');
    const stdDeduction = stdDeductionBase * (isMfj ? 2 : 1) * compoundInflation;
    const ficaTax = salaryIncome * 0.0765;

    // IRS Provisional Income & SS Taxation Formula
    const provisionalIncome = salaryIncome + pensionIncome + otherIncome + totalSsIncome * 0.5;
    const ssTier1 = (isMfj ? 32000 : 25000) * compoundInflation;
    const ssTier2 = (isMfj ? 44000 : 34000) * compoundInflation;

    let taxableSs = 0;
    if (provisionalIncome > ssTier2) {
      taxableSs = Math.min(0.85 * totalSsIncome, 0.50 * (ssTier2 - ssTier1) + 0.85 * (provisionalIncome - ssTier2));
    } else if (provisionalIncome > ssTier1) {
      taxableSs = Math.min(0.50 * totalSsIncome, 0.50 * (provisionalIncome - ssTier1));
    }

    const taxableOrdinaryIncome = Math.max(0, salaryIncome + pensionIncome + otherIncome + taxableSs - stdDeduction);

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

    const capGainsTax = 0;
    const taxesPaid = ficaTax + ordinaryTax + capGainsTax;
    const effectiveTaxRate = grossIncome > 0 ? (taxesPaid / grossIncome) * 100 : 0;

    const netCashFlow = grossIncome - totalExpenses - taxesPaid;

    let surplusSaved = 0;
    let deficitWithdrawn = 0;
    const accountDrawdowns: AccountDrawdownDetail[] = [];
    const drawdownsByType = { cash: 0, taxable: 0, traditional: 0, roth: 0, hsa: 0 };
    let rothConversionAmount = 0;

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
          const isAge50 = primaryAge >= 50 || (spouseAge !== undefined && spouseAge >= 50);
          let maxLimit = (isMfj ? 14000 : 7000) + (isAge50 ? 1000 : 0);
          if (targetAcc.type.includes('401k')) maxLimit = (isMfj ? 46000 : 23000) + (isAge50 ? 7500 : 0);
          else if (targetAcc.type === 'hsa') maxLimit = (isMfj || targetAcc.owner === 'joint' ? 8300 : 4150) + (primaryAge >= 55 ? 1000 : 0);
          limit = Math.min(surplus, maxLimit);
        }

        const alloc = Math.min(surplus, limit);
        targetAcc.balance += alloc;
        surplus -= alloc;
        surplusSaved += alloc;
      }

      if (surplus > 0) {
        const taxableAcc = Object.values(accountsState).find((a) => a.type === 'taxable' || a.type === 'cash');
        if (taxableAcc) taxableAcc.balance += surplus;
        surplusSaved += surplus;
      }
    } else if (netCashFlow < 0) {
      let deficit = Math.abs(netCashFlow);
      deficitWithdrawn = deficit;

      const withdrawFromAcc = (acc: EngineAccount, amt: number) => {
        const actual = Math.min(acc.balance, amt);
        if (actual <= 0) return 0;
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
        // Tax-Bracket Shielding: Fill 12% bracket with Traditional first, then remaining from Taxable / Roth
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
        // 'textbook' or 'custom_order'
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

    // 4b. Roth Conversion Ladder Engine (Retired, before RMD age 73)
    const isRetired = primaryAge >= plan.retirementAge;
    const rmdStartAge = rules.secureActRules?.rmdAge || 73;
    if (plan.settings?.enableRothConversions && isRetired && primaryAge < rmdStartAge) {
      let targetCeilingRate = 0.12;
      if (plan.settings.rothConversionTargetCeiling === 'top_of_10') targetCeilingRate = 0.10;
      else if (plan.settings.rothConversionTargetCeiling === 'top_of_22') targetCeilingRate = 0.22;

      const targetBracketObj =
        rules.ordinaryTaxBrackets.find((b: any) => Math.abs(b.rate - targetCeilingRate) < 0.01) ||
        rules.ordinaryTaxBrackets[1];
      const targetCeilingDollars = (targetBracketObj ? targetBracketObj.threshold : 48475) * (isMfj ? 2 : 1) * compoundInflation;

      const currentTaxable = taxableOrdinaryIncome + drawdownsByType.traditional;
      const convHeadroom = Math.max(0, targetCeilingDollars - currentTaxable);

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

    // 4c. Compute MAGI & Queue IRMAA Surcharges for Year Y+2
    const magi = salaryIncome + pensionIncome + taxableSs + drawdownsByType.traditional + rothConversionAmount;
    let irmaaTier = 0;
    const irmaaList = rules.irmaaThresholds || [];
    for (let idx = irmaaList.length - 1; idx >= 0; idx--) {
      const tierObj = irmaaList[idx];
      const limit = isMfj ? tierObj.magiJoint : tierObj.magiSingle;
      if (magi >= limit && limit > 0) {
        irmaaTier = idx;
        const annualSurcharge = (tierObj.partBMonthly + tierObj.partDMonthly) * 12 * (isMfj ? 2 : 1);
        irmaaSurchargeQueue[simYear + 2] = annualSurcharge;
        break;
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
      accountDrawdowns,
      drawdownsByType,
      rothConversionAmount,
      magi,
      irmaaTier,
      irmaaSurchargeAnnual,
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
