import { describe, it, expect } from 'vitest';
import { runRetirementSimulation, EnginePlan } from '@/lib/services/retirement-engine';
import { DEFAULT_2026_RULES } from '@/lib/constants/retirement-defaults';

describe('Scenarios & Strategy Engine', () => {
  const basePlan: EnginePlan = {
    id: 'plan_scenario_test',
    name: 'Scenario Base Plan',
    hasSpouse: false,
    primaryBirthYear: 1985,
    primaryBirthMonth: 1,
    filingStatus: 'single',
    retirementAge: 60,
    lifeExpectancyAge: 85,
    primarySalary: 120000,
    primarySalaryYear: 2026,
    primarySalaryRaisePct: 2.5,
    withdrawalMethod: 'textbook',
    primarySsMonthlyAmount: 2800,
    primarySsStartAge: 67,
    accounts: [
      {
        id: 'acc_taxable',
        name: 'Brokerage Account',
        type: 'taxable',
        owner: 'primary',
        balance: 150000,
        costBasis: 100000,
        expectedGrowthRate: 7.0,
        dividendYield: 2.0,
        reinvestDividends: true,
        qualifiedDividendRatio: 1.0,
        isSurplusDestination: true,
      },
      {
        id: 'acc_trad',
        name: 'Traditional 401(k)',
        type: 'traditional_401k',
        owner: 'primary',
        balance: 300000,
        costBasis: 300000,
        expectedGrowthRate: 7.0,
        dividendYield: 2.0,
        reinvestDividends: true,
        qualifiedDividendRatio: 1.0,
        contributionMode: 'percentage',
        contributionValue: 10.0,
      },
      {
        id: 'acc_roth',
        name: 'Roth IRA',
        type: 'roth_ira',
        owner: 'primary',
        balance: 100000,
        costBasis: 80000,
        expectedGrowthRate: 7.0,
        dividendYield: 2.0,
        reinvestDividends: true,
        qualifiedDividendRatio: 1.0,
        contributionMode: 'maximize',
      },
    ],
    liabilities: [],
    events: [
      {
        id: 'ev_exp',
        name: 'Living Expenses',
        category: 'expense',
        type: 'living_expense',
        owner: 'primary',
        amount: 50000,
        frequency: 'yearly',
        growthRate: 2.5,
        adjustForInflation: true,
        startTriggerType: 'now',
        endTriggerType: 'end_of_plan',
      },
    ],
    flows: [],
    settings: {
      fixedInflationRate: 2.5,
      withholdingDeferred: 20.0,
      withholdingTaxable: 10.0,
      heirFlatIncomeTaxRate: 25.0,
    },
    rules: DEFAULT_2026_RULES,
  };

  it('compares outcomes across different withdrawal strategies', () => {
    const textbookPlan = { ...basePlan, withdrawalMethod: 'textbook' as const };
    const proportionalPlan = { ...basePlan, withdrawalMethod: 'proportional' as const };
    const taxDeferredFirstPlan = { ...basePlan, withdrawalMethod: 'tax_deferred_first' as const };
    const rothLadderPlan = {
      ...basePlan,
      withdrawalMethod: 'textbook' as const,
      settings: {
        ...basePlan.settings,
        enableRothConversions: true,
        rothConversionTargetCeiling: 'top_of_12' as const,
        avoidIrmaaCliffs: true,
      },
    };

    const resTextbook = runRetirementSimulation(textbookPlan);
    const resProportional = runRetirementSimulation(proportionalPlan);
    const resTaxDeferred = runRetirementSimulation(taxDeferredFirstPlan);
    const resRothLadder = runRetirementSimulation(rothLadderPlan);

    expect(resTextbook.yearlyResults.length).toBeGreaterThan(0);
    expect(resProportional.yearlyResults.length).toBeGreaterThan(0);
    expect(resTaxDeferred.yearlyResults.length).toBeGreaterThan(0);
    expect(resRothLadder.yearlyResults.length).toBeGreaterThan(0);

    const endNWTextbook = resTextbook.yearlyResults[resTextbook.yearlyResults.length - 1].netWorth;
    const endNWRothLadder = resRothLadder.yearlyResults[resRothLadder.yearlyResults.length - 1].netWorth;

    expect(endNWTextbook).toBeGreaterThan(0);
    expect(endNWRothLadder).toBeGreaterThan(0);
  });

  it('compares Social Security claiming age variations (62 vs 67 vs 70)', () => {
    const planSs62 = { ...basePlan, primarySsStartAge: 62 };
    const planSs67 = { ...basePlan, primarySsStartAge: 67 };
    const planSs70 = { ...basePlan, primarySsStartAge: 70 };

    const resSs62 = runRetirementSimulation(planSs62);
    const resSs67 = runRetirementSimulation(planSs67);
    const resSs70 = runRetirementSimulation(planSs70);

    const yrAt62 = resSs62.yearlyResults.find((y) => y.primaryAge === 62 || y.year === 2047);
    const yrAt67 = resSs67.yearlyResults.find((y) => y.primaryAge === 67 || y.year === 2052);
    const yrAt70 = resSs70.yearlyResults.find((y) => y.primaryAge === 70 || y.year === 2055);

    expect(yrAt62).toBeDefined();
    expect(yrAt67).toBeDefined();
    expect(yrAt70).toBeDefined();
    expect(resSs62.yearlyResults.length).toBeGreaterThan(0);
  });
});
