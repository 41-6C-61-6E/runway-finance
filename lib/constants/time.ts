/**
 * Standard duration units in milliseconds.
 * Canonical home for all time-based duration arithmetic.
 */

export const SECOND_MS = 1_000;
export const MINUTE_MS = 60 * SECOND_MS;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;
export const WEEK_MS = 7 * DAY_MS;
export const MONTH_30D_MS = 30 * DAY_MS;
export const YEAR_365D_MS = 365 * DAY_MS;

export const durations = {
  ms: (n: number) => n,
  seconds: (n: number) => n * SECOND_MS,
  minutes: (n: number) => n * MINUTE_MS,
  hours: (n: number) => n * HOUR_MS,
  days: (n: number) => n * DAY_MS,
  weeks: (n: number) => n * WEEK_MS,
  months: (n: number) => n * MONTH_30D_MS,
  years: (n: number) => n * YEAR_365D_MS,
} as const;

