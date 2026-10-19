import { describe, it, expect } from 'vitest';
import {
  ScenarioOverrides,
  applyScenarioOverrides,
  buildScenarioComparison,
} from '@/lib/advice/fire-scenario';
import type { EnginePlan } from '@/lib/services/retirement-engine';

const BASE_PLAN: EnginePlan = {
  id: 'test-plan-1',
  name: 'Baseline Plan',
  hasSpouse: false,
  primaryBirthYear: 1985,
  filingStatus: 'single',
  retirementAge: 65,
  lifeExpectancyAge: 95,
  fiTargetMultiplier: 25,
  primarySalary: 120000,
  accounts: [
    {
      id: 'acc-1',
      name: 'Brokerage',
      type: 'brokerage',
      owner: 'primary',
      reinvestDividends: true,
      balance: 400000,
      costBasis: 300000,
      expectedGrowthRate: 7.0,
      dividendYield: 1.5,
    },
    {
      id: 'acc-2',
      name: '401k',
      type: 'traditional_401k',
      owner: 'primary',
      reinvestDividends: true,
      balance: 300000,
      costBasis: 0,
      expectedGrowthRate: 7.0,
      dividendYield: 0,
    },
  ],
  liabilities: [],
  events: [
    {
      id: 'ev-1',
      name: 'Living Expenses',
      category: 'expense',
      type: 'living_expense',
      owner: 'primary',
      amount: 60000,
      frequency: 'yearly',
      growthRate: 0,
      adjustForInflation: true,
      startTriggerType: 'now',
      endTriggerType: 'end_of_plan',
    },
  ],
  flows: [],
  settings: {
    fixedInflationRate: 2.5,
    withdrawalMethod: 'textbook',
  },
};

describe('Advice Fire Scenario', () => {
  it('validates ScenarioOverrides schema with bounds and strict rejection', () => {
    // Valid
    const valid = ScenarioOverrides.safeParse({
      retirementAge: 55,
      annualSpendingChangePct: -15,
      growthRateDeltaPct: 1.5,
      inflationRate: 3.0,
    });
    expect(valid.success).toBe(true);

    // Invalid retirement age (< 30 or > 80)
    const tooYoung = ScenarioOverrides.safeParse({ retirementAge: 25 });
    expect(tooYoung.success).toBe(false);

    const tooOld = ScenarioOverrides.safeParse({ retirementAge: 85 });
    expect(tooOld.success).toBe(false);

    // Invalid spending change pct (< -50 or > 100)
    const tooLowSpending = ScenarioOverrides.safeParse({ annualSpendingChangePct: -70 });
    expect(tooLowSpending.success).toBe(false);

    // Unknown field rejected because strict()
    const unknownField = ScenarioOverrides.safeParse({ retirementAge: 55, randomKey: 123 });
    expect(unknownField.success).toBe(false);
  });

  it('applies overrides to a deep clone without mutating the original plan', () => {
    const originalCopy = JSON.parse(JSON.stringify(BASE_PLAN));

    const overrides = {
      retirementAge: 58,
      salaryChangePct: 10,
      growthRateDeltaPct: -1.0,
      annualSpendingChangePct: 20,
      inflationRate: 3.5,
      lumpSum: { amount: 50000, age: 60 },
    };

    const scenarioPlan = applyScenarioOverrides(BASE_PLAN, overrides);

    // Assert original plan is unchanged
    expect(BASE_PLAN).toEqual(originalCopy);
    expect(BASE_PLAN.retirementAge).toBe(65);
    expect(BASE_PLAN.primarySalary).toBe(120000);

    // Assert scenario plan received overrides
    expect(scenarioPlan.retirementAge).toBe(58);
    expect(scenarioPlan.primarySalary).toBe(132000); // 120000 * 1.1
    expect(scenarioPlan.settings?.fixedInflationRate).toBe(3.5);
    expect(scenarioPlan.accounts[0].expectedGrowthRate).toBe(6.0); // 7.0 - 1.0

    // Check spending was scaled
    const livingExp = scenarioPlan.events.find((e) => e.type === 'living_expense');
    expect(livingExp?.amount).toBe(72000); // 60000 * 1.2

    // Check lump sum event was added
    const lump = scenarioPlan.events.find((e) => e.id === 'hypothetical_lump_60');
    expect(lump).toBeDefined();
    expect(lump?.amount).toBe(50000);
    expect(lump?.category).toBe('income');
  });

  it('builds comparison diff and includes "Hypothetical — not saved" disclaimer', () => {
    const comparison = buildScenarioComparison(BASE_PLAN, {
      retirementAge: 60,
      annualSpendingChangePct: -10,
    });

    expect(comparison.markdown).toContain('Hypothetical — not saved');
    expect(comparison.markdown).toContain('Retirement Age: 65 → 60');
    expect(comparison.markdown).toContain('Annual Spending: -10%');
    expect(comparison.metrics.some((m) => m.metric === 'Plan Success')).toBe(true);
    expect(comparison.metrics.some((m) => m.metric === 'Net Worth at Retirement')).toBe(true);
    expect(comparison.metrics.some((m) => m.metric === 'Ending Net Worth')).toBe(true);
  });
});
