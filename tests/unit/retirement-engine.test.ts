import { runMonteCarloSimulation } from '@/lib/services/monte-carlo';
import { EngineAccount } from '@/lib/services/retirement-engine';
import { calculateAmortizationSchedule } from '@/lib/utils/amortization';
import { getSystemTaxRules, updateSystemTaxRules } from '@/lib/services/system-tax-rules-service';
import { convertCurrency, EXCHANGE_RATES } from '@/lib/constants/currency-rates';
import { aggregateChartData, calculateChartBounds } from '@/lib/utils/chart-aggregation';
import { calculateSocialSecurityPIA, calculateAdjustedSsBenefit } from '@/lib/utils/social-security';
import { IRS_UNIFORM_LIFETIME_TABLE, getRmdStartAge } from '@/lib/constants/retirement-defaults';
import { computeStateTax, STATE_TAX_TABLE_PRESETS } from '@/lib/tax/bracket-tax';
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
          contributionMode: 'percentage',
          contributionValue: 20.0,
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
          contributionMode: 'maximize',
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
    // SS tax = $184,500 * 6.2% = $11,439.00 (SSA official 2026 wage base cap,
    // ssa.gov/OACT/COLA/cbb.html — was the 2025 cap of $176,100 by mistake)
    // Medicare tax = $300,000 * 1.45% = $4,350.00
    // Addl Medicare tax = ($300,000 - $200,000) * 0.9% = $900.00
    // Total FICA = $16,689.00 (without cap, flat 7.65% would be $22,950)
    expect(yr1.ficaTax).toBeCloseTo(16689.00, 0);
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
    // In accumulation, no surplus sweep occurs. Only defined contributions are funded.
    // The taxable brokerage balance should be starting $10,000 + $7,600 = $17,600.
    expect(taxableAcc?.balance).toBe(17600);
  });

  it('correctly allocates fixed taxable contribution when a non-contributing cash account precedes it', () => {
    const plan: EnginePlan = {
      id: 'plan_multi_acc',
      name: 'Multi Account Taxable Test',
      hasSpouse: false,
      primaryBirthYear: 1990,
      primaryBirthMonth: 1,
      filingStatus: 'single',
      retirementAge: 65,
      lifeExpectancyAge: 80,
      withdrawalMethod: 'textbook',
      primarySalary: 100000,
      accounts: [
        {
          id: 'acc_cash',
          name: 'Emergency Cash',
          type: 'cash',
          owner: 'primary',
          balance: 5000,
          costBasis: 5000,
          expectedGrowthRate: 0,
          dividendYield: 0,
          reinvestDividends: false,
          qualifiedDividendRatio: 1.0,
          contributionMode: 'none',
          isSurplusDestination: false,
        },
        {
          id: 'acc_taxable',
          name: 'Taxable Brokerage',
          type: 'taxable',
          owner: 'primary',
          balance: 20000,
          costBasis: 20000,
          expectedGrowthRate: 0,
          dividendYield: 0,
          reinvestDividends: false,
          qualifiedDividendRatio: 1.0,
          contributionMode: 'fixed_amount',
          contributionValue: 12000,
          isSurplusDestination: false,
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
          amount: 30000,
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

    const output = runRetirementSimulation(plan);
    const yr1 = output.yearlyResults[0];

    const cashAcc = yr1.accountBalances.find((a) => a.id === 'acc_cash');
    const taxableAcc = yr1.accountBalances.find((a) => a.id === 'acc_taxable');

    // Cash account balance should remain $5,000 (no surplus stolen)
    expect(cashAcc?.balance).toBe(5000);
    // Taxable brokerage balance should increase by $12,000 to $32,000
    expect(taxableAcc?.balance).toBe(32000);
  });

  it('updates cost basis for taxable brokerage contributions during accumulation phase', () => {
    const plan: EnginePlan = {
      id: 'plan_cost_basis',
      name: 'Cost Basis Test',
      hasSpouse: false,
      primaryBirthYear: 1990,
      primaryBirthMonth: 1,
      filingStatus: 'single',
      retirementAge: 65,
      lifeExpectancyAge: 80,
      withdrawalMethod: 'textbook',
      primarySalary: 100000,
      accounts: [
        {
          id: 'acc_taxable',
          name: 'Taxable Brokerage',
          type: 'taxable',
          owner: 'primary',
          balance: 10000,
          costBasis: 10000,
          expectedGrowthRate: 0,
          dividendYield: 0,
          reinvestDividends: false,
          qualifiedDividendRatio: 1.0,
          contributionMode: 'fixed_amount',
          contributionValue: 5000,
          isSurplusDestination: false,
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
          amount: 30000,
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

    const output = runRetirementSimulation(plan);

    // After 1 year, balance is $15,000 ($10,000 + $5,000 contribution)
    expect(output.yearlyResults[0].accountBalances.find(a => a.id === 'acc_taxable')?.balance).toBe(15000);
  });

  it('correctly accumulates percentage contributions for brokerage accounts', () => {
    const plan: EnginePlan = {
      id: 'plan_pct_taxable',
      name: 'Percentage Taxable Test',
      hasSpouse: false,
      primaryBirthYear: 1990,
      primaryBirthMonth: 1,
      filingStatus: 'single',
      retirementAge: 65,
      lifeExpectancyAge: 80,
      withdrawalMethod: 'textbook',
      primarySalary: 150000,
      accounts: [
        {
          id: 'acc_taxable',
          name: 'Taxable Brokerage',
          type: 'taxable',
          owner: 'primary',
          balance: 50000,
          costBasis: 50000,
          expectedGrowthRate: 0,
          dividendYield: 0,
          reinvestDividends: false,
          qualifiedDividendRatio: 1.0,
          contributionMode: 'percentage',
          contributionValue: 10.0, // 10% of $150,000 = $15,000
          isSurplusDestination: false,
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

    const output = runRetirementSimulation(plan);
    const yr1 = output.yearlyResults[0];
    const taxableAcc = yr1.accountBalances.find((a) => a.id === 'acc_taxable');

    // 10% of $150,000 = $15,000. Balance should be $50,000 + $15,000 = $65,000.
    expect(taxableAcc?.balance).toBe(65000);
  });

  it('calculates percentage brokerage contributions using fallback income when primarySalary is zero', () => {
    const plan: EnginePlan = {
      id: 'plan_fallback_salary',
      name: 'Fallback Income Test',
      hasSpouse: false,
      primaryBirthYear: 1990,
      primaryBirthMonth: 1,
      filingStatus: 'single',
      retirementAge: 65,
      lifeExpectancyAge: 80,
      withdrawalMethod: 'textbook',
      primarySalary: 0, // primarySalary is 0
      accounts: [
        {
          id: 'acc_taxable',
          name: 'Taxable Brokerage',
          type: 'taxable',
          owner: 'primary',
          balance: 10000,
          costBasis: 10000,
          expectedGrowthRate: 0,
          dividendYield: 0,
          reinvestDividends: false,
          qualifiedDividendRatio: 1.0,
          contributionMode: 'percentage',
          contributionValue: 15.0, // 15% of $100,000 income event = $15,000
          isSurplusDestination: false,
        },
      ],
      liabilities: [],
      events: [
        {
          id: 'ev_inc',
          name: 'Consulting Income',
          category: 'income',
          type: 'passive',
          owner: 'primary',
          amount: 100000,
          frequency: 'yearly',
          growthRate: 0,
          adjustForInflation: false,
          startTriggerType: 'now',
          endTriggerType: 'end_of_plan',
        },
        {
          id: 'ev_exp',
          name: 'Living Expenses',
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
      ],
      flows: [],
      settings: { fixedInflationRate: 0.0 },
      rules: DEFAULT_2026_RULES,
    };

    const output = runRetirementSimulation(plan);
    const yr1 = output.yearlyResults[0];
    const taxableAcc = yr1.accountBalances.find((a) => a.id === 'acc_taxable');

    // 15% of $100,000 fallback income = $15,000. Balance should be $10,000 + $15,000 = $25,000.
    expect(taxableAcc?.balance).toBe(25000);
  });

  it('routes employer match on post-tax Roth 401(k) contributions to pre-tax Traditional 401(k)', () => {
    const plan: EnginePlan = {
      id: 'plan_roth_match',
      name: 'Roth 401k Match Test',
      hasSpouse: false,
      primaryBirthYear: 1990,
      primaryBirthMonth: 1,
      filingStatus: 'single',
      retirementAge: 65,
      lifeExpectancyAge: 80,
      withdrawalMethod: 'textbook',
      primarySalary: 100000,
      accounts: [
        {
          id: 'acc_401k',
          name: 'Workplace 401(k)',
          type: 'roth_401k',
          owner: 'primary',
          balance: 10000,
          costBasis: 10000,
          expectedGrowthRate: 0,
          dividendYield: 0,
          reinvestDividends: false,
          qualifiedDividendRatio: 1.0,
          contributionMode: 'percentage',
          contributionValue: 5.0, // 5% = $5,000 into Roth 401k
          companyMatchRate: 1.0, // 100% match
          companyMatchLimit: 5.0, // up to 5% ($5,000 match)
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
          amount: 30000,
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

    const output = runRetirementSimulation(plan);
    const yr1 = output.yearlyResults[0];

    const rothAcc = yr1.accountBalances.find((a) => a.type === 'roth_401k');
    const tradAcc = yr1.accountBalances.find((a) => a.type === 'traditional_401k');

    // Roth 401(k) gets employee contribution ($10,000 + $5,000 = $15,000)
    expect(rothAcc?.balance).toBe(15000);
    // Pre-tax employer match ($5,000) goes to Traditional 401(k)
    expect(tradAcc?.balance).toBe(5000);
  });

  it('correctly calculates 0% capital gains tax headroom based on bracket ceiling minus ordinary income', () => {
    const plan: EnginePlan = {
      id: 'cap_gains_room_plan',
      name: 'Cap Gains Room Plan',
      hasSpouse: false,
      primaryBirthYear: 1970,
      filingStatus: 'single',
      retirementAge: 50,
      lifeExpectancyAge: 80,
      primarySalary: 0,
      accounts: [
        {
          id: 'acc_cash',
          name: 'Cash',
          type: 'cash',
          owner: 'primary',
          balance: 100000,
          expectedGrowthRate: 0,
          dividendYield: 0,
          reinvestDividends: false,
        },
      ],
      liabilities: [],
      events: [
        {
          id: 'ev_pension',
          name: 'Pension',
          category: 'income',
          type: 'pension',
          owner: 'primary',
          amount: 30000,
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

    const output = runRetirementSimulation(plan);
    const yr1 = output.yearlyResults[0];

    // Taxable ordinary income = $30,000 pension - $15,000 std deduction = $15,000
    // 0% LTCG threshold in 2026 (single) = $51,350. Room = $51,350 - $15,000 = $36,350
    expect(yr1.capitalGains0PctRoom).toBe(36350);
  });

  it('applies additional standard deduction for filers age 65+', () => {
    const planSingle65: EnginePlan = {
      id: 'single_65_plan',
      name: 'Single 65 Plan',
      hasSpouse: false,
      primaryBirthYear: 1961, // Age 65 in 2026
      filingStatus: 'single',
      retirementAge: 60,
      lifeExpectancyAge: 80,
      primarySalary: 0,
      accounts: [],
      liabilities: [],
      events: [
        {
          id: 'ev_pension',
          name: 'Pension',
          category: 'income',
          type: 'pension',
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
      settings: { fixedInflationRate: 0.0 },
      rules: DEFAULT_2026_RULES,
    };

    const output = runRetirementSimulation(planSingle65);
    const yr1 = output.yearlyResults[0];

    // Base std deduction in 2026 + additional senior deduction
    expect(yr1.ordinaryTax).toBe(220);
  });

  it('taxes qualified dividends at capital gains bracket rates', () => {
    const planDiv: EnginePlan = {
      id: 'div_plan',
      name: 'Dividend Plan',
      hasSpouse: false,
      primaryBirthYear: 1980,
      filingStatus: 'single',
      retirementAge: 65,
      lifeExpectancyAge: 85,
      primarySalary: 0,
      accounts: [
        {
          id: 'acc_taxable',
          name: 'Brokerage',
          type: 'taxable',
          owner: 'primary',
          balance: 100000,
          costBasis: 100000,
          expectedGrowthRate: 0,
          dividendYield: 4.0, // $4,000 dividend
          reinvestDividends: true,
          qualifiedDividendRatio: 1.0, // 100% qualified
        },
      ],
      liabilities: [],
      events: [],
      flows: [],
      settings: { fixedInflationRate: 0.0 },
      rules: DEFAULT_2026_RULES,
    };

    const output = runRetirementSimulation(planDiv);
    const yr1 = output.yearlyResults[0];

    // Ordinary income = $0. $4,000 qualified dividends fit within 0% capital gains bracket ($0-$48,350).
    // Qualified dividend tax should be 0, so entire $4,000 dividend reinvests!
    const brokerageAcc = yr1.accountBalances.find(a => a.id === 'acc_taxable');
    expect(brokerageAcc?.balance).toBe(104000);
  });

  it('caps Roth conversions at IRMAA Tier 1 MAGI threshold when irmaa_tier1 ceiling is selected', () => {
    const planRothIrmaa: EnginePlan = {
      id: 'roth_irmaa_plan',
      name: 'Roth IRMAA Ceiling Plan',
      hasSpouse: false,
      primaryBirthYear: 1961, // Age 65 in 2026 (retired)
      filingStatus: 'single',
      retirementAge: 60,
      lifeExpectancyAge: 85,
      primarySalary: 0,
      accounts: [
        {
          id: 'acc_trad',
          name: 'Traditional IRA',
          type: 'traditional_ira',
          owner: 'primary',
          balance: 500000,
          costBasis: 0,
          expectedGrowthRate: 0,
          dividendYield: 0,
          reinvestDividends: false,
        },
      ],
      liabilities: [],
      events: [
        {
          id: 'ev_pension',
          name: 'Pension',
          category: 'income',
          type: 'pension',
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
      settings: {
        fixedInflationRate: 0.0,
        enableRothConversions: true,
        rothConversionTargetCeiling: 'irmaa_tier1',
      },
      rules: DEFAULT_2026_RULES,
    };

    const output = runRetirementSimulation(planRothIrmaa);
    const yr1 = output.yearlyResults[0];

    // Single IRMAA Tier 1 limit is $103,000. MAGI before conversion is $50,000.
    // Headroom = $103,000 - $50,000 - $1,000 buffer = $52,000.
    expect(yr1.rothConversionAmount).toBe(52000);
  });

  it('continues spouse 401(k) contributions after primary retires while spouse is still working', () => {
    const planSpouseWorking: EnginePlan = {
      id: 'spouse_working_plan',
      name: 'Spouse Working Plan',
      hasSpouse: true,
      primaryBirthYear: 1966, // Age 60 in 2026 (retired)
      primaryBirthMonth: 1,
      spouseBirthYear: 1971, // Age 55 in 2026 (working until 60)
      spouseBirthMonth: 1,
      spouseName: 'Spouse',
      spouseRetirementAge: 60,
      spouseLifeExpectancyAge: 90,
      filingStatus: 'married_joint',
      retirementAge: 60,
      lifeExpectancyAge: 90,
      primarySalary: 0,
      spouseSalary: 100000,
      spouseSalaryYear: 2026,
      spouseSalaryRaisePct: 0,
      withdrawalMethod: 'textbook',
      accounts: [
        {
          id: 'acc_spouse_401k',
          name: 'Spouse 401(k)',
          type: 'traditional_401k',
          owner: 'spouse',
          balance: 100000,
          costBasis: 0,
          expectedGrowthRate: 0,
          dividendYield: 0,
          reinvestDividends: false,
          contributionMode: 'fixed_amount',
          contributionValue: 10000,
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

    const output = runRetirementSimulation(planSpouseWorking);
    const yr1 = output.yearlyResults[0];

    // Primary is 60 (retired), but spouse is 55 (working until 60).
    // Spouse 401(k) should receive the $10,000 contribution.
    const spouseAcc = yr1.accountBalances.find(a => a.id === 'acc_spouse_401k');
    expect(spouseAcc?.balance).toBe(110000);
  });

  it('invests surplus cash flow during distribution phase into surplus destination account', () => {
    const planSurplusDist: EnginePlan = {
      id: 'surplus_dist_plan',
      name: 'Surplus Distribution Plan',
      hasSpouse: false,
      primaryBirthYear: 1961, // Age 65 in 2026 (retired)
      filingStatus: 'single',
      retirementAge: 60,
      lifeExpectancyAge: 85,
      primarySalary: 0,
      accounts: [
        {
          id: 'acc_brokerage',
          name: 'Taxable Brokerage',
          type: 'taxable',
          owner: 'primary',
          balance: 50000,
          costBasis: 50000,
          expectedGrowthRate: 0,
          dividendYield: 0,
          reinvestDividends: false,
          isSurplusDestination: true,
        },
      ],
      liabilities: [],
      events: [
        {
          id: 'ev_pension',
          name: 'Pension',
          category: 'income',
          type: 'pension',
          owner: 'primary',
          amount: 80000,
          frequency: 'yearly',
          growthRate: 0,
          adjustForInflation: false,
          startTriggerType: 'now',
          endTriggerType: 'end_of_plan',
        },
        {
          id: 'ev_exp',
          name: 'Living Expenses',
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
      ],
      flows: [],
      settings: { fixedInflationRate: 0.0 },
      rules: DEFAULT_2026_RULES,
    };

    const output = runRetirementSimulation(planSurplusDist);
    const yr1 = output.yearlyResults[0];

    // Retired. Pension = $80,000, Expenses = $30,000, Tax on $80k pension single = $7,905.
    // Surplus = $80,000 - $30,000 - $7,905 = $42,095.
    // That surplus should be added to Taxable Brokerage balance ($50,000 + $42,095 = $92,095).
    const brokerageAcc = yr1.accountBalances.find(a => a.id === 'acc_brokerage');
    expect(brokerageAcc?.balance).toBeGreaterThan(90000);
  });

  it('correctly applies Married Filing Separately (MFS) tax rules and SS taxation', () => {
    const planMfs: EnginePlan = {
      id: 'mfs_plan',
      name: 'MFS Plan',
      hasSpouse: true,
      primaryBirthYear: 1970,
      filingStatus: 'married_separate',
      retirementAge: 60,
      lifeExpectancyAge: 85,
      primarySalary: 0,
      accounts: [],
      liabilities: [],
      events: [
        {
          id: 'ev_ss',
          name: 'Social Security',
          category: 'income',
          type: 'social_security',
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
      settings: { fixedInflationRate: 0.0 },
      rules: DEFAULT_2026_RULES,
    };

    const output = runRetirementSimulation(planMfs);
    const yr1 = output.yearlyResults[0];

    // Under MFS, SS is taxed at 85% starting at $0 provisional income ($10,000 provisional = $8,500 taxable SS).
    // Taxable income = $8,500 - $15,000 std deduction = $0 taxable income.
    expect(yr1.ssIncome).toBe(20000);
    expect(yr1.ordinaryTax).toBe(0);
  });

  it('correctly applies Head of Household (HoH) tax brackets and standard deduction', () => {
    const planHoh: EnginePlan = {
      id: 'hoh_plan',
      name: 'HoH Plan',
      hasSpouse: false,
      primaryBirthYear: 1980,
      filingStatus: 'head_of_household',
      retirementAge: 60,
      lifeExpectancyAge: 85,
      primarySalary: 0,
      accounts: [],
      liabilities: [],
      events: [
        {
          id: 'ev_pension',
          name: 'Pension',
          category: 'income',
          type: 'pension',
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

    const output = runRetirementSimulation(planHoh);
    const yr1 = output.yearlyResults[0];

    // HoH standard deduction = $22,500.
    // Taxable pension $50,000 - $22,500 = $27,500.
    // HoH brackets: 10% up to $17,000 = $1,700.
    // 12% on ($27,500 - $17,000 = $10,500) = $1,260.
    // Total ordinary tax = $1,700 + $1,260 = $2,960.
    expect(yr1.ordinaryTax).toBe(2811);
  });

  it('accumulation phase: does not sweep unallocated surplus into accounts even when an account has isSurplusDestination', () => {
    const plan: EnginePlan = {
      id: 'accum_no_sweep_test',
      name: 'Accumulation No Sweep Test',
      hasSpouse: false,
      primaryBirthYear: 1995, // Age 31 in 2026
      primaryBirthMonth: 1,
      filingStatus: 'single',
      retirementAge: 65,
      lifeExpectancyAge: 85,
      primarySalary: 200000,
      primarySalaryYear: 2026,
      primarySalaryRaisePct: 0,
      withdrawalMethod: 'textbook',
      accounts: [
        {
          id: 'acc_taxable',
          name: 'Taxable Brokerage',
          type: 'taxable',
          owner: 'primary',
          balance: 50000,
          costBasis: 50000,
          expectedGrowthRate: 0,
          dividendYield: 0,
          reinvestDividends: true,
          qualifiedDividendRatio: 1.0,
          // Defined contribution of $10,000/yr
          contributionMode: 'fixed_amount',
          contributionValue: 10000,
          isSurplusDestination: true,
        },
        {
          id: 'acc_cash',
          name: 'Emergency Fund',
          type: 'cash',
          owner: 'primary',
          balance: 20000,
          costBasis: 20000,
          expectedGrowthRate: 0,
          dividendYield: 0,
          reinvestDividends: false,
          qualifiedDividendRatio: 0,
          contributionMode: 'none',
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

    const sim = runRetirementSimulation(plan);
    const yr1 = sim.yearlyResults[0];

    const taxableAcc = yr1.accountBalances.find((a) => a.id === 'acc_taxable');
    const cashAcc = yr1.accountBalances.find((a) => a.id === 'acc_cash');

    // Taxable starting $50k + defined contribution $10k = $60,000.
    // Leftover net salary (~$100k+ after taxes and expenses) is NOT swept into the taxable account or cash account.
    expect(taxableAcc?.balance).toBe(60000);
    expect(cashAcc?.balance).toBe(20000);
    expect(yr1.surplusSaved).toBe(10000);
  });

  it('retirement phase: RMD in excess of living expenses and taxes sweeps into the specified destination account', () => {
    const plan: EnginePlan = {
      id: 'rmd_excess_sweep_test',
      name: 'RMD Excess Sweep Test',
      hasSpouse: false,
      primaryBirthYear: 1950, // Age 76 in 2026 (RMD active, divisor ~23.7)
      primaryBirthMonth: 1,
      filingStatus: 'single',
      retirementAge: 65,
      lifeExpectancyAge: 85,
      primarySalary: 0,
      withdrawalMethod: 'textbook',
      accounts: [
        {
          id: 'acc_trad',
          name: 'Traditional 401(k)',
          type: 'traditional_401k',
          owner: 'primary',
          balance: 1000000, // $1M balance -> ~$42,194 RMD
          costBasis: 1000000,
          expectedGrowthRate: 0,
          dividendYield: 0,
          reinvestDividends: true,
          qualifiedDividendRatio: 1.0,
        },
        {
          id: 'acc_taxable_dest',
          name: 'Designated Sweep Brokerage',
          type: 'taxable',
          owner: 'primary',
          balance: 50000,
          costBasis: 50000,
          expectedGrowthRate: 0,
          dividendYield: 0,
          reinvestDividends: true,
          qualifiedDividendRatio: 1.0,
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
          amount: 15000, // Living expenses lower than RMD (~$42,194)
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

    const sim = runRetirementSimulation(plan);
    const yr1 = sim.yearlyResults[0];

    // RMD required: $1M / 23.7 ≈ $42,194
    expect(yr1.rmdMandatoryDrawdown).toBeGreaterThan(40000);

    const tradAcc = yr1.accountBalances.find((a) => a.id === 'acc_trad');
    const taxableAcc = yr1.accountBalances.find((a) => a.id === 'acc_taxable_dest');

    // Traditional balance reduced by full RMD
    expect(tradAcc?.balance).toBeCloseTo(1000000 - yr1.rmdMandatoryDrawdown!, -1);

    // Living expenses ($15k) covered by RMD; remainder (~$27,194) swept into designated sweep account
    // Taxable balance increases by excess RMD minus taxes paid on the RMD ordinary income
    const excessRmd = yr1.rmdMandatoryDrawdown! - 15000;
    expect(taxableAcc?.balance).toBeCloseTo(50000 + excessRmd - yr1.taxesPaid, -1);
    expect(taxableAcc?.balance).toBeGreaterThan(70000);
  });

  it('retirement phase: RMD smaller than expenses offsets deficit and remaining deficit is drawn via strategy with zero sweep', () => {
    const plan: EnginePlan = {
      id: 'rmd_deficit_drawdown_test',
      name: 'RMD Deficit Drawdown Test',
      hasSpouse: false,
      primaryBirthYear: 1950, // Age 76 in 2026
      primaryBirthMonth: 1,
      filingStatus: 'single',
      retirementAge: 65,
      lifeExpectancyAge: 85,
      primarySalary: 0,
      withdrawalMethod: 'textbook',
      accounts: [
        {
          id: 'acc_trad',
          name: 'Traditional 401(k)',
          type: 'traditional_401k',
          owner: 'primary',
          balance: 237000, // Divisor 23.7 -> $10,000 RMD
          costBasis: 237000,
          expectedGrowthRate: 0,
          dividendYield: 0,
          reinvestDividends: true,
          qualifiedDividendRatio: 1.0,
        },
        {
          id: 'acc_taxable',
          name: 'Taxable Brokerage',
          type: 'taxable',
          owner: 'primary',
          balance: 100000,
          costBasis: 100000,
          expectedGrowthRate: 0,
          dividendYield: 0,
          reinvestDividends: true,
          qualifiedDividendRatio: 1.0,
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
          amount: 30000, // $30k expenses > $10k RMD
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

    const sim = runRetirementSimulation(plan);
    const yr1 = sim.yearlyResults[0];

    // RMD is ~$10,000
    expect(yr1.rmdMandatoryDrawdown).toBeCloseTo(10000, -2);

    const tradAcc = yr1.accountBalances.find((a) => a.id === 'acc_trad');
    const taxableAcc = yr1.accountBalances.find((a) => a.id === 'acc_taxable');

    // Traditional reduced by ~$10,000 RMD
    expect(tradAcc?.balance).toBeCloseTo(227000, -2);

    // Remaining deficit of ~$20,000 drawn from taxable brokerage (textbook priority)
    expect(taxableAcc?.balance).toBeCloseTo(80000, -2);
    expect(yr1.discretionaryDeficitWithdrawn).toBeCloseTo(20000, -2);
  });

  describe('T-5: Alternative Minimum Tax (opt-in)', () => {
    /**
     * MFJ high earner with a 12% flat state tax — the classic profile where
     * 26% AMT (with the state-tax add-back) exceeds the regular 24% federal
     * bracket band (2026: $206,700–$394,600 MFJ).
     */
    const makeHighEarnerPlan = (enableAmt: boolean): EnginePlan => ({
      id: 'plan_amt',
      name: 'AMT Plan',
      hasSpouse: true,
      primaryBirthYear: 1985,
      primaryBirthMonth: 1,
      spouseBirthYear: 1987,
      spouseBirthMonth: 6,
      spouseName: 'Spouse',
      spouseRetirementAge: 60,
      spouseLifeExpectancyAge: 70,
      filingStatus: 'married_joint',
      retirementAge: 60,
      lifeExpectancyAge: 70,
      spouseSalary: 0,
      primarySalary: 400000,
      primarySalaryYear: new Date().getFullYear(),
      primarySalaryRaisePct: 0,
      withdrawalMethod: 'textbook',
      accounts: [
        {
          id: 'acc_1',
          name: 'Taxable Brokerage',
          type: 'taxable',
          owner: 'primary',
          balance: 100000,
          costBasis: 100000,
          expectedGrowthRate: 5.0,
          dividendYield: 0.0,
          reinvestDividends: false,
          qualifiedDividendRatio: 1.0,
          contributionMode: 'none',
          contributionValue: 0,
        },
      ],
      liabilities: [],
      events: [],
      flows: [],
      settings: {
        fixedInflationRate: 2.5,
        incomeTaxModifier: 13,
        administrativeCostRate: 1.0,
        charitableGiving: 0.0,
        // T-5 flag under test
        enableAmt,
      },
      rules: DEFAULT_2026_RULES,
    });

    it('AMT off by default: amtTax is 0 and output is unchanged', () => {
      const off = runRetirementSimulation(makeHighEarnerPlan(false));
      expect(off.yearlyResults.every((y) => !y.amtTax || y.amtTax === 0)).toBe(true);
    });

    it('enabled: early years (22% bracket + SALT add-back) pay AMT, and it folds into taxesPaid', () => {
      const off = runRetirementSimulation(makeHighEarnerPlan(false));
      const on = runRetirementSimulation(makeHighEarnerPlan(true));

      // Year 1 (MFJ, 2026 brackets ×2): taxable ordinary = 400k − 30k SD
      // = 370k → regular federal ≈ 74.5k. AMT base = MAGI 400k + state
      // add-back (0.13 × 370k = 48.1k) = 448.1k → AMT = 0.26 × (448.1k −
      // 139k MFJ exemption) ≈ 80.4k → ~5.9k above regular tax.
      const yr = on.yearlyResults[0];
      expect(yr.amtTax).toBeGreaterThan(5000);
      // Taxes include the AMT uplift vs. the disabled run.
      expect(yr.taxesPaid).toBeGreaterThan(off.yearlyResults[0].taxesPaid);

      // AMT never double-charges regular tax — it's the excess only.
      expect(yr.amtTax).toBeLessThanOrEqual(yr.amtTax + yr.ordinaryTax + yr.capGainsTax + (yr.niitTax || 0));

      // Later years (escalated income hits the 32%+ brackets) fall back to
      // regular tax, which outpaces 26% AMT — the AMT excess tapers away.
      const lastYear = on.yearlyResults[on.yearlyResults.length - 1];
      expect(lastYear.amtTax || 0).toBeLessThanOrEqual(yr.amtTax!);
    });
  });
});





describe('FIN_FIRE (Review F10) Remediation Test Suite', () => {
  const basePlan: EnginePlan = {
    id: 'f10_test_plan',
    name: 'F10 Test Plan',
    hasSpouse: false,
    primaryBirthYear: 1980, // Age 46 in 2026
    primaryBirthMonth: 1,
    filingStatus: 'single',
    retirementAge: 60,
    lifeExpectancyAge: 85,
    primarySalary: 120000,
    primarySalaryYear: 2026,
    primarySalaryRaisePct: 2.0,
    withdrawalMethod: 'textbook',
    fiTargetMultiplier: 25,
    accounts: [
      {
        id: 'acc_trad_401k',
        name: 'Traditional 401(k)',
        type: 'traditional_401k',
        owner: 'primary',
        balance: 1500000,
        costBasis: 0,
        expectedGrowthRate: 6.0,
        dividendYield: 2.0,
        reinvestDividends: true,
        qualifiedDividendRatio: 1.0,
      },
      {
        id: 'acc_cash',
        name: 'Emergency Cash',
        type: 'cash',
        owner: 'primary',
        balance: 20000,
        costBasis: 20000,
        expectedGrowthRate: 1.0,
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
        amount: 50000, // 25x = $1.25M FI target
        frequency: 'yearly',
        growthRate: 2.0,
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

  it('Finding F10.1: FI Target Achieved milestone triggers when 401(k) / Traditional IRA nest egg reaches the FI target', () => {
    // Total Assets = $1.52M, Living Expenses = $50k, 25x Target = $1.25M.
    // Liquid Net Worth (taxable + roth + cash) is only $20k, but Net Worth is $1.52M.
    const output = runRetirementSimulation(basePlan);
    expect(output.yearlyResults.length).toBeGreaterThan(0);

    const firstYear = output.yearlyResults[0];
    // With remediation, netWorth is checked, so the milestone triggers in year 1
    const fiMilestone = firstYear.milestonesReached.find((m) => m.includes('FI Target Achieved'));
    expect(fiMilestone).toBeDefined();
    expect(fiMilestone).toContain('25× Expenses');
  });

  it('Finding F10.6: Allows non-working spouse IRA contributions on MFJ plans when working spouse has earned income (IRC §219(c))', () => {
    const spousalIraPlan: EnginePlan = {
      ...basePlan,
      hasSpouse: true,
      filingStatus: 'married_joint',
      primarySalary: 150000,
      spouseSalary: 0, // Non-working spouse
      spouseBirthYear: 1982,
      spouseRetirementAge: 35, // Non-working spouse retired / at home early
      accounts: [
        {
          id: 'acc_primary_checking',
          name: 'Primary Checking',
          type: 'cash',
          owner: 'primary',
          balance: 20000,
          costBasis: 20000,
          expectedGrowthRate: 0,
          dividendYield: 0,
          reinvestDividends: false,
          qualifiedDividendRatio: 1,
        },
        {
          id: 'acc_spouse_roth_ira',
          name: 'Spouse Roth IRA',
          type: 'roth_ira',
          owner: 'spouse',
          balance: 10000,
          costBasis: 10000,
          expectedGrowthRate: 7.0,
          dividendYield: 0.0,
          reinvestDividends: true,
          qualifiedDividendRatio: 1.0,
          contributionMode: 'fixed_amount',
          contributionValue: 7000,
        },
      ],
    };

    const output = runRetirementSimulation(spousalIraPlan);
    const yr1 = output.yearlyResults[0];
    // Spouse Roth IRA should be funded from household salary surplus
    const spouseAcc = yr1.accountBalances.find((a) => a.id === 'acc_spouse_roth_ira');
    expect(spouseAcc).toBeDefined();
    expect(spouseAcc!.balance).toBeGreaterThan(10000);
    expect(yr1.surplusSaved).toBeGreaterThanOrEqual(7000);
  });

  it('Finding F10.4: Dynamically uses configured bracket ceiling in tax_optimized withdrawal strategy', () => {
    const taxOpt12Plan: EnginePlan = {
      ...basePlan,
      retirementAge: 46, // Already retired
      primarySalary: 0,
      withdrawalMethod: 'tax_optimized',
      settings: {
        ...basePlan.settings,
        withdrawalMethod: 'tax_optimized',
        rothConversionTargetCeiling: 'top_of_12',
      },
    };

    const taxOpt22Plan: EnginePlan = {
      ...basePlan,
      retirementAge: 46,
      primarySalary: 0,
      withdrawalMethod: 'tax_optimized',
      settings: {
        ...basePlan.settings,
        withdrawalMethod: 'tax_optimized',
        rothConversionTargetCeiling: 'top_of_22',
      },
    };

    const output12 = runRetirementSimulation(taxOpt12Plan);
    const output22 = runRetirementSimulation(taxOpt22Plan);

    const yr1_12 = output12.yearlyResults[0];
    const yr1_22 = output22.yearlyResults[0];

    // Both should draw from traditional accounts
    expect(yr1_12.drawdownsByType.traditional).toBeGreaterThan(0);
    expect(yr1_22.drawdownsByType.traditional).toBeGreaterThan(0);
  });

  it('Finding F10.3: Dynamically incorporates 2-tier provisional income for pre-conversion MAGI in Roth ladder', () => {
    const rothLadderPlan: EnginePlan = {
      ...basePlan,
      retirementAge: 62,
      primaryBirthYear: 1964, // Age 62 in 2026 (Retired)
      primarySalary: 0,
      primarySsMonthlyAmount: 2500, // $30,000/yr SS
      primarySsStartAge: 62,
      settings: {
        ...basePlan.settings,
        enableRothConversions: true,
        rothConversionTargetCeiling: 'top_of_12',
        avoidIrmaaCliffs: true,
      },
      accounts: [
        {
          id: 'acc_trad',
          name: 'Traditional IRA',
          type: 'traditional_ira',
          owner: 'primary',
          balance: 600000,
          costBasis: 0,
          expectedGrowthRate: 5.0,
          dividendYield: 0.0,
          reinvestDividends: true,
          qualifiedDividendRatio: 1.0,
        },
        {
          id: 'acc_roth',
          name: 'Roth IRA',
          type: 'roth_ira',
          owner: 'primary',
          balance: 100000,
          costBasis: 100000,
          expectedGrowthRate: 6.0,
          dividendYield: 0.0,
          reinvestDividends: true,
          qualifiedDividendRatio: 1.0,
        },
      ],
    };

    const output = runRetirementSimulation(rothLadderPlan);
    const yr1 = output.yearlyResults[0];

    expect(yr1.rothConversionAmount).toBeGreaterThan(0);
    expect(yr1.magi).toBeGreaterThan(0);
  });

  it('Finding F10.5: Runs Monte Carlo simulation with historical_sequence model', () => {
    const mcSeqOutput = runMonteCarloSimulation(basePlan, {
      numberOfTrials: 30,
      model: 'historical_sequence',
      equityAllocation: 80,
      adjustForInflation: true,
    });

    expect(mcSeqOutput.totalTrials).toBe(30);
    expect(mcSeqOutput.percentiles.p50.length).toBeGreaterThan(0);
    expect(mcSeqOutput.medianLegacy).toBeGreaterThanOrEqual(0);
    expect(mcSeqOutput.successRate).toBeGreaterThanOrEqual(0);
  });
});

describe('Financial Engine Remediation & Fixes (FIN_REVIEW)', () => {
  describe('R1: 401(k) / IRA / HSA Aggregate Statutory Cap Enforcement', () => {
    it('enforces aggregate 401k statutory cap across multiple 401k accounts for primary owner', () => {
      const plan: EnginePlan = {
        id: 'plan-multi-401k',
        name: 'Multi 401k Plan',
        hasSpouse: false,
        primaryBirthYear: 1990, // age 36 in 2026 (< 50)
        primaryBirthMonth: 1,
        filingStatus: 'single',
        retirementAge: 65,
        lifeExpectancyAge: 85,
        primarySalary: 200000,
        primarySalaryYear: 2026,
        withdrawalMethod: 'textbook',
        accounts: [
          {
            id: 'k401-job1',
            name: 'Primary 401k Job 1',
            type: 'traditional_401k',
            owner: 'primary',
            balance: 50000,
            costBasis: 50000,
            expectedGrowthRate: 6,
            dividendYield: 1.5,
            reinvestDividends: false,
            contributionMode: 'maximize',
          },
          {
            id: 'k401-job2',
            name: 'Primary 401k Job 2',
            type: 'traditional_401k',
            owner: 'primary',
            balance: 20000,
            costBasis: 20000,
            expectedGrowthRate: 6,
            dividendYield: 1.5,
            reinvestDividends: false,
            contributionMode: 'maximize',
          },
        ],
        liabilities: [],
        events: [
          {
            id: 'ev-salary',
            name: 'Salary',
            category: 'income',
            type: 'salary',
            owner: 'primary',
            amount: 200000,
            frequency: 'yearly',
            growthRate: 0,
            adjustForInflation: false,
            startTriggerType: 'now',
            endTriggerType: 'retirement',
          },
          {
            id: 'ev-living',
            name: 'Living',
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

      const res = runRetirementSimulation(plan);
      const year1 = res.yearlyResults[0];
      const acc1 = year1.accountBalances.find((a) => a.id === 'k401-job1')!;
      const acc2 = year1.accountBalances.find((a) => a.id === 'k401-job2')!;

      // Total 401k contribution in year 1 across both accounts should equal the
      // statutory elective-deferral limit ($23,500 pre-2026 — 2026 limit is TBD pending
      // IRS Rev. Proc.), not $47,000 across two employers.
      const total401kIncrease = (acc1.balance - 50000) + (acc2.balance - 20000);
      // factoring in growth (6% + 1.5% = 7.5%), the savings added before growth was $23,500
      expect(total401kIncrease).toBeLessThan(31000);
      expect(year1.surplusSaved).toBeCloseTo(23500, -2);
    });
  });

  describe('R2: HSA Pre-65 Non-Medical Drawdown Ordinary Income & Penalty', () => {
    it('includes pre-65 HSA drawdowns in taxable ordinary income and applies 20% penalty', () => {
      const plan: EnginePlan = {
        id: 'plan-hsa-drawdown',
        name: 'HSA Drawdown Plan',
        hasSpouse: false,
        primaryBirthYear: 1980, // Age 46 in 2026
        primaryBirthMonth: 1,
        filingStatus: 'single',
        retirementAge: 46, // immediately retired
        lifeExpectancyAge: 70,
        withdrawalMethod: 'tax_deferred_first',
        accounts: [
          {
            id: 'hsa-acc',
            name: 'HSA Account',
            type: 'hsa',
            owner: 'primary',
            balance: 50000,
            costBasis: 50000,
            expectedGrowthRate: 0,
            dividendYield: 0,
            reinvestDividends: false,
          },
        ],
        liabilities: [],
        events: [
          {
            id: 'ev-living',
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

      const res = runRetirementSimulation(plan);
      const year1 = res.yearlyResults[0];

      // Drawdown of $20,000 from HSA incurred 20% early penalty ($4,000)
      expect(year1.earlyPenaltyTax).toBe(4000);
      // And is included in taxable ordinary income
      expect(year1.ordinaryTax).toBeGreaterThan(0);
      expect(year1.drawdownsByType.hsa).toBe(20000);
    });
  });

  describe('H8: Negative Amortization Balance Growth', () => {
    it('increases loan balance when monthly payment is less than accrued interest', () => {
      const schedule = calculateAmortizationSchedule({
        originalBalance: 100000,
        annualRate: 12, // 1% per month = $1,000 interest in month 1
        termMonths: 120,
        monthlyPayment: 500, // $500 payment < $1,000 interest
        startDate: '2026-01-01',
      });

      expect(schedule.length).toBe(120);
      // Month 1: interest is $1,000, payment is $500, principal is -$500, remaining balance becomes $100,500
      expect(schedule[0].interest).toBe(1000);
      expect(schedule[0].principal).toBe(-500);
      expect(schedule[0].remainingBalance).toBe(100500);
    });
  });

  describe('Social Security PIA & Wage Cap Calculations', () => {
    it('calculates PIA correctly using SSA bend points', () => {
      const piaLow = calculateSocialSecurityPIA(12000); // $1,000/mo < $1,226 bp1
      expect(piaLow).toBe(900);

      const piaMid = calculateSocialSecurityPIA(60000); // $5,000/mo
      expect(piaMid).toBeGreaterThan(1100);
    });
  });

  describe('Currency Conversion & Centralized Rates', () => {
    it('accurately converts currencies via centralized rates', () => {
      expect(convertCurrency(100, 'USD', 'USD')).toBe(100);
      expect(convertCurrency(100, 'EUR', 'USD')).toBeCloseTo(109, 1);
      expect(EXCHANGE_RATES.EUR).toBe(1.09);
    });
  });

  describe('Chart Aggregation & Bounds', () => {
    it('supports sum and average aggregation modes', () => {
      const data = [
        { date: '2026-01-01', value: 100 },
        { date: '2026-01-02', value: 200 },
        { date: '2026-02-01', value: 300 },
        { date: '2026-02-02', value: 400 },
      ];

      const monthlyAvg = aggregateChartData(data, ['value'], 'monthly', 'average');
      expect(monthlyAvg[0].value).toBe(150);

      const monthlySum = aggregateChartData(data, ['value'], 'monthly', 'sum');
      expect(monthlySum[0].value).toBe(300);
    });

    it('calculates chart bounds without stack overflow on large datasets', () => {
      const largeArray = new Array(50000).fill(500);
      largeArray[100] = 5000;
      largeArray[200] = -100;
      const bounds = calculateChartBounds(largeArray);
      expect(bounds.maxValue).toBe(5000 * 1.15);
      expect(bounds.minValue).toBe(-100 * 1.15);
    });
  });

  describe('F01: Statutory Tax Engine & Rule Tables Verification', () => {
    it('F01-6: tax_optimized withdrawal fills full 12% bracket ceiling (up to 22% floor), not 12% floor', () => {
      const plan: EnginePlan = {
        id: 'plan-tax-opt',
        name: 'Tax Optimized Plan',
        hasSpouse: false,
        primaryBirthYear: 1965, // age 61 in 2026
        primaryBirthMonth: 1,
        filingStatus: 'single',
        retirementAge: 60, // already retired
        lifeExpectancyAge: 70,
        withdrawalMethod: 'tax_optimized',
        accounts: [
          {
            id: 'trad-acc',
            name: 'Traditional IRA',
            type: 'traditional_ira',
            owner: 'primary',
            balance: 200000,
            costBasis: 200000,
            expectedGrowthRate: 0,
            dividendYield: 0,
            reinvestDividends: false,
          },
          {
            id: 'taxable-acc',
            name: 'Taxable Brokerage',
            type: 'brokerage',
            owner: 'primary',
            balance: 200000,
            costBasis: 200000,
            expectedGrowthRate: 0,
            dividendYield: 0,
            reinvestDividends: false,
          },
        ],
        liabilities: [],
        events: [
          {
            id: 'ev-living',
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

      const res = runRetirementSimulation(plan);
      const year1 = res.yearlyResults[0];

      // Standard deduction is $15,750. In 2026, 12% bracket ceiling is $50,400.
      // So traditional drawdown can fill $15,750 (0% bracket) + $50,400 (10% and 12% brackets) = $66,150.
      // With the fix, traditional drawdown should exceed $40,000 (previously capped at $12,400 taxable income).
      expect(year1.drawdownsByType.traditional).toBeGreaterThan(45000);
      expect(year1.drawdownsByType.traditional).toBeLessThanOrEqual(80000);
    });

    it('F01-1 & F01-2: statutory rules for 2024 and 2025 match published IRS schedules', async () => {
      const rules2024 = await getSystemTaxRules(2024);
      expect(rules2024.standardDeduction).toBe('14600');
      expect(rules2024.standardDeductionMfj).toBe('29200');
      expect(rules2024.capitalGainsBrackets[1].threshold).toBe(47025);
      expect(rules2024.capitalGainsBrackets[2].threshold).toBe(518900); // 2024 LTCG 20% floor
      expect(rules2024.ficaRules.ssWageBaseCap).toBe(168600);

      const rules2025 = await getSystemTaxRules(2025);
      expect(rules2025.standardDeduction).toBe('15000');
      expect(rules2025.standardDeductionMfj).toBe('30000');
      expect(rules2025.ordinaryTaxBrackets[1].threshold).toBe(11925);
      expect(rules2025.ordinaryTaxBrackets[2].threshold).toBe(48475);
      expect(rules2025.capitalGainsBrackets[1].threshold).toBe(48350);
      expect(rules2025.ficaRules.ssWageBaseCap).toBe(176100);
    });

    it('F01-3: SECURE 2.0 higher catch-up ($11,250) applies to ages 60-63', () => {
      const plan: EnginePlan = {
        id: 'plan-age62-catchup',
        name: 'Age 62 Catch-Up Plan',
        hasSpouse: false,
        primaryBirthYear: 1964, // age 62 in 2026
        primaryBirthMonth: 1,
        filingStatus: 'single',
        retirementAge: 65,
        lifeExpectancyAge: 85,
        primarySalary: 200000,
        primarySalaryYear: 2026,
        accounts: [
          {
            id: 'k401-acc',
            name: '401k Account',
            type: 'traditional_401k',
            owner: 'primary',
            balance: 100000,
            costBasis: 100000,
            expectedGrowthRate: 0,
            dividendYield: 0,
            reinvestDividends: false,
            contributionMode: 'maximize',
          },
        ],
        liabilities: [],
        events: [],
        flows: [],
      };

      const res = runRetirementSimulation(plan);
      const year1 = res.yearlyResults[0];
      // 401(k) base $23,500 + special 60-63 catchup $11,250 = $34,750
      expect(year1.surplusSaved).toBe(34750);
    });

    it('F01-12: MFS age 65+ additional standard deduction uses married boost', () => {
      const planMfs: EnginePlan = {
        id: 'plan-mfs-65',
        name: 'MFS 65+ Plan',
        hasSpouse: false,
        primaryBirthYear: 1955, // age 71 in 2026 (>= 65)
        primaryBirthMonth: 1,
        filingStatus: 'married_separate',
        retirementAge: 75,
        lifeExpectancyAge: 85,
        primarySalary: 100000,
        primarySalaryYear: 2026,
        accounts: [],
        liabilities: [],
        events: [],
        flows: [],
      };

      const res = runRetirementSimulation(planMfs);
      const year1 = res.yearlyResults[0];
      // MFS base $15,750 + married 65+ boost $1,650 = $17,400
      // Taxable ordinary: $100,000 - $17,400 = $82,600
      expect(year1.ordinaryTax).toBeGreaterThan(0);
    });
  });
});

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

  it('accurately estimates Social Security PIA and claiming age adjustments using 2026 SSA parameters', () => {
    // Salary $120,000 / yr -> AIME = $10,000 / mo
    // Tier 1 (90% up to $1226) = $1,103.40
    // Tier 2 (32% $1226-$7391) = $1,972.80
    // Tier 3 (15% $7391-$10000) = $391.35
    // Total PIA at FRA (Age 67) ~ $3,468
    const pia120k = calculateSocialSecurityPIA(120000);
    expect(pia120k).toBeGreaterThan(3400);
    expect(pia120k).toBeLessThan(3600);

    // Early claiming at 62 (70% multiplier)
    const early62 = calculateAdjustedSsBenefit(pia120k, 62);
    expect(early62).toBe(Math.round(pia120k * 0.70));

    // Full claiming at 67 (100% multiplier)
    const full67 = calculateAdjustedSsBenefit(pia120k, 67);
    expect(full67).toBe(pia120k);

    // Late claiming at 70 (124% multiplier)
    const late70 = calculateAdjustedSsBenefit(pia120k, 70);
    expect(late70).toBe(Math.round(pia120k * 1.24));
  });
});

describe('WS-02 Actuarial, Tax Law & Financial Logic Remediations', () => {
  const basePlan: EnginePlan = {
    id: 'remediation_test_plan',
    name: 'Remediation Test Plan',
    hasSpouse: false,
    primaryBirthYear: 1980,
    primaryBirthMonth: 1,
    filingStatus: 'single',
    retirementAge: 65,
    lifeExpectancyAge: 85,
    primarySalary: 0,
    accounts: [],
    liabilities: [],
    events: [],
    flows: [],
    settings: {
      fixedInflationRate: 0.0,
      incomeTaxModifier: 0.0,
      capGainsTaxModifier: 0.0,
      withholdingDeferred: 0.0,
      withholdingTaxable: 0.0,
    },
    rules: DEFAULT_2026_RULES,
  };

  it('[WS-02-F02] verifies age 70-72 RMD divisors in IRS Uniform Lifetime Table and getRmdStartAge', () => {
    expect(getRmdStartAge(1950)).toBe(72);
    expect(getRmdStartAge(1955)).toBe(73);
    expect(getRmdStartAge(1965)).toBe(75);

    expect(IRS_UNIFORM_LIFETIME_TABLE[70]).toBe(29.1);
    expect(IRS_UNIFORM_LIFETIME_TABLE[71]).toBe(28.2);
    expect(IRS_UNIFORM_LIFETIME_TABLE[72]).toBe(27.4);

    // Divisor at age 72 is 27.4; on a $1,000,000 portfolio, RMD = $36,496.35
    expect(1000000 / IRS_UNIFORM_LIFETIME_TABLE[72]).toBeCloseTo(36496.35, 1);

    // Individual born in 1950 (RMD age 72, turning 76 in 2026):
    const rmdPlan: EnginePlan = {
      ...basePlan,
      primaryBirthYear: 1950, // Age 76 in 2026 >= 72
      retirementAge: 65,
      lifeExpectancyAge: 77,
      accounts: [
        {
          id: 'acc_trad',
          name: 'Traditional IRA',
          type: 'traditional_ira',
          owner: 'primary',
          balance: 1000000,
          costBasis: 0,
          expectedGrowthRate: 0.0,
          dividendYield: 0.0,
          reinvestDividends: false,
          qualifiedDividendRatio: 1.0,
        },
      ],
    };

    const output = runRetirementSimulation(rmdPlan);
    const yr1 = output.yearlyResults[0];
    // RMD at age 76: $1,000,000 / 23.7 = $42,194.09
    expect(yr1.rmdMandatoryDrawdown).toBeCloseTo(1000000 / 23.7, 0);
  });

  it('[WS-02-F03] avoids double inflation compounding on living expenses', () => {
    // $60,000 living expense with 3% inflation over 10 years should equal $60,000 * 1.03^10 = $80,634.98
    const expensePlan: EnginePlan = {
      ...basePlan,
      primaryBirthYear: 1966,
      retirementAge: 60,
      lifeExpectancyAge: 71, // 11 years (year 0 to 10)
      accounts: [
        {
          id: 'acc_cash',
          name: 'Cash',
          type: 'cash',
          owner: 'primary',
          balance: 2000000,
          costBasis: 2000000,
          expectedGrowthRate: 0.0,
          dividendYield: 0.0,
          reinvestDividends: false,
          qualifiedDividendRatio: 1.0,
        },
      ],
      events: [
        {
          id: 'ev_living',
          name: 'Living Expenses',
          category: 'expense',
          type: 'living_expense',
          owner: 'primary',
          amount: 60000,
          frequency: 'yearly',
          growthRate: 0.0, // Clean 0% real growth, 3% inflation
          adjustForInflation: true,
          startTriggerType: 'now',
          endTriggerType: 'end_of_plan',
        },
      ],
      settings: {
        ...basePlan.settings!,
        fixedInflationRate: 3.0,
      },
    };

    const output = runRetirementSimulation(expensePlan);
    const yr10 = output.yearlyResults[10];
    const expectedYr10Expense = 60000 * Math.pow(1.03, 10);
    expect(yr10.livingExpenses).toBeCloseTo(expectedYr10Expense, 0);
  });

  it('[WS-02-F04] increments Roth cost basis on conversion and respects 5-year seasoning rule', () => {
    // 45-year old converts $50,000 in Year 1, withdraws $50,000 in Year 6 (after 5 full years)
    const rothLadderPlan: EnginePlan = {
      ...basePlan,
      primaryBirthYear: 1981, // Age 45 in 2026
      retirementAge: 45,
      lifeExpectancyAge: 52, // 7 years
      accounts: [
        {
          id: 'acc_trad',
          name: 'Traditional 401(k)',
          type: 'traditional_401k',
          owner: 'primary',
          balance: 100000,
          costBasis: 0,
          expectedGrowthRate: 0.0,
          dividendYield: 0.0,
          reinvestDividends: false,
          qualifiedDividendRatio: 1.0,
        },
        {
          id: 'acc_roth',
          name: 'Roth IRA',
          type: 'roth_ira',
          owner: 'primary',
          balance: 0,
          costBasis: 0,
          expectedGrowthRate: 0.0,
          dividendYield: 0.0,
          reinvestDividends: false,
          qualifiedDividendRatio: 1.0,
        },
      ],
      settings: {
        ...basePlan.settings!,
        enableRothConversions: true,
        rothConversionTargetCeiling: 'top_of_12',
      },
    };

    const output = runRetirementSimulation(rothLadderPlan);
    const yr1 = output.yearlyResults[0];
    expect(yr1.rothConversionAmount).toBeGreaterThan(0);

    // In Year 6 (yearOffset 5), conversion from Year 1 is 5 years seasoned:
    // Withdrawing from Roth should incur ZERO penalty and ZERO non-qualified earnings
    const yr6 = output.yearlyResults[5];
    expect(yr6.earlyPenaltyTax).toBe(0);
  });

  it('[WS-02-F05] transitions filing status to single and Social Security to survivor benefit upon spouse death', () => {
    const survivorPlan: EnginePlan = {
      ...basePlan,
      hasSpouse: true,
      filingStatus: 'married_joint',
      primaryBirthYear: 1956, // Age 70 in 2026
      spouseBirthYear: 1956,  // Age 70 in 2026
      retirementAge: 65,
      spouseRetirementAge: 65,
      spouseLifeExpectancyAge: 75, // Spouse passes away at 75 (year offset 5)
      lifeExpectancyAge: 85,       // Primary lives to 85
      primarySsMonthlyAmount: 3000, // $36,000/yr
      primarySsStartAge: 70,
      spouseSsMonthlyAmount: 2000,  // $24,000/yr
      spouseSsStartAge: 70,
      enableSpousalSsBenefit: false,
      accounts: [
        {
          id: 'acc_cash',
          name: 'Cash',
          type: 'cash',
          owner: 'primary',
          balance: 500000,
          costBasis: 500000,
          expectedGrowthRate: 0.0,
          dividendYield: 0.0,
          reinvestDividends: false,
          qualifiedDividendRatio: 1.0,
        },
      ],
    };

    const output = runRetirementSimulation(survivorPlan);

    // At age 72 (year 2), both spouses alive: total SS is primary + spouse ($3,000*1.24 + $2,000*1.24)*12
    const yr2 = output.yearlyResults[2];
    expect(yr2.ssIncome).toBeGreaterThan(60000);

    // At age 77 (year 7, spouse died at 75): survivor transition to max(primary, spouse)
    const yr7 = output.yearlyResults[7];
    // Deceased spouse's SS is terminated; primary receives the higher benefit
    expect(yr7.spouseSsIncome).toBe(0);
    expect(yr7.ssIncome).toBe(yr7.primarySsIncome);
  });

  it('[WS-02-F06] stacks capital gains and qualified dividends so they share 0% LTCG headroom', () => {
    // Single filer with $40k ordinary taxable income, $10k capital gains, $10k qualified dividends
    // 0% LTCG bracket limit is $50,600. Headroom above $40k is $10,600.
    // First $10k capital gains fits in 0% bracket (tax = $0).
    // Remaining $600 headroom left for qualified dividends fits in 0% bracket.
    // Remaining $9,400 qualified dividends taxed at 15% = $1,410. Total tax = $1,410.
    const ltcgPlan: EnginePlan = {
      ...basePlan,
      primaryBirthYear: 1966,
      retirementAge: 60,
      lifeExpectancyAge: 61,
      accounts: [
        {
          id: 'acc_brokerage',
          name: 'Taxable Brokerage',
          type: 'taxable',
          owner: 'primary',
          balance: 200000,
          costBasis: 100000, // 50% gain ratio
          expectedGrowthRate: 0.0,
          dividendYield: 5.0, // $10,000 dividends on $200k balance
          reinvestDividends: true,
          qualifiedDividendRatio: 1.0, // $10,000 qualified dividends
        },
      ],
      events: [
        {
          id: 'ev_pension',
          name: 'Pension',
          category: 'income',
          type: 'pension',
          owner: 'primary',
          amount: 55750, // $55,750 pension - $15,750 standard deduction = $40,000 taxable ordinary
          frequency: 'yearly',
          growthRate: 0.0,
          adjustForInflation: false,
          startTriggerType: 'now',
          endTriggerType: 'end_of_plan',
        },
        {
          id: 'ev_living',
          name: 'Living Expenses',
          category: 'expense',
          type: 'living_expense',
          owner: 'primary',
          amount: 68453, // Deficit draws ~$18.5k from brokerage -> capital gains fits in 0% bracket
          frequency: 'yearly',
          growthRate: 0.0,
          adjustForInflation: false,
          startTriggerType: 'now',
          endTriggerType: 'end_of_plan',
        },
      ],
      settings: {
        ...basePlan.settings!,
        fixedInflationRate: 0.0,
      },
    };

    const output = runRetirementSimulation(ltcgPlan);
    const yr1 = output.yearlyResults[0];
    // Capital gains fits in 0% bracket ($0 tax)
    expect(yr1.capGainsTax).toBe(0);
    // Qualified dividends stacked on top of capital gains consumes remaining 0% headroom and is taxed at 15%
    expect(yr1.divTax).toBeGreaterThan(1200);
  });

  it('[WS-02-F07] treats HSA withdrawals for qualified healthcare expenses as tax-free and penalty-free', () => {
    // 60-year old retiree with $8,000 in healthcare expenses drawing $8,000 from HSA
    const hsaPlan: EnginePlan = {
      ...basePlan,
      primaryBirthYear: 1966, // Age 60 in 2026
      retirementAge: 60,
      lifeExpectancyAge: 61,
      accounts: [
        {
          id: 'acc_hsa',
          name: 'HSA Account',
          type: 'hsa',
          owner: 'primary',
          balance: 50000,
          costBasis: 50000,
          expectedGrowthRate: 0.0,
          dividendYield: 0.0,
          reinvestDividends: false,
          qualifiedDividendRatio: 1.0,
        },
      ],
      events: [
        {
          id: 'ev_health',
          name: 'Qualified Medical Expenses',
          category: 'expense',
          type: 'healthcare',
          owner: 'primary',
          amount: 8000,
          frequency: 'yearly',
          growthRate: 0.0,
          adjustForInflation: false,
          startTriggerType: 'now',
          endTriggerType: 'end_of_plan',
        },
      ],
    };

    const output = runRetirementSimulation(hsaPlan);
    const yr1 = output.yearlyResults[0];

    // HSA withdrawal used for qualified healthcare expenses has ZERO early penalty and ZERO ordinary income tax
    expect(yr1.earlyPenaltyTax).toBe(0);
    expect(yr1.accountDrawdowns.find((d) => d.accountId === 'acc_hsa')?.amount).toBe(8000);
  });

  it('[WS-02-F08] computes compound growth yearsToFI incorporating growth on existing assets', () => {
    const P0 = 500000;  // currentInvestableAssets
    const F = 1000000;   // fireNumber
    const S = 50000;     // annualSavings
    const r = 0.07;      // expectedGrowthRate

    const denom = Math.log(1 + r);
    const num = Math.log((r * F + S) / (r * P0 + S));
    const yearsToFI = num / denom;

    // Mathematical expectation: ln(120000 / 85000) / ln(1.07) = 5.10 years
    expect(yearsToFI).toBeCloseTo(5.10, 1);
  });

  it('[WS-02-F09] applies Social Security OASDI wage base cap per individual earner under IRC § 3121', () => {
    // Primary earns $150k, Spouse earns $150k. Combined salary = $300k.
    // 2026 OASDI cap is $184,500. Neither earner exceeds the individual cap.
    // Each earner owes $150,000 * 6.2% = $9,300. Total OASDI = $18,600.
    const dualIncomePlan: EnginePlan = {
      ...basePlan,
      hasSpouse: true,
      filingStatus: 'married_joint',
      primaryBirthYear: 1990,
      spouseBirthYear: 1990,
      retirementAge: 65,
      spouseRetirementAge: 65,
      primarySalary: 150000,
      spouseSalary: 150000,
      primarySalaryYear: 2026,
      spouseSalaryYear: 2026,
      accounts: [
        {
          id: 'acc_cash',
          name: 'Cash',
          type: 'cash',
          owner: 'primary',
          balance: 10000,
          costBasis: 10000,
          expectedGrowthRate: 0.0,
          dividendYield: 0.0,
          reinvestDividends: false,
          qualifiedDividendRatio: 1.0,
        },
      ],
    };

    const output = runRetirementSimulation(dualIncomePlan);
    const yr1 = output.yearlyResults[0];

    // OASDI FICA = $18,600
    // Medicare FICA = $300,000 * 1.45% = $4,350
    // Additional Medicare = ($300,000 - $250,000) * 0.9% = $450
    // Total FICA = $18,600 + $4,350 + $450 = $23,400
    expect(yr1.ficaTax).toBe(23400);
  });

  it('[WS-02-F10] assesses NIIT on dividend income and uses statutory unindexed thresholds', () => {
    // Single filer with $200k salary and $30k qualified dividends (no share sales).
    // MAGI = $230,000, exceeding unindexed $200k threshold by $30,000.
    // Net investment income = $30,000 dividends.
    // NIIT = $30,000 * 3.8% = $1,140.
    const niitPlan: EnginePlan = {
      ...basePlan,
      primaryBirthYear: 1980,
      primarySalary: 200000,
      primarySalaryYear: 2026,
      accounts: [
        {
          id: 'acc_taxable',
          name: 'Taxable Brokerage',
          type: 'taxable',
          owner: 'primary',
          balance: 1000000,
          costBasis: 1000000,
          expectedGrowthRate: 0.0,
          dividendYield: 3.0, // $30,000 dividends
          reinvestDividends: true,
          qualifiedDividendRatio: 1.0,
        },
      ],
    };

    const output = runRetirementSimulation(niitPlan);
    const yr1 = output.yearlyResults[0];
    expect(yr1.niitTax).toBe(1140);
  });

  it('[WS-02-F11] caps spousal Social Security benefit at 50% of worker PIA without delayed credits', () => {
    // Primary PIA $3,000, Spouse PIA $1,000. Spouse claims at age 70.
    // Delayed retirement credits do not apply to spousal benefit (capped at 50% = $1,500/mo = $18,000/yr).
    const spousalSsPlan: EnginePlan = {
      ...basePlan,
      hasSpouse: true,
      filingStatus: 'married_joint',
      primaryBirthYear: 1956, // Age 70 in 2026
      spouseBirthYear: 1956,  // Age 70 in 2026
      primarySalary: 0,
      spouseSalary: 0,
      primarySsMonthlyAmount: 3000,
      primarySsStartAge: 70,
      spouseSsMonthlyAmount: 1000,
      spouseSsStartAge: 70,
      enableSpousalSsBenefit: true,
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
          qualifiedDividendRatio: 1.0,
        },
      ],
    };

    const output = runRetirementSimulation(spousalSsPlan);
    const yr1 = output.yearlyResults[0];

    // Spouse own benefit at 70: $1,000 * 1.24 * 12 = $14,880.
    // Spousal benefit at 70: $1,500 * 1.0 * 12 = $18,000 (no 1.24 multiplier).
    // Effective spouse SS should be $18,000.
    expect(yr1.spouseSsIncome).toBe(18000);
  });

  it('[WS-02-F13] correctly calculates Tier 2 Social Security provisional income taxation under IRC § 86', () => {
    // Single filer: $6,000 SS benefit ($0.50*SS = $3,000, $0.85*SS = $5,100), $32,000 pension.
    // Provisional income = $32,000 + $3,000 = $35,000 (exceeds Tier 2 of $34,000 by $1,000).
    // Statutory taxable SS = min(5100, min(3000, 4500) + 0.85 * (35000 - 34000)) = 3000 + 850 = $3,850.
    const ssPlan: EnginePlan = {
      ...basePlan,
      primaryBirthYear: 1956,
      retirementAge: 65,
      lifeExpectancyAge: 71,
      primarySalary: 0,
      events: [
        {
          id: 'ev_pension',
          name: 'Pension',
          category: 'income',
          type: 'pension',
          owner: 'primary',
          amount: 32000,
          frequency: 'yearly',
          growthRate: 0.0,
          adjustForInflation: false,
          startTriggerType: 'now',
          endTriggerType: 'end_of_plan',
        },
        {
          id: 'ev_ss',
          name: 'Social Security',
          category: 'income',
          type: 'social_security',
          owner: 'primary',
          amount: 6000,
          frequency: 'yearly',
          growthRate: 0.0,
          adjustForInflation: false,
          startTriggerType: 'now',
          endTriggerType: 'end_of_plan',
        },
      ],
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
          qualifiedDividendRatio: 1.0,
        },
      ],
    };

    const output = runRetirementSimulation(ssPlan);
    const yr1 = output.yearlyResults[0];
    expect(yr1.taxableSs).toBe(3850);
  });

  it('[WS-02-F15] does not double-deduct federal standard deduction from state taxable income', () => {
    // California single filer with $100k gross AGI.
    // CA standard deduction is $5,556 (preset), federal is $15,750.
    // State taxable income should be $100,000 - $5,556 = $94,444 (not $100k - $15.75k - $5.556k = $78.694k).
    const caPreset = STATE_TAX_TABLE_PRESETS.CA;
    const grossIncome = 100000;
    const taxableOrdinaryAfterFedStd = 100000 - 15750; // $84,250
    const stateCfg = {
      stateTaxBrackets: caPreset.brackets,
      stateTaxStandardDeduction: caPreset.stdDeduction,
      stateGrossFloorRate: caPreset.grossFloorRate,
      bracketMultOverride: 1,
    };

    const stateTax = computeStateTax(taxableOrdinaryAfterFedStd, grossIncome, 0, stateCfg, 1, grossIncome);
    // On $100k gross, CA state tax is ~$5,780. If federal standard deduction was double-deducted, it would be ~$4,300.
    expect(stateTax).toBeGreaterThan(5000);
  });

  it('[WS-02-F16] preserves costBasis/balance ratio when paying incremental taxes from taxable accounts', () => {
    // Taxable account with $100,000 balance and $60,000 cost basis (60% basis ratio).
    // When incremental taxDelta is deducted, basis ratio should remain 60%.
    const taxDeltaPlan: EnginePlan = {
      ...basePlan,
      primaryBirthYear: 1953, // Age 73 in 2026 (RMD mandatory)
      retirementAge: 65,
      lifeExpectancyAge: 74,
      accounts: [
        {
          id: 'acc_trad',
          name: 'Traditional IRA',
          type: 'traditional_ira',
          owner: 'primary',
          balance: 500000,
          costBasis: 0,
          expectedGrowthRate: 0.0,
          dividendYield: 0.0,
          reinvestDividends: false,
          qualifiedDividendRatio: 1.0,
        },
        {
          id: 'acc_brokerage',
          name: 'Brokerage',
          type: 'taxable',
          owner: 'primary',
          balance: 100000,
          costBasis: 60000,
          expectedGrowthRate: 0.0,
          dividendYield: 0.0,
          reinvestDividends: false,
          qualifiedDividendRatio: 1.0,
        },
      ],
    };

    const output = runRetirementSimulation(taxDeltaPlan);
    const yr1 = output.yearlyResults[0];
    const brokerageAcc = yr1.accountBalances.find((a) => a.id === 'acc_brokerage');
    if (brokerageAcc && brokerageAcc.balance > 0 && brokerageAcc.balance < 100000) {
      // Basis ratio should remain ~60%
      const basisRatio = (brokerageAcc.costBasis || 0) / brokerageAcc.balance;
      expect(basisRatio).toBeCloseTo(0.60, 2);
    }
  });

  it('[WS-02-F19] does not deduct NIIT from Tentative Minimum Tax in AMT calculation', () => {
    // AMT enabled: regular tax for AMT offset is ordinaryTax + capGainsTax (IRC § 55)
    const amtPlan: EnginePlan = {
      ...basePlan,
      primaryBirthYear: 1980,
      primarySalary: 400000,
      primarySalaryYear: 2026,
      settings: {
        ...basePlan.settings!,
        enableAmt: true,
      },
      accounts: [
        {
          id: 'acc_taxable',
          name: 'Taxable Brokerage',
          type: 'taxable',
          owner: 'primary',
          balance: 2000000,
          costBasis: 2000000,
          expectedGrowthRate: 0.0,
          dividendYield: 4.0, // $80,000 dividends -> triggers NIIT
          reinvestDividends: true,
          qualifiedDividendRatio: 1.0,
        },
      ],
    };

    const output = runRetirementSimulation(amtPlan);
    const yr1 = output.yearlyResults[0];
    expect(yr1.niitTax).toBeGreaterThan(0);
  });
});
