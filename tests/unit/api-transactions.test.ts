import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from '@/app/api/transactions/route';
import { standardSession, unauthed } from './mocks/session';

const mockTransactions: any[] = [];
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

vi.mock('@/lib/services/sync', () => ({
  triggerUserSummariesRebuild: vi.fn(),
  updateCategorySpendingSummaries: vi.fn(),
  updateCategoryIncomeSummaries: vi.fn(),
  updateMonthlyCashFlowSummaries: vi.fn(),
}));

vi.mock('@/lib/services/search-cache', () => ({
  getSearchMatchingTransactionIds: vi.fn().mockResolvedValue([]),
  invalidateUserSearchCache: vi.fn(),
}));

import { getTableName } from 'drizzle-orm';

vi.mock('@/lib/db', () => ({
  getDb: () => {
    let currentTable: any = null;
    const chain: any = {
      select: vi.fn(() => chain),
      from: vi.fn((t) => {
        currentTable = t;
        return chain;
      }),
      where: vi.fn(() => chain),
      orderBy: vi.fn(() => chain),
      leftJoin: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      offset: vi.fn(() => chain),
      insert: vi.fn(() => ({
        values: vi.fn((val: any) => ({
          returning: () => Promise.resolve([{ id: 'tx_created_1', ...val }]),
          then: (resolve: (v: any) => any) => Promise.resolve([{ id: 'tx_created_1', ...val }]).then(resolve),
        })),
      })),
      then: (resolve: (v: any) => any) => {
        const name = getTableName(currentTable) || currentTable?._?.name || currentTable?.name || '';
        if (name === 'accounts') {
          return Promise.resolve([{ id: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d' }]).then(resolve);
        }
        return Promise.resolve(
          mockTransactions.map((tx) => ({
            transaction: tx,
            account: { name: 'Checking' },
            category: { name: 'General' },
          }))
        ).then(resolve);
      },
    };
    return chain;
  },
}));

describe('API Route: /api/transactions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTransactions.length = 0;
    authFn = standardSession();
  });

  describe('GET /api/transactions', () => {
    it('returns 401 unauthenticated when no session is present', async () => {
      authFn = unauthed();
      const req = new Request('http://localhost:3000/api/transactions');
      const res = await GET(req);
      expect(res.status).toBe(401);
    });

    it('returns paginated transactions list', async () => {
      mockTransactions.push({
        id: 'tx_1',
        userId: 'user-1',
        accountId: 'acc_1',
        amount: '45.50',
        description: 'Supermarket',
        date: '2026-08-10',
      });

      const req = new Request('http://localhost:3000/api/transactions?page=1&limit=25');
      const res = await GET(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data).toBeDefined();
      expect(json.total).toBeDefined();
    });
  });

  describe('POST /api/transactions', () => {
    it('creates a manual transaction and returns 201', async () => {
      const payload = {
        accountId: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
        date: '2026-08-15',
        amount: '-25.00',
        description: 'Coffee Shop',
        pending: false,
      };

      const req = new Request('http://localhost:3000/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const res = await POST(req);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.id).toBe('tx_created_1');
    });
  });
});
