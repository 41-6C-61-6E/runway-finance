import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from '@/app/api/financial-goals/route';
import { NextRequest } from 'next/server';
import { standardSession, unauthed } from './mocks/session';

const mockGoals: any[] = [];
let authFn = standardSession();

vi.mock('@/lib/auth', () => ({
  auth: () => authFn(),
}));

vi.mock('@/lib/crypto-context', () => ({
  getSessionDEK: vi.fn().mockResolvedValue(new Uint8Array(32)),
}));

vi.mock('@/lib/crypto', () => ({
  decryptRows: vi.fn((_table, rows) => Promise.resolve(rows.map((r: any) => ({ ...r })))),
  decryptRow: vi.fn((_table, row) => Promise.resolve({ ...row })),
  decryptField: vi.fn((val) => Promise.resolve(String(val ?? ''))),
  encryptRow: vi.fn((_table, data) => Promise.resolve(data)),
  encryptField: vi.fn((val) => Promise.resolve(String(val ?? ''))),
}));

vi.mock('@/lib/services/goal-allocation', () => ({
  computeGoalAllocations: vi.fn().mockResolvedValue({ accounts: [], totalAllocated: 0 }),
  findSharedAccounts: vi.fn().mockResolvedValue([]),
  getGoalAllocation: vi.fn().mockReturnValue(null),
}));

vi.mock('@/lib/db', () => ({
  getDb: () => {
    const chain: any = {
      select: vi.fn(() => chain),
      from: vi.fn(() => chain),
      where: vi.fn(() => chain),
      orderBy: vi.fn(() => chain),
      leftJoin: vi.fn(() => chain),
      innerJoin: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      insert: vi.fn(() => ({
        values: vi.fn((val: any) => ({
          returning: () => Promise.resolve([{ id: 'goal_created_1', ...val }]),
          then: (resolve: (v: any) => any) => Promise.resolve([{ id: 'goal_created_1', ...val }]).then(resolve),
        })),
      })),
      then: (resolve: (v: any) => any) => {
        return Promise.resolve(
          mockGoals.map((g) => ({
            goal: g,
            category: { name: 'Savings' },
          }))
        ).then(resolve);
      },
    };
    return chain;
  },
}));

describe('API Route: /api/financial-goals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGoals.length = 0;
    authFn = standardSession();
  });

  describe('GET /api/financial-goals', () => {
    it('returns 401 unauthorized when unauthenticated', async () => {
      authFn = unauthed();
      const req = new NextRequest('http://localhost:3000/api/financial-goals');
      const res = await GET(req);
      expect(res.status).toBe(401);
    });

    it('returns list of user goals with categories', async () => {
      mockGoals.push({
        id: 'goal_1',
        userId: 'test-user-id',
        name: 'Emergency Fund',
        targetAmount: '10000.00',
        sortOrder: 1,
        status: 'active',
      });

      const req = new NextRequest('http://localhost:3000/api/financial-goals');
      const res = await GET(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(Array.isArray(json)).toBe(true);
      expect(json.length).toBe(1);
      expect(json[0].name).toBe('Emergency Fund');
    });
  });

  describe('POST /api/financial-goals', () => {
    it('creates a new goal and returns 201', async () => {
      const payload = {
        name: 'New House Downpayment',
        type: 'savings',
        targetAmount: 50000,
        linkedAccountId: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
        percentage: 100,
        reserve: 0,
      };

      const req = new NextRequest('http://localhost:3000/api/financial-goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const res = await POST(req);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.id).toBe('goal_created_1');
    });
  });
});
