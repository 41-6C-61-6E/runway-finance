import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

const state = vi.hoisted(() => ({
  now: new Date('2026-01-01T00:00:00Z'),
  entries: new Map<string, { count: number; windowStart: Date }>(),
  lastParams: [] as any[],
  shouldFail: false,
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@/lib/db', () => ({
  getPool: () => ({
    query: async (sql: string, params?: any[]) => {
      if (state.shouldFail) {
        throw new Error('connection refused');
      }
      state.lastParams = params ?? [];
      if (sql.includes('"rate_limits"') && sql.includes('ON CONFLICT')) {
        const key: string = params![0];
        const windowSecs: number = params![1];
        const now = state.now;
        const existing = state.entries.get(key);
        const windowEnd = existing ? new Date(existing.windowStart.getTime() + windowSecs * 1000) : null;
        if (!existing || !windowEnd || now >= windowEnd) {
          state.entries.set(key, { count: 1, windowStart: now });
        } else {
          existing.count += 1;
        }
        const row = state.entries.get(key)!;
        return { rows: [{ count: row.count, window_start: row.windowStart }] };
      }
      throw new Error(`unexpected sql: ${sql.slice(0, 60)}`);
    },
  }),
}));

import { checkGlobalRateLimit, checkRateLimit, clearRateLimitMap, getClientIp } from '@/lib/rate-limit';

const advance = (ms: number) => {
  state.now = new Date(state.now.getTime() + ms);
};

describe('DB-backed rate limiting', () => {
  beforeEach(() => {
    state.now = new Date('2026-01-01T00:00:00Z');
    state.entries.clear();
    state.lastParams = [];
    state.shouldFail = false;
    clearRateLimitMap();
  });

  it('allows up to maxRequests in the window, then blocks', async () => {
    for (let i = 0; i < 3; i++) {
      expect(await checkRateLimit('db-key', 3, 60_000)).toBe(true);
    }
    expect(await checkRateLimit('db-key', 3, 60_000)).toBe(false);
  });

  it('resets the window after it elapses', async () => {
    expect(await checkRateLimit('db-reset', 1, 60_000)).toBe(true);
    expect(await checkRateLimit('db-reset', 1, 60_000)).toBe(false);

    advance(60_000 + 1_000);
    expect(await checkRateLimit('db-reset', 1, 60_000)).toBe(true);
    // Count restarted at 1, so one more request in the new window is blocked
    expect(await checkRateLimit('db-reset', 1, 60_000)).toBe(false);
  });

  it('keeps separate keys independent', async () => {
    expect(await checkRateLimit('db-a', 1, 60_000)).toBe(true);
    expect(await checkRateLimit('db-a', 1, 60_000)).toBe(false);
    expect(await checkRateLimit('db-b', 1, 60_000)).toBe(true);
  });

  it('shares state across callers (single source of truth)', async () => {
    // Two "processes" hitting the same key in the same window
    expect(await checkRateLimit('db-shared', 2, 60_000)).toBe(true);
    expect(await checkRateLimit('db-shared', 2, 60_000)).toBe(true);
    expect(await checkRateLimit('db-shared', 2, 60_000)).toBe(false);
  });

  it('passes the window to the SQL as seconds', async () => {
    await checkRateLimit('db-params', 5, 60_000);
    expect(state.lastParams[0]).toBe('db-params');
    expect(state.lastParams[1]).toBe(60);
  });

  it('falls back to the in-memory limiter when the DB query fails', async () => {
    state.shouldFail = true;
    expect(await checkRateLimit('db-fail', 1, 60_000)).toBe(true);
    expect(await checkRateLimit('db-fail', 1, 60_000)).toBe(false);
    // A different key is still tracked independently by the memory fallback
    expect(await checkRateLimit('db-fail-other', 1, 60_000)).toBe(true);
  });

  it('does not touch the DB-backed entry when falling back mid-stream', async () => {
    expect(await checkRateLimit('db-mixed', 2, 60_000)).toBe(true); // DB: count 1
    state.shouldFail = true;
    expect(await checkRateLimit('db-mixed', 2, 60_000)).toBe(true); // memory: count 1
    expect(await checkRateLimit('db-mixed', 2, 60_000)).toBe(true); // memory: count 2
    expect(await checkRateLimit('db-mixed', 2, 60_000)).toBe(false); // memory: count 3 > 2
    state.shouldFail = false;
    // DB entry was NOT incremented during the fallback: 1 (earlier) + 1 = 2, still allowed
    expect(await checkRateLimit('db-mixed', 2, 60_000)).toBe(true);
    // Next DB increment reaches 3 > 2
    expect(await checkRateLimit('db-mixed', 2, 60_000)).toBe(false);
  });
});

