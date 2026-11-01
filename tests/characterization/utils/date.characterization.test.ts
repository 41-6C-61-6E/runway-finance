import { describe, it, expect } from 'vitest';
import { formatSafeUTCDate, shiftDaysUTC } from '@/lib/utils/date';

describe('Date Utilities Characterization Matrix', () => {
  const dateInputs = [
    '2026-01-01',
    '2026-02-28',
    '2024-02-29', // Leap year
    '2026-12-31',
    '2026-06-15T12:00:00Z',
    '2026-07',
    '',
    'invalid-date',
  ];

  it('characterizes formatSafeUTCDate outputs', () => {
    const results = dateInputs.map((input) => ({
      input,
      output: formatSafeUTCDate(input),
    }));
    expect(results).toMatchSnapshot();
  });

  it('characterizes shiftDaysUTC shifts across month and leap boundaries', () => {
    const shifts = [-31, -1, 0, 1, 31, 365];
    const results = dateInputs.map((input) => ({
      input,
      shifts: shifts.map((days) => ({ days, result: shiftDaysUTC(input, days) })),
    }));
    expect(results).toMatchSnapshot();
  });
});

