import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '@/app/api/cash-flow/daily/route';
import { standardSession, unauthed } from './mocks/session';

let authFn = standardSession();

vi.mock('@/lib/auth', () => ({
  auth: () => authFn(),
}));

vi.mock('@/lib/crypto-context', () => ({
  getSessionDEK: vi.fn().mockResolvedValue(new Uint8Array(32)),
}));

vi.mock('@/lib/finance/context', () => ({
  buildFinanceContext: vi.fn().mockResolvedValue({
    userId: 'user_1',
    dek: new Uint8Array(32),
  }),
}));

const mockGetDailyCashFlow = vi.fn();
vi.mock('@/lib/finance/daily-cash-flow', () => ({
  getDailyCashFlow: (...args: any[]) => mockGetDailyCashFlow(...args),
}));

describe('GET /api/cash-flow/daily', () => {
  beforeEach(() => {
    authFn = standardSession();
    mockGetDailyCashFlow.mockReset();
  });

  it('returns 401 when unauthenticated', async () => {
    authFn = unauthed();
    const req = new Request('http://localhost:3001/api/cash-flow/daily?startDate=2026-10-01&endDate=2026-10-15');
    const res = await GET(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('unauthorized');
  });

  it('returns 400 when missing startDate or endDate', async () => {
    const req = new Request('http://localhost:3001/api/cash-flow/daily?startDate=2026-10-01');
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('validation_error');
  });

  it('returns 400 when startDate is after endDate', async () => {
    const req = new Request('http://localhost:3001/api/cash-flow/daily?startDate=2026-10-20&endDate=2026-10-10');
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('validation_error');
  });

  it('returns 400 when date range exceeds 62 days', async () => {
    const req = new Request('http://localhost:3001/api/cash-flow/daily?startDate=2026-01-01&endDate=2026-04-01');
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('validation_error');
  });

  it('returns 200 with result on valid query', async () => {
    const mockResult = {
      startDate: '2026-10-01',
      endDate: '2026-10-15',
      days: [
        {
          date: '2026-10-05',
          income: 1000,
          expenses: 250,
          net: 750,
          transactionCount: 2,
          pendingCount: 0,
          topItems: [],
          topCategories: [],
        },
      ],
    };
    mockGetDailyCashFlow.mockResolvedValueOnce(mockResult);

    const req = new Request('http://localhost:3001/api/cash-flow/daily?startDate=2026-10-01&endDate=2026-10-15');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(mockResult);
  });
});
