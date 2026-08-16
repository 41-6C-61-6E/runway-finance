import { EnginePlan } from '@/lib/services/retirement-engine';
import { DEFAULT_2026_RULES } from '@/lib/constants/retirement-defaults';
import { isFireEligibleAccount } from '@/lib/utils/account-scope';

export interface BuildEnginePlanOptions {
  retirementAge?: number;
  spouseRetirementAge?: number;
  expectedGrowthRate?: number;
  fixedInflationRate?: number;
  expenseModifier?: number;
  primarySsStartAge?: number;
  spouseSsStartAge?: number;
  enableSpousalSsBenefit?: boolean;
  primarySsMonthlyAmount?: number;
  spouseSsMonthlyAmount?: number;
  enableRothConversions?: boolean;
  rothConversionTargetCeiling?: string;
  avoidIrmaaCliffs?: boolean;
  withdrawalMethod?: string;
  allowPenaltyWithdrawals?: boolean;
}

export function buildEnginePlan(plan: any, options: BuildEnginePlanOptions = {}): EnginePlan {
  const planAccountsList = Array.isArray(plan?.accounts) ? plan.accounts : [];
  const activeAccounts = planAccountsList.filter((a: any) => a.isIncluded !== false && isFireEligibleAccount(a));

  const planEventsList = Array.isArray(plan?.events) ? plan.events : [];
  const planFlowsList = Array.isArray(plan?.flows) ? plan.flows : [];
  const planLiabilitiesList = Array.isArray(plan?.liabilities) ? plan.liabilities : [];

  const currentYear = new Date().getFullYear();
  const expenseMod = options.expenseModifier ?? 0;

  return {
    id: plan?.id || 'plan_1',
    name: plan?.name || 'Primary Plan',
    hasSpouse: Boolean(plan?.hasSpouse),
    householdSize: plan?.householdSize ? Number(plan.householdSize) : (plan?.filingStatus === 'married_joint' || plan?.hasSpouse ? 2 : 1),
    primaryBirthYear: Number(plan?.primaryBirthYear) || 1985,
    primaryBirthMonth: Number(plan?.primaryBirthMonth) || 1,
    spouseBirthYear: plan?.spouseBirthYear ? Number(plan.spouseBirthYear) : undefined,
    spouseBirthMonth: plan?.spouseBirthMonth ? Number(plan.spouseBirthMonth) : undefined,
    spouseName: plan?.spouseName || 'Spouse / Partner',
    spouseRetirementAge: options.spouseRetirementAge ?? (plan?.spouseRetirementAge ? Number(plan.spouseRetirementAge) : 60),
    spouseLifeExpectancyAge: plan?.spouseLifeExpectancyAge ? Number(plan.spouseLifeExpectancyAge) : 100,
    primarySsMonthlyAmount: options.primarySsMonthlyAmount !== undefined
      ? options.primarySsMonthlyAmount
      : (plan?.primarySsMonthlyAmount !== undefined && plan?.primarySsMonthlyAmount !== null && plan?.primarySsMonthlyAmount !== ''
          ? parseFloat(plan.primarySsMonthlyAmount)
          : undefined),
    primarySsStartAge: options.primarySsStartAge ?? (plan?.primarySsStartAge ? Number(plan.primarySsStartAge) : 67),
    spouseSsMonthlyAmount: options.spouseSsMonthlyAmount !== undefined
      ? options.spouseSsMonthlyAmount
      : (plan?.spouseSsMonthlyAmount !== undefined && plan?.spouseSsMonthlyAmount !== null && plan?.spouseSsMonthlyAmount !== ''
          ? parseFloat(plan.spouseSsMonthlyAmount)
          : undefined),
    spouseSsStartAge: options.spouseSsStartAge ?? (plan?.spouseSsStartAge ? Number(plan.spouseSsStartAge) : 67),
    enableSpousalSsBenefit: options.enableSpousalSsBenefit ?? (plan?.enableSpousalSsBenefit !== false),
    filingStatus: plan?.filingStatus || 'single',
    retirementAge: options.retirementAge ?? (Number(plan?.retirementAge) || 60),
    lifeExpectancyAge: Number(plan?.lifeExpectancyAge) || 100,
    withdrawalMethod: options.withdrawalMethod || plan?.withdrawalMethod || plan?.settings?.withdrawalMethod || 'textbook',
    customWithdrawalOrder: Array.isArray(plan?.customWithdrawalOrder) ? plan.customWithdrawalOrder : undefined,
    primarySalary: parseFloat(plan?.primarySalary) || 0,
    spouseSalary: parseFloat(plan?.spouseSalary) || 0,
    primarySalaryYear: Number(plan?.primarySalaryYear) || currentYear,
    primarySalaryRaisePct: parseFloat(plan?.primarySalaryRaisePct) || 0,
    primarySalaryOverrides: plan?.primarySalaryOverrides && typeof plan?.primarySalaryOverrides === 'object' ? plan.primarySalaryOverrides : undefined,
    spouseSalaryYear: Number(plan?.spouseSalaryYear) || currentYear,
    spouseSalaryRaisePct: parseFloat(plan?.spouseSalaryRaisePct) || 0,
    spouseSalaryOverrides: plan?.spouseSalaryOverrides && typeof plan?.spouseSalaryOverrides === 'object' ? plan.spouseSalaryOverrides : undefined,
    accounts: activeAccounts.map((a: any) => {
      const parsedGrowth = parseFloat(a.expectedGrowthRate);
      const parsedYield = parseFloat(a.dividendYield);
      return {
        id: a.id,
        name: a.name,
        type: a.type,
        owner: a.owner || 'primary',
        balance: parseFloat(a.balance) || 0,
        costBasis: parseFloat(a.costBasis) || 0,
        expectedGrowthRate: options.expectedGrowthRate ?? (Number.isFinite(parsedGrowth) ? parsedGrowth : 6.0),
        dividendYield: Number.isFinite(parsedYield) ? parsedYield : 2.0,
        reinvestDividends: a.reinvestDividends !== false,
        qualifiedDividendRatio: parseFloat(a.qualifiedDividendRatio) || 1.0,
        rothPercentage: a.rothPercentage,
        contributionMode: (a.contributionMode as any) || 'none',
        contributionValue: a.contributionValue ? parseFloat(a.contributionValue) : undefined,
        contributionSalarySource: (a.contributionSalarySource as any) || undefined,
        companyMatchRate: a.companyMatchRate ? parseFloat(a.companyMatchRate) : undefined,
        companyMatchLimit: a.companyMatchLimit ? parseFloat(a.companyMatchLimit) : undefined,
        isSurplusDestination: Boolean(a.isSurplusDestination),
      };
    }),
    liabilities: planLiabilitiesList.map((l: any) => ({
      id: l.id,
      name: l.name,
      owner: l.owner || 'primary',
      balance: parseFloat(l.balance) || 0,
      interestRate: parseFloat(l.interestRate) || 0,
      monthlyPayment: parseFloat(l.monthlyPayment) || 0,
      yearsRemaining: parseFloat(l.yearsRemaining) || 30,
    })),
    events: planEventsList.map((e: any) => {
      let amt = parseFloat(e.amount) || 0;
      if (e.category === 'expense' && expenseMod !== 0) {
        amt *= (1 + expenseMod / 100);
      }
      return {
        id: e.id,
        name: e.name,
        category: e.category as any,
        type: e.type,
        owner: e.owner || 'primary',
        amount: amt,
        frequency: e.frequency as any,
        growthRate: parseFloat(e.growthRate) || 0,
        adjustForInflation: e.adjustForInflation !== false,
        startTriggerType: e.startTriggerType || 'now',
        startTriggerValue: e.startTriggerValue,
        endTriggerType: e.endTriggerType || 'retirement',
        endTriggerValue: e.endTriggerValue,
      };
    }),
    flows: planFlowsList.map((f: any) => ({
      id: f.id,
      name: f.name,
      type: f.type as any,
      rank: f.rank || 1,
      targetAccountId: f.targetAccountId,
      ruleType: f.ruleType as any,
      ruleValue: f.ruleValue ? parseFloat(f.ruleValue) : undefined,
      matchRate: f.matchRate ? parseFloat(f.matchRate) : undefined,
      matchLimit: f.matchLimit ? parseFloat(f.matchLimit) : undefined,
      matchAccountId: f.matchAccountId,
      salarySource: f.salarySource as any,
    })),
    settings: {
      fixedInflationRate: options.fixedInflationRate ?? (parseFloat(plan?.settings?.fixedInflationRate || '3.0')),
      withholdingDeferred: parseFloat(plan?.settings?.withholdingDeferred || '20.0'),
      withholdingTaxable: parseFloat(plan?.settings?.withholdingTaxable || '10.0'),
      incomeTaxModifier: parseFloat(plan?.settings?.incomeTaxModifier || '0.0'),
      capGainsTaxModifier: parseFloat(plan?.settings?.capGainsTaxModifier || '0.0'),
      heirFlatIncomeTaxRate: parseFloat(plan?.settings?.heirFlatIncomeTaxRate || '25.0'),
      stepUpBasis: plan?.settings?.stepUpBasis ?? true,
      realEstateLiquidationRate: parseFloat(plan?.settings?.realEstateLiquidationRate || '6.0'),
      administrativeCostRate: parseFloat(plan?.settings?.administrativeCostRate || '1.0'),
      charitableGiving: parseFloat(plan?.settings?.charitableGiving || '0.0'),
      withdrawalMethod: options.withdrawalMethod || plan?.settings?.withdrawalMethod || plan?.withdrawalMethod || 'textbook',
      enableRothConversions: options.enableRothConversions ?? Boolean(plan?.settings?.enableRothConversions),
      rothConversionTargetCeiling: options.rothConversionTargetCeiling || plan?.settings?.rothConversionTargetCeiling || 'top_of_12',
      avoidIrmaaCliffs: options.avoidIrmaaCliffs ?? (plan?.settings?.avoidIrmaaCliffs !== false),
      allowPenaltyWithdrawals: options.allowPenaltyWithdrawals ?? (plan?.settings?.allowPenaltyWithdrawals !== false),
    },
    rules: plan?.rules || DEFAULT_2026_RULES,
  };
}
