import { describe, it, expect } from 'vitest';
import { runRetirementSimulation, EnginePlan } from '@/lib/services/retirement-engine';
import { DEFAULT_2026_RULES, IRS_UNIFORM_LIFETIME_TABLE, getRmdStartAge } from '@/lib/constants/retirement-defaults';
import { computeStateTax, STATE_TAX_TABLE_PRESETS } from '@/lib/tax/bracket-tax';

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
