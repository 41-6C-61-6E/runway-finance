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
 * Evicts oldest / nearest-expiry entries when map is full.
 */
function evictOldestEntries(targetCount: number): void {
  // Sort or iterate keys by resetAt ascending
  const entries = Array.from(rateLimitMap.entries());
  entries.sort((a, b) => a[1].resetAt - b[1].resetAt);
  const toRemove = entries.slice(0, targetCount);
  for (const [k] of toRemove) {
    rateLimitMap.delete(k);
  }
}

/**
 * Checks if a given key has exceeded the rate limit.
 *
 * @param key Unique key for rate limiting (e.g. `ip:endpoint` or `user:login`)
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

  // Prevent memory exhaustion if map size grows too large without clearing all legitimate limits
  if (rateLimitMap.size >= MAX_MAP_SIZE) {
    pruneRateLimitMap();
    if (rateLimitMap.size >= MAX_MAP_SIZE) {
      // Evict 20% oldest entries instead of clearing the entire map
      evictOldestEntries(Math.floor(MAX_MAP_SIZE * 0.2));
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
