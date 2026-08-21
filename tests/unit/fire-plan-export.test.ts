import { describe, it, expect } from 'vitest';
import { buildEnginePlan } from '@/lib/utils/build-engine-plan';
import { runRetirementSimulation } from '@/lib/services/retirement-engine';
import { runMonteCarloSimulation } from '@/lib/services/monte-carlo';

describe('FIRE Plan Export and Simulation', () => {
  const samplePlan = {
    id: 'plan_test_export',
    name: 'Early FI Scenario 2035',
    primaryBirthYear: 1990,
    retirementAge: 45,
    lifeExpectancyAge: 95,
    annualRetirementExpenses: 75000,
    safeWithdrawalRate: 3.5,
    expectedGrowthRate: 7.0,
    fixedInflationRate: 2.5,
    withdrawalMethod: 'textbook',
    enableRothConversions: true,
    rothConversionTargetCeiling: '12% bracket',
    accounts: [
      {
        id: 'acc_1',
        name: 'Vanguard Brokerage',
        type: 'investment',
        taxCategory: 'taxable',
        balance: 350000,
        annualContribution: 30000,
        expectedGrowthRate: 7.0,
      },
      {
        id: 'acc_2',
        name: 'Fidelity 401(k)',
        type: 'traditional_401k',
        taxCategory: 'taxDeferred',
        balance: 250000,
        annualContribution: 23000,
        expectedGrowthRate: 7.0,
      },
      {
        id: 'acc_3',
        name: 'Roth IRA',
        type: 'roth_ira',
        taxCategory: 'taxFree',
        balance: 100000,
        annualContribution: 7000,
        expectedGrowthRate: 7.0,
      },
    ],
  };

  it('builds a valid EnginePlan from sample plan configuration', () => {
    const enginePlan = buildEnginePlan(samplePlan);
    expect(enginePlan.name).toBe('Early FI Scenario 2035');
    expect(enginePlan.primaryBirthYear).toBe(1990);
    expect(enginePlan.retirementAge).toBe(45);
    expect(enginePlan.accounts.length).toBe(3);
  });

  it('runs deterministic simulation successfully producing yearly results and metrics', () => {
    const enginePlan = buildEnginePlan(samplePlan);
    const results = runRetirementSimulation(enginePlan);

    expect(results.yearlyResults.length).toBeGreaterThan(0);
    expect(results.endingNetWorth).toBeDefined();

    const startYear = results.yearlyResults[0];
    expect(startYear.netWorth).toBeGreaterThanOrEqual(700000);

    const retirementYear = results.yearlyResults.find((y) => y.primaryAge === 45);
    expect(retirementYear).toBeDefined();
    expect(retirementYear!.netWorth).toBeGreaterThan(startYear.netWorth);
  });

  it('runs Monte Carlo simulation and outputs valid statistical percentiles', () => {
    const enginePlan = buildEnginePlan(samplePlan);
    const mcResults = runMonteCarloSimulation(enginePlan, { numberOfTrials: 50 });

    expect(mcResults.successRate).toBeGreaterThanOrEqual(0);
    expect(mcResults.successRate).toBeLessThanOrEqual(100);
    expect(mcResults.percentiles.years.length).toBeGreaterThan(0);
    expect(mcResults.percentiles.p50.length).toBe(mcResults.percentiles.years.length);
  });
});
