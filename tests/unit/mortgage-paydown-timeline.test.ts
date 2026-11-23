import { describe, it, expect } from 'vitest';
import {
  calculateAmortizationSchedule,
  calculateAmortizationWithExtraPayments,
} from '@/lib/utils/amortization';
import {
  buildMortgagePaydownTimeline,
  type LinkedMortgageInput,
  type MortgageSnapshotPoint,
} from '@/lib/utils/mortgage-paydown-timeline';

describe('buildMortgagePaydownTimeline', () => {
  it('normalizes dense weekly snapshots to monthly grid, anchors Today, and trims trailing zeros', () => {
    const mortgage: LinkedMortgageInput = {
      id: 'm1',
      name: 'Chase 30Y Fixed',
      balance: -452800,
      originalLoanAmount: 500000,
      interestRate: 3.125,
      monthlyPayment: 2141.6,
      termMonths: 360,
      metadata: {
        purchaseDate: '2021-10-15',
      },
    };

    const mortgageSnapshots: MortgageSnapshotPoint[] = [
      { accountId: 'm1', date: '2021-09-01', value: -502000 }, // before property purchaseDate
      { accountId: 'm1', date: '2021-10-15', value: -500000 },
      { accountId: 'm1', date: '2021-10-24', value: -499500 },
      { accountId: 'm1', date: '2021-10-31', value: -499000 }, // latest in 2021-10
      // 2021-11 omitted deliberately to verify gap-month carrying
      { accountId: 'm1', date: '2021-12-15', value: -497500 },
      { accountId: 'm1', date: '2026-10-08', value: -453500 },
    ];

    const { standard, accelerated } = calculateAmortizationWithExtraPayments(
      {
        originalBalance: 452800,
        annualRate: 3.125,
        termMonths: 310,
        monthlyPayment: 2141.6,
        startDate: '2026-12-01',
      },
      { monthlyExtra: 500 }
    );

    const result = buildMortgagePaydownTimeline({
      selectedMortgage: mortgage,
      allLinkedMortgages: [mortgage],
      mortgageSnapshots,
      propertyPurchaseDate: '2021-10-15',
      todayDate: '2026-11-23',
      showSynthetic: true,
      standardProjection: standard,
      acceleratedProjection: accelerated,
      showAccelerated: true,
    });

    // Should exclude pre-purchase snapshot
    expect(result.points.some((p) => p.date.startsWith('2021-09'))).toBe(false);

    // First month (2021-10) keeps latest October snapshot (2021-10-31)
    expect(result.points[0].date).toBe('2021-10-31');
    expect(result.points[0].mortgage_m1).toBe(499000);
    expect(result.points[0].Standard).toBeNull();

    // Gap month (2021-11) carries balance cleanly on month end
    const nov2021 = result.points.find((p) => p.date === '2021-11-30');
    expect(nov2021).toBeDefined();
    expect(nov2021?.mortgage_m1).toBe(499000);

    // Today anchor point connects historical balance and future projections seamlessly
    const todayPt = result.points.find((p) => p.date === '2026-11-23');
    expect(todayPt).toBeDefined();
    expect(todayPt?.isToday).toBe(true);
    expect(todayPt?.mortgage_m1).toBe(452800);
    expect(todayPt?.Standard).toBe(452800);
    expect(todayPt?.['With Extra Payments']).toBe(452800);
    expect(result.todayAnchorDate).toBe('2026-11-23');

    // Future points have null historical balance and non-null projections
    const firstFuture = result.points.find((p) => p.date === '2026-12-01');
    expect(firstFuture).toBeDefined();
    expect(firstFuture?.mortgage_m1).toBeNull();
    expect(firstFuture?.Standard).toBeLessThan(452800);
    expect(firstFuture?.['With Extra Payments']).toBeLessThan(firstFuture!.Standard!);

    // Trailing zero rows are trimmed (at most one 0-balance terminal point per curve)
    const stdZeroCount = result.points.filter((p) => p.Standard === 0).length;
    const accZeroCount = result.points.filter((p) => p['With Extra Payments'] === 0).length;
    expect(stdZeroCount).toBe(1);
    expect(accZeroCount).toBe(1);
    expect(result.points.at(-1)?.Standard).toBe(0);
    expect(result.hasHistoricalData).toBe(true);
    expect(result.hasProjectedData).toBe(true);
    expect(result.maxBalance).toBe(499000);
  });

  it('includes refinanced prior loan history back to initial property purchase and transitions to active loan', () => {
    const oldLoan: LinkedMortgageInput = {
      id: 'm_old',
      name: 'Original 2018 Loan',
      balance: 0,
      originalLoanAmount: 400000,
      interestRate: 4.5,
      monthlyPayment: 2026.74,
      termMonths: 360,
      metadata: {
        mortgageStatus: 'refinanced',
        purchaseDate: '2018-06-01',
        refinanceDate: '2021-10-01',
        payoffBalance: 375000,
      },
    };

    const newLoan: LinkedMortgageInput = {
      id: 'm_new',
      name: 'Refi 2021 Loan',
      balance: -330000,
      originalLoanAmount: 375000,
      interestRate: 3.0,
      monthlyPayment: 1581.02,
      termMonths: 360,
      metadata: {
        purchaseDate: '2021-10-01',
      },
    };

    const mortgageSnapshots: MortgageSnapshotPoint[] = [
      { accountId: 'm_old', date: '2018-06-01', value: -400000 },
      { accountId: 'm_old', date: '2021-09-01', value: -375000 },
      { accountId: 'm_old', date: '2021-10-01', value: 0 },
      { accountId: 'm_new', date: '2021-10-01', value: -375000 },
      { accountId: 'm_new', date: '2026-10-01', value: -331000 },
    ];

    const standard = calculateAmortizationSchedule({
      originalBalance: 330000,
      annualRate: 3.0,
      termMonths: 300,
      monthlyPayment: 1581.02,
      startDate: '2026-12-01',
    });

    const result = buildMortgagePaydownTimeline({
      selectedMortgage: newLoan,
      allLinkedMortgages: [oldLoan, newLoan],
      mortgageSnapshots,
      propertyPurchaseDate: '2018-06-01',
      todayDate: '2026-11-23',
      showSynthetic: true,
      standardProjection: standard,
      acceleratedProjection: [],
      showAccelerated: false,
    });

    expect(result.historicalSeries.map((s) => s.id)).toEqual(['m_old', 'm_new']);
    expect(result.historicalSeries[0].isClosed).toBe(true);
    expect(result.historicalSeries[0].isSelected).toBe(false);
    expect(result.historicalSeries[1].isClosed).toBe(false);
    expect(result.historicalSeries[1].isSelected).toBe(true);

    // Chart begins at 2018 purchase
    expect(result.points[0].date).toBe('2018-06-01');
    expect(result.points[0].mortgage_m_old).toBe(400000);
    expect(result.points[0].mortgage_m_new).toBeNull();

    // On refinanceDate (2021-10-01), old loan stops (null) and new loan starts
    const refiPt = result.points.find((p) => p.date === '2021-10-01');
    expect(refiPt?.mortgage_m_old).toBeNull();
    expect(refiPt?.mortgage_m_new).toBe(375000);

    // At Today, active loan anchors to future Standard Payoff
    const todayPt = result.points.find((p) => p.date === '2026-11-23');
    expect(todayPt?.mortgage_m_old).toBeNull();
    expect(todayPt?.mortgage_m_new).toBe(330000);
    expect(todayPt?.Standard).toBe(330000);
    expect(result.todayAnchorDate).toBe('2026-11-23');
  });

  it('displays concurrent active mortgages (Primary + HELOC) while projecting selected mortgage', () => {
    const primary: LinkedMortgageInput = {
      id: 'm_primary',
      name: 'Primary Mortgage',
      balance: -380000,
      originalLoanAmount: 420000,
      metadata: { purchaseDate: '2023-01-01' },
    };
    const heloc: LinkedMortgageInput = {
      id: 'm_heloc',
      name: 'HELOC',
      balance: -42000,
      originalLoanAmount: 50000,
      metadata: { purchaseDate: '2024-06-01' },
    };

    const snapshots: MortgageSnapshotPoint[] = [
      { accountId: 'm_primary', date: '2023-01-01', value: -420000 },
      { accountId: 'm_primary', date: '2024-06-01', value: -405000 },
      { accountId: 'm_heloc', date: '2024-06-01', value: -50000 },
      { accountId: 'm_primary', date: '2026-10-01', value: -381000 },
      { accountId: 'm_heloc', date: '2026-10-01', value: -42500 },
    ];

    const standard = calculateAmortizationSchedule({
      originalBalance: 380000,
      annualRate: 5.5,
      termMonths: 315,
      monthlyPayment: 2384,
      startDate: '2026-12-01',
    });

    const result = buildMortgagePaydownTimeline({
      selectedMortgage: primary,
      allLinkedMortgages: [primary, heloc],
      mortgageSnapshots: snapshots,
      propertyPurchaseDate: '2023-01-01',
      todayDate: '2026-11-23',
      showSynthetic: true,
      standardProjection: standard,
      acceleratedProjection: [],
      showAccelerated: false,
    });

    expect(result.historicalSeries.map((s) => s.id)).toEqual(['m_primary', 'm_heloc']);

    const preHeloc = result.points.find((p) => p.date === '2023-01-01');
    expect(preHeloc?.mortgage_m_primary).toBe(420000);
    expect(preHeloc?.mortgage_m_heloc).toBeNull();

    const todayPt = result.points.find((p) => p.date === '2026-11-23');
    expect(todayPt?.mortgage_m_primary).toBe(380000);
    expect(todayPt?.mortgage_m_heloc).toBe(42000);
    expect(todayPt?.Standard).toBe(380000);
  });

  it('respects showSynthetic: false by omitting synthetic snapshots and disabling fallback synthesis', () => {
    const mortgage: LinkedMortgageInput = {
      id: 'm1',
      name: 'Mortgage',
      balance: -290000,
      originalLoanAmount: 300000,
      interestRate: 6.0,
      monthlyPayment: 1798.65,
      termMonths: 360,
      metadata: { purchaseDate: '2024-01-01' },
    };

    const syntheticOnly: MortgageSnapshotPoint[] = [
      { accountId: 'm1', date: '2024-01-01', value: -300000, isSynthetic: true },
      { accountId: 'm1', date: '2025-01-01', value: -295000, isSynthetic: true },
    ];

    const standard = calculateAmortizationSchedule({
      originalBalance: 290000,
      annualRate: 6.0,
      termMonths: 328,
      monthlyPayment: 1798.65,
      startDate: '2026-12-01',
    });

    const result = buildMortgagePaydownTimeline({
      selectedMortgage: mortgage,
      allLinkedMortgages: [mortgage],
      mortgageSnapshots: syntheticOnly,
      propertyPurchaseDate: '2024-01-01',
      todayDate: '2026-11-23',
      showSynthetic: false,
      standardProjection: standard,
      acceleratedProjection: [],
      showAccelerated: false,
    });

    expect(result.hasHistoricalData).toBe(false);
    expect(result.historicalSeries).toHaveLength(0);
    expect(result.todayAnchorDate).toBeNull();
    expect(result.points[0].date).toBe('2026-11-23');
    expect(result.points[0].Standard).toBe(290000);
    expect(result.points[0].mortgage_m1).toBeNull();
  });

  it('synthesizes monthly history from origination when snapshots are empty and showSynthetic is true', () => {
    const mortgage: LinkedMortgageInput = {
      id: 'm1',
      name: 'Mortgage',
      balance: -285000,
      originalLoanAmount: 300000,
      interestRate: 6.0,
      monthlyPayment: 1798.65,
      termMonths: 360,
      metadata: { purchaseDate: '2024-06-15' },
    };

    const standard = calculateAmortizationSchedule({
      originalBalance: 285000,
      annualRate: 6.0,
      termMonths: 331,
      monthlyPayment: 1798.65,
      startDate: '2026-12-01',
    });

    const result = buildMortgagePaydownTimeline({
      selectedMortgage: mortgage,
      allLinkedMortgages: [mortgage],
      mortgageSnapshots: [],
      propertyPurchaseDate: '2024-06-15',
      todayDate: '2026-11-23',
      showSynthetic: true,
      standardProjection: standard,
      acceleratedProjection: [],
      showAccelerated: false,
    });

    expect(result.hasHistoricalData).toBe(true);
    expect(result.historicalSeries).toHaveLength(1);
    expect(result.points[0].date).toBe('2024-06-15');
    expect(result.points[0].mortgage_m1).toBe(300000);
    const todayPt = result.points.find((p) => p.date === '2026-11-23');
    expect(todayPt?.mortgage_m1).toBe(285000);
    expect(todayPt?.Standard).toBe(285000);
    expect(result.todayAnchorDate).toBe('2026-11-23');
  });

  it('handles paid-off mortgage with historical snapshots vs zero-snapshot theoretical fallback', () => {
    const paidOffMortgage: LinkedMortgageInput = {
      id: 'm_paid',
      name: 'Paid Off Mortgage',
      balance: 0,
      originalLoanAmount: 200000,
      interestRate: 4.0,
      monthlyPayment: 954.83,
      termMonths: 360,
      metadata: { purchaseDate: '2020-01-01' },
    };

    // Case 1: With historical snapshots down to 0
    const withSnaps = buildMortgagePaydownTimeline({
      selectedMortgage: paidOffMortgage,
      allLinkedMortgages: [paidOffMortgage],
      mortgageSnapshots: [
        { accountId: 'm_paid', date: '2020-01-01', value: -200000 },
        { accountId: 'm_paid', date: '2024-06-01', value: -25000 },
        { accountId: 'm_paid', date: '2025-01-01', value: 0 },
      ],
      propertyPurchaseDate: '2020-01-01',
      todayDate: '2026-11-23',
      showSynthetic: true,
      standardProjection: [],
      acceleratedProjection: [],
      showAccelerated: false,
    });

    expect(withSnaps.hasHistoricalData).toBe(true);
    expect(withSnaps.hasProjectedData).toBe(false);
    expect(withSnaps.todayAnchorDate).toBeNull();
    expect(withSnaps.points[0].mortgage_m_paid).toBe(200000);

    // Case 2: Zero snapshots + showSynthetic false -> falls back to theoretical schedule
    const theoreticalSchedule = calculateAmortizationSchedule({
      originalBalance: 200000,
      annualRate: 4.0,
      termMonths: 360,
      monthlyPayment: 954.83,
      startDate: '2020-01-01',
    });

    const fallback = buildMortgagePaydownTimeline({
      selectedMortgage: paidOffMortgage,
      allLinkedMortgages: [paidOffMortgage],
      mortgageSnapshots: [],
      propertyPurchaseDate: '2020-01-01',
      todayDate: '2026-11-23',
      showSynthetic: false,
      standardProjection: theoreticalSchedule,
      acceleratedProjection: [],
      showAccelerated: false,
    });

    expect(fallback.hasHistoricalData).toBe(false);
    expect(fallback.hasProjectedData).toBe(true);
    expect(fallback.points).toHaveLength(360);
    expect(fallback.points[0].date).toBe('2020-01-01');
    expect(fallback.points.at(-1)?.Standard).toBe(0);
  });
});
