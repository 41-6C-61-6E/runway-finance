import { describe, it, expect } from 'vitest';
import { runRetirementSimulation, EnginePlan } from '@/lib/services/retirement-engine';
import { DEFAULT_2026_RULES } from '@/lib/constants/retirement-defaults';

describe('Retirement Projection Engine', () => {
  it('correctly simulates accumulation and drawdown', () => {
    const mockPlan: EnginePlan = {
      id: 'plan_1',
      name: 'Test FIRE Plan',
      hasSpouse: false,
      primaryBirthYear: 1990,
      primaryBirthMonth: 1,
      filingStatus: 'single',
      retirementAge: 60,
      lifeExpectancyAge: 80,
      withdrawalMethod: 'textbook',
      accounts: [
        {
          id: 'acc_1',
          name: 'Taxable Brokerage',
          type: 'taxable',
          owner: 'primary',
          balance: 100000,
          costBasis: 80000,
          expectedGrowthRate: 7.0,
          dividendYield: 2.0,
          reinvestDividends: true,
          qualifiedDividendRatio: 1.0,
        },
        {
          id: 'acc_2',
          name: 'Roth IRA',
          type: 'roth_ira',
          owner: 'primary',
          balance: 50000,
          costBasis: 50000,
          expectedGrowthRate: 7.0,
          dividendYield: 0.0,
          reinvestDividends: true,
          qualifiedDividendRatio: 1.0,
        },
      ],
      liabilities: [],
      events: [
        {
          id: 'ev_1',
          name: 'Salary Job',
          category: 'income',
          type: 'salary',
          owner: 'primary',
          amount: 100000,
          frequency: 'yearly',
          growthRate: 3.0,
          adjustForInflation: true,
          startTriggerType: 'now',
          endTriggerType: 'retirement',
        },
        {
          id: 'ev_2',
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
      flows: [
        {
          id: 'fl_1',
          name: 'Save Leftover Surplus',
          type: 'invest',
          rank: 1,
          targetAccountId: 'acc_1',
          ruleType: 'save_leftover',
        },
      ],
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
      },
      rules: DEFAULT_2026_RULES,
    };

    const output = runRetirementSimulation(mockPlan);

    expect(output.yearlyResults.length).toBe(44); // 80 - 36
    expect(output.endingNetWorth).toBeGreaterThan(0);
    expect(output.success).toBe(true);
    expect(output.netLegacy).toBeGreaterThan(0);
  });
});
