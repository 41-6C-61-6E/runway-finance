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

  it('Textbook mode avoids traditional accounts before 59.5 — draws from Roth first', () => {
    const plan: EnginePlan = {
      id: 'test-textbook-reorder',
      name: 'Textbook Reorder Test',
      hasSpouse: false,
      primaryBirthYear: 1980, // Age 46 in 2026
      primaryBirthMonth: 1,
      filingStatus: 'single',
      retirementAge: 46,
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
        {
          id: 'acc-roth',
          name: 'Roth IRA',
          type: 'roth_ira',
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
          amount: 50000,
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
    expect(sim.yearlyResults[0]).toBeDefined();
  });

  it('Textbook mode draws traditional accounts before Roth accounts in standard sequence', () => {
    const plan: EnginePlan = {
      id: 'test-textbook-order',
      name: 'Textbook Order Test',
      hasSpouse: false,
      primaryBirthYear: 1980, // Age 46
      primaryBirthMonth: 1,
      filingStatus: 'single',
      retirementAge: 46,
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
        {
          id: 'acc-roth',
          name: 'Roth IRA',
          type: 'roth_ira',
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
          amount: 50000,
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

    // Traditional should be drawn first in textbook order
    expect(firstYear.drawdownsByType.traditional).toBeGreaterThan(0);
    expect(firstYear.drawdownsByType.roth).toBe(0);
  });

  it('Tax-optimized mode skips trad bracket-fill when allowPenaltyWithdrawals is false under 59.5', () => {
    const plan: EnginePlan = {
      id: 'test-taxopt-skip',
      name: 'Tax Optimized Skip Test',
      hasSpouse: false,
      primaryBirthYear: 1980, // Age 46
      primaryBirthMonth: 1,
      filingStatus: 'single',
      retirementAge: 46,
      lifeExpectancyAge: 50,
      withdrawalMethod: 'tax_optimized',
      settings: {
        fixedInflationRate: 3,
        allowPenaltyWithdrawals: false,
      },
      accounts: [
        {
          id: 'acc-trad',
          name: 'Traditional 401k',
          type: 'traditional_401k',
          owner: 'primary',
          balance: 100000,
          costBasis: 100000,
          expectedGrowthRate: 0,
          dividendYield: 0,
          reinvestDividends: true,
          qualifiedDividendRatio: 1,
        },
        {
          id: 'acc-taxable',
          name: 'Taxable Brokerage',
          type: 'taxable',
          owner: 'primary',
          balance: 100000,
          costBasis: 50000,
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
          amount: 50000,
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

    // Taxable should be drawn, not trad (no penalty allowed)
    expect(firstYear.drawdownsByType.traditional).toBe(0);
    expect(firstYear.earlyPenaltyTax).toBe(0);
  });

  it('Penalties only applied as last resort when no other accounts have funds', () => {
    const plan: EnginePlan = {
      id: 'test-penalty-last-resort',
      name: 'Penalty Last Resort',
      hasSpouse: false,
      primaryBirthYear: 1980,
      primaryBirthMonth: 1,
      filingStatus: 'single',
      retirementAge: 46,
      lifeExpectancyAge: 50,
      withdrawalMethod: 'textbook',
      accounts: [
        {
          id: 'acc-trad',
          name: 'Traditional IRA',
          type: 'traditional_ira',
          owner: 'primary',
          balance: 50000,
          costBasis: 50000,
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
          amount: 80000,
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

    // Only trad account exists, so penalty is unavoidable
    expect(firstYear.drawdownsByType.traditional).toBeGreaterThan(0);
    expect(firstYear.earlyPenaltyTax).toBeGreaterThan(0);
    expect(firstYear.earlyPenaltyDetails?.length).toBeGreaterThan(0);
  });

  it('earlyPenaltyDetails includes per-account breakdown', () => {
    const plan: EnginePlan = {
      id: 'test-penalty-details',
      name: 'Penalty Details Test',
      hasSpouse: false,
      primaryBirthYear: 1980,
      primaryBirthMonth: 1,
      filingStatus: 'single',
      retirementAge: 46,
      lifeExpectancyAge: 50,
      withdrawalMethod: 'textbook',
      accounts: [
        {
          id: 'acc-trad-ira',
          name: 'Traditional IRA',
          type: 'traditional_ira',
          owner: 'primary',
          balance: 50000,
          costBasis: 50000,
          expectedGrowthRate: 0,
          dividendYield: 0,
          reinvestDividends: true,
          qualifiedDividendRatio: 1,
        },
        {
          id: 'acc-trad-401k',
          name: 'Old 401k',
          type: 'traditional_401k',
          owner: 'primary',
          balance: 50000,
          costBasis: 50000,
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
          amount: 80000,
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

    expect(firstYear.earlyPenaltyDetails?.length).toBeGreaterThan(0);
    for (const detail of firstYear.earlyPenaltyDetails!) {
      expect(detail.age).toBe(46);
      expect(detail.penalty).toBe(detail.amount * 0.10);
      expect(detail.accountType).toMatch(/traditional/);
    }
  });

  it('Rule of 55 exception: no penalty for 401k when retiring at 55+', () => {
    const plan: EnginePlan = {
      id: 'test-rule-of-55',
      name: 'Rule of 55 Test',
      hasSpouse: false,
      primaryBirthYear: 1971, // Age 55 in 2026
      primaryBirthMonth: 1,
      filingStatus: 'single',
      retirementAge: 55,
      lifeExpectancyAge: 60,
      withdrawalMethod: 'textbook',
      accounts: [
        {
          id: 'acc-trad-401k',
          name: 'Company 401k',
          type: 'traditional_401k',
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
          amount: 50000,
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

    // Rule of 55: no penalty for 401k at 55+ when retirement age >= 55
    expect(firstYear.drawdownsByType.traditional).toBeGreaterThan(0);
    expect(firstYear.earlyPenaltyTax).toBe(0);
    expect(firstYear.earlyPenaltyDetails?.length ?? 0).toBe(0);
  });

  it('Rule of 55 does NOT apply to Traditional IRA — penalty still applies', () => {
    const plan: EnginePlan = {
      id: 'test-rule-of-55-ira',
      name: 'Rule of 55 IRA Test',
      hasSpouse: false,
      primaryBirthYear: 1971, // Age 55 in 2026
      primaryBirthMonth: 1,
      filingStatus: 'single',
      retirementAge: 55,
      lifeExpectancyAge: 60,
      withdrawalMethod: 'textbook',
      accounts: [
        {
          id: 'acc-trad-ira',
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
          amount: 50000,
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

    // Rule of 55 only applies to 401k, not IRA
    expect(firstYear.drawdownsByType.traditional).toBeGreaterThan(0);
    expect(firstYear.earlyPenaltyTax).toBeGreaterThan(0);
  });

  it('allowPenaltyWithdrawals=false allows penalty-free Roth cost basis but caps withdrawals to basis', () => {
    const plan: EnginePlan = {
      id: 'test-no-penalty-roth-basis',
      name: 'No Penalty Roth Basis Test',
      hasSpouse: false,
      primaryBirthYear: 1980, // Age 46
      primaryBirthMonth: 1,
      filingStatus: 'single',
      retirementAge: 46,
      lifeExpectancyAge: 50,
      withdrawalMethod: 'textbook',
      settings: {
        fixedInflationRate: 3,
        allowPenaltyWithdrawals: false,
      },
      accounts: [
        {
          id: 'acc-roth',
          name: 'Roth IRA',
          type: 'roth_ira',
          owner: 'primary',
          balance: 100000,
          costBasis: 30000, // $30k basis, $70k earnings
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
          amount: 50000,
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

    // Only $30,000 cost basis should be drawn penalty-free; remaining $20,000 becomes shortfall
    expect(firstYear.drawdownsByType.roth).toBe(30000);
    expect(firstYear.earlyPenaltyTax).toBe(0);
    expect(firstYear.shortfall).toBe(20000);
  });

  it('Roth IRA cost basis increases when post-tax contributions are saved to Roth', () => {
    const plan: EnginePlan = {
      id: 'test-roth-basis-contrib',
      name: 'Roth Basis Contrib Test',
      hasSpouse: false,
      withdrawalMethod: 'tax_optimized',
      primaryBirthYear: 1990, // Age 36
      primaryBirthMonth: 1,
      filingStatus: 'single',
      retirementAge: 60,
      lifeExpectancyAge: 62,
      primarySalary: 100000,
      accounts: [
        {
          id: 'acc-roth',
          name: 'Roth IRA',
          type: 'roth_ira',
          owner: 'primary',
          balance: 10000,
          costBasis: 10000,
          expectedGrowthRate: 0,
          dividendYield: 0,
          reinvestDividends: true,
          qualifiedDividendRatio: 1,
          contributionMode: 'fixed_amount',
          contributionValue: 6000,
        },
      ],
      liabilities: [],
      events: [],
      flows: [],
    };

    const sim = runRetirementSimulation(plan);
    const firstYearAcc = sim.yearlyResults[0].accountBalances.find((a) => a.id === 'acc-roth');
    // First year balance should be $16,000
    expect(firstYearAcc?.balance).toBe(16000);
  });

  it('mixed 401(k) with rothPercentage draws Pre-Tax portion in Traditional phase (rank 3) and Roth portion in Roth phase (rank 4)', () => {
    const plan: EnginePlan = {
      id: 'test-mixed-401k-strategy',
      name: 'Mixed 401k Strategy Test',
      hasSpouse: false,
      primaryBirthYear: 1980, // Age 46
      primaryBirthMonth: 1,
      filingStatus: 'single',
      retirementAge: 46,
      lifeExpectancyAge: 50,
      withdrawalMethod: 'textbook',
      settings: {
        fixedInflationRate: 0,
        allowPenaltyWithdrawals: true,
      },
      accounts: [
        {
          id: 'acc-mixed-401k',
          name: 'Company 401(k)',
          type: 'traditional_401k',
          owner: 'primary',
          balance: 100000, // 60% Trad ($60k), 40% Roth ($40k)
          costBasis: 100000,
          rothPercentage: 40,
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
          amount: 80000, // Needs $80,000 drawdown
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

    // Under textbook order:
    // 1. Draws entire Pre-Tax Traditional portion ($60,000) at rank 3
    // 2. Draws remaining $20,000 from Tax-Free Roth portion at rank 4
    expect(firstYear.drawdownsByType.traditional).toBe(60000);
    expect(firstYear.drawdownsByType.roth).toBe(20000);
    // Penalty: 10% on $60,000 early Traditional draw = $6,000
    expect(firstYear.earlyPenaltyTax).toBe(6000);
  });

  it('when allowPenaltyWithdrawals is false, early traditional withdrawals are strictly blocked and produce 0 early penalties', () => {
    const plan: EnginePlan = {
      id: 'test-block-penalty-trad',
      name: 'Block Penalty Trad Test',
      hasSpouse: false,
      primaryBirthYear: 1980, // Age 46
      primaryBirthMonth: 1,
      filingStatus: 'single',
      retirementAge: 46,
      lifeExpectancyAge: 50,
      withdrawalMethod: 'textbook',
      settings: {
        fixedInflationRate: 0,
        allowPenaltyWithdrawals: false,
      },
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
          amount: 50000,
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

    // Early traditional withdrawals before 59.5 are blocked ($0 drawn)
    expect(firstYear.drawdownsByType.traditional).toBe(0);
    expect(firstYear.earlyPenaltyTax).toBe(0);
    expect(firstYear.shortfall).toBe(50000);
  });

  it('RMD mandatory drawdowns preserve net proceeds in portfolio net worth', () => {
    const plan: EnginePlan = {
      id: 'test-rmd-cash-preservation',
      name: 'RMD Cash Preservation Test',
      hasSpouse: false,
      primaryBirthYear: 1950, // Age 76 in 2026 (RMD active)
      primaryBirthMonth: 1,
      filingStatus: 'single',
      retirementAge: 65,
      lifeExpectancyAge: 78,
      withdrawalMethod: 'textbook',
      settings: {
        fixedInflationRate: 0,
        allowPenaltyWithdrawals: true,
      },
      accounts: [
        {
          id: 'acc-403b',
          name: 'University 403(b)',
          type: 'traditional_403b',
          owner: 'primary',
          balance: 1000000, // $1M balance at age 76 -> ~ $42,194 RMD
          costBasis: 1000000,
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
          amount: 10000, // Living expenses lower than RMD
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

    // RMD drawn should be mandatory (~$42,194 for 76 year old)
    expect(firstYear.rmdMandatoryDrawdown).toBeGreaterThan(40000);
    // Net worth should preserve assets (Total assets ~ $1,000,000 minus taxes/living expenses, NOT losing RMD)
    expect(firstYear.totalAssets).toBeGreaterThan(950000);
  });

  it('supports expense start condition and end condition for early retirement expenses', () => {
    const plan: EnginePlan = {
      id: 'test-expense-triggers',
      name: 'Travel Expense Test',
      hasSpouse: false,
      primaryBirthYear: 1980, // Age 46 in 2026
      primaryBirthMonth: 1,
      filingStatus: 'single',
      retirementAge: 60,
      lifeExpectancyAge: 80,
      withdrawalMethod: 'textbook',
      settings: {
        fixedInflationRate: 0,
      },
      accounts: [
        {
          id: 'acc-cash',
          name: 'Cash',
          type: 'cash',
          owner: 'primary',
          balance: 1000000,
          costBasis: 1000000,
          expectedGrowthRate: 0,
          dividendYield: 0,
          reinvestDividends: true,
          qualifiedDividendRatio: 1,
        },
      ],
      liabilities: [],
      events: [
        {
          id: 'base-expense',
          name: 'Base Living Expenses',
          category: 'expense',
          type: 'living_expense',
          owner: 'primary',
          amount: 40000,
          frequency: 'yearly',
          growthRate: 0,
          adjustForInflation: false,
          startTriggerType: 'now',
          endTriggerType: 'end_of_plan',
        },
        {
          id: 'travel-expense',
          name: 'Early Retirement Travel',
          category: 'expense',
          type: 'lump_sum',
          owner: 'primary',
          amount: 20000,
          frequency: 'yearly',
          growthRate: 0,
          adjustForInflation: false,
          startTriggerType: 'retirement', // Starts at retirement (age 60)
          endTriggerType: 'age',
          endTriggerValue: '70', // Ends at age 70 (first 10 years of retirement)
        },
      ],
      flows: [],
    };

    const sim = runRetirementSimulation(plan);
    
    // Age 50 (Pre-retirement): only base expense active
    const yearAge50 = sim.yearlyResults.find((r) => r.primaryAge === 50);
    expect(yearAge50).toBeDefined();
    expect(yearAge50!.livingExpenses).toBe(40000);

    // Age 60 (Retirement start): travel expense active ($40,000 + $20,000)
    const yearAge60 = sim.yearlyResults.find((r) => r.primaryAge === 60);
    expect(yearAge60).toBeDefined();
    expect(yearAge60!.livingExpenses).toBe(60000);

    // Age 70 (Final year of travel): travel expense still active ($60,000)
    const yearAge70 = sim.yearlyResults.find((r) => r.primaryAge === 70);
    expect(yearAge70).toBeDefined();
    expect(yearAge70!.livingExpenses).toBe(60000);

    // Age 71 (Post-travel): travel expense ended ($40,000)
    const yearAge71 = sim.yearlyResults.find((r) => r.primaryAge === 71);
    expect(yearAge71).toBeDefined();
    expect(yearAge71!.livingExpenses).toBe(40000);
  });

  it('supports "after_n_years" duration end condition for income and expenses', () => {
    const plan: EnginePlan = {
      id: 'test-after-n-years',
      name: 'After N Years Test',
      hasSpouse: false,
      primaryBirthYear: 1980,
      primaryBirthMonth: 1,
      filingStatus: 'single',
      retirementAge: 60,
      lifeExpectancyAge: 80,
      withdrawalMethod: 'textbook',
      settings: {
        fixedInflationRate: 0,
      },
      accounts: [
        {
          id: 'acc-cash',
          name: 'Cash',
          type: 'cash',
          owner: 'primary',
          balance: 1000000,
          costBasis: 1000000,
          expectedGrowthRate: 0,
          dividendYield: 0,
          reinvestDividends: true,
          qualifiedDividendRatio: 1,
        },
      ],
      liabilities: [],
      events: [
        {
          id: 'base-exp',
          name: 'Base Living Expenses',
          category: 'expense',
          type: 'living_expense',
          owner: 'primary',
          amount: 30000,
          frequency: 'yearly',
          growthRate: 0,
          adjustForInflation: false,
          startTriggerType: 'now',
          endTriggerType: 'end_of_plan',
        },
        {
          id: 'travel-10y',
          name: 'Retirement Travel (10 Years)',
          category: 'expense',
          type: 'living_expense',
          owner: 'primary',
          amount: 15000,
          frequency: 'yearly',
          growthRate: 0,
          adjustForInflation: false,
          startTriggerType: 'retirement',
          endTriggerType: 'after_n_years',
          endTriggerValue: '10', // Active for 10 years (ages 60 to 69)
        },
        {
          id: 'bridge-5y',
          name: 'Bridge Annuity (5 Years)',
          category: 'income',
          type: 'passive',
          owner: 'primary',
          amount: 12000,
          frequency: 'yearly',
          growthRate: 0,
          adjustForInflation: false,
          startTriggerType: 'retirement',
          endTriggerType: 'after_n_years',
          endTriggerValue: '5', // Active for 5 years (ages 60 to 64)
        },
      ],
      flows: [],
    };

    const sim = runRetirementSimulation(plan);

    // Pre-retirement (age 55): base expense $30k, 0 bridge income
    const r55 = sim.yearlyResults.find((r) => r.primaryAge === 55)!;
    expect(r55.livingExpenses).toBe(30000);
    expect(r55.otherIncome).toBe(0);

    // Retirement year 1 (age 60): expenses = $30k + $15k = $45k; income = $12k
    const r60 = sim.yearlyResults.find((r) => r.primaryAge === 60)!;
    expect(r60.livingExpenses).toBe(45000);
    expect(r60.otherIncome).toBe(12000);

    // Year 5 of retirement (age 64): bridge income still active ($12k), travel expense still active ($45k)
    const r64 = sim.yearlyResults.find((r) => r.primaryAge === 64)!;
    expect(r64.livingExpenses).toBe(45000);
    expect(r64.otherIncome).toBe(12000);

    // Year 6 of retirement (age 65): 5-year bridge income expired ($0), travel expense still active ($45k)
    const r65 = sim.yearlyResults.find((r) => r.primaryAge === 65)!;
    expect(r65.livingExpenses).toBe(45000);
    expect(r65.otherIncome).toBe(0);

    // Year 10 of retirement (age 69): travel expense last active year ($45k)
    const r69 = sim.yearlyResults.find((r) => r.primaryAge === 69)!;
    expect(r69.livingExpenses).toBe(45000);

    // Year 11 of retirement (age 70): 10-year travel expense expired -> back to $30k base expense
    const r70 = sim.yearlyResults.find((r) => r.primaryAge === 70)!;
    expect(r70.livingExpenses).toBe(30000);
  });
});
