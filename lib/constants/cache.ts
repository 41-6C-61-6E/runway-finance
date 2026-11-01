import { durations } from './time';

/**
 * Client-side TanStack Query staleness profiles.
 */
export const QUERY_STALE_TIME = {
  realtime: durations.seconds(30),
  standard: durations.minutes(1),
  dashboard: durations.minutes(5),
  static: durations.minutes(10),
  long: durations.minutes(15),
  never: Infinity,
} as const;

/**
 * Client-side TanStack Query garbage collection (gcTime) durations.
 */
export const QUERY_GC_TIME = {
  standard: durations.minutes(10),
  extended: durations.minutes(30),
  long: durations.hours(24),
} as const;

/**
 * Server-side in-memory and route cache TTL profiles.
 */
export const SERVER_CACHE_TTL = {
  short: durations.minutes(2),
  standard: durations.minutes(3),
  dashboard: durations.minutes(5),
  dek: durations.minutes(10),
  quotes: durations.minutes(15),
  search: durations.minutes(30),
  benchmark: durations.hours(1),
  long: durations.hours(24),
} as const;

/**
 * Local storage / cache persistence max age.
 */
export const PERSIST_MAX_AGE = durations.days(7);

