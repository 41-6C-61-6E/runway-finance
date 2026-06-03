import { describe, it, expect } from 'vitest';
import { computeMovingAverage, computeMedianFilter } from '@/lib/utils/chart-aggregation';

describe('chart smoothing algorithms', () => {
  const dummyData = [
    { date: '2026-06-01', netWorth: 100000, assets: 120000 },
    { date: '2026-06-02', netWorth: 100000, assets: 120000 },
    { date: '2026-06-03', netWorth: 100000, assets: 120000 },
    { date: '2026-06-04', netWorth: 10000, assets: 30000 },  // Deep 1-day outlier dropout (e.g. mortgage overlap)
    { date: '2026-06-05', netWorth: 100000, assets: 120000 },
    { date: '2026-06-06', netWorth: 100000, assets: 120000 },
    { date: '2026-06-07', netWorth: 100000, assets: 120000 },
  ];

  it('correctly calculates Simple Moving Average (SMA)', () => {
    // 3-day SMA: for 2026-06-04, window is [100000 (day3), 10000 (day4), 100000 (day2)? No, index 2, 3, i.e. max(0, index - windowSize + 1)]
    // index 3 (day4): start = max(0, 3 - 3 + 1) = 1 (day2). Subset is index 1, 2, 3: [100000, 100000, 10000]
    // Average = (210000) / 3 = 70000.
    const smoothed = computeMovingAverage(dummyData, ['netWorth', 'assets'], 3);
    
    expect(smoothed).toHaveLength(dummyData.length);
    expect(smoothed[3].netWorth).toBe(70000);
    expect(smoothed[3].assets).toBe(90000);
    
    // Check boundaries: first point has window of 1
    expect(smoothed[0].netWorth).toBe(100000);
  });

  it('correctly filters out spikes/dropouts using Median Filter', () => {
    // 5-day median filter: for 2026-06-04 (index 3), window is index [1, 2, 3, 4, 5] (i.e. index 3 +/- 2)
    // subset netWorths: [100000, 100000, 10000, 100000, 100000]
    // sorted: [10000, 100000, 100000, 100000, 100000] -> median is 100000
    const filtered = computeMedianFilter(dummyData, ['netWorth', 'assets'], 5);
    
    expect(filtered).toHaveLength(dummyData.length);
    // The outlier dropout should be completely cleaned to 100k
    expect(filtered[3].netWorth).toBe(100000);
    expect(filtered[3].assets).toBe(120000);

    // Other non-outlier points should remain unchanged
    expect(filtered[0].netWorth).toBe(100000);
    expect(filtered[6].netWorth).toBe(100000);
  });
});
