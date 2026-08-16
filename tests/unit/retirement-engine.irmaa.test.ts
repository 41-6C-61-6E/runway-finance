import { describe, it, expect } from 'vitest';
import { runRetirementSimulation, EnginePlan } from '@/lib/services/retirement-engine';
import { DEFAULT_2026_RULES } from '@/lib/constants/retirement-defaults';
import { buildEnginePlan } from '@/lib/utils/build-engine-plan';

describe('Retirement Engine IRMAA & Statutory Threshold Tests', () => {
  it('correctly uses 4 surcharge tiers with standard rate at $0 surcharge', () => {
    const thresholds = DEFAULT_2026_RULES.irmaaThresholds;
    expect(thresholds).toHaveLength(5); // Tier 0 (base) + 4 surcharge tiers
    expect(thresholds[0].partBMonthly).toBe(0);
    expect(thresholds[0].partDMonthly).toBe(0);
    expect(thresholds[1].magiSingle).toBe(103000);
    expect(thresholds[1].magiJoint).toBe(206000);
    expect(thresholds[1].partBMonthly).toBe(69.90);
    expect(thresholds[4].magiSingle).toBe(193000);
    expect(thresholds[4].magiJoint).toBe(386000);
  });

  it('queues IRMAA surcharges with 2-year lookback and does not overcharge base Medicare premiums', () => {
    const currentYear = new Date().getFullYear();
    const plan: EnginePlan = {
      id: 'irmaa_test',
      name: 'IRMAA Test Plan',
      hasSpouse: false,
      primaryBirthYear: currentYear - 63, // Age 63 in year 0
      filingStatus: 'single',
      retirementAge: 65,
      lifeExpectancyAge: 70,
      primarySalary: 150000,
      accounts: [
        {
          id: 'acc1',
          name: 'Taxable Account',
          type: 'taxable',
          owner: 'primary',
          balance: 1000000,
          expectedGrowthRate: 5.0,
          dividendYield: 0,
          reinvestDividends: true,
        },
      ],
      liabilities: [],
      events: [],
      flows: [],
      settings: {
        fixedInflationRate: 0,
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
        avoidIrmaaCliffs: false,
      },
      rules: DEFAULT_2026_RULES,
    };

    const res = runRetirementSimulation(plan);
    // At age 63 (year 0), primary salary was 150k (which breached Tier 2: $129k-$161k limit).
    // Age 65 (year 2) should have Tier 2 surcharge queued: (174.70 + 33.30) * 12 = $2,496.
    const year65 = res.yearlyResults.find((y) => y.primaryAge === 65);
    expect(year65).toBeDefined();
    if (year65) {
      expect(year65.irmaaSurchargeAnnual).toBeCloseTo((174.70 + 33.30) * 12, 0);
    }
  });

  it('preserves user-set 0.0% growth rate and does not reset to 6.0%', () => {
    const dbPlan = {
      id: 'p1',
      name: 'Cash Plan',
      primaryBirthYear: 1980,
      retirementAge: 65,
      accounts: [
        {
          id: 'cash_1',
          name: 'Cash Account',
          type: 'cash',
          balance: 50000,
          expectedGrowthRate: '0.0',
          dividendYield: '0.0',
          isIncluded: true,
        },
      ],
    };

    const enginePlan = buildEnginePlan(dbPlan);
    expect(enginePlan.accounts[0].expectedGrowthRate).toBe(0);
    expect(enginePlan.accounts[0].dividendYield).toBe(0);
  });
});
