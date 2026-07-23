import { describe, it, expect } from 'vitest';
import { runRetirementSimulation, EnginePlan } from '@/lib/services/retirement-engine';
import { DEFAULT_2026_RULES } from '@/lib/constants/retirement-defaults';

describe('Withdrawal Sequencing Strategies Comparison', () => {
  const mockPlan: EnginePlan = {
    id: 'test_plan',
    name: 'Strategy Test Plan',
    hasSpouse: false,
    primaryBirthYear: 1966, // Age 60 in 2026
    primaryBirthMonth: 1,
    filingStatus: 'single',
    retirementAge: 60,
    lifeExpectancyAge: 85,
    withdrawalMethod: 'textbook',
    primarySalary: 0,
    accounts: [
      {
        id: 'acc_cash',
        name: 'Cash Savings',
        type: 'cash',
        owner: 'primary',
        balance: 50000,
        costBasis: 0,
        expectedGrowthRate: 1,
        dividendYield: 0,
        reinvestDividends: true,
        qualifiedDividendRatio: 1.0,
      },
      {
        id: 'acc_taxable',
        name: 'Taxable Brokerage',
        type: 'taxable',
        owner: 'primary',
        balance: 300000,
        costBasis: 150000,
        expectedGrowthRate: 7,
        dividendYield: 2,
        reinvestDividends: true,
        qualifiedDividendRatio: 1.0,
      },
      {
        id: 'acc_trad',
        name: 'Traditional 401k',
        type: 'traditional_401k',
        owner: 'primary',
        balance: 600000,
        costBasis: 0,
        expectedGrowthRate: 7,
        dividendYield: 0,
        reinvestDividends: true,
        qualifiedDividendRatio: 1.0,
      },
      {
        id: 'acc_roth',
        name: 'Roth IRA',
        type: 'roth_ira',
        owner: 'primary',
        balance: 250000,
        costBasis: 150000,
        expectedGrowthRate: 7,
        dividendYield: 0,
        reinvestDividends: true,
        qualifiedDividendRatio: 1.0,
      },
    ],
    events: [
      {
        id: 'ev_exp',
        name: 'Living Expenses',
        category: 'expense',
        type: 'expense',
        owner: 'primary',
        amount: 60000,
        frequency: 'yearly',
        growthRate: 2.5,
        adjustForInflation: true,
        startTriggerType: 'now',
        endTriggerType: 'end_of_plan',
      },
    ],
    liabilities: [],
    flows: [],
    settings: {
      fixedInflationRate: 2.5,
      enableRothConversions: false,
      withdrawalMethod: 'textbook',
    },
    rules: DEFAULT_2026_RULES,
  };

  it('runs textbook strategy drawing taxable before traditional', () => {
    const res = runRetirementSimulation({ ...mockPlan, withdrawalMethod: 'textbook', settings: { ...mockPlan.settings, withdrawalMethod: 'textbook' } });
    expect(res.yearlyResults.length).toBeGreaterThan(0);

    const firstRetirementYear = res.yearlyResults.find((y) => y.primaryAge >= 60)!;
    expect(firstRetirementYear).toBeDefined();
    expect(firstRetirementYear.drawdownsByType.cash + firstRetirementYear.drawdownsByType.taxable).toBeGreaterThan(0);
    expect(firstRetirementYear.drawdownsByType.traditional).toBe(0);
  });

  it('runs tax_deferred_first strategy drawing traditional before taxable', () => {
    const res = runRetirementSimulation({ ...mockPlan, withdrawalMethod: 'tax_deferred_first', settings: { ...mockPlan.settings, withdrawalMethod: 'tax_deferred_first' } });
    expect(res.yearlyResults.length).toBeGreaterThan(0);

    const firstRetirementYear = res.yearlyResults.find((y) => y.primaryAge >= 60)!;
    expect(firstRetirementYear).toBeDefined();
    expect(firstRetirementYear.drawdownsByType.traditional).toBeGreaterThan(0);
  });

  it('runs proportional strategy drawing across accounts', () => {
    const res = runRetirementSimulation({ ...mockPlan, withdrawalMethod: 'proportional', settings: { ...mockPlan.settings, withdrawalMethod: 'proportional' } });
    expect(res.yearlyResults.length).toBeGreaterThan(0);

    const firstRetirementYear = res.yearlyResults.find((y) => y.primaryAge >= 60)!;
    expect(firstRetirementYear).toBeDefined();
    expect(firstRetirementYear.drawdownsByType.taxable).toBeGreaterThan(0);
    expect(firstRetirementYear.drawdownsByType.traditional).toBeGreaterThan(0);
  });

  it('produces distinct simulation summaries across strategies', () => {
    const textbook = runRetirementSimulation({ ...mockPlan, withdrawalMethod: 'textbook', settings: { ...mockPlan.settings, withdrawalMethod: 'textbook' } });
    const waterfall = runRetirementSimulation({ ...mockPlan, withdrawalMethod: 'tax_deferred_first', settings: { ...mockPlan.settings, withdrawalMethod: 'tax_deferred_first' } });

    const yrText = textbook.yearlyResults.find((y) => y.primaryAge >= 60)!;
    const yrWater = waterfall.yearlyResults.find((y) => y.primaryAge >= 60)!;

    // Ensure strategies differ in drawdown patterns and metrics
    expect(yrText.drawdownsByType.traditional).not.toBe(yrWater.drawdownsByType.traditional);
  });
});
