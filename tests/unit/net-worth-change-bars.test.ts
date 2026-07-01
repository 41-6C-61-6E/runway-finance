import { describe, expect, it } from 'vitest';
import { computeNetWorthChangeBarData } from '@/lib/utils/net-worth-change-bars';

describe('net worth change bars', () => {
  it('uses the previous snapshot for daily changes', () => {
    const { barData, bucketSize } = computeNetWorthChangeBarData([
      { date: '2026-06-01', netWorth: 1000 },
      { date: '2026-06-02', netWorth: 1250 },
      { date: '2026-06-03', netWorth: 1100 },
    ]);

    expect(bucketSize).toBe('daily');
    expect(barData).toEqual([
      {
        date: '2026-06-02',
        startDate: '2026-06-01',
        endDate: '2026-06-02',
        change: 250,
        startNetWorth: 1000,
        endNetWorth: 1250,
      },
      {
        date: '2026-06-03',
        startDate: '2026-06-02',
        endDate: '2026-06-03',
        change: -150,
        startNetWorth: 1250,
        endNetWorth: 1100,
      },
    ]);
  });

  it('uses prior period ending net worth for monthly changes', () => {
    const points = [
      { date: '2025-07-01', netWorth: 100000 },
      { date: '2025-07-31', netWorth: 101000 },
      { date: '2025-08-31', netWorth: 103500 },
      { date: '2025-09-30', netWorth: 108000 },
      { date: '2025-10-31', netWorth: 111000 },
      { date: '2025-11-30', netWorth: 114000 },
      { date: '2025-12-31', netWorth: 118000 },
      { date: '2026-01-31', netWorth: 120000 },
      { date: '2026-02-28', netWorth: 121000 },
      { date: '2026-03-31', netWorth: 123000 },
      { date: '2026-04-30', netWorth: 126000 },
      { date: '2026-05-31', netWorth: 130000 },
      { date: '2026-06-01', netWorth: 171719 },
      { date: '2026-06-30', netWorth: 141296 },
    ];

    const { barData, bucketSize } = computeNetWorthChangeBarData(points);
    const june = barData.find((bar) => bar.date === '2026-06-01');

    expect(bucketSize).toBe('monthly');
    expect(june).toMatchObject({
      startDate: '2026-05-31',
      endDate: '2026-06-30',
      change: 11296,
      startNetWorth: 130000,
      endNetWorth: 141296,
    });
  });
});
