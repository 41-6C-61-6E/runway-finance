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
      startDate: '2026-06-01',
      endDate: '2026-06-30',
      change: 11296,
      startNetWorth: 130000,
      endNetWorth: 141296,
    });
  });

  it('extends past periods to calendar end and clamps current period to overall end', () => {
    const points = [
      // 2022 (historical)
      { date: '2022-01-01', netWorth: 50000 },
      { date: '2022-12-25', netWorth: 60000 }, // ends early on Dec 25
      // 2025 (current/last period in data)
      { date: '2025-01-01', netWorth: 60000 },
      { date: '2025-06-15', netWorth: 70000 }, // ends early on Jun 15, which is also overall end date of dataset
    ];

    const { barData, bucketSize } = computeNetWorthChangeBarData(points);

    expect(bucketSize).toBe('yearly');
    expect(barData).toHaveLength(2);

    // 2022 bucket should go to Dec 31
    expect(barData[0]).toMatchObject({
      startDate: '2022-01-01',
      endDate: '2022-12-31',
    });

    // 2025 bucket should clamp to the dataset overall end date (2025-06-15)
    expect(barData[1]).toMatchObject({
      startDate: '2025-01-01',
      endDate: '2025-06-15',
    });
  });
});
