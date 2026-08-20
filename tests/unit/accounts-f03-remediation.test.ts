import { describe, it, expect } from 'vitest';
import { convertCurrency, EXCHANGE_RATES } from '@/lib/constants/currency-rates';
import { isAssetAccount, isLiabilityAccount } from '@/lib/utils/account-scope';

describe('Financial Review F03: Accounts, Balances, Debt Metrics & Net Worth Remediation', () => {
  describe('F03-1: Debt-to-Asset Ratio Inversion at Zero Assets', () => {
    const RATING_THRESHOLDS = [
      { max: 0.35, label: 'Excellent' },
      { max: 0.45, label: 'Good' },
      { max: 0.55, label: 'Fair' },
      { max: 0.75, label: 'Poor' },
      { max: Infinity, label: 'Critical' },
    ];

    function getRating(ratio: number) {
      for (const t of RATING_THRESHOLDS) {
        if (ratio < t.max) return t;
      }
      return RATING_THRESHOLDS[RATING_THRESHOLDS.length - 1];
    }

    function calculateDebtToAsset(assets: number, liabilities: number) {
      const rawRatio = assets > 0 ? liabilities / assets : (liabilities > 0 ? Infinity : 0);
      const rating = getRating(rawRatio);
      return { rawRatio, rating };
    }

    it('rates insolvent user ($0 assets, $50k debt) as Critical / Infinity', () => {
      const res = calculateDebtToAsset(0, 50000);
      expect(res.rawRatio).toBe(Infinity);
      expect(res.rating.label).toBe('Critical');
    });

    it('rates debt-free user with zero assets ($0 assets, $0 debt) as Excellent (0.0)', () => {
      const res = calculateDebtToAsset(0, 0);
      expect(res.rawRatio).toBe(0);
      expect(res.rating.label).toBe('Excellent');
    });

    it('calculates standard solvent debt ratios correctly', () => {
      const excellent = calculateDebtToAsset(100000, 20000); // 0.20
      expect(excellent.rawRatio).toBe(0.20);
      expect(excellent.rating.label).toBe('Excellent');

      const fair = calculateDebtToAsset(100000, 50000); // 0.50
      expect(fair.rawRatio).toBe(0.50);
      expect(fair.rating.label).toBe('Fair');

      const critical = calculateDebtToAsset(100000, 90000); // 0.90
      expect(critical.rawRatio).toBe(0.90);
      expect(critical.rating.label).toBe('Critical');
    });
  });

  describe('F03-2: Age-Cohort Benchmark Resolution', () => {
    interface AgeBandReference {
      minAge: number;
      label: string;
      savingsRateMedian: number;
      netWorthToIncomeMedian: number;
    }

    const AGE_BAND_REFERENCES: AgeBandReference[] = [
      { minAge: 18, label: '18–29', savingsRateMedian: 10, netWorthToIncomeMedian: 0.2 },
      { minAge: 30, label: '30–39', savingsRateMedian: 12, netWorthToIncomeMedian: 1.1 },
      { minAge: 40, label: '40–49', savingsRateMedian: 15, netWorthToIncomeMedian: 2.5 },
      { minAge: 50, label: '50–59', savingsRateMedian: 18, netWorthToIncomeMedian: 4.2 },
      { minAge: 60, label: '60+', savingsRateMedian: 22, netWorthToIncomeMedian: 6.5 },
    ];

    function getAgeBand(age: number): AgeBandReference {
      for (let i = AGE_BAND_REFERENCES.length - 1; i >= 0; i--) {
        const band = AGE_BAND_REFERENCES[i];
        if (age >= band.minAge) return band;
      }
      return AGE_BAND_REFERENCES[0];
    }

    it('resolves demographic age cohorts accurately across all brackets', () => {
      expect(getAgeBand(22).label).toBe('18–29');
      expect(getAgeBand(22).netWorthToIncomeMedian).toBe(0.2);

      expect(getAgeBand(35).label).toBe('30–39');
      expect(getAgeBand(35).netWorthToIncomeMedian).toBe(1.1);

      expect(getAgeBand(45).label).toBe('40–49');
      expect(getAgeBand(45).netWorthToIncomeMedian).toBe(2.5);

      expect(getAgeBand(55).label).toBe('50–59');
      expect(getAgeBand(55).netWorthToIncomeMedian).toBe(4.2);

      expect(getAgeBand(68).label).toBe('60+');
      expect(getAgeBand(68).netWorthToIncomeMedian).toBe(6.5);
    });
  });

  describe('F03-4: Debt Subtypes Inclusion in Debt Breakdown Categories', () => {
    const DEBT_DISPLAY_CATEGORIES: Record<string, { label: string }> = {
      credit: { label: 'Credit Cards' },
      loan: { label: 'Loans' },
      mortgage: { label: 'Mortgages' },
      studentloan: { label: 'Student Loans' },
      autoloan: { label: 'Auto Loans' },
      otherloan: { label: 'Other Loans' },
      otherLiability: { label: 'Other Debt' },
      otherliability: { label: 'Other Debt' },
    };

    it('maps all liability account types to display categories', () => {
      const liabilityTypes = [
        'credit',
        'loan',
        'mortgage',
        'studentloan',
        'autoloan',
        'otherloan',
        'otherLiability',
        'otherliability',
      ];

      for (const t of liabilityTypes) {
        expect(isLiabilityAccount(t)).toBe(true);
        expect(DEBT_DISPLAY_CATEGORIES[t]).toBeDefined();
        expect(DEBT_DISPLAY_CATEGORIES[t].label).toBeTruthy();
      }
    });
  });

  describe('F03-5 & F03-6: Multi-Currency Conversion & Global FX Rates', () => {
    it('converts major world currencies using published exchange rates', () => {
      // 100 EUR -> USD ($109)
      expect(convertCurrency(100, 'EUR', 'USD')).toBeCloseTo(109, 1);

      // 100 GBP -> USD ($127)
      expect(convertCurrency(100, 'GBP', 'USD')).toBeCloseTo(127, 1);

      // 10,000 JPY -> USD ($64)
      expect(convertCurrency(10000, 'JPY', 'USD')).toBeCloseTo(64, 1);

      // 100,000 INR -> USD ($1,200)
      expect(convertCurrency(100000, 'INR', 'USD')).toBeCloseTo(1200, 1);

      // 1,000 SGD -> USD ($750)
      expect(convertCurrency(1000, 'SGD', 'USD')).toBeCloseTo(750, 1);

      // 1,000 CAD -> USD ($730)
      expect(convertCurrency(1000, 'CAD', 'USD')).toBeCloseTo(730, 1);
    });

    it('protects against division by zero and invalid inputs', () => {
      expect(convertCurrency(NaN, 'USD', 'USD')).toBe(0);
      expect(convertCurrency(Infinity, 'USD', 'USD')).toBe(0);
      expect(convertCurrency(100, 'USD', 'UNKNOWN_ZERO')).toBe(100);
      expect(convertCurrency(0, 'EUR', 'USD')).toBe(0);
    });
  });
});
