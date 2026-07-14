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
  });
});
