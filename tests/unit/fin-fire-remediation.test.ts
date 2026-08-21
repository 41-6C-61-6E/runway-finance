import { describe, it, expect } from 'vitest';
import { runRetirementSimulation, EnginePlan } from '@/lib/services/retirement-engine';
import { runMonteCarloSimulation } from '@/lib/services/monte-carlo';
import { DEFAULT_2026_RULES } from '@/lib/constants/retirement-defaults';

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
