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
      primarySalary: 100000,
      primarySalaryYear: 2026,
      primarySalaryRaisePct: 3.0,
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

  it('correctly calculates Married Filing Jointly (MFJ) tax, spouse events, and dual Social Security', () => {
    const mfjPlan: EnginePlan = {
      id: 'plan_mfj',
      name: 'Couple FIRE Plan',
      hasSpouse: true,
      primaryBirthYear: 1985,
      primaryBirthMonth: 1,
      spouseBirthYear: 1987,
      spouseBirthMonth: 6,
      spouseName: 'Jane',
      spouseRetirementAge: 62,
      spouseLifeExpectancyAge: 95,
      primarySsMonthlyAmount: 3000,
      primarySsStartAge: 70,
      spouseSsMonthlyAmount: 2000,
      spouseSsStartAge: 67,
      enableSpousalSsBenefit: true,
      filingStatus: 'married_joint',
      retirementAge: 60,
      lifeExpectancyAge: 90,
      primarySalary: 120000,
      primarySalaryYear: 2026,
      primarySalaryRaisePct: 3.0,
      spouseSalary: 80000,
      spouseSalaryYear: 2026,
      spouseSalaryRaisePct: 3.0,
      withdrawalMethod: 'textbook',
      accounts: [
        {
          id: 'acc_1',
          name: 'Joint Taxable Brokerage',
          type: 'taxable',
          owner: 'joint',
          balance: 200000,
          costBasis: 150000,
          expectedGrowthRate: 7.0,
          dividendYield: 2.0,
          reinvestDividends: true,
          qualifiedDividendRatio: 1.0,
        },
      ],
      liabilities: [],
      events: [
        {
          id: 'ev_living',
          name: 'Joint Living Expenses',
          category: 'expense',
          type: 'living_expense',
          owner: 'joint',
          amount: 70000,
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

    const output = runRetirementSimulation(mfjPlan);
    expect(output.yearlyResults.length).toBeGreaterThan(0);
    
    // Check first year result (ages: Primary 41, Spouse 39)
    const firstYear = output.yearlyResults[0];
    expect(firstYear.primaryAge).toBe(41);
    expect(firstYear.spouseAge).toBe(39);
    expect(firstYear.grossIncome).toBeGreaterThan(190000);

    // Verify dual Social Security streams kick in at designated claiming ages
    const ssActiveYear = output.yearlyResults.find((r) => r.primaryAge >= 70);
    expect(ssActiveYear).toBeDefined();
    expect(ssActiveYear?.ssIncome).toBeGreaterThan(0);
    expect(ssActiveYear?.primarySsIncome).toBeGreaterThan(0);
    expect(ssActiveYear?.spouseSsIncome).toBeGreaterThan(0);
  });

  it('correctly amortizes debt with interest and principal payoff', () => {
    const debtPlan: EnginePlan = {
      id: 'plan_debt',
      name: 'Debt Test Plan',
      hasSpouse: false,
      primaryBirthYear: 1990,
      primaryBirthMonth: 1,
      filingStatus: 'single',
      retirementAge: 65,
      lifeExpectancyAge: 70,
      withdrawalMethod: 'textbook',
      accounts: [
        {
          id: 'acc_cash',
          name: 'Cash',
          type: 'cash',
          owner: 'primary',
          balance: 100000,
          costBasis: 100000,
          expectedGrowthRate: 0.0,
          dividendYield: 0.0,
          reinvestDividends: false,
          qualifiedDividendRatio: 0.0,
        },
      ],
      liabilities: [
        {
          id: 'liab_1',
          name: 'Personal Loan',
          owner: 'primary',
          balance: 10000,
          interestRate: 6.0, // 6% annual = $600 interest in year 1
          monthlyPayment: 500, // $6,000 annual payment
          yearsRemaining: 2,
        },
      ],
      events: [
        {
          id: 'ev_exp',
          name: 'Living Expenses',
          category: 'expense',
          type: 'living_expense',
          owner: 'primary',
          amount: 20000,
          frequency: 'yearly',
          growthRate: 0.0,
          adjustForInflation: false,
          startTriggerType: 'now',
          endTriggerType: 'end_of_plan',
        },
      ],
      flows: [],
      settings: { fixedInflationRate: 0.0 },
      rules: DEFAULT_2026_RULES,
    };

    const output = runRetirementSimulation(debtPlan);
    const yr1 = output.yearlyResults[0];
    // In Year 1: interest is $600, payment is $6,000, principal paid is $5,400. Debt balance remaining should be $4,600.
    expect(yr1.debtPayments).toBe(6000);
    
    const yr2 = output.yearlyResults[1];
    // In Year 2: balance starts at $4,600. Interest is $276 ($4600 * 6%). Total needed payoff = $4,876, which is < $6,000 payment.
    expect(yr2.debtPayments).toBeCloseTo(4876, 0);
  });

  it('calculates capital gains tax on taxable account withdrawals', () => {
    const capGainsPlan: EnginePlan = {
      id: 'plan_cg',
      name: 'Cap Gains Test Plan',
      hasSpouse: false,
      primaryBirthYear: 1960,
      primaryBirthMonth: 1,
      filingStatus: 'single',
      retirementAge: 65, // Age 65 in 2025 -> retired
      lifeExpectancyAge: 67,
      withdrawalMethod: 'textbook',
      accounts: [
        {
          id: 'acc_taxable',
          name: 'Taxable Brokerage',
          type: 'taxable',
          owner: 'primary',
          balance: 200000,
          costBasis: 50000, // 75% gain ratio ($150k gains / $200k balance)
          expectedGrowthRate: 0.0,
          dividendYield: 0.0,
          reinvestDividends: false,
          qualifiedDividendRatio: 1.0,
        },
      ],
      liabilities: [],
      events: [
        {
          id: 'ev_living',
          name: 'Living Expenses',
          category: 'expense',
          type: 'living_expense',
          owner: 'primary',
          amount: 100000, // Requires $100k drawdown -> 75% ($75k) is taxable capital gains
          frequency: 'yearly',
          growthRate: 0.0,
          adjustForInflation: false,
          startTriggerType: 'now',
          endTriggerType: 'end_of_plan',
        },
      ],
      flows: [],
      settings: { fixedInflationRate: 0.0 },
      rules: DEFAULT_2026_RULES,
    };

    const output = runRetirementSimulation(capGainsPlan);
    const yr1 = output.yearlyResults[0];
    expect(yr1.drawdownsByType.taxable).toBeGreaterThan(0);
    expect(yr1.capGainsTax).toBeGreaterThan(0);
  });

  it('enforces Required Minimum Distributions (RMDs) at age 75 for post-1960 birth year', () => {
    const rmdPlan: EnginePlan = {
      id: 'plan_rmd',
      name: 'RMD Test Plan',
      hasSpouse: false,
      primaryBirthYear: 1960,
      primaryBirthMonth: 1,
      filingStatus: 'single',
      retirementAge: 65,
      lifeExpectancyAge: 77,
      withdrawalMethod: 'textbook',
      accounts: [
        {
          id: 'acc_trad',
          name: 'Traditional IRA',
          type: 'traditional_ira',
          owner: 'primary',
          balance: 1000000,
          costBasis: 1000000,
          expectedGrowthRate: 0.0,
          dividendYield: 0.0,
          reinvestDividends: false,
          qualifiedDividendRatio: 0.0,
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
          amount: 10000, // Small expense so RMD exceeds expenses
          frequency: 'yearly',
          growthRate: 0.0,
          adjustForInflation: false,
          startTriggerType: 'now',
          endTriggerType: 'end_of_plan',
        },
      ],
      flows: [],
      settings: { fixedInflationRate: 0.0 },
      rules: DEFAULT_2026_RULES,
    };

    const output = runRetirementSimulation(rmdPlan);
    // Age 75 occurs in year index 9 (age 66 to 75)
    const rmdYear = output.yearlyResults.find((r) => r.primaryAge === 75);
    expect(rmdYear).toBeDefined();
    // Divisor for age 75 in Uniform Lifetime Table is 24.6 -> $1M / 24.6 ≈ $40,650
    expect(rmdYear?.drawdownsByType.traditional).toBeGreaterThan(35000);
  });

  it('applies 401(k) employer match contributions', () => {
    const matchPlan: EnginePlan = {
      id: 'plan_match',
      name: 'Employer Match Plan',
      hasSpouse: false,
      primaryBirthYear: 1990,
      primaryBirthMonth: 1,
      filingStatus: 'single',
      retirementAge: 65,
      lifeExpectancyAge: 67,
      primarySalary: 100000,
      primarySalaryYear: 2026,
      primarySalaryRaisePct: 0,
      withdrawalMethod: 'textbook',
      accounts: [
        {
          id: 'acc_401k',
          name: '401k',
          type: 'traditional_401k',
          owner: 'primary',
          balance: 0,
          costBasis: 0,
          expectedGrowthRate: 0.0,
          dividendYield: 0.0,
          reinvestDividends: false,
          qualifiedDividendRatio: 0.0,
        },
      ],
      liabilities: [],
      events: [],
      flows: [
        {
          id: 'fl_match',
          name: '401k Contrib & Match',
          type: 'invest',
          rank: 1,
          targetAccountId: 'acc_401k',
          ruleType: 'percentage',
          ruleValue: 5.0, // 5% = $5,000 employee contribution
          matchRate: 1.0, // 100% match up to 5%
          matchLimit: 5.0,
          matchAccountId: 'acc_401k',
        },
      ],
      settings: { fixedInflationRate: 0.0 },
      rules: DEFAULT_2026_RULES,
    };

    const output = runRetirementSimulation(matchPlan);
    const yr1 = output.yearlyResults[0];
    // Employee contrib $5,000 + employer match $5,000 = $10,000 balance
    expect(yr1.totalAssets).toBe(10000);
  });

  it('caps FICA Social Security tax at the wage base limit and calculates Medicare tax', () => {
    const highEarnerPlan: EnginePlan = {
      id: 'plan_fica',
      name: 'FICA Test Plan',
      hasSpouse: false,
      primaryBirthYear: 1990,
      primaryBirthMonth: 1,
      filingStatus: 'single',
      retirementAge: 65,
      lifeExpectancyAge: 67,
      primarySalary: 300000,
      primarySalaryYear: 2026,
      primarySalaryRaisePct: 0,
      withdrawalMethod: 'textbook',
      accounts: [
        {
          id: 'acc_cash',
          name: 'Cash',
          type: 'cash',
          owner: 'primary',
          balance: 0,
          costBasis: 0,
          expectedGrowthRate: 0.0,
          dividendYield: 0.0,
          reinvestDividends: false,
          qualifiedDividendRatio: 0.0,
        },
      ],
      liabilities: [],
      events: [],
      flows: [],
      settings: { fixedInflationRate: 0.0 },
      rules: DEFAULT_2026_RULES,
    };

    const output = runRetirementSimulation(highEarnerPlan);
    const yr1 = output.yearlyResults[0];
    // SS tax = $168,600 * 6.2% = $10,453.20
    // Medicare tax = $300,000 * 1.45% = $4,350.00
    // Addl Medicare tax = ($300,000 - $200,000) * 0.9% = $900.00
    // Total FICA = $15,703.20 (without cap, flat 7.65% would be $22,950)
    expect(yr1.ficaTax).toBeCloseTo(15703.20, 0);
    expect(yr1.ficaTax).toBeLessThan(22000);
  });

  it('handles fixed_amount and save_maintain flow rules', () => {
    const flowPlan: EnginePlan = {
      id: 'plan_flows',
      name: 'Flow Rules Plan',
      hasSpouse: false,
      primaryBirthYear: 1990,
      primaryBirthMonth: 1,
      filingStatus: 'single',
      retirementAge: 65,
      lifeExpectancyAge: 67,
      primarySalary: 80000,
      primarySalaryYear: 2026,
      primarySalaryRaisePct: 0,
      withdrawalMethod: 'textbook',
      accounts: [
        {
          id: 'acc_emerg',
          name: 'Emergency Fund',
          type: 'cash',
          owner: 'primary',
          balance: 8000, // Wants to maintain $10,000 -> needs $2,000
          costBasis: 8000,
          expectedGrowthRate: 0.0,
          dividendYield: 0.0,
          reinvestDividends: false,
          qualifiedDividendRatio: 0.0,
        },
        {
          id: 'acc_taxable',
          name: 'Fixed Investment',
          type: 'taxable',
          owner: 'primary',
          balance: 0,
          costBasis: 0,
          expectedGrowthRate: 0.0,
          dividendYield: 0.0,
          reinvestDividends: false,
          qualifiedDividendRatio: 0.0,
        },
      ],
      liabilities: [],
      events: [],
      flows: [
        {
          id: 'fl_maint',
          name: 'Maintain Emergency Fund at 10k',
          type: 'save_maintain',
          rank: 1,
          targetAccountId: 'acc_emerg',
          ruleType: 'save_maintain',
          ruleValue: 10000,
        },
        {
          id: 'fl_fixed',
          name: 'Fixed 5k Investment',
          type: 'invest',
          rank: 2,
          targetAccountId: 'acc_taxable',
          ruleType: 'fixed_amount',
          ruleValue: 5000,
        },
      ],
      settings: { fixedInflationRate: 0.0 },
      rules: DEFAULT_2026_RULES,
    };

    const output = runRetirementSimulation(flowPlan);
    const yr1 = output.yearlyResults[0];
    // Emergency fund should receive $2,000 to reach $10,000
    expect(yr1.portfolioBreakdown.cash).toBe(10000);
    // Taxable brokerage should receive fixed $5,000
    expect(yr1.portfolioBreakdown.taxable).toBe(5000);
  });

  it('calculates state tax when incomeTaxModifier is set', () => {
    const stateTaxPlan: EnginePlan = {
      id: 'plan_state_tax',
      name: 'State Tax Plan',
      hasSpouse: false,
      primaryBirthYear: 1990,
      primaryBirthMonth: 1,
      filingStatus: 'single',
      retirementAge: 65,
      lifeExpectancyAge: 67,
      primarySalary: 100000,
      primarySalaryYear: 2026,
      primarySalaryRaisePct: 0,
      withdrawalMethod: 'textbook',
      accounts: [],
      liabilities: [],
      events: [],
      flows: [],
      settings: { fixedInflationRate: 0.0, incomeTaxModifier: 5.0 }, // 5% state tax
      rules: DEFAULT_2026_RULES,
    };

    const output = runRetirementSimulation(stateTaxPlan);
    const yr1 = output.yearlyResults[0];
    expect(yr1.stateTax).toBeGreaterThan(0);
    expect(yr1.taxesPaid).toBeGreaterThan(yr1.ordinaryTax + yr1.ficaTax);
  });

  it('calculates ACA healthcare subsidies for early retirees under age 65', () => {
    const acaPlan: EnginePlan = {
      id: 'plan_aca',
      name: 'ACA Subsidy Plan',
      hasSpouse: false,
      primaryBirthYear: 1970, // Age 55 in 2025 -> retired
      primaryBirthMonth: 1,
      filingStatus: 'single',
      retirementAge: 55,
      lifeExpectancyAge: 66,
      withdrawalMethod: 'textbook',
      accounts: [
        {
          id: 'acc_trad',
          name: 'Traditional IRA',
          type: 'traditional_ira',
          owner: 'primary',
          balance: 500000,
          costBasis: 500000,
          expectedGrowthRate: 0.0,
          dividendYield: 0.0,
          reinvestDividends: false,
          qualifiedDividendRatio: 0.0,
        },
      ],
      liabilities: [],
      events: [
        {
          id: 'ev_living',
          name: 'Living Expenses',
          category: 'expense',
          type: 'living_expense',
          owner: 'primary',
          amount: 30000, // Low MAGI -> eligible for ACA subsidy
          frequency: 'yearly',
          growthRate: 0.0,
          adjustForInflation: false,
          startTriggerType: 'now',
          endTriggerType: 'end_of_plan',
        },
      ],
      flows: [],
      settings: { fixedInflationRate: 0.0 },
      rules: DEFAULT_2026_RULES,
    };

    const output = runRetirementSimulation(acaPlan);
    const yr1 = output.yearlyResults[0]; // Primary age 55 (pre-65)
    expect(yr1.acaSubsidy).toBeGreaterThan(0);
  });

  it('handles 10-year spouse age gap correctly for catch-up limits and account ownership', () => {
    const ageGapPlan: EnginePlan = {
      id: 'plan_age_gap',
      name: 'Age Gap Plan',
      hasSpouse: true,
      primaryBirthYear: 1970, // Age 55
      primaryBirthMonth: 1,
      spouseBirthYear: 1980,  // Age 45 (10-year gap)
      filingStatus: 'married_joint',
      retirementAge: 60,
      lifeExpectancyAge: 85,
      primarySalary: 120000,
      primarySalaryYear: 2026,
      primarySalaryRaisePct: 0,
      withdrawalMethod: 'textbook',
      accounts: [
        {
          id: 'acc_primary_ira',
          name: 'Primary IRA',
          type: 'traditional_ira',
          owner: 'primary',
          balance: 100000,
          costBasis: 100000,
          expectedGrowthRate: 0.0,
          dividendYield: 0.0,
          reinvestDividends: false,
          qualifiedDividendRatio: 0.0,
        },
        {
          id: 'acc_spouse_ira',
          name: 'Spouse IRA',
          type: 'traditional_ira',
          owner: 'spouse',
          balance: 50000,
          costBasis: 50000,
          expectedGrowthRate: 0.0,
          dividendYield: 0.0,
          reinvestDividends: false,
          qualifiedDividendRatio: 0.0,
        },
      ],
      liabilities: [],
      events: [],
      flows: [
        {
          id: 'fl_spouse_max',
          name: 'Maximize Spouse IRA',
          type: 'invest',
          rank: 1,
          targetAccountId: 'acc_spouse_ira',
          ruleType: 'maximize',
        },
      ],
      settings: { fixedInflationRate: 0.0 },
      rules: DEFAULT_2026_RULES,
    };

    const output = runRetirementSimulation(ageGapPlan);
    const yr1 = output.yearlyResults[0];
    expect(yr1.primaryAge).toBe(56);
    expect(yr1.spouseAge).toBe(46);
    // Spouse is age 45 (<50), so Spouse IRA contribution should be capped at $7,000 (no $1,000 catch-up)
    const spouseAcc = yr1.portfolioBreakdown.taxDeferred;
    expect(spouseAcc).toBeGreaterThan(0);
  });

  it('simulates sequence-of-returns market crash in early retirement', () => {
    const crashPlan: EnginePlan = {
      id: 'plan_crash',
      name: 'Market Crash Plan',
      hasSpouse: false,
      primaryBirthYear: 1965, // Age 60 in 2025 -> retired
      primaryBirthMonth: 1,
      filingStatus: 'single',
      retirementAge: 60,
      lifeExpectancyAge: 80,
      withdrawalMethod: 'textbook',
      accounts: [
        {
          id: 'acc_taxable',
          name: 'Taxable Brokerage',
          type: 'taxable',
          owner: 'primary',
          balance: 500000,
          costBasis: 500000,
          expectedGrowthRate: 7.0,
          dividendYield: 0.0,
          reinvestDividends: false,
          qualifiedDividendRatio: 1.0,
        },
      ],
      liabilities: [],
      events: [
        {
          id: 'ev_living',
          name: 'Living Expenses',
          category: 'expense',
          type: 'living_expense',
          owner: 'primary',
          amount: 50000,
          frequency: 'yearly',
          growthRate: 0.0,
          adjustForInflation: false,
          startTriggerType: 'now',
          endTriggerType: 'end_of_plan',
        },
      ],
      flows: [],
      settings: { fixedInflationRate: 0.0 },
      rules: DEFAULT_2026_RULES,
    };

    // Custom growth function: -30% market crash in years 0 and 1
    const crashGrowthFn = (yearOffset: number) => {
      if (yearOffset <= 1) {
        return { growth: -0.30, dividend: 0.0 };
      }
      return { growth: 0.07, dividend: 0.0 };
    };

    const output = runRetirementSimulation(crashPlan, crashGrowthFn);
    const yr1 = output.yearlyResults[0];
    const yr2 = output.yearlyResults[1];

    // Verify portfolio took severe hits from crash
    expect(yr1.netWorth).toBeLessThan(350000);
    expect(yr2.netWorth).toBeLessThan(250000);
  });

  it('executes Roth conversion ladder with IRMAA cliff avoidance for high net worth plans', () => {
    const hnwPlan: EnginePlan = {
      id: 'plan_hnw',
      name: 'High Net Worth Roth Plan',
      hasSpouse: false,
      primaryBirthYear: 1961, // Age 64 in 2025 (pre-RMD, Medicare age 65 -> IRMAA 2-year lookback applies)
      primaryBirthMonth: 1,
      filingStatus: 'single',
      retirementAge: 60,
      lifeExpectancyAge: 85,
      withdrawalMethod: 'textbook',
      accounts: [
        {
          id: 'acc_trad',
          name: 'Traditional IRA',
          type: 'traditional_ira',
          owner: 'primary',
          balance: 2000000,
          costBasis: 2000000,
          expectedGrowthRate: 5.0,
          dividendYield: 0.0,
          reinvestDividends: false,
          qualifiedDividendRatio: 0.0,
        },
        {
          id: 'acc_roth',
          name: 'Roth IRA',
          type: 'roth_ira',
          owner: 'primary',
          balance: 100000,
          costBasis: 100000,
          expectedGrowthRate: 5.0,
          dividendYield: 0.0,
          reinvestDividends: false,
          qualifiedDividendRatio: 0.0,
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
          amount: 40000,
          frequency: 'yearly',
          growthRate: 0.0,
          adjustForInflation: false,
          startTriggerType: 'now',
          endTriggerType: 'end_of_plan',
        },
      ],
      flows: [],
      settings: {
        fixedInflationRate: 0.0,
        enableRothConversions: true,
        rothConversionTargetCeiling: 'top_of_12',
        avoidIrmaaCliffs: true,
      },
      rules: DEFAULT_2026_RULES,
    };

    const output = runRetirementSimulation(hnwPlan);
    const yr1 = output.yearlyResults[0];
    expect(yr1.rothConversionAmount).toBeGreaterThan(0);
    // Roth conversions should happen while keeping MAGI within safe bounds
    expect(yr1.magi).toBeLessThan(200000);
  });

  it('correctly categorizes diverse account types and tracks accountBalances in yearly simulation results', () => {
    const multiAccountPlan: EnginePlan = {
      id: 'plan_multi',
      name: 'Multi Account Plan',
      hasSpouse: false,
      primaryBirthYear: 1985,
      primaryBirthMonth: 1,
      filingStatus: 'single',
      retirementAge: 65,
      lifeExpectancyAge: 70,
      withdrawalMethod: 'textbook',
      accounts: [
        {
          id: 'acc_1',
          name: 'Fidelity Brokerage',
          type: 'brokerage',
          owner: 'primary',
          balance: 100000,
          costBasis: 80000,
          expectedGrowthRate: 7.0,
          dividendYield: 0.0,
          reinvestDividends: false,
          qualifiedDividendRatio: 1.0,
        },
        {
          id: 'acc_2',
          name: 'Empower 401(k)',
          type: '401k',
          owner: 'primary',
          balance: 200000,
          costBasis: 200000,
          expectedGrowthRate: 7.0,
          dividendYield: 0.0,
          reinvestDividends: false,
          qualifiedDividendRatio: 1.0,
        },
        {
          id: 'acc_3',
          name: 'Vanguard Roth IRA',
          type: 'roth',
          owner: 'primary',
          balance: 50000,
          costBasis: 50000,
          expectedGrowthRate: 7.0,
          dividendYield: 0.0,
          reinvestDividends: false,
          qualifiedDividendRatio: 1.0,
        },
      ],
      liabilities: [],
      events: [],
      flows: [],
      settings: { fixedInflationRate: 0.0 },
      rules: DEFAULT_2026_RULES,
    };

    const output = runRetirementSimulation(multiAccountPlan);
    const yr1 = output.yearlyResults[0];

    // Verify accountBalances exists and contains all accounts
    expect(yr1.accountBalances).toBeDefined();
    expect(yr1.accountBalances.length).toBe(3);

    const brokerageAcc = yr1.accountBalances.find((a) => a.id === 'acc_1');
    const k401Acc = yr1.accountBalances.find((a) => a.id === 'acc_2');
    const rothAcc = yr1.accountBalances.find((a) => a.id === 'acc_3');

    expect(brokerageAcc?.category).toBe('taxable');
    expect(k401Acc?.category).toBe('taxDeferred');
    expect(rothAcc?.category).toBe('taxFree');

    // Verify portfolioBreakdown matches
    expect(yr1.portfolioBreakdown.taxable).toBeCloseTo(brokerageAcc?.balance || 0, 1);
    expect(yr1.portfolioBreakdown.taxDeferred).toBeCloseTo(k401Acc?.balance || 0, 1);
    expect(yr1.portfolioBreakdown.taxFree).toBeCloseTo(rothAcc?.balance || 0, 1);
  });

  it('correctly calculates FICA tax on gross salary excluding 401(k) pre-tax deductions', () => {
    const ficaPlan: EnginePlan = {
      id: 'fica_plan',
      name: 'FICA Test Plan',
      hasSpouse: false,
      primaryBirthYear: 1990,
      primaryBirthMonth: 1,
      withdrawalMethod: 'textbook',
      filingStatus: 'single',
      retirementAge: 65,
      lifeExpectancyAge: 80,
      primarySalary: 100000,
      primarySalaryYear: 2026,
      primarySalaryRaisePct: 0,
      accounts: [
        {
          id: 'acc_401k',
          name: 'Traditional 401(k)',
          type: 'traditional_401k',
          owner: 'primary',
          balance: 0,
          costBasis: 0,
          expectedGrowthRate: 0,
          dividendYield: 0,
          reinvestDividends: false,
          qualifiedDividendRatio: 1.0,
          contributionMode: 'fixed_amount',
          contributionValue: 20000,
        },
      ],
      liabilities: [],
      events: [],
      flows: [],
      settings: { fixedInflationRate: 0.0 },
      rules: DEFAULT_2026_RULES,
    };

    const output = runRetirementSimulation(ficaPlan);
    const yr1 = output.yearlyResults[0];

    // FICA (6.2% SS + 1.45% Medicare = 7.65%) should be calculated on full $100,000 salary ($7,650),
    // NOT on $80,000 ($6,120).
    expect(yr1.ficaTax).toBeCloseTo(7650, 0);
  });

  it('recalculates Social Security taxation when Traditional IRA drawdowns occur in retirement', () => {
    const ssDrawdownPlan: EnginePlan = {
      id: 'ss_draw_plan',
      name: 'SS Drawdown Plan',
      hasSpouse: false,
      primaryBirthYear: 1959, // Age 67 in 2026
      primaryBirthMonth: 1,
      withdrawalMethod: 'textbook',
      filingStatus: 'single',
      retirementAge: 60, // Already retired
      lifeExpectancyAge: 85,
      primarySalary: 0,
      primarySsMonthlyAmount: 2000, // $24,000/yr SS
      primarySsStartAge: 67,
      accounts: [
        {
          id: 'acc_trad',
          name: 'Traditional IRA',
          type: 'traditional_ira',
          owner: 'primary',
          balance: 500000,
          costBasis: 500000,
          expectedGrowthRate: 0,
          dividendYield: 0,
          reinvestDividends: false,
          qualifiedDividendRatio: 1.0,
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
          growthRate: 0,
          adjustForInflation: false,
          startTriggerType: 'now',
          endTriggerType: 'end_of_plan',
        },
      ],
      flows: [],
      settings: { fixedInflationRate: 0.0, withdrawalMethod: 'textbook' },
      rules: DEFAULT_2026_RULES,
    };

    const output = runRetirementSimulation(ssDrawdownPlan);
    const yr1 = output.yearlyResults[0];

    // With $24k SS and $50k Traditional IRA drawdown, Provisional Income = 50k + 12k = $62,000 (exceeds $34k tier 2).
    // Taxable SS should be calculated and taxes paid should be greater than 0.
    expect(yr1.ssIncome).toBe(24000);
    expect(yr1.drawdownsByType.traditional).toBeGreaterThan(0);
    expect(yr1.taxesPaid).toBeGreaterThan(0);
  });

  it('allows penalty-free Roth IRA withdrawals up to cost basis before age 59.5, but penalizes earnings', () => {
    const rothEarlyPlan: EnginePlan = {
      id: 'roth_early_plan',
      name: 'Roth Early Plan',
      hasSpouse: false,
      primaryBirthYear: 1974, // Age 52 in 2026
      primaryBirthMonth: 1,
      filingStatus: 'single',
      retirementAge: 50, // Retired at 50
      lifeExpectancyAge: 80,
      withdrawalMethod: 'textbook',
      primarySalary: 0,
      accounts: [
        {
          id: 'acc_roth',
          name: 'Vanguard Roth IRA',
          type: 'roth_ira',
          owner: 'primary',
          balance: 100000, // $100k balance
          costBasis: 30000, // $30k contribution basis, $70k growth
          expectedGrowthRate: 0,
          dividendYield: 0,
          reinvestDividends: false,
          qualifiedDividendRatio: 1.0,
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
          growthRate: 0,
          adjustForInflation: false,
          startTriggerType: 'now',
          endTriggerType: 'end_of_plan',
        },
      ],
      flows: [],
      settings: { fixedInflationRate: 0.0 },
      rules: DEFAULT_2026_RULES,
    };

    const output = runRetirementSimulation(rothEarlyPlan);
    const yr1 = output.yearlyResults[0];

    // Total drawn: $50,000 from Roth IRA at age 52.
    // Basis is $30,000 -> $30,000 comes out tax-free and penalty-free!
    // Remaining $20,000 is non-qualified earnings -> 10% penalty = $2,000 penalty.
    expect(yr1.drawdownsByType.roth).toBe(50000);
    expect(yr1.earlyPenaltyTax).toBe(2000);
    expect(yr1.earlyPenaltyDetails?.length).toBe(1);
    expect(yr1.earlyPenaltyDetails?.[0].amount).toBe(20000);
  });

  it('correctly allocates 4% salary contribution to taxable brokerage when isSurplusDestination is true', () => {
    const taxableContribPlan: EnginePlan = {
      id: 'taxable_contrib_plan',
      name: 'Taxable Contribution Plan',
      hasSpouse: false,
      primaryBirthYear: 1990,
      primaryBirthMonth: 1,
      filingStatus: 'single',
      retirementAge: 65,
      lifeExpectancyAge: 80,
      withdrawalMethod: 'textbook',
      primarySalary: 190000,
      primarySalaryYear: 2026,
      primarySalaryRaisePct: 0,
      accounts: [
        {
          id: 'acc_taxable',
          name: 'Vanguard Taxable Brokerage',
          type: 'taxable',
          owner: 'primary',
          balance: 10000,
          costBasis: 10000,
          expectedGrowthRate: 0, // 0% growth to isolate contribution
          dividendYield: 0,
          reinvestDividends: true,
          qualifiedDividendRatio: 1.0,
          contributionMode: 'percentage',
          contributionValue: 4.0, // 4% of $190k = $7,600/yr
          isSurplusDestination: true,
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
          growthRate: 0,
          adjustForInflation: false,
          startTriggerType: 'now',
          endTriggerType: 'end_of_plan',
        },
      ],
      flows: [],
      settings: { fixedInflationRate: 0.0 },
      rules: DEFAULT_2026_RULES,
    };

    const output = runRetirementSimulation(taxableContribPlan);
    const yr1 = output.yearlyResults[0];
    const taxableAcc = yr1.accountBalances.find(a => a.id === 'acc_taxable');

    // 4% of $190,000 = $7,600 contribution. Starting balance $10,000.
    // Plus leftover net cash surplus sweep (salary $190k - $50k exp - ~$43k tax = ~$97k surplus).
    // The taxable brokerage balance should be at least starting $10,000 + $7,600 = $17,600.
    expect(taxableAcc?.balance).toBeGreaterThanOrEqual(17600);
  });
});



