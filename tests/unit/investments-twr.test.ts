import { describe, it, expect } from 'vitest';
import {
  filterAndClassifyCashFlow,
  computeTwrDailyPoints,
} from '@/lib/finance/investments-twr';

describe('Investments Time-Weighted Return (TWR) Logic', () => {
  it('calculates 0% TWR for flat balance with no cash flows', () => {
    const snaps = [
      { date: '2026-01-01', value: 10000 },
      { date: '2026-01-02', value: 10000 },
      { date: '2026-01-03', value: 10000 },
    ];
    const points = computeTwrDailyPoints(snaps, new Map());
    expect(points[points.length - 1].twr).toBe(0);
  });

  it('isolates organic investment return when a large deposit occurs', () => {
    // Day 0: $10,000
    // Day 1: Market goes up 10% -> $11,000, plus user deposits $5,000 -> balance becomes $16,000
    // Simple % return would say ($16,000 - $10,000) / $10,000 = 60%
    // True TWR should only reflect the 10% market gain: ($16,000 - $5,000) / $10,000 - 1 = 10%
    const snaps = [
      { date: '2026-01-01', value: 10000 },
      { date: '2026-01-02', value: 16000 },
    ];
    const flows = new Map<string, number>([['2026-01-02', 5000]]);
    const points = computeTwrDailyPoints(snaps, flows);
    expect(points[1].twr).toBe(10);
  });

  it('isolates organic investment return when a withdrawal occurs', () => {
    // Day 0: $10,000
    // Day 1: Market drops 5% -> $9,500, and user withdraws $2,000 -> balance becomes $7,500
    // Simple % return would say -25%
    // True TWR should only reflect the -5% market return: ($7,500 - (-$2,000)) / $10,000 - 1 = -5%
    const snaps = [
      { date: '2026-01-01', value: 10000 },
      { date: '2026-01-02', value: 7500 },
    ];
    const flows = new Map<string, number>([['2026-01-02', -2000]]);
    const points = computeTwrDailyPoints(snaps, flows);
    expect(points[1].twr).toBe(-5);
  });

  it('compounds multi-period TWR accurately across multiple cash flow events', () => {
    // Period 1: $10,000 -> +10% -> $11,000 (+ $1,000 deposit) => $12,000
    // Period 2: $12,000 -> -10% -> $10,800 (no deposit) => $10,800
    // Compound return = (1 + 0.10) * (1 - 0.10) - 1 = 0.99 - 1 = -1%
    const snaps = [
      { date: '2026-01-01', value: 10000 },
      { date: '2026-01-02', value: 12000 },
      { date: '2026-01-03', value: 10800 },
    ];
    const flows = new Map<string, number>([['2026-01-02', 1000]]);
    const points = computeTwrDailyPoints(snaps, flows);
    expect(points[2].twr).toBe(-1);
  });

  describe('WS-03-F01: Transaction cash flow filtering and classification', () => {
    it('classifies external contributions as positive cash flow', () => {
      expect(
        filterAndClassifyCashFlow({
          description: 'ACH Deposit - Contribution',
          payee: 'Schwab',
          amount: 5000,
        })
      ).toBe(5000);
      expect(
        filterAndClassifyCashFlow({
          description: 'Direct Deposit',
          amount: 2500,
        })
      ).toBe(2500);
    });

    it('classifies external withdrawals as negative cash flow', () => {
      expect(
        filterAndClassifyCashFlow({
          description: 'ACH Withdrawal',
          payee: 'Schwab',
          amount: -2000,
        })
      ).toBe(-2000);
    });

    it('filters out internal buys, sells, transfers, and reinvestments (returns null)', () => {
      // Buy stock (-$5000) does not inject external capital
      expect(
        filterAndClassifyCashFlow({
          description: 'Market Buy 10 VOO',
          payee: 'Vanguard',
          amount: -5000,
        })
      ).toBeNull();

      // Sell stock (+$5000) does not remove external capital
      expect(
        filterAndClassifyCashFlow({
          description: 'Limit Sell Order 5 AAPL',
          payee: 'Fidelity',
          amount: 5000,
        })
      ).toBeNull();

      // DRIP reinvestment is internal rotation
      expect(
        filterAndClassifyCashFlow({
          description: 'AUTOMATIC REINVESTMENT — BOUGHT 0.4 SH VOO',
          payee: 'Vanguard',
          amount: -32,
        })
      ).toBeNull();

      // Internal transfer
      expect(
        filterAndClassifyCashFlow({
          description: 'Transfer Between Accounts',
          categoryName: 'Transfer',
          amount: -1000,
        })
      ).toBeNull();
    });

    it('filters out dividends from cash flows so organic income is preserved in TWR', () => {
      expect(
        filterAndClassifyCashFlow({
          description: 'QUALIFIED DIVIDEND - AAPL',
          payee: 'Apple Inc.',
          amount: 150,
        })
      ).toBeNull();
      expect(
        filterAndClassifyCashFlow({
          description: 'Interest Payment',
          payee: 'Money Market',
          amount: 25,
        })
      ).toBeNull();
    });

    it('filters out synthetic equity adjustments and balance adjustments', () => {
      expect(
        filterAndClassifyCashFlow({
          externalId: 'equity-sync-acc123',
          description: 'Vested equity intrinsic value',
          amount: 100000,
        })
      ).toBeNull();
      expect(
        filterAndClassifyCashFlow({
          externalId: 'adj-manual-balance',
          description: 'Manual adjustment',
          amount: 500,
        })
      ).toBeNull();
      expect(
        filterAndClassifyCashFlow({
          categoryName: 'Balance Adjustments',
          amount: 1000,
        })
      ).toBeNull();
    });
  });

  describe('WS-03-F12: TWR Portfolio Liquidation Zero-Factor Recovery', () => {
    it('recovers accurately when a portfolio touches $0 and restarts with new deposits and gains', () => {
      // Period 0: $10,000
      // Period 1: Market drops to $0 (100% loss) -> TWR = -100%
      // Period 2: User deposits $5,000 -> Value = $5,000 (0% return in period)
      // Period 3: Portfolio doubles from $5,000 to $10,000 (+100% organic return)
      const snaps = [
        { date: '2026-01-01', value: 10000 },
        { date: '2026-01-02', value: 0 },
        { date: '2026-01-03', value: 5000 },
        { date: '2026-01-04', value: 10000 },
      ];
      const flows = new Map<string, number>([
        ['2026-01-03', 5000],
      ]);
      const points = computeTwrDailyPoints(snaps, flows);

      expect(points[1].twr).toBe(-100);
      // Day 3: re-funded with $5k -> factor resets to 1.0 (0% return from deposit)
      expect(points[2].twr).toBe(0);
      // Day 4: value doubled without cash flow -> +100% return
      expect(points[3].twr).toBe(100);
    });
  });
});
