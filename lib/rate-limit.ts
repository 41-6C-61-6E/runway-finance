const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

/**
 * Checks if a given key has exceeded the rate limit.
 *
 * @param key Unique key for rate limiting (e.g. `ip:endpoint`)
 * @param maxRequests Maximum number of allowed requests in the window
 * @param windowMs Time window in milliseconds
 * @returns `true` if request is allowed, `false` if rate limit is exceeded
 */
export function checkRateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= maxRequests) return false;
  entry.count++;
  return true;
}
