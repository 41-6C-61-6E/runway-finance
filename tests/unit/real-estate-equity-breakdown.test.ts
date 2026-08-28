import { describe, it, expect } from 'vitest';
import { computeEquityBreakdown } from '@/lib/services/real-estate-equity-breakdown';

describe('computeEquityBreakdown', () => {
  it('computes a simple no-refinance case', () => {
    const r = computeEquityBreakdown(500_000, 400_000, 400_000, [
      { id: 'm1', balance: -300_000, originalLoanAmount: 320_000 },
    ]);
    expect(r.downPayment).toBeCloseTo(80_000, 2);
    expect(r.principalPaid).toBeCloseTo(20_000, 2);
    expect(r.appreciation).toBeCloseTo(100_000, 2);
    expect(r.mortgageOwed).toBeCloseTo(300_000, 2);
    expect(r.totalEquity).toBeCloseTo(200_000, 2);
    expect(r.isWhollyOwned).toBe(false);
    expect(r.isUnderwater).toBe(false);
  });

  it('attributing refinance: down payment uses original loan, principal includes payoff balance (Carnation scenario)', () => {
    const r = computeEquityBreakdown(1_218_000, 924_500, 924_500, [
      {
        id: 'becu',
        name: 'BECU Mortgage',
        balance: -629_883.02,
        originalLoanAmount: 660_000,
        metadata: { originalLoanAmount: 660_000, mortgageStatus: 'active', purchaseDate: '2025-10-07' },
      },
      {
        id: 'nationstar',
        name: 'Nationstar Mortgage',
        balance: 0,
        originalLoanAmount: 726_200,
        metadata: {
          originalLoanAmount: 726_200,
          mortgageStatus: 'refinanced',
          purchaseDate: '2023-06-20',
          refinanceDate: '2025-10-07',
          payoffBalance: 665_697.28,
          refinancedByLoanId: 'becu',
        },
      },
    ]);
    // Cash down at purchase = 924,500 - 726,200
    expect(r.downPayment).toBeCloseTo(198_300, 2);
    // (726,200 - 665,697.28) paid on original loan + (660,000 - 629,883.02) on refi
    expect(r.principalPaid).toBeCloseTo(60_502.72 + 30_116.98, 2);
    expect(r.appreciation).toBeCloseTo(293_500, 2);
    expect(r.mortgageOwed).toBeCloseTo(629_883.02, 2);
    expect(r.totalEquity).toBeCloseTo(588_116.98, 2);
    expect(r.effectivePurchasePrice).toBeCloseTo(924_500, 2);
  });

  it('resolves original financing via refinancedByLoanId when the refi loan has an earlier/missing date', () => {
    const r = computeEquityBreakdown(600_000, 500_000, undefined, [
      {
        id: 'refi',
        balance: -350_000,
        originalLoanAmount: 380_000,
        metadata: { mortgageStatus: 'active' },
      },
      {
        id: 'orig',
        balance: 0,
        originalLoanAmount: 450_000,
        metadata: {
          mortgageStatus: 'refinanced',
          purchaseDate: '2022-01-01',
          payoffBalance: 400_000,
          refinancedByLoanId: 'refi',
        },
      },
    ]);
    expect(r.downPayment).toBeCloseTo(50_000, 2);
    expect(r.principalPaid).toBeCloseTo(50_000 + 30_000, 2);
    expect(r.mortgageOwed).toBeCloseTo(350_000, 2);
  });

  it('counts a paid-off loan as full principal paydown via payoffBalance', () => {
    const r = computeEquityBreakdown(700_000, 600_000, 600_000, [
      {
        id: 'closed',
        balance: 0,
        originalLoanAmount: 480_000,
        metadata: { mortgageStatus: 'paid_off', payoffBalance: 480_000 },
      },
    ]);
    expect(r.principalPaid).toBeCloseTo(480_000, 2);
    expect(r.downPayment).toBeCloseTo(120_000, 2);
    expect(r.mortgageOwed).toBeCloseTo(0, 2);
    expect(r.isWhollyOwned).toBe(true);
    // wholly owned: appreciation fills the rest, equity = value
    expect(r.totalEquity).toBeCloseTo(700_000, 2);
  });

  it('handles a paid-off loan with no explicit payoffBalance (fall back to its original amount)', () => {
    const r = computeEquityBreakdown(700_000, 600_000, 600_000, [
      { id: 'closed', balance: 0, originalLoanAmount: 480_000, metadata: { mortgageStatus: 'paid_off' } },
    ]);
    expect(r.principalPaid).toBeCloseTo(480_000, 2);
  });

  it('falls back to active loans for original financing when there is no closed loan data', () => {
    // Pre-fix behavior preserved for plain active-loan properties
    const r = computeEquityBreakdown(500_000, 425_000, 425_000, [
      { id: 'm1', balance: -300_000, originalLoanAmount: 340_000 },
    ]);
    expect(r.downPayment).toBeCloseTo(85_000, 2);
    expect(r.principalPaid).toBeCloseTo(40_000, 2);
  });

  it('scales components down proportionally for underwater properties', () => {
    const r = computeEquityBreakdown(300_000, 400_000, 400_000, [
      { id: 'm1', balance: -250_000, originalLoanAmount: 320_000 },
    ]);
    expect(r.appreciation).toBe(0);
    expect(r.isUnderwater).toBe(true);
    // initial equity = 80,000 down + 70,000 paid = 150,000; actual = 50,000 → ratio 1/3
    expect(r.downPayment).toBeCloseTo(80_000 / 3, 2);
    expect(r.principalPaid).toBeCloseTo(70_000 / 3, 2);
  });

  it('treats missing purchasePrice with initialValue, then 80% LTV of the original loan', () => {
    const r1 = computeEquityBreakdown(500_000, undefined, 450_000, [
      { id: 'm1', balance: -300_000, originalLoanAmount: 360_000, metadata: { purchaseDate: '2020-01-01' } },
    ]);
    expect(r1.downPayment).toBeCloseTo(90_000, 2);
    expect(r1.appreciation).toBeCloseTo(50_000, 2);

    const r2 = computeEquityBreakdown(500_000, undefined, undefined, [
      { id: 'm1', balance: -350_000, originalLoanAmount: 400_000, metadata: { purchaseDate: '2020-01-01' } },
    ]);
    // pp = 400,000 / 0.8 = 500,000
    expect(r2.downPayment).toBeCloseTo(100_000, 2);
    expect(r2.appreciation).toBeCloseTo(0, 2);
    expect(r2.effectivePurchasePrice).toBeCloseTo(500_000, 2);
  });

  it('returns zeros for zero property value', () => {
    const r = computeEquityBreakdown(0, 400_000, 400_000, [
      { id: 'm1', balance: -300_000, originalLoanAmount: 320_000 },
    ]);
    expect(r.totalValue).toBe(0);
    expect(r.downPayment).toBe(0);
    expect(r.principalPaid).toBe(0);
    expect(r.appreciation).toBe(0);
    expect(r.isWhollyOwned).toBe(true);
  });

  it('keeps segment percentages consistent (sum ~100%) when components overshoot value', () => {
    // Components sum above value (e.g. stale payoff data): scale to value
    const r = computeEquityBreakdown(400_000, 300_000, 300_000, [
      { id: 'm1', balance: -100_000, originalLoanAmount: 240_000 },
    ]);
    const sum = r.downPayment + r.principalPaid + r.appreciation + r.mortgageOwed;
    expect(sum).toBeCloseTo(400_000, 1);
  });

  it('handles multiple active loans (no closed loans)', () => {
    const r = computeEquityBreakdown(1_000_000, 900_000, 900_000, [
      { id: 'a', balance: -300_000, originalLoanAmount: 320_000, metadata: { purchaseDate: '2021-05-01' } },
      { id: 'b', balance: -100_000, originalLoanAmount: 120_000, metadata: { purchaseDate: '2021-05-01' } },
    ]);
    // no closed loans → original financing = sum of active originals
    expect(r.downPayment).toBeCloseTo(460_000, 2);
    expect(r.principalPaid).toBeCloseTo(40_000, 2);
    expect(r.mortgageOwed).toBeCloseTo(400_000, 2);
  });
});
