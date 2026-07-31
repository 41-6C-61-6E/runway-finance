import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import proxyHandler from '@/proxy';

// Mock NextAuth to pass-through the handler given to it
vi.mock('next-auth', () => ({
  default: () => ({
    auth: (fn: any) => fn,
  }),
}));

vi.mock('@/lib/auth.config', () => ({
  authConfig: {},
}));

describe('Proxy CSRF middleware', () => {
  it('should allow valid same-origin POST requests matching Host header', async () => {
    const req = new NextRequest('http://localhost:3000/api/backup/import', {
      method: 'POST',
      headers: {
        host: 'localhost:3000',
        origin: 'http://localhost:3000',
      },
    });

    const res = await (proxyHandler as any)(req);
    expect(res.status).not.toBe(403);
  });

  it('should allow POST requests when Origin matches loopback alias (127.0.0.1 vs localhost)', async () => {
    const req = new NextRequest('http://127.0.0.1:3001/api/backup/import', {
      method: 'POST',
      headers: {
        host: '127.0.0.1:3001',
        origin: 'http://localhost:3001',
      },
    });

    const res = await (proxyHandler as any)(req);
    expect(res.status).not.toBe(403);
  });

  it('should allow POST requests when X-Forwarded-Host matches Origin', async () => {
    const req = new NextRequest('http://internal-docker:3000/api/backup/import', {
      method: 'POST',
      headers: {
        host: 'internal-docker:3000',
        'x-forwarded-host': 'my-finance.domain.com',
        origin: 'https://my-finance.domain.com',
      },
    });

    const res = await (proxyHandler as any)(req);
    expect(res.status).not.toBe(403);
  });

  it('should allow POST requests when Origin is "null" but Referer is valid same-origin', async () => {
    const req = new NextRequest('http://localhost:3000/api/backup/import', {
      method: 'POST',
      headers: {
        host: 'localhost:3000',
        origin: 'null',
        referer: 'http://localhost:3000/settings',
      },
    });

    const res = await (proxyHandler as any)(req);
    expect(res.status).not.toBe(403);
  });

  it('should allow POST requests when Sec-Fetch-Site is same-origin', async () => {
    const req = new NextRequest('http://localhost:3000/api/backup/import', {
      method: 'POST',
      headers: {
        host: 'localhost:3000',
        'sec-fetch-site': 'same-origin',
      },
    });

    const res = await (proxyHandler as any)(req);
    expect(res.status).not.toBe(403);
  });

  it('should block cross-site POST requests from unauthorized origins', async () => {
    const req = new NextRequest('http://localhost:3000/api/backup/import', {
      method: 'POST',
      headers: {
        host: 'localhost:3000',
        origin: 'http://attacker.com',
        referer: 'http://attacker.com/malicious',
        'sec-fetch-site': 'cross-site',
      },
    });

    const res = await (proxyHandler as any)(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('CSRF_ERROR');
  });
});
