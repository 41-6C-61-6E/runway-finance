/**
 * Small in-memory response memo for client-side JSON API fetches.
 *
 * Tab-style pages (e.g. /flows) mount and unmount heavy chart components as
 * the user switches tabs. Without a cache, every switch re-fetches the same
 * URL and the tab renders a spinner while it waits. `getOrFetch` returns
 * already-resolved responses instantly (microtask, no paint) and de-dupes
 * concurrent in-flight requests, so tab switches back to a recently loaded
 * tab render with no loading UI.
 *
 * This is a client-only, session-scoped layer — it intentionally does NOT
 * bypass server-side auth or the `cache: 'no-store'` semantics of the API
 * routes; it only avoids duplicate work within a single page view.
 */

const MAX_ENTRIES = 40;
const DEFAULT_TTL_MS = 5 * 60 * 1000;

export interface JsonShim {
  ok: boolean;
  status: number;
  statusText: string;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}

interface CacheEntry {
  data: unknown;
  status: number;
  statusText: string;
  ts: number;
  ttlMs: number;
}

interface Inflight {
  promise: Promise<CacheEntry>;
}

const cache = new Map<string, CacheEntry | Inflight>();

function isCacheEntry(value: unknown): value is CacheEntry {
  return (
    typeof value === 'object' &&
    value !== null &&
    'ts' in value &&
    'status' in value &&
    'ttlMs' in value
  );
}

function toShim(entry: CacheEntry): JsonShim {
  return {
    ok: entry.status >= 200 && entry.status < 300,
    status: entry.status,
    statusText: entry.statusText,
    json: async () => entry.data,
    text: async () => entry.statusText,
  };
}

export interface GetOrFetchOptions {
  /** Defaults to `(res) => !res.ok`. */
  isError?: (res: Response) => boolean;
  /** Defaults to 5 minutes. */
  ttlMs?: number;
}

/**
 * Fetch `url` with an in-memory memo keyed by `key` (pass the full URL).
 * Returns a `{ ok, status, statusText, json(), text() }` shim shaped like a
 * `Response` so existing `fetch` call sites only change `res = await
 * getOrFetch(...)` — no other edits needed.
 */
export async function getOrFetch<T = unknown>(
  key: string,
  opts?: GetOrFetchOptions
): Promise<JsonShim> {
  const ttlMs = opts?.ttlMs ?? DEFAULT_TTL_MS;
  const isError = opts?.isError ?? ((res: Response) => !res.ok);

  const existing = cache.get(key);
  if (existing) {
    if (isCacheEntry(existing) && Date.now() - existing.ts < existing.ttlMs) {
      return toShim(existing);
    }
    if (!isCacheEntry(existing)) {
      const entry = await existing.promise;
      return toShim(entry);
    }
    // Expired entry — fall through and refetch.
  }

  const promise = (async (): Promise<CacheEntry> => {
    try {
      const res = await fetch(key);
      const data = await res.json();
      return {
        data,
        status: res.status,
        statusText: res.statusText,
        ts: Date.now(),
        ttlMs,
      };
    } finally {
      // Drop the in-flight marker; a failed fetch must not poison the cache.
      if (isInflight(cache.get(key))) cache.delete(key);
    }
  })();

  // LRU-ish bound: evict the oldest entries when the map grows too large.
  if (cache.size >= MAX_ENTRIES) {
    const keys = [...cache.keys()];
    for (let i = 0; i < keys.length / 2 && keys.length > 0; i++) {
      cache.delete(keys[i]);
    }
  }

  cache.set(key, { promise });

  try {
    const entry = await promise;
    cache.set(key, entry);
    return toShim(entry);
  } catch (err) {
    throw err;
  }
}

function isInflight(value: unknown): value is Inflight {
  return typeof value === 'object' && value !== null && 'promise' in value;
}
