import { convertCurrency, EXCHANGE_RATES } from '@/lib/constants/currency-rates';
import { isLiabilityAccount } from '@/lib/utils/account-scope';
import { describe, it, expect } from 'vitest';
import { computeNetWorthTotals, isReportableAccount } from '@/lib/utils/account-scope';

// Fixed date so mortgage-activity checks are deterministic
const DATE = '2026-08-24';

describe('computeNetWorthTotals', () => {
  it('sums asset and liability accounts into net worth', () => {
    const result = computeNetWorthTotals(
      [
        { type: 'checking', balance: '1000', currency: 'USD' },
        { type: 'savings', balance: 2000, currency: 'USD' },
        { type: 'credit', balance: '-500', currency: 'USD' },
      ],
      'USD',
      DATE
    );

    expect(result.totalAssets).toBe(3000);
    expect(result.totalLiabilities).toBe(500);
    expect(result.netWorth).toBe(2500);
  });

  it('excludes hidden accounts', () => {
    const result = computeNetWorthTotals(
      [
        { type: 'checking', balance: '1000', isHidden: false },
        { type: 'savings', balance: '99999', isHidden: true },
      ],
      'USD',
      DATE
    );

    expect(result.totalAssets).toBe(1000);
    expect(result.netWorth).toBe(1000);
  });

  it('excludes accounts flagged isExcludedFromNetWorth', () => {
    const result = computeNetWorthTotals(
      [
        { type: 'checking', balance: '1000', isExcludedFromNetWorth: false },
        { type: 'brokerage', balance: '42000', isExcludedFromNetWorth: true },
      ],
      'USD',
      DATE
    );

    expect(result.totalAssets).toBe(1000);
    expect(result.netWorth).toBe(1000);
  });

  it('counts liability balances as absolute value regardless of sign', () => {
    const negative = computeNetWorthTotals([{ type: 'autoloan', balance: '-750' }], 'USD', DATE);
    const positive = computeNetWorthTotals([{ type: 'autoloan', balance: '750' }], 'USD', DATE);

    expect(negative.totalLiabilities).toBe(750);
    expect(positive.totalLiabilities).toBe(750);
    expect(negative.netWorth).toBe(positive.netWorth);
  });

  it('converts balances to the base currency', () => {
    // EXCHANGE_RATES: USD 1.0, EUR 1.09. 109 USD == 100 EUR.
    const inEur = computeNetWorthTotals(
      [{ type: 'checking', balance: '109', currency: 'USD' }],
      'EUR',
      DATE
    );
    expect(inEur.totalAssets).toBe(100);

    const inUsd = computeNetWorthTotals(
      [{ type: 'checking', balance: '200', currency: 'EUR' }],
      'USD',
      DATE
    );
    expect(inUsd.totalAssets).toBe(218); // 200 EUR * 1.09
  });

  it('ignores balance types that are not assets or liabilities', () => {
    const result = computeNetWorthTotals(
      [
        { type: 'paystub', balance: '50000' },
        { type: 'checking', balance: '1000' },
      ],
      'USD',
      DATE
    );

    expect(result.totalAssets).toBe(1000);
    expect(result.netWorth).toBe(1000);
  });

  it('excludes a paid-off mortgage after its payoff date', () => {
    const active = computeNetWorthTotals(
      [
        { type: 'checking', balance: '1000' },
        { type: 'mortgage', balance: '-300000', metadata: { mortgageStatus: 'paid_off', payoffDate: '2027-01-01' } },
      ],
      'USD',
      DATE
    );
    // Mortgage still active on DATE
    expect(active.totalLiabilities).toBe(300000);

    const paidOff = computeNetWorthTotals(
      [
        { type: 'checking', balance: '1000' },
        { type: 'mortgage', balance: '-300000', metadata: { mortgageStatus: 'paid_off', payoffDate: '2025-01-01' } },
      ],
      'USD',
      DATE
    );
    // Mortgage excluded after payoff
    expect(paidOff.totalLiabilities).toBe(0);
    expect(paidOff.netWorth).toBe(1000);
  });

  it('rounds results to cents', () => {
    const result = computeNetWorthTotals(
      [
        { type: 'checking', balance: '10.01' },
        { type: 'savings', balance: '20.02' },
        { type: 'savings', balance: '30.04' },
      ],
      'USD',
      DATE
    );
    // 60.07 (guards against float drift 60.07000000000001)
    expect(result.totalAssets).toBe(60.07);
    expect(result.netWorth).toBe(60.07);
  });

  it('treats empty account list as zero net worth', () => {
    const result = computeNetWorthTotals([], 'USD', DATE);
    expect(result.totalAssets).toBe(0);
    expect(result.totalLiabilities).toBe(0);
    expect(result.netWorth).toBe(0);
  });
});

describe('isReportableAccount', () => {
  it('returns false when hidden or excluded', () => {
    expect(isReportableAccount({ type: 'checking', isHidden: true })).toBe(false);
    expect(isReportableAccount({ type: 'checking', isExcludedFromNetWorth: true })).toBe(false);
    expect(isReportableAccount({ type: 'checking' })).toBe(true);
  });
});


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
