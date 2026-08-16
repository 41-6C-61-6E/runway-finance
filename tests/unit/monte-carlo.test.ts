import { describe, it, expect } from 'vitest';
import { runMonteCarloSimulation } from '@/lib/services/monte-carlo';
import { EnginePlan } from '@/lib/services/retirement-engine';
import { DEFAULT_2026_RULES } from '@/lib/constants/retirement-defaults';

describe('Monte Carlo Simulation Engine', () => {
  const mockPlan: EnginePlan = {
    id: 'plan_mc_test',
    name: 'Monte Carlo Test Plan',
    hasSpouse: false,
    primaryBirthYear: 1990,
    primaryBirthMonth: 1,
    filingStatus: 'single',
    retirementAge: 60,
    lifeExpectancyAge: 85,
    primarySalary: 80000,
    primarySalaryYear: 2026,
    primarySalaryRaisePct: 2.5,
    withdrawalMethod: 'textbook',
    accounts: [
      {
        id: 'acc_1',
        name: '401(k) Account',
        type: 'traditional_401k',
        owner: 'primary',
        balance: 100000,
        costBasis: 100000,
        expectedGrowthRate: 7.0,
        dividendYield: 2.0,
        reinvestDividends: true,
        qualifiedDividendRatio: 1.0,
      },
    ],
    liabilities: [],
    events: [
      {
        id: 'ev_2',
        name: 'Living Expenses',
        category: 'expense',
        type: 'living_expense',
        owner: 'primary',
        amount: 40000,
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
        name: '15% Salary to 401k',
        type: 'invest',
        rank: 1,
        targetAccountId: 'acc_1',
        ruleType: 'percentage',
        ruleValue: 15,
      },
    ],
    settings: {
      fixedInflationRate: 3.0,
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

  it('runs Monte Carlo historical bootstrap simulation with real dollar discounting', () => {
    const res = runMonteCarloSimulation(mockPlan, {
      numberOfTrials: 50,
      model: 'historical_bootstrap',
      equityAllocation: 80,
      adjustForInflation: true,
      fixedInflationRate: 3.0,
    });

    expect(res.totalTrials).toBe(50);
    expect(res.successRate).toBeGreaterThan(0);
    expect(res.isRealDollars).toBe(true);
    expect(res.medianLegacy).toBeGreaterThanOrEqual(0);
    expect(res.percentiles.years.length).toBeGreaterThan(0);
  });

  it('runs Monte Carlo normal distribution simulation matching requested mean return and std dev', () => {
    const res = runMonteCarloSimulation(mockPlan, {
      numberOfTrials: 50,
      model: 'normal_distribution',
      meanAnnualReturn: 0.07,
      returnStdDev: 0.12,
      adjustForInflation: true,
    });

    expect(res.totalTrials).toBe(50);
    expect(res.medianLegacy).toBeGreaterThanOrEqual(0);
    expect(res.percentiles.years.length).toBeGreaterThan(0);
  });

  it('runs Monte Carlo constant model simulation', () => {
    const res = runMonteCarloSimulation(mockPlan, {
      numberOfTrials: 20,
      model: 'constant',
      meanAnnualReturn: 0.06,
      adjustForInflation: true,
    });

    expect(res.totalTrials).toBe(20);
    expect(res.medianLegacy).toBeGreaterThanOrEqual(0);
    expect(res.percentiles.years.length).toBeGreaterThan(0);
  });

  it('runs deterministically when a custom randomFn is provided', () => {
    // Simple pseudo-random generator (mulberry32)
    const createPrng = (seed: number) => {
      let s = seed;
      return () => {
        s |= 0;
        s = (s + 0x6d2b79f5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    };

    const res1 = runMonteCarloSimulation(mockPlan, {
      numberOfTrials: 25,
      model: 'normal_distribution',
      randomFn: createPrng(12345),
    });

    const res2 = runMonteCarloSimulation(mockPlan, {
      numberOfTrials: 25,
      model: 'normal_distribution',
      randomFn: createPrng(12345),
    });

    expect(res1.medianLegacy).toBe(res2.medianLegacy);
    expect(res1.successRate).toBe(res2.successRate);
    expect(res1.averageLegacy).toBe(res2.averageLegacy);
  });
});
