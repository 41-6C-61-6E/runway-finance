import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { snapToPeriod, getPreciseDateRange, getPeriodLabel } from '@/lib/utils/date-window';

describe('Date Boundaries & DST Transitions (date-window.ts)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('snaps period wrap-around from Jan/Feb backwards into previous year', () => {
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'));
    // 3m snap for 2026-01 -> Q4 of 2025 (2025-12)
    expect(snapToPeriod('2026-01', '3m')).toBe('2025-12');
    // 6m snap for 2026-02 -> H2 of 2025 (2025-12)
    expect(snapToPeriod('2026-02', '6m')).toBe('2025-12');
  });

  it('handles 7d date window across Fall-Back DST transition (2025-11-02)', () => {
    // Pinned to Nov 3, 2025 (right after DST fall-back on Nov 2)
    vi.setSystemTime(new Date('2025-11-03T12:00:00-05:00'));

    const range = getPreciseDateRange('7d');
    expect(range.end).toBe('2025-11-03');
    expect(range.start).toBe('2025-10-27');
  });

  it('handles 7d date window across Spring-Forward DST transition (2026-03-09)', () => {
    // Pinned to March 9, 2026 (right after DST spring-forward on March 8)
    vi.setSystemTime(new Date('2026-03-09T12:00:00-04:00'));

    const range = getPreciseDateRange('7d');
    expect(range.end).toBe('2026-03-09');
    expect(range.start).toBe('2026-03-02');
  });

  it('handles 7d_discrete date window calculation', () => {
    const range = getPreciseDateRange('7d_discrete', '2026-03-09');
    expect(range.end).toBe('2026-03-09');
    // Notice that due to DST spring forward on March 8, 7*24h subtraction in local time yields March 1st 23:00
    expect(range.start).toBe('2026-03-01');
  });

  it('formats period labels correctly across different timeframes', () => {
    expect(getPeriodLabel('2026-06', '3m')).toBe('Q2 2026');
    expect(getPeriodLabel('2026-12', '6m')).toBe('H2 2026');
    expect(getPeriodLabel('2026-07', '1y')).toBe('2026');
    expect(getPeriodLabel('2026-07', 'all')).toBe('All time');
  });
});
