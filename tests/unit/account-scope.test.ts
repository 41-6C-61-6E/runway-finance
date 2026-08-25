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
