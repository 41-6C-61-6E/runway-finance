import { describe, it, expect } from 'vitest';
import { runRetirementSimulation, EnginePlan, EngineAccount } from '@/lib/services/retirement-engine';
import { calculateAmortizationSchedule } from '@/lib/utils/amortization';
import { getSystemTaxRules, updateSystemTaxRules } from '@/lib/services/system-tax-rules-service';
import { DEFAULT_2026_RULES } from '@/lib/constants/retirement-defaults';
import { convertCurrency, EXCHANGE_RATES } from '@/lib/constants/currency-rates';
import { aggregateChartData, calculateChartBounds } from '@/lib/utils/chart-aggregation';
import { calculateSocialSecurityPIA } from '@/lib/utils/social-security';

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

      // Total 401k contribution in year 1 across both accounts should equal exactly $23,000 (not $46,000)
      const total401kIncrease = (acc1.balance - 50000) + (acc2.balance - 20000);
      // factoring in growth (6% + 1.5% = 7.5%), the savings added before growth was $23,000
      expect(total401kIncrease).toBeLessThan(30000);
      expect(year1.surplusSaved).toBeCloseTo(23000, -2);
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
});
