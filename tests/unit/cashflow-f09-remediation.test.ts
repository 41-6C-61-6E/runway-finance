import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { addFrequencyPeriod, calculateNextExpectedDate } from '@/lib/services/recurring-detection';
import { getDateRange, timeframeToMonths } from '@/lib/utils/timeframe';
import { getPreciseDateRange, snapToPeriod } from '@/lib/utils/date-window';

describe('Cash Flow, Savings Rate & Date Windows Remediation Suite (Review F09)', () => {
  describe('F09-3: Recurring Bill 31st Day Anchor Preservation', () => {
    it('preserves 31st calendar anchor across short months like February and April', () => {
      const anchorDay = 31;
      let date = '2026-01-31';

      // 1. Jan 31 -> Feb (clamps to 28 in non-leap year 2026)
      date = addFrequencyPeriod(date, 'monthly', anchorDay);
      expect(date).toBe('2026-02-28');

      // 2. Feb 28 -> March (restores to 31!)
      date = addFrequencyPeriod(date, 'monthly', anchorDay);
      expect(date).toBe('2026-03-31');

      // 3. March 31 -> April (clamps to 30)
      date = addFrequencyPeriod(date, 'monthly', anchorDay);
      expect(date).toBe('2026-04-30');

      // 4. April 30 -> May (restores to 31!)
      date = addFrequencyPeriod(date, 'monthly', anchorDay);
      expect(date).toBe('2026-05-31');
    });

    it('correctly calculates next expected date preserving anchor day across past dates', () => {
      const anchorDay = 31;
      // Overdue bill scheduled on 2025-12-31 with today being 2026-03-15
      const nextDate = calculateNextExpectedDate('2025-12-31', 'monthly', '2026-03-15', anchorDay);
      expect(nextDate).toBe('2026-03-31');
    });
  });

  describe('F09-4 & F09-5: Date Range Clamping & Month Overflows (timeframe.ts & date-window.ts)', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('correctly clamps month subtraction on March 31 (avoids rolling into March 3)', () => {
      vi.setSystemTime(new Date('2026-03-31T12:00:00Z'));
      const [start, end] = getDateRange('1m');

      expect(end.toISOString().slice(0, 10)).toBe('2026-03-31');
      // On non-leap year 2026, 1 month before March 31 should be February 28
      expect(start.getFullYear()).toBe(2026);
      expect(start.getMonth()).toBe(1); // February (0-indexed 1)
      expect(start.getDate()).toBe(28);
    });

    it('correctly clamps month subtraction on May 31 (avoids rolling into May 1)', () => {
      vi.setSystemTime(new Date('2026-05-31T12:00:00Z'));
      const [start, end] = getDateRange('1m');

      expect(end.toISOString().slice(0, 10)).toBe('2026-05-31');
      // 1 month before May 31 is April 30
      expect(start.getFullYear()).toBe(2026);
      expect(start.getMonth()).toBe(3); // April (0-indexed 3)
      expect(start.getDate()).toBe(30);
    });

    it('correctly clamps year subtraction on Leap Year Feb 29 (avoids rolling into March 1)', () => {
      vi.setSystemTime(new Date('2024-02-29T12:00:00Z'));
      const [start, end] = getDateRange('1y');

      expect(end.toISOString().slice(0, 10)).toBe('2024-02-29');
      // 1 year before 2024-02-29 in non-leap 2023 is February 28
      expect(start.getFullYear()).toBe(2023);
      expect(start.getMonth()).toBe(1); // February (0-indexed 1)
      expect(start.getDate()).toBe(28);
    });

    it('handles 7d_discrete date window across Spring DST with exact 7-day span', () => {
      // Pinned to March 9, 2026 (right after Spring forward on March 8)
      vi.setSystemTime(new Date('2026-03-09T12:00:00-04:00'));

      const range = getPreciseDateRange('7d_discrete', '2026-03-09');
      expect(range.end).toBe('2026-03-09');
      expect(range.start).toBe('2026-03-02');
    });

    it('expands timeframeToMonths("all") to 360 months for long-term historical records', () => {
      expect(timeframeToMonths('all')).toBe(360);
    });
  });
});
