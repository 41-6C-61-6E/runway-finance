import { addFrequencyPeriod, calculateNextExpectedDate } from '@/lib/services/recurring-detection';
import { getDateRange, timeframeToMonths } from '@/lib/utils/timeframe';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getCurrentMonth, getMonthRange, snapToPeriod, formatMonth, getPeriodLabel, getPreciseDateRange } from '@/lib/utils/date-window';

describe('date-window utilities', () => {
  beforeEach(() => {
    // Lock system time to June 15, 2026
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getCurrentMonth', () => {
    it('returns the current month in YYYY-MM format', () => {
      expect(getCurrentMonth()).toBe('2026-06');
    });
  });

  describe('getMonthRange', () => {
    it('returns YTD range from Jan to current month for "ytd"', () => {
      const range = getMonthRange('ytd');
      expect(range).toEqual({ start: '2026-01', end: '2026-06' });
    });

    it('returns from 2000-01 to current month for "all"', () => {
      const range = getMonthRange('all');
      expect(range).toEqual({ start: '2000-01', end: '2026-06' });
    });

    it('returns correct range for "1m"', () => {
      const range = getMonthRange('1m', '2026-05');
      expect(range).toEqual({ start: '2026-05', end: '2026-05' });
    });

    it('returns correct range for "3m"', () => {
      const range = getMonthRange('3m', '2026-06');
      expect(range).toEqual({ start: '2026-04', end: '2026-06' });
    });

    it('returns correct range for "6m"', () => {
      const range = getMonthRange('6m', '2026-06');
      expect(range).toEqual({ start: '2026-01', end: '2026-06' });
    });

    it('returns correct range for "1y"', () => {
      const range = getMonthRange('1y', '2026-06');
      expect(range).toEqual({ start: '2025-07', end: '2026-06' });
    });

    it('returns correct range for "1d_discrete"', () => {
      const range = getMonthRange('1d_discrete', '2026-06-15');
      expect(range).toEqual({ start: '2026-06', end: '2026-06' });
    });
  });

  describe('snapToPeriod', () => {
    it('handles 1m timeframe (no-op)', () => {
      expect(snapToPeriod('2026-04', '1m')).toBe('2026-04');
    });

    it('snaps to end of 3m period', () => {
      // April (4) and May (5) snap to March (3), June (6) snaps to June (6)
      expect(snapToPeriod('2026-04', '3m')).toBe('2026-03');
      expect(snapToPeriod('2026-05', '3m')).toBe('2026-03');
      expect(snapToPeriod('2026-06', '3m')).toBe('2026-06');
    });

    it('snaps to end of 6m period', () => {
      // March (3) snaps to last Dec (12), August (8) snaps to June (6)
      expect(snapToPeriod('2026-03', '6m')).toBe('2025-12');
      expect(snapToPeriod('2026-08', '6m')).toBe('2026-06');
    });

    it('snaps to December for 1y', () => {
      expect(snapToPeriod('2026-05', '1y')).toBe('2026-12');
    });

    it('snaps future 1y to current year December', () => {
      expect(snapToPeriod('2027-05', '1y')).toBe('2026-12');
    });

    it('snaps future 1m to current month', () => {
      expect(snapToPeriod('2026-12', '1m')).toBe('2026-06');
    });

    it('handles 1d_discrete timeframe (snaps to same day or first day of month or today)', () => {
      expect(snapToPeriod('2026-06-15', '1d_discrete')).toBe('2026-06-15');
      expect(snapToPeriod('2026-06', '1d_discrete')).toBe('2026-06-15');
      expect(snapToPeriod('2026-05', '1d_discrete')).toBe('2026-05-01');
    });
  });

  describe('formatMonth', () => {
    it('formats YYYY-MM to long month and year', () => {
      expect(formatMonth('2026-06')).toBe('June 2026');
    });
  });

  describe('getPeriodLabel', () => {
    it('returns "All time" for "all"', () => {
      expect(getPeriodLabel('2026-06', 'all')).toBe('All time');
    });

    it('returns formatted month for "1m"', () => {
      expect(getPeriodLabel('2026-06', '1m')).toBe('June 2026');
    });

    it('returns Q label for "3m"', () => {
      expect(getPeriodLabel('2026-06', '3m')).toBe('Q2 2026');
    });

    it('returns H label for "6m"', () => {
      expect(getPeriodLabel('2026-06', '6m')).toBe('H1 2026');
    });

    it('returns year label for "1y"', () => {
      expect(getPeriodLabel('2026-12', '1y')).toBe('2026');
    });

    it('returns YTD label for "ytd"', () => {
      expect(getPeriodLabel('2026-06', 'ytd')).toBe('YTD 2026');
    });

    it('returns "Previous 24 Hours" for "1d"', () => {
      expect(getPeriodLabel('2026-06', '1d')).toBe('Previous 24 Hours');
    });

    it('returns formatted date for "1d_discrete"', () => {
      expect(getPeriodLabel('2026-06-15', '1d_discrete')).toBe('Jun 15, 2026');
    });

    it('returns formatted date range for "7d_discrete"', () => {
      expect(getPeriodLabel('2026-06-15', '7d_discrete')).toBe('Jun 8 – Jun 15, 2026');
    });
  });

  describe('getPreciseDateRange', () => {

    it('returns yesterday to today range for "1d"', () => {
      const range = getPreciseDateRange('1d');
      expect(range).toEqual({ start: '2026-06-14', end: '2026-06-15' });
    });

    it('returns 7 days ago to today range for "7d"', () => {
      const range = getPreciseDateRange('7d');
      expect(range).toEqual({ start: '2026-06-08', end: '2026-06-15' });
    });

    it('returns single day range for "1d_discrete"', () => {
      const range = getPreciseDateRange('1d_discrete', '2026-06-12');
      expect(range).toEqual({ start: '2026-06-12', end: '2026-06-12' });
    });

    it('returns 7 day range ending on windowEnd for "7d_discrete"', () => {
      const range = getPreciseDateRange('7d_discrete', '2026-06-12');
      expect(range).toEqual({ start: '2026-06-05', end: '2026-06-12' });
    });
  });
});


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
