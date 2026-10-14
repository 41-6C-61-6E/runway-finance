interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const serverCache = new Map<string, CacheEntry<any>>();
const MAX_ENTRIES = 500;
const DEFAULT_TTL_MS = 3 * 60 * 1000; // 3 minutes

export function getCached<T>(key: string): T | null {
  const entry = serverCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    serverCache.delete(key);
    return null;
  }
  return entry.data;
}

export function setCached<T>(key: string, data: T, ttlMs: number = DEFAULT_TTL_MS): void {
  if (serverCache.size >= MAX_ENTRIES) {
    // Evict oldest 20% entries
    const iter = serverCache.keys();
    for (let i = 0; i < MAX_ENTRIES / 5; i++) {
      const k = iter.next().value;
      if (k) serverCache.delete(k);
      else break;
    }
  }
  serverCache.set(key, {
    data,
    expiresAt: Date.now() + ttlMs,
  });
}

/**
 * Invalidate all cached data for a specific user.
 * Prefix format: `user:<userId>:*`
 */
export function invalidateUserServerCache(userId: string): void {
  const prefix = `user:${userId}:`;
  for (const key of serverCache.keys()) {
    if (key.startsWith(prefix)) {
      serverCache.delete(key);
    }
  }
}

export function clearServerCache(): void {
  serverCache.clear();
}
