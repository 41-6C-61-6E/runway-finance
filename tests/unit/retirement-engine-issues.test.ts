import { describe, expect, it } from 'vitest';
import { runRetirementSimulation, EnginePlan } from '@/lib/services/retirement-engine';

describe('FIRE Open Issues Fixes', () => {
  it('Issue 8ed50c46: obeys rothPercentage on mixed 401(k) accounts', () => {
    const plan: EnginePlan = {
      id: 'test-roth-pct',
      name: 'Roth Pct Test',
      hasSpouse: false,
      primaryBirthYear: 1980,
      primaryBirthMonth: 1,
      filingStatus: 'single',
      retirementAge: 60,
      lifeExpectancyAge: 80,
      withdrawalMethod: 'textbook',
      accounts: [
        {
          id: 'acc-1',
          name: 'Company 401k',
          type: 'traditional_401k',
          owner: 'primary',
          balance: 100000,
          costBasis: 100000,
          expectedGrowthRate: 0,
          dividendYield: 0,
          reinvestDividends: true,
          qualifiedDividendRatio: 1,
          rothPercentage: 40, // 40% Roth ($40k), 60% Traditional ($60k)
        },
      ],
      liabilities: [],
      events: [],
      flows: [],
    };

    const sim = runRetirementSimulation(plan);
    const firstYear = sim.yearlyResults[0];

    // Check portfolio breakdown: taxDeferred should be 60,000, taxFree should be 40,000
    expect(firstYear.portfolioBreakdown.taxDeferred).toBeCloseTo(60000, 0);
    expect(firstYear.portfolioBreakdown.taxFree).toBeCloseTo(40000, 0);
  });

  it('Issue c9a9b83a: handles primary and spouse salary percentage waterfall flows', () => {
    const plan: EnginePlan = {
      id: 'test-dual-salary',
      name: 'Dual Salary Test',
      hasSpouse: true,
      primaryBirthYear: 1990,
      primaryBirthMonth: 1,
      spouseBirthYear: 1992,
      filingStatus: 'married_joint',
      retirementAge: 65,
      lifeExpectancyAge: 90,
      primarySalary: 100000,
      primarySalaryYear: 2026,
      primarySalaryRaisePct: 0,
      spouseSalary: 50000,
      spouseSalaryYear: 2026,
      spouseSalaryRaisePct: 0,
      withdrawalMethod: 'textbook',
      accounts: [
        {
          id: 'acc-primary-401k',
          name: 'Primary 401k',
          type: 'traditional_401k',
          owner: 'primary',
          balance: 0,
          costBasis: 0,
          expectedGrowthRate: 0,
          dividendYield: 0,
          reinvestDividends: true,
          qualifiedDividendRatio: 1,
        },
        {
          id: 'acc-spouse-401k',
          name: 'Spouse 401k',
          type: 'traditional_401k',
          owner: 'spouse',
          balance: 0,
          costBasis: 0,
          expectedGrowthRate: 0,
          dividendYield: 0,
          reinvestDividends: true,
          qualifiedDividendRatio: 1,
        },
      ],
      liabilities: [],
      events: [],
      flows: [
        {
          id: 'flow-primary',
          name: 'Primary 10% Contribution',
          type: 'invest',
          rank: 1,
          targetAccountId: 'acc-primary-401k',
          ruleType: 'percentage',
          ruleValue: 10, // 10% of Primary Salary ($10,000)
          salarySource: 'primary',
        },
        {
          id: 'flow-spouse',
          name: 'Spouse 10% Contribution',
          type: 'invest',
          rank: 2,
          targetAccountId: 'acc-spouse-401k',
          ruleType: 'percentage',
          ruleValue: 10, // 10% of Spouse Salary ($5,000)
          salarySource: 'spouse',
        },
      ],
    };

    const sim = runRetirementSimulation(plan);
    const firstYear = sim.yearlyResults[0];

    expect(firstYear.primarySalaryIncome).toBe(100000);
    expect(firstYear.spouseSalaryIncome).toBe(50000);
    expect(firstYear.surplusSaved).toBe(15000);
  });

  it('Issue 127a51ac: calculates 10% early withdrawal penalty for traditional accounts before 59.5', () => {
    const plan: EnginePlan = {
      id: 'test-early-penalty',
      name: 'Early Penalty Test',
      hasSpouse: false,
      primaryBirthYear: 1980, // Age 46 in 2026
      primaryBirthMonth: 1,
      filingStatus: 'single',
      retirementAge: 46, // Retiring early now
      lifeExpectancyAge: 50,
      withdrawalMethod: 'textbook',
      accounts: [
        {
          id: 'acc-trad',
          name: 'Traditional IRA',
          type: 'traditional_ira',
          owner: 'primary',
          balance: 100000,
          costBasis: 100000,
          expectedGrowthRate: 0,
          dividendYield: 0,
          reinvestDividends: true,
          qualifiedDividendRatio: 1,
        },
      ],
      liabilities: [],
      events: [
        {
          id: 'ev-exp',
          name: 'Living Expenses',
          category: 'expense',
          type: 'living_expense',
          owner: 'primary',
          amount: 20000,
          frequency: 'yearly',
          growthRate: 0,
          adjustForInflation: false,
          startTriggerType: 'now',
          endTriggerType: 'end_of_plan',
        },
      ],
      flows: [],
    };

    const sim = runRetirementSimulation(plan);
    const firstYear = sim.yearlyResults[0];

    // Withdrawing $20,000 deficit from traditional IRA at age 46
    expect(firstYear.earlyPenaltyTax).toBeGreaterThan(0);
    expect(firstYear.earlyWithdrawalWarnings?.length).toBeGreaterThan(0);
  });

  it('Issue 2b379374: calculates 3.8% NIIT tax when MAGI exceeds threshold', () => {
    const plan: EnginePlan = {
      id: 'test-niit',
      name: 'NIIT Test',
      hasSpouse: false,
      primaryBirthYear: 1960, // Age 66
      primaryBirthMonth: 1,
      filingStatus: 'single',
      retirementAge: 65,
      lifeExpectancyAge: 70,
      withdrawalMethod: 'textbook',
      accounts: [
        {
          id: 'acc-taxable',
          name: 'Taxable Account',
          type: 'taxable',
          owner: 'primary',
          balance: 1000000,
          costBasis: 500000, // 50% gain ratio
          expectedGrowthRate: 0,
          dividendYield: 0,
          reinvestDividends: true,
          qualifiedDividendRatio: 1,
        },
      ],
      liabilities: [],
      events: [
        {
          id: 'ev-high-income',
          name: 'High Pension',
          category: 'income',
          type: 'pension',
          owner: 'primary',
          amount: 300000, // Exceeds $200k single NIIT threshold
          frequency: 'yearly',
          growthRate: 0,
          adjustForInflation: false,
          startTriggerType: 'now',
          endTriggerType: 'end_of_plan',
        },
        {
          id: 'ev-expense',
          name: 'Expenses',
          category: 'expense',
          type: 'living_expense',
          owner: 'primary',
          amount: 350000,
          frequency: 'yearly',
          growthRate: 0,
          adjustForInflation: false,
          startTriggerType: 'now',
          endTriggerType: 'end_of_plan',
        },
      ],
      flows: [],
    };

    const sim = runRetirementSimulation(plan);
    const firstYear = sim.yearlyResults[0];

    // Deficit causes taxable withdrawal triggering capital gains + NIIT tax
    expect(firstYear.niitTax).toBeGreaterThan(0);
  });

  it('Issue 2d37f955: generates IRMAA notice when MAGI breaches threshold', () => {
    const plan: EnginePlan = {
      id: 'test-irmaa-notice',
      name: 'IRMAA Notice Test',
      hasSpouse: false,
      primaryBirthYear: 1955, // Age 71
      primaryBirthMonth: 1,
      filingStatus: 'single',
      retirementAge: 65,
      lifeExpectancyAge: 75,
      withdrawalMethod: 'textbook',
      accounts: [],
      liabilities: [],
      events: [
        {
          id: 'ev-high-pension',
          name: 'Pension',
          category: 'income',
          type: 'pension',
          owner: 'primary',
          amount: 150000, // MAGI > $106k single IRMAA tier 1
          frequency: 'yearly',
          growthRate: 0,
          adjustForInflation: false,
          startTriggerType: 'now',
          endTriggerType: 'end_of_plan',
        },
      ],
      flows: [],
    };

    const sim = runRetirementSimulation(plan);
    const firstYear = sim.yearlyResults[0];

    expect(firstYear.irmaaNotice).toBeDefined();
    expect(firstYear.irmaaNotice?.tier).toBeGreaterThan(0);
  });
});
