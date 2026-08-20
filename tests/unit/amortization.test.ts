import { describe, it, expect } from 'vitest';
import { calculateAmortizationSchedule, calculateAmortizationWithExtraPayments, getAmortizationPaymentDate } from '@/lib/utils/amortization';

describe('amortization utility calculations', () => {
  const params = {
    originalBalance: 300000,
    annualRate: 6.0,
    termMonths: 360,
    monthlyPayment: 1798.65, // Standard P&I payment
    startDate: '2025-01-01',
  };

  it('calculates standard amortization schedule correctly with terminal balance zeroing', () => {
    const schedule = calculateAmortizationSchedule(params);

    expect(schedule).toHaveLength(360);
    
    // First month payment should have principal and interest
    expect(schedule[0].month).toBe(1);
    expect(schedule[0].date).toBe('2025-01-01');
    expect(schedule[0].payment).toBe(1798.65);
    expect(schedule[0].interest).toBe(1500.00); // 300,000 * 0.06 / 12 = 1500
    expect(schedule[0].principal).toBeCloseTo(298.65, 2);
    expect(schedule[0].remainingBalance).toBeCloseTo(299701.35, 2);

    // Terminal balance at month 360 should be exactly $0.00 (adjusted for rounding drift)
    expect(schedule[359].remainingBalance).toBe(0);
    expect(schedule[359].payment).toBeGreaterThan(0);
  });

  it('generates consistent monthly dates without skipping February when started on Jan 31', () => {
    const schedule = calculateAmortizationSchedule({
      originalBalance: 300000,
      annualRate: 6.0,
      termMonths: 12,
      monthlyPayment: 2500,
      startDate: '2025-01-31',
    });

    expect(schedule[0].date).toBe('2025-01-31');
    expect(schedule[1].date).toBe('2025-02-28'); // Correctly clamps to Feb 28, does not overflow to Mar 3
    expect(schedule[2].date).toBe('2025-03-31');
    expect(schedule[3].date).toBe('2025-04-30'); // Clamps to Apr 30, does not overflow to May 1
    expect(schedule[4].date).toBe('2025-05-31');
    expect(schedule[5].date).toBe('2025-06-30');
    expect(schedule[6].date).toBe('2025-07-31');
    expect(schedule[7].date).toBe('2025-08-31');
    expect(schedule[8].date).toBe('2025-09-30');
    expect(schedule[9].date).toBe('2025-10-31');
    expect(schedule[10].date).toBe('2025-11-30');
    expect(schedule[11].date).toBe('2025-12-31');
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
    expect(result.acceleratedSummary.payoffDate!.localeCompare('2054-12-01')).toBeLessThan(0);
    
    // Total payments under standard should be 360, and accelerated should be less
    expect(result.standardSummary.totalPayments).toBe(360);
    expect(result.acceleratedSummary.totalPayments).toBe(360 - result.acceleratedSummary.monthsSaved);
  });

  it('applies lump sum payment exactly once and defaults to start date if undated', () => {
    const resultWithDate = calculateAmortizationWithExtraPayments(params, {
      lumpSumAmount: 10000,
      lumpSumDate: '2025-06-01', // Month 6
    });

    expect(resultWithDate.acceleratedSummary.monthsSaved).toBeGreaterThan(0);

    const stdMonth6 = resultWithDate.standard.find(r => r.date === '2025-06-01');
    const accMonth6 = resultWithDate.accelerated.find(r => r.date === '2025-06-01');

    expect(stdMonth6).toBeDefined();
    expect(accMonth6).toBeDefined();

    if (stdMonth6 && accMonth6) {
      const balanceDiff = stdMonth6.remainingBalance - accMonth6.remainingBalance;
      expect(balanceDiff).toBeGreaterThanOrEqual(10000);
      expect(balanceDiff).toBeLessThan(11000);
    }

    // Verify undated lump sum is also applied (defaults to month 1)
    const resultUndated = calculateAmortizationWithExtraPayments(params, {
      lumpSumAmount: 10000,
      lumpSumDate: undefined,
    });

    expect(resultUndated.acceleratedSummary.monthsSaved).toBeGreaterThan(0);
    expect(resultUndated.acceleratedSummary.interestSaved).toBeGreaterThan(0);
  });

  it('correctly models statutory PMI cancellation (78% LTV) and PMI savings under HPA 1998', () => {
    const paramsWithPmi = {
      ...params,
      originalBalance: 285000, // 95% LTV on a $300k home
      originalPropertyPrice: 300000,
      monthlyPmi: 150,
      monthlyPayment: 1708.72,
    };

    const result = calculateAmortizationWithExtraPayments(paramsWithPmi, {
      monthlyExtra: 300,
    });

    // 78% LTV threshold is $234,000
    expect(result.standardSummary.totalPmiPaid).toBeGreaterThan(0);
    expect(result.acceleratedSummary.totalPmiPaid).toBeGreaterThan(0);
    expect(result.acceleratedSummary.pmiSaved).toBeGreaterThan(0);
    expect(result.standardSummary.pmiRemovalDate80).toBeDefined();
    expect(result.standardSummary.pmiRemovalDate78).toBeDefined();
    expect(result.acceleratedSummary.pmiRemovalDate78!.localeCompare(result.standardSummary.pmiRemovalDate78!)).toBeLessThan(0);
  });

  it('does not declare loan paid off when experiencing negative amortization ($M < I)', () => {
    const negAmortResult = calculateAmortizationWithExtraPayments(
      {
        originalBalance: 300000,
        annualRate: 12.0, // $3,000/mo monthly interest
        termMonths: 360,
        monthlyPayment: 1000, // Underpaying interest
        startDate: '2025-01-01',
      },
      {}
    );

    expect(negAmortResult.standard[359].remainingBalance).toBeGreaterThan(300000);
    expect(negAmortResult.standardSummary.payoffDate).toBeNull();
    expect(negAmortResult.standardSummary.isNegativeAmortization).toBe(true);
    expect(negAmortResult.acceleratedSummary.payoffDate).toBeNull();
  });

  it('amortizes 0% annual interest rate as straight line without NaN', () => {
    const zeroRateSchedule = calculateAmortizationSchedule({
      originalBalance: 120000,
      annualRate: 0,
      termMonths: 240,
      monthlyPayment: 500,
      startDate: '2025-01-01',
    });

    expect(zeroRateSchedule).toHaveLength(240);
    expect(zeroRateSchedule[0].interest).toBe(0);
    expect(zeroRateSchedule[0].principal).toBe(500);
    expect(zeroRateSchedule[239].remainingBalance).toBe(0);
    expect(zeroRateSchedule.every((p) => Number.isFinite(p.remainingBalance))).toBe(true);
  });

  it('handles negative annual interest rate without producing NaN', () => {
    const negRateSchedule = calculateAmortizationSchedule({
      originalBalance: 100000,
      annualRate: -2,
      termMonths: 360,
      monthlyPayment: 300,
      startDate: '2025-01-01',
    });

    expect(negRateSchedule.length).toBeGreaterThan(0);
    expect(negRateSchedule.every((p) => Number.isFinite(p.remainingBalance))).toBe(true);
    expect(negRateSchedule.at(-1)!.remainingBalance).toBeLessThan(100000);
  });
});
