import { describe, it, expect } from 'vitest';
import { generateMortgagePaydownHistory } from '@/lib/services/asset-estimator';

describe('mortgage-amortization', () => {
  const params = {
    originalBalance: 300000,
    annualRate: 6.0,
    termMonths: 360,
    monthlyPayment: 1798.65, // Standard P&I payment for 300k at 6%
    startDate: '2025-01-01',
  };

  it('generates correct active mortgage paydown history', () => {
    // Current balance today: e.g. 290000, current date: 2025-06-01
    const history = generateMortgagePaydownHistory(params, 290000, '2025-06-01', 'active');
    
    // Total months: Jan, Feb, Mar, Apr, May, June = 6 snapshots
    expect(history).toHaveLength(6);
    
    // Balance on start date (2025-01-01) should be close to original balance
    expect(history[0].date).toBe('2025-01-01');
    expect(history[0].balance).toBeGreaterThan(290000);
    expect(history[0].balance).toBeLessThanOrEqual(300000);
    
    // Balance today (2025-06-01) should match currentBalance exactly
    expect(history[5].date).toBe('2025-06-01');
    expect(history[5].balance).toBe(290000);
  });

  it('generates correct active mortgage paydown history when start date day-of-month does not align with currentDate day-of-month', () => {
    // Start date is Jan 5, currentDate is Jun 1.
    // Standard paydown history should contain a snapshot on the start date (Jan 5)
    // and subsequent anniversary dates (Feb 5, Mar 5, Apr 5, May 5) and currentDate (Jun 1).
    const nonAlignedParams = {
      ...params,
      startDate: '2025-01-05',
    };
    const history = generateMortgagePaydownHistory(nonAlignedParams, 290000, '2025-06-01', 'active');
    
    // Anniversary dates: Jan 5, Feb 5, Mar 5, Apr 5, May 5
    // Plus currentDate: Jun 1
    // Total should be 6 snapshots, and the earliest should be Jan 5.
    expect(history).toHaveLength(6);
    expect(history.map(h => h.date)).toContain('2025-01-05');
    expect(history.map(h => h.date)).toContain('2025-02-05');
    expect(history.map(h => h.date)).toContain('2025-03-05');
    expect(history.map(h => h.date)).toContain('2025-04-05');
    expect(history.map(h => h.date)).toContain('2025-05-05');
    expect(history.map(h => h.date)).toContain('2025-06-01');
  });

  it('generates correct paid off mortgage paydown history', () => {
    // Paid off date: 2025-03-01, current date: 2025-06-01
    // Amortization ends at 2025-03-01 with 0 balance.
    // Snapshots should end on 2025-03-01 (Jan, Feb, Mar).
    const history = generateMortgagePaydownHistory(params, 0, '2025-06-01', 'paid_off', '2025-03-01', 0);
    
    expect(history).toHaveLength(3); // Jan, Feb, Mar
    
    // Snapshots after paid off date (Apr, May, Jun) should not exist
    const junSnap = history.find(h => h.date === '2025-06-01');
    const maySnap = history.find(h => h.date === '2025-05-01');
    const aprSnap = history.find(h => h.date === '2025-04-01');
    
    expect(junSnap).toBeUndefined();
    expect(maySnap).toBeUndefined();
    expect(aprSnap).toBeUndefined();
    
    // Snapshots on or before paid off date (Jan, Feb, Mar) should exist
    const marSnap = history.find(h => h.date === '2025-03-01');
    const febSnap = history.find(h => h.date === '2025-02-01');
    const janSnap = history.find(h => h.date === '2025-01-01');
    
    expect(marSnap?.balance).toBe(0); // Paid off to 0 on payoff date
    expect(febSnap?.balance).toBeGreaterThan(0);
    expect(janSnap?.balance).toBeGreaterThan(0);
  });

  it('generates correct refinanced mortgage paydown history', () => {
    // Refinanced date: 2025-04-01 with payoff balance of 280000, current date: 2025-06-01
    // Amortization ends at 2025-04-01 with 0 balance (old loan paid off).
    // Snapshots should end on 2025-04-01 (Jan, Feb, Mar, Apr).
    const history = generateMortgagePaydownHistory(params, 0, '2025-06-01', 'refinanced', '2025-04-01', 280000);
    
    expect(history).toHaveLength(4); // Jan, Feb, Mar, Apr
    
    // Snapshots after refinance date (May, Jun) should not exist
    const junSnap = history.find(h => h.date === '2025-06-01');
    const maySnap = history.find(h => h.date === '2025-05-01');
    expect(junSnap).toBeUndefined();
    expect(maySnap).toBeUndefined();
    
    // Snapshot on refinance date (Apr) should be 0
    const aprSnap = history.find(h => h.date === '2025-04-01');
    expect(aprSnap?.balance).toBe(0);

    // Snapshot on the month before refinance date should be payoffBalance
    const marSnap = history.find(h => h.date === '2025-03-01');
    expect(marSnap?.balance).toBe(280000);
    
    // Snapshots before that should be higher than payoff balance
    const febSnap = history.find(h => h.date === '2025-02-01');
    expect(febSnap?.balance).toBeGreaterThan(280000);
  });

  it('generates mortgage paydown history with extraPrincipal using proportional adjustment', () => {
    // 6 months term. Extra principal = 1000. Start balance = 300000.
    // Standard P&I = 1798.65.
    const history = generateMortgagePaydownHistory(
      params,
      280000, // current balance
      '2025-06-01', // current date
      'active',
      undefined,
      undefined,
      1000 // extraPrincipal
    );

    // Should go from Jan to Jun (6 snapshots)
    expect(history).toHaveLength(6);
    // Start balance must be exactly originalBalance (300000)
    expect(history[0].date).toBe('2025-01-01');
    expect(history[0].balance).toBe(300000);
    // End balance must be exactly currentBalance (280000)
    expect(history[5].date).toBe('2025-06-01');
    expect(history[5].balance).toBe(280000);
  });

  it('correctly pushes starting date with originalBalance in refinanced path', () => {
    const history = generateMortgagePaydownHistory(
      params,
      0,
      '2025-06-01',
      'refinanced',
      '2025-04-01',
      280000,
      0
    );

    // It should contain the start date snapshot '2025-01-01' with originalBalance (300000)
    const janSnap = history.find(h => h.date === '2025-01-01');
    expect(janSnap).toBeDefined();
    expect(janSnap?.balance).toBe(300000);
  });
});
