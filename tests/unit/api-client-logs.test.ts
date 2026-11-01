import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/logs/client/route';
import { logger } from '@/lib/logger';

vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('@/lib/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: '123' } }),
}));

vi.mock('@/lib/rate-limit', () => ({
  getClientIp: vi.fn(() => '127.0.0.1'),
  checkRateLimit: vi.fn().mockResolvedValue(true),
}));

describe('/api/logs/client API Route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects payloads exceeding 32 KB with 413 Payload Too Large', async () => {
    const req = new Request('http://localhost/api/logs/client', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': '35000',
      },
      body: JSON.stringify({ errorMessage: 'x'.repeat(33000) }),
    });

    const res = await POST(req);
    expect(res.status).toBe(413);
    const json = await res.json();
    expect(json.error).toBe('Payload too large');
  });

  it('rejects requests missing errorMessage with 400 Bad Request', async () => {
    const req = new Request('http://localhost/api/logs/client', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': '20',
      },
      body: JSON.stringify({ errorName: 'SyntaxError' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Missing error message');
  });

  it('accepts valid error payload, logs exception, and returns 200 OK', async () => {
    const req = new Request('http://localhost/api/logs/client', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        errorName: 'TypeError',
        errorMessage: 'Cannot read properties of undefined',
        errorStack: 'TypeError: Cannot read properties...',
        url: 'http://localhost:3001/budgets',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(logger.error).toHaveBeenCalled();
  });
});