describe('getClientIp', () => {
  const req = (headers: Record<string, string>) => new Request('http://localhost/api', { headers });
  const orig = process.env.RATE_LIMIT_TRUST_PROXY;

  afterAll(() => {
    if (orig === undefined) delete process.env.RATE_LIMIT_TRUST_PROXY;
    else process.env.RATE_LIMIT_TRUST_PROXY = orig;
  });

  it('ignores client headers when no trusted proxy is configured (H-1)', () => {
    delete process.env.RATE_LIMIT_TRUST_PROXY;
    const request = req({ 'x-real-ip': '1.2.3.4', 'x-forwarded-for': '9.9.9.9, 8.8.8.8' });
    expect(getClientIp(request)).toBe('direct');
  });

  it('prefers a sanitized x-real-ip when a trusted proxy is configured', () => {
    process.env.RATE_LIMIT_TRUST_PROXY = 'true';
    const request = req({ 'x-real-ip': '1.2.3.4', 'x-forwarded-for': '9.9.9.9, 8.8.8.8' });
    expect(getClientIp(request)).toBe('1.2.3.4');
  });

  it('falls back to the first x-forwarded-for entry (trusted proxy)', () => {
    process.env.RATE_LIMIT_TRUST_PROXY = 'true';
    const request = req({ 'x-forwarded-for': ' 5.6.7.8 , 8.8.8.8' });
    expect(getClientIp(request)).toBe('5.6.7.8');
  });

  it('rejects malformed proxy header values (trusted proxy)', () => {
    process.env.RATE_LIMIT_TRUST_PROXY = 'true';
    expect(getClientIp(req({ 'x-real-ip': '1.2.3.4, evil' }))).toBe('unknown');
    // A raw CRLF cannot be constructed via the Request/Headers API (undici
    // rejects it) — this simulates an upstream proxy that forwards it, which
    // is exactly the case sanitizeIp's bare-literal check must cover.
    const rawHeaders = {
      get: (name: string) =>
        name.toLowerCase() === 'x-real-ip' ? 'evil\r\nX-Injected: 1' : null,
    };
    expect(getClientIp({ headers: rawHeaders } as unknown as Request)).toBe('unknown');
  });

  it('defaults to unknown when no (trusted) proxy headers are present', () => {
    process.env.RATE_LIMIT_TRUST_PROXY = 'true';
    expect(getClientIp(req({}))).toBe('unknown');
  });
});

describe('checkGlobalRateLimit (H-1 non-identity backstop)', () => {
  beforeEach(() => {
    state.now = new Date('2026-01-01T00:00:00Z');
    state.entries.clear();
    state.shouldFail = false;
    clearRateLimitMap();
  });

  it('shares one bucket across all callers regardless of identity', async () => {
    for (let i = 0; i < 2; i++) {
      expect(await checkGlobalRateLimit('login', 2, 60_000)).toBe(true);
    }
    expect(await checkGlobalRateLimit('login', 2, 60_000)).toBe(false);
  });

  it('keeps buckets independent', async () => {
    expect(await checkGlobalRateLimit('login', 1, 60_000)).toBe(true);
    expect(await checkGlobalRateLimit('login', 1, 60_000)).toBe(false);
    expect(await checkGlobalRateLimit('register', 1, 60_000)).toBe(true);
  });
});
