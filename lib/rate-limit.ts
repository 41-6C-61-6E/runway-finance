const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
let lastPruned = 0;
const PRUNE_INTERVAL_MS = 60_000; // Prune every 1 minute
const MAX_MAP_SIZE = 10_000; // Prevent memory exhaustion

/**
 * Prunes expired entries from the rate limit map.
 */
export function pruneRateLimitMap(): void {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap.entries()) {
    if (now > entry.resetAt) {
      rateLimitMap.delete(key);
    }
  }
}

/**
 * Gets the current rate limit map size (exposed for testing).
 */
export function getRateLimitMapSize(): number {
  return rateLimitMap.size;
}

/**
 * Clears the rate limit map (exposed for testing).
 */
export function clearRateLimitMap(): void {
  rateLimitMap.clear();
}

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

  // Clean up expired entries periodically
  if (now - lastPruned > PRUNE_INTERVAL_MS) {
    pruneRateLimitMap();
    lastPruned = now;
  }

  // Prevent memory exhaustion if map size grows too large
  if (rateLimitMap.size >= MAX_MAP_SIZE) {
    pruneRateLimitMap();
    if (rateLimitMap.size >= MAX_MAP_SIZE) {
      rateLimitMap.clear();
    }
  }

  const entry = rateLimitMap.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= maxRequests) return false;
  entry.count++;
  return true;
}
