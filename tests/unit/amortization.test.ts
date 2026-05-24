import { describe, it, expect } from 'vitest';
import { calculateAmortizationSchedule, calculateAmortizationWithExtraPayments } from '@/lib/utils/amortization';

describe('amortization utility calculations', () => {
  const params = {
    originalBalance: 300000,
    annualRate: 6.0,
    termMonths: 360,
    monthlyPayment: 1798.65, // Standard P&I payment
    startDate: '2025-01-01',
  };

  it('calculates standard amortization schedule correctly', () => {
    const schedule = calculateAmortizationSchedule(params);

    expect(schedule).toHaveLength(360);
    
    // First month payment should have principal and interest
    expect(schedule[0].month).toBe(1);
    expect(schedule[0].date).toBe('2025-01-01');
    expect(schedule[0].payment).toBe(1798.65);
    expect(schedule[0].interest).toBe(1500.00); // 300,000 * 0.06 / 12 = 1500
    expect(schedule[0].principal).toBeCloseTo(298.65, 2);
    expect(schedule[0].remainingBalance).toBeCloseTo(299701.35, 2);

    // Remaining balance at month 360 should be close to 0 (rounding error of $1.58 is normal)
    expect(schedule[359].remainingBalance).toBeLessThan(2.0);
    expect(schedule[359].payment).toBeGreaterThan(0);
  });

  it('calculates accelerated schedule with monthly extra payment', () => {
    const result = calculateAmortizationWithExtraPayments(params, {
      monthlyExtra: 200, // $200 extra every month
    });

    // Interest saved should be > 0 and months saved should be > 0
    expect(result.acceleratedSummary.interestSaved).toBeGreaterThan(0);
    expect(result.acceleratedSummary.monthsSaved).toBeGreaterThan(0);
    expect(result.acceleratedSummary.totalPayments).toBeLessThan(360);
    
    // Standard payoff date should be Dec 2054 (360 months from Jan 2025)
    expect(result.standardSummary.payoffDate).toBe('2054-12-01');
    
    // Accelerated payoff date should be earlier than Dec 2054
    expect(result.acceleratedSummary.payoffDate.localeCompare('2054-12-01')).toBeLessThan(0);
    
    // Total payments under standard should be 360, and accelerated should be less
    expect(result.standardSummary.totalPayments).toBe(360);
    expect(result.acceleratedSummary.totalPayments).toBe(360 - result.acceleratedSummary.monthsSaved);
  });

  it('applies lump sum payment exactly once (one-time)', () => {
    const result = calculateAmortizationWithExtraPayments(params, {
      lumpSumAmount: 10000,
      lumpSumDate: '2025-06-01', // Month 6
    });

    // Total payments should be less than 360
    expect(result.acceleratedSummary.monthsSaved).toBeGreaterThan(0);

    // Get month 6 snapshot (June 2025) in both standard and accelerated
    const stdMonth6 = result.standard.find(r => r.date === '2025-06-01');
    const accMonth6 = result.accelerated.find(r => r.date === '2025-06-01');

    expect(stdMonth6).toBeDefined();
    expect(accMonth6).toBeDefined();

    if (stdMonth6 && accMonth6) {
      // Balance difference in month 6 should reflect standard principal paydown + extra $10,000 lump sum + extra interest savings
      const balanceDiff = stdMonth6.remainingBalance - accMonth6.remainingBalance;
      expect(balanceDiff).toBeGreaterThanOrEqual(10000);
      expect(balanceDiff).toBeLessThan(11000); // Should be very close to 10k, not 60k (which recurring would cause)
    }

    // Get month 7 snapshot (July 2025) to verify it didn't subtract another $10,000
    const stdMonth7 = result.standard.find(r => r.date === '2025-07-01');
    const accMonth7 = result.accelerated.find(r => r.date === '2025-07-01');

    if (stdMonth6 && accMonth6 && stdMonth7 && accMonth7) {
      const month6Diff = stdMonth6.remainingBalance - accMonth6.remainingBalance;
      const month7Diff = stdMonth7.remainingBalance - accMonth7.remainingBalance;
      
      // The difference between standard and accelerated should grow slightly due to interest savings, but not by $10,000!
      expect(month7Diff - month6Diff).toBeLessThan(100); // interest savings growth is very small month-to-month
    }
  });
});
