import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from '@/app/api/bug-reporting/route';

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  getDb: vi.fn(() => ({
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        leftJoin: vi.fn(() => ({
          orderBy: vi.fn().mockResolvedValue([
            { id: 'issue-1', title: 'Test issue', status: 'reported' },
          ]),
        })),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([
          { id: 'issue-2', title: 'New bug', status: 'reported', type: 'bug' },
        ]),
      })),
    })),
  })),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue(true),
}));

import { auth } from '@/lib/auth';

describe('/api/bug-reporting API Route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BUG_REPORTING = 'true';
  });

  it('returns 404 when BUG_REPORTING feature is disabled', async () => {
    process.env.BUG_REPORTING = 'false';
    const res = await GET();
    expect(res.status).toBe(404);
  });

  it('returns 401 when user is unauthenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('GET returns issues list when authenticated and enabled', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'admin' } } as any);
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json)).toBe(true);
    expect(json[0].id).toBe('issue-1');
  });

  it('POST creates an issue and returns 201 Created', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'admin' } } as any);
    const req = new Request('http://localhost/api/bug-reporting', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'bug',
        title: 'Missing transaction icon',
        description: 'The transaction icon is missing on mobile.',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.id).toBe('issue-2');
  });

  it('POST rejects invalid issue payloads with validation error', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'admin' } } as any);
    const req = new Request('http://localhost/api/bug-reporting', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'invalid-type',
        title: '',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
