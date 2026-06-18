import { describe, it, expect } from 'vitest';
import { checkRateLimit } from '@/lib/rate-limit';

describe('rate limit helper', () => {
  it('allows requests within threshold and blocks requests exceeding it', () => {
    const key = 'test-client-1';
    
    // Allow up to 3 requests in a 1-second window
    expect(checkRateLimit(key, 3, 1000)).toBe(true); // 1st
    expect(checkRateLimit(key, 3, 1000)).toBe(true); // 2nd
    expect(checkRateLimit(key, 3, 1000)).toBe(true); // 3rd
    
    // 4th request should be blocked
    expect(checkRateLimit(key, 3, 1000)).toBe(false);
  });

  it('separates rate limits by key', () => {
    const keyA = 'test-client-a';
    const keyB = 'test-client-b';

    // Block keyA
    expect(checkRateLimit(keyA, 2, 1000)).toBe(true);
    expect(checkRateLimit(keyA, 2, 1000)).toBe(true);
    expect(checkRateLimit(keyA, 2, 1000)).toBe(false);

    // keyB should still be allowed since it has a separate limit
    expect(checkRateLimit(keyB, 2, 1000)).toBe(true);
  });

  it('resets limit after window has expired', async () => {
    const key = 'test-client-reset';
    const windowMs = 50;

    expect(checkRateLimit(key, 1, windowMs)).toBe(true);
    expect(checkRateLimit(key, 1, windowMs)).toBe(false);

    // Wait for window to expire
    await new Promise((resolve) => setTimeout(resolve, windowMs + 10));

    // Should be allowed again
    expect(checkRateLimit(key, 1, windowMs)).toBe(true);
  });
});
