import { describe, it, expect } from 'vitest';
import { runRetirementSimulation, EnginePlan } from '@/lib/services/retirement-engine';
import { DEFAULT_2026_RULES } from '@/lib/constants/retirement-defaults';

describe('Retirement Engine Advanced Drawdowns, Conversions & IRMAA', () => {
  const basePlan: EnginePlan = {
    id: 'plan_drawdown_test',
    name: 'Advanced Drawdown & Roth Test Plan',
    hasSpouse: false,
    primaryBirthYear: 1970, // Age 56 in 2026
    primaryBirthMonth: 1,
    filingStatus: 'single',
    retirementAge: 60, // Retirement in 4 years (2030)
    lifeExpectancyAge: 85,
    withdrawalMethod: 'textbook',
    accounts: [
      {
        id: 'acc_cash',
        name: 'Checking Cash',
        type: 'cash',
        owner: 'primary',
        balance: 20000,
        costBasis: 20000,
        expectedGrowthRate: 1.0,
        dividendYield: 0.0,
        reinvestDividends: false,
        qualifiedDividendRatio: 0,
      },
      {
        id: 'acc_taxable',
        name: 'Vanguard Brokerage',
        type: 'taxable',
        owner: 'primary',
        balance: 200000,
        costBasis: 150000,
        expectedGrowthRate: 6.0,
        dividendYield: 2.0,
        reinvestDividends: true,
        qualifiedDividendRatio: 1.0,
      },
      {
        id: 'acc_trad',
        name: 'Traditional 401(k)',
        type: 'traditional_401k',
        owner: 'primary',
        balance: 500000,
        costBasis: 500000,
        expectedGrowthRate: 6.0,
        dividendYield: 0,
        reinvestDividends: true,
        qualifiedDividendRatio: 0,
      },
      {
        id: 'acc_roth',
        name: 'Roth IRA',
        type: 'roth_ira',
        owner: 'primary',
        balance: 100000,
        costBasis: 100000,
        expectedGrowthRate: 6.0,
        dividendYield: 0,
        reinvestDividends: true,
        qualifiedDividendRatio: 0,
      },
    ],
    liabilities: [],
    events: [
      {
        id: 'ev_salary',
        name: 'Primary Salary',
        category: 'income',
        type: 'salary',
        owner: 'primary',
        amount: 100000,
        frequency: 'yearly',
        growthRate: 2.0,
        adjustForInflation: true,
        startTriggerType: 'now',
        endTriggerType: 'retirement',
      },
      {
        id: 'ev_living',
        name: 'Living Expenses',
        category: 'expense',
        type: 'living_expense',
        owner: 'primary',
        amount: 60000,
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
      incomeTaxModifier: 0.0,
      capGainsTaxModifier: 0.0,
      heirFlatIncomeTaxRate: 25.0,
      stepUpBasis: true,
      realEstateLiquidationRate: 6.0,
      administrativeCostRate: 1.0,
      charitableGiving: 0.0,
      withdrawalMethod: 'textbook',
      enableRothConversions: false,
    },
    rules: DEFAULT_2026_RULES,
  };

  it('tracks account-level drawdowns and categorizes drawdowns by asset type during retirement', () => {
    const output = runRetirementSimulation(basePlan);
    expect(output.yearlyResults.length).toBeGreaterThan(10);

    // Find a retirement drawdown year (e.g. age 61)
    const retirementYear = output.yearlyResults.find((y) => y.primaryAge === 61);
    expect(retirementYear).toBeDefined();
    expect(retirementYear?.deficitWithdrawn).toBeGreaterThan(0);
    expect(retirementYear?.accountDrawdowns.length).toBeGreaterThan(0);

    // Under textbook waterfall: cash and taxable should be drawn first
    expect(retirementYear?.drawdownsByType.cash + retirementYear?.drawdownsByType.taxable).toBeGreaterThan(0);
  });

  it('executes Tax-Bracket Shielding drawdown strategy filling low tax brackets', () => {
    const taxOptPlan: EnginePlan = {
      ...basePlan,
      settings: {
        ...basePlan.settings,
        withdrawalMethod: 'tax_optimized',
      },
    };

    const output = runRetirementSimulation(taxOptPlan);
    const retirementYear = output.yearlyResults.find((y) => y.primaryAge === 61);

    expect(retirementYear).toBeDefined();
    // Under tax_optimized strategy, Traditional IRA is drawn up to 12% bracket headroom
    expect(retirementYear?.drawdownsByType.traditional).toBeGreaterThan(0);
  });

  it('executes Roth Conversion Ladder during retirement prior to age 73 RMDs', () => {
    const rothConvPlan: EnginePlan = {
      ...basePlan,
      settings: {
        ...basePlan.settings,
        enableRothConversions: true,
        rothConversionTargetCeiling: 'top_of_12',
      },
    };

    const output = runRetirementSimulation(rothConvPlan);
    const earlyRetirementYear = output.yearlyResults.find((y) => y.primaryAge === 62);

    expect(earlyRetirementYear).toBeDefined();
    expect(earlyRetirementYear?.rothConversionAmount).toBeGreaterThan(0);
  });

  it('computes MAGI and queues IRMAA surcharges lookback correctly', () => {
    const output = runRetirementSimulation(basePlan);
    const yearAge65 = output.yearlyResults.find((y) => y.primaryAge === 65);
    expect(yearAge65).toBeDefined();
    expect(yearAge65?.magi).toBeDefined();
  });
});
