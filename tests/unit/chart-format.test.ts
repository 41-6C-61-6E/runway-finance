import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  formatChartYAxisCurrency,
  formatChartXAxisDate,
  getChartXTicksUnified,
} from '@/lib/utils/chart-format';

describe('chart-format utilities', () => {
  beforeEach(() => {
    // Lock system time to July 2, 2026
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-02T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('formatChartYAxisCurrency', () => {
    it('returns $0 for absolute zero', () => {
      expect(formatChartYAxisCurrency(0, 0, 1000)).toBe('$0');
    });

    it('formats millions with narrow range to 3 decimals to avoid repeated labels', () => {
      // Range = $20,000. Under 50k, so 3 decimal places
      expect(formatChartYAxisCurrency(1340000, 1340000, 1360000)).toBe('$1.340M');
      expect(formatChartYAxisCurrency(1355000, 1340000, 1360000)).toBe('$1.355M');
    });

    it('formats millions with medium range to 2 decimals', () => {
      // Range = $100,000. Under 200k, so 2 decimal places
      expect(formatChartYAxisCurrency(1340000, 1300000, 1400000)).toBe('$1.34M');
    });

    it('formats millions with large range to 0 decimals', () => {
      // Range = $3,000,000. Above 1M, so 0 decimals
      expect(formatChartYAxisCurrency(3000000, 1000000, 4000000)).toBe('$3M');
    });

    it('formats thousands with narrow range', () => {
      // Range = 40. Under 50, so 2 decimals
      expect(formatChartYAxisCurrency(1020, 1000, 1040)).toBe('$1.02K');
    });

    it('formats thousands with normal range', () => {
      // Range = 5000. Above 200, so 0 decimals
      expect(formatChartYAxisCurrency(15000, 10000, 20000)).toBe('$15K');
    });

    it('formats small values below 1000', () => {
      expect(formatChartYAxisCurrency(450, 0, 500)).toBe('$450');
    });

    it('handles negative values correctly', () => {
      expect(formatChartYAxisCurrency(-1340000, -1360000, -1340000)).toBe('-$1.340M');
    });
  });

  describe('formatChartXAxisDate', () => {
    it('formats with short month and year when isMonthly is true (non-ambiguous format)', () => {
      expect(formatChartXAxisDate('2026-06-01', '1y', { isMonthly: true })).toBe('Jun 26\'');
      expect(formatChartXAxisDate('2025-12-01', '1y', { isMonthly: true })).toBe('Dec 25\'');
    });

    it('formats daily dates in the current year as MMM DD', () => {
      expect(formatChartXAxisDate('2026-07-02', '1y')).toBe('Jul 02');
    });

    it('formats daily dates in a previous year as MMM DD, YY\'', () => {
      expect(formatChartXAxisDate('2025-07-02', '1y')).toBe('Jul 02, 25\'');
    });

    it('formats yearly ticks as YYYY', () => {
      expect(formatChartXAxisDate('2026-01-01', '5y')).toBe('2026');
      expect(formatChartXAxisDate('2024-06-15', 'all')).toBe('2024');
    });

    it('formats daily timeframe 1m as MMM DD regardless of year status', () => {
      expect(formatChartXAxisDate('2026-06-10', '1m')).toBe('Jun 10');
    });
  });

  describe('getChartXTicksUnified', () => {
    it('spaces ticks evenly for 1m timeframe', () => {
      const data = Array.from({ length: 30 }, (_, i) => ({
        date: `2026-06-${String(i + 1).padStart(2, '0')}`,
      }));

      // Desktop: max 8 ticks
      const desktopTicks = getChartXTicksUnified(data, '1m', false);
      expect(desktopTicks.length).toBeLessThanOrEqual(8);
      expect(desktopTicks[0]).toBe('2026-06-01');
      expect(desktopTicks[desktopTicks.length - 1]).toBe('2026-06-30');

      // Mobile: max 4 ticks
      const mobileTicks = getChartXTicksUnified(data, '1m', true);
      expect(mobileTicks.length).toBeLessThanOrEqual(4);
      expect(mobileTicks[0]).toBe('2026-06-01');
      expect(mobileTicks[mobileTicks.length - 1]).toBe('2026-06-30');
    });

    it('finds month transitions and downsamples them based on screen size', () => {
      // 12 months data
      const data = [
        { date: '2025-07-01' },
        { date: '2025-08-01' },
        { date: '2025-09-01' },
        { date: '2025-10-01' },
        { date: '2025-11-01' },
        { date: '2025-12-01' },
        { date: '2026-01-01' },
        { date: '2026-02-01' },
        { date: '2026-03-01' },
        { date: '2026-04-01' },
        { date: '2026-05-01' },
        { date: '2026-06-01' },
      ];

      // Desktop: max 8 ticks
      const desktopTicks = getChartXTicksUnified(data, '1y', false);
      expect(desktopTicks.length).toBe(8);
      expect(desktopTicks[0]).toBe('2025-07-01');
      expect(desktopTicks[desktopTicks.length - 1]).toBe('2026-06-01');

      // Mobile: max 4 ticks
      const mobileTicks = getChartXTicksUnified(data, '1y', true);
      expect(mobileTicks.length).toBe(4);
      expect(mobileTicks[0]).toBe('2025-07-01');
      expect(mobileTicks[mobileTicks.length - 1]).toBe('2026-06-01');
    });
  });
});
