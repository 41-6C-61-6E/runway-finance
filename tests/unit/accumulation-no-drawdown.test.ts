import { describe, it, expect } from 'vitest';
import { runRetirementSimulation, EnginePlan } from '@/lib/services/retirement-engine';
import { DEFAULT_2026_RULES } from '@/lib/constants/retirement-defaults';

describe('Retirement Engine Accumulation Phase Drawdown Rules', () => {
  it('never draws down from portfolio accounts during accumulation even if expenses exceed net salary', () => {
    const plan: EnginePlan = {
      id: 'accumulation_test_plan',
      name: 'Accumulation Drawdown Test Plan',
      hasSpouse: false,
      primaryBirthYear: 1985, // Age 41 in 2026
      primaryBirthMonth: 1,
      filingStatus: 'single',
      retirementAge: 58, // Retirement at age 58 (17 working years)
      lifeExpectancyAge: 90,
      withdrawalMethod: 'textbook',
      primarySalary: 95000,
      primarySalaryYear: 2026,
      primarySalaryRaisePct: 0, // Flat salary to simulate inflation overtaking salary
      settings: {
        fixedInflationRate: 3.0, // 3% inflation compounding on expenses
        withholdingDeferred: 20,
        withholdingTaxable: 10,
        incomeTaxModifier: 0,
        capGainsTaxModifier: 0,
        heirFlatIncomeTaxRate: 25,
        stepUpBasis: true,
        realEstateLiquidationRate: 6,
        administrativeCostRate: 1,
        charitableGiving: 0,
        withdrawalMethod: 'textbook',
        enableRothConversions: false,
        allowPenaltyWithdrawals: true,
      },
      accounts: [
        {
          id: 'acc_taxable',
          name: 'Taxable Brokerage',
          type: 'taxable',
          owner: 'primary',
          balance: 200000,
          costBasis: 150000,
          expectedGrowthRate: 7.0,
          dividendYield: 2.0,
          reinvestDividends: true,
          qualifiedDividendRatio: 1.0,
        },
        {
          id: 'acc_trad_401k',
          name: 'Traditional 401(k)',
          type: 'traditional_401k',
          owner: 'primary',
          balance: 300000,
          costBasis: 0,
          expectedGrowthRate: 7.0,
          dividendYield: 0,
          reinvestDividends: true,
          qualifiedDividendRatio: 0,
        },
        {
          id: 'acc_roth_ira',
          name: 'Roth IRA',
          type: 'roth_ira',
          owner: 'primary',
          balance: 100000,
          costBasis: 100000,
          expectedGrowthRate: 7.0,
          dividendYield: 0,
          reinvestDividends: true,
          qualifiedDividendRatio: 0,
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
          amount: 85000, // High living expense that exceeds net take-home salary after taxes
          frequency: 'yearly',
          growthRate: 0,
          adjustForInflation: true,
          startTriggerType: 'now',
          endTriggerType: 'end_of_plan',
        },
      ],
      flows: [],
      rules: DEFAULT_2026_RULES,
    };

    const output = runRetirementSimulation(plan);

    // Working years: ages 41 through 57
    const accumulationYears = output.yearlyResults.filter((y) => y.primaryAge < 58);
    expect(accumulationYears.length).toBe(17);

    for (const yr of accumulationYears) {
      // Must have zero portfolio drawdowns during accumulation
      expect(yr.deficitWithdrawn).toBe(0);
      expect(yr.discretionaryDeficitWithdrawn).toBe(0);
      expect(yr.accountDrawdowns.length).toBe(0);
      expect(yr.drawdownsByType.cash).toBe(0);
      expect(yr.drawdownsByType.taxable).toBe(0);
      expect(yr.drawdownsByType.traditional).toBe(0);
      expect(yr.drawdownsByType.roth).toBe(0);
      expect(yr.drawdownsByType.hsa).toBe(0);
      expect(yr.earlyPenaltyTax).toBe(0);
      expect(yr.earlyWithdrawalWarnings.length).toBe(0);

      // Balances must strictly grow with compound returns (not decrease from drawdowns)
      const taxableAcc = yr.accountBalances.find((a) => a.id === 'acc_taxable');
      expect(taxableAcc?.balance).toBeGreaterThan(200000);
    }

    // Retirement years: age 58+
    const retirementYears = output.yearlyResults.filter((y) => y.primaryAge >= 58);
    expect(retirementYears.length).toBeGreaterThan(0);

    const firstRetirementYear = retirementYears[0];
    expect(firstRetirementYear.primaryAge).toBe(58);
    // In retirement, portfolio drawdowns should execute to fund expenses
    expect(firstRetirementYear.deficitWithdrawn).toBeGreaterThan(0);
    expect(firstRetirementYear.accountDrawdowns.length).toBeGreaterThan(0);
    expect(firstRetirementYear.drawdownsByType.taxable).toBeGreaterThan(0);
  });
});
