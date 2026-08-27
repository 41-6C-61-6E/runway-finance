import { vi, describe, it, expect, beforeEach } from 'vitest';
import { POST } from '@/app/api/register/route';
import { NextRequest } from 'next/server';

// Mock auth to avoid loading next-auth (which fails in Vitest environment due to next/server import)
vi.mock('@/lib/auth', () => ({
  auth: vi.fn().mockResolvedValue(null),
}));

// Mock database (no pool in unit tests -> rate limiter uses memory fallback)
vi.mock('@/lib/db', () => ({
  getPool: vi.fn().mockReturnValue(null),
  getDb: vi.fn().mockReturnValue({
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockResolvedValue({}),
  }),
}));

// Mock user operations
vi.mock('@/lib/users', () => ({
  addUser: vi.fn().mockResolvedValue({ username: 'testuser' }),
  findUser: vi.fn().mockResolvedValue(undefined),
  createUserEncryptionKeys: vi.fn().mockResolvedValue(undefined),
  rewrapDekForUser: vi.fn().mockResolvedValue(undefined),
}));

// Mock sharing operations
vi.mock('@/lib/sharing', () => ({
  validateInvitation: vi.fn().mockResolvedValue({ valid: true, invitationId: '1', inviterUserId: 'primary' }),
  validateJoinToken: vi.fn().mockResolvedValue({ valid: false, error: 'Invalid or expired join link.' }),
  acceptInvitation: vi.fn().mockResolvedValue(undefined),
}));

// Mock other seeds/setup
vi.mock('@/lib/db/seed-categories', () => ({ seedUserCategories: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/db/seed-default-rules', () => ({ seedUserDefaultRules: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/db/seed-ai-providers', () => ({ seedUserAiProviders: vi.fn().mockResolvedValue(undefined) }));

// H-1: the register route consults BOTH a per-identity limit and a global
// backstop. Mock both with simple counters so each test is hermetic; the
// real limiter logic is covered in rate-limit-db.test.ts.
const rlState = vi.hoisted(() => ({
  perKey: new Map<string, number>(),
  global: new Map<string, number>(),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(async (key: string, max: number) => {
    const n = (rlState.perKey.get(key) ?? 0) + 1;
    rlState.perKey.set(key, n);
    return n <= max;
  }),
  checkGlobalRateLimit: vi.fn(async (bucket: string, max: number) => {
    const n = (rlState.global.get(bucket) ?? 0) + 1;
    rlState.global.set(bucket, n);
    return n <= max;
  }),
  getClientIp: vi.fn((req: Request) => req.headers.get('x-forwarded-for') ?? 'unknown'),
}));

describe('registration API rate limiting', () => {
  beforeEach(() => {
    // Reset rate limiter state between tests if needed, but since it's in-memory, we can use different IPs or keys
    vi.clearAllMocks();
    rlState.perKey.clear();
    rlState.global.clear();
  });

  it('rate limits registration attempts per IP', async () => {
    const ip = '192.168.1.50';
    
    // We will make 5 requests. They should not get blocked by rate limiting (though they may fail/succeed with mock results).
    for (let i = 0; i < 5; i++) {
      const request = new NextRequest('http://localhost:3000/api/register', {
        method: 'POST',
        headers: {
          'x-forwarded-for': ip,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username: 'testuser', password: 'password123' }),
      });

      const response = await POST(request);
      expect(response.status).not.toBe(429);
    }

    // The 6th request from the same IP should be blocked with 429 Too Many Requests
    const blockedRequest = new NextRequest('http://localhost:3000/api/register', {
      method: 'POST',
      headers: {
        'x-forwarded-for': ip,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username: 'testuser', password: 'password123' }),
    });

    const response = await POST(blockedRequest);
    expect(response.status).toBe(429);

    const body = await response.json();
    expect(body.message).toContain('Too many registration attempts');
  });

  it('allows registration from different IPs', async () => {
    const ipA = '10.0.0.1';
    const ipB = '10.0.0.2';

    // Exhaust rate limit for ipA
    for (let i = 0; i < 5; i++) {
      const request = new NextRequest('http://localhost:3000/api/register', {
        method: 'POST',
        headers: {
          'x-forwarded-for': ipA,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username: 'testuser', password: 'password123' }),
      });
      await POST(request);
    }

    // ipA is now rate limited
    const requestA = new NextRequest('http://localhost:3000/api/register', {
      method: 'POST',
      headers: {
        'x-forwarded-for': ipA,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username: 'testuser', password: 'password123' }),
    });
    const responseA = await POST(requestA);
    expect(responseA.status).toBe(429);

    // ipB should still be allowed (not 429)
    const requestB = new NextRequest('http://localhost:3000/api/register', {
      method: 'POST',
      headers: {
        'x-forwarded-for': ipB,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username: 'testuser', password: 'password123' }),
    });
    const responseB = await POST(requestB);
    expect(responseB.status).not.toBe(429);
  });
});
