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
 * Whether client-controllable IP headers may be trusted as rate-limit
 * identity.
 *
 * SECURITY (fix for H-1, 2026-08-27 security review): X-Real-IP /
 * X-Forwarded-For set by a client let an attacker rotate their identity
 * per request and bypass every limit. Headers are therefore only trusted
 * when the operator sets RATE_LIMIT_TRUST_PROXY=true, which declares that
 * the request passes through a reverse proxy that rewrites X-Real-IP to
 * the real peer address and strips any client-supplied X-Forwarded-For
 * before forwarding. Without that flag all requests are bucketed under
 * the shared `direct` id so header rotation cannot bypass limits.
 */
export function isTrustedProxyEnabled(): boolean {
  return process.env.RATE_LIMIT_TRUST_PROXY === 'true';
}

const IP_V4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;
const IP_V6_RE = /^[0-9a-fA-F:]{2,45}$/;

function sanitizeIp(value: string | null): string | null {
  if (!value) return null;
  const v = value.trim();
  // Reject anything that is not a bare IPv4/IPv6 literal (blocks garbage
  // like "1.2.3.4, evil" or CRLF injection into the limit key).
  if (!IP_V4_RE.test(v) && !IP_V6_RE.test(v)) return null;
  return v;
}

/**
 * Resolves the identity used as a rate-limit key for the request:
 * - trusted proxy configured: sanitized X-Real-IP, else first
 *   X-Forwarded-For entry, else `unknown`;
 * - otherwise: the shared `direct` id (headers are attacker-controlled).
 */
export function getClientIp(request: Request): string {
  if (!isTrustedProxyEnabled()) return 'direct';
  return (
    sanitizeIp(request.headers.get('x-real-ip'))
    ?? sanitizeIp(request.headers.get('x-forwarded-for')?.split(',')[0])
    ?? 'unknown'
  );
}

/**
 * Non-identity backstop limit, shared across ALL clients. Prevents a
 * compromised/misconfigured proxy (or a client that ignores limits) from
 * brute-forcing an endpoint via identity rotation. Use for high-value
 * endpoints (login, register, invite).
 */
export async function checkGlobalRateLimit(bucket: string, maxRequests: number, windowMs: number): Promise<boolean> {
  return checkRateLimit(`rl:global:${bucket}`, maxRequests, windowMs);
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
