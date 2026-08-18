import { describe, it, expect, vi } from 'vitest';

// No DB in unit tests: getPool returns null, so checkRateLimit must use the
// in-memory fallback path.
vi.mock('@/lib/db', () => ({
  getPool: vi.fn(() => null),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { checkRateLimit, pruneRateLimitMap, getRateLimitMapSize, clearRateLimitMap } from '@/lib/rate-limit';

describe('rate limit helper (in-memory fallback)', () => {
  it('allows requests within threshold and blocks requests exceeding it', async () => {
    const key = 'test-client-1';

    // Allow up to 3 requests in a 1-second window
    expect(await checkRateLimit(key, 3, 1000)).toBe(true); // 1st
    expect(await checkRateLimit(key, 3, 1000)).toBe(true); // 2nd
    expect(await checkRateLimit(key, 3, 1000)).toBe(true); // 3rd

    // 4th request should be blocked
    expect(await checkRateLimit(key, 3, 1000)).toBe(false);
  });

  it('separates rate limits by key', async () => {
    const keyA = 'test-client-a';
    const keyB = 'test-client-b';

    // Block keyA
    expect(await checkRateLimit(keyA, 2, 1000)).toBe(true);
    expect(await checkRateLimit(keyA, 2, 1000)).toBe(true);
    expect(await checkRateLimit(keyA, 2, 1000)).toBe(false);

    // keyB should still be allowed since it has a separate limit
    expect(await checkRateLimit(keyB, 2, 1000)).toBe(true);
  });

  it('resets limit after window has expired', async () => {
    vi.useFakeTimers();
    const key = 'test-client-reset';
    const windowMs = 50;

    expect(await checkRateLimit(key, 1, windowMs)).toBe(true);
    expect(await checkRateLimit(key, 1, windowMs)).toBe(false);

    // Advance fake timer past window
    vi.advanceTimersByTime(windowMs + 10);

    // Should be allowed again
    expect(await checkRateLimit(key, 1, windowMs)).toBe(true);
    vi.useRealTimers();
  });

  it('correctly prunes expired entries', async () => {
    vi.useFakeTimers();
    clearRateLimitMap();
    const windowMs = 30;

    await checkRateLimit('client-x', 1, windowMs);
    await checkRateLimit('client-y', 1, windowMs * 10);

    expect(getRateLimitMapSize()).toBe(2);

    // Advance fake timer past client-x window
    vi.advanceTimersByTime(windowMs + 10);

    pruneRateLimitMap();

    // client-x should be pruned, client-y should remain
    expect(getRateLimitMapSize()).toBe(1);

    // Verify client-x is cleared from the map
    expect(await checkRateLimit('client-x', 1, windowMs)).toBe(true);
    vi.useRealTimers();
  });

  it('evicts oldest entries instead of clearing the entire map when capacity is reached', async () => {
    clearRateLimitMap();
    // Fill with entries
    for (let i = 0; i < 10005; i++) {
      await checkRateLimit(`test-fill-${i}`, 5, 60_000);
    }
    // Size should be trimmed but not 0
    expect(getRateLimitMapSize()).toBeLessThan(10000);
    expect(getRateLimitMapSize()).toBeGreaterThan(5000);
  });
});
