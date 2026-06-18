import { vi, describe, it, expect, beforeEach } from 'vitest';
import { POST } from '@/app/api/register/route';
import { NextRequest } from 'next/server';

// Mock auth to avoid loading next-auth (which fails in Vitest environment due to next/server import)
vi.mock('@/lib/auth', () => ({
  auth: vi.fn().mockResolvedValue(null),
}));

// Mock database
vi.mock('@/lib/db', () => ({
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
  acceptInvitation: vi.fn().mockResolvedValue(undefined),
}));

// Mock other seeds/setup
vi.mock('@/lib/db/seed-categories', () => ({ seedUserCategories: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/db/seed-default-rules', () => ({ seedUserDefaultRules: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/db/seed-ai-providers', () => ({ seedUserAiProviders: vi.fn().mockResolvedValue(undefined) }));

describe('registration API rate limiting', () => {
  beforeEach(() => {
    // Reset rate limiter state between tests if needed, but since it's in-memory, we can use different IPs or keys
    vi.clearAllMocks();
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
