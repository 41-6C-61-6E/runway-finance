import { getPool } from './db';
import { logger } from './logger';

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
let lastPruned = 0;
const PRUNE_INTERVAL_MS = 60_000; // Prune every 1 minute
const MAX_MAP_SIZE = 10_000; // Prevent memory exhaustion

// Warn at most once per process when the DB path is unavailable
let dbFallbackWarned = false;

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
 * Resolves the client IP for rate limiting.
 * Prefers x-real-ip, then the first x-forwarded-for entry, then 'unknown'.
 */
export function getClientIp(request: Request): string {
  return (
    request.headers.get('x-real-ip')
    ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? 'unknown'
  );
}

// Single atomic upsert: increments within the window, resets otherwise.
// RETURNING gives the post-update count, so concurrent requests are safe.
const RATE_LIMIT_UPSERT_SQL = `
  INSERT INTO "rate_limits" ("key", "count", "window_start")
  VALUES ($1, 1, now())
  ON CONFLICT ("key") DO UPDATE SET
    "count" = CASE WHEN "rate_limits"."window_start" + make_interval(secs => $2) > now() THEN "rate_limits"."count" + 1 ELSE 1 END,
    "window_start" = CASE WHEN "rate_limits"."window_start" + make_interval(secs => $2) > now() THEN "rate_limits"."window_start" ELSE now() END
  RETURNING "count", "window_start"
`;

/**
 * DB-backed check: one atomic upsert per call, shared across processes.
 * A returned count of 1 means the window was just (re)started.
 */
async function checkRateLimitDb(key: string, maxRequests: number, windowMs: number): Promise<boolean> {
  const pool = getPool();
  if (!pool || typeof pool.query !== 'function') {
    throw new Error('database pool unavailable');
  }
  const windowSecs = windowMs / 1000;
  const result = await pool.query(RATE_LIMIT_UPSERT_SQL, [key, windowSecs]);
  const row = result?.rows?.[0];
  if (!row) {
    throw new Error('rate limit upsert returned no rows');
  }
  return Number(row.count) <= maxRequests;
}

/**
 * In-process check (fallback when the DB is unavailable).
 */
function checkRateLimitMemory(key: string, maxRequests: number, windowMs: number): boolean {
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

/**
 * Checks if a given key has exceeded the rate limit.
 *
 * Backed by the shared `rate_limits` table so limits survive restarts and
 * span multiple instances; falls back to the in-process map if the DB is
 * unavailable (warns once).
 *
 * @param key Unique key for rate limiting (e.g. `ip:endpoint` or `user:login`)
 * @param maxRequests Maximum number of allowed requests in the window
 * @param windowMs Time window in milliseconds
 * @returns `true` if request is allowed, `false` if rate limit is exceeded
 */
export async function checkRateLimit(key: string, maxRequests: number, windowMs: number): Promise<boolean> {
  try {
    return await checkRateLimitDb(key, maxRequests, windowMs);
  } catch (err) {
    if (!dbFallbackWarned) {
      dbFallbackWarned = true;
      logger.warn('[rate-limit] DB-backed rate limiting unavailable; using in-memory limits for this process', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return checkRateLimitMemory(key, maxRequests, windowMs);
  }
}
