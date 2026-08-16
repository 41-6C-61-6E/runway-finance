import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from '@/app/api/categories/route';
import { standardSession, unauthed } from './mocks/session';

const mockCategories: any[] = [];
let authFn = standardSession();

vi.mock('@/lib/auth', () => ({
  auth: () => authFn(),
}));

vi.mock('@/lib/crypto-context', () => ({
  getSessionDEK: vi.fn().mockResolvedValue(new Uint8Array(32)),
}));

vi.mock('@/lib/crypto', () => ({
  decryptRows: vi.fn((_table, rows) => Promise.resolve(rows.map((r: any) => ({ ...r })))),
  encryptRow: vi.fn((_table, data) => Promise.resolve(data)),
  decryptField: vi.fn((val) => Promise.resolve(String(val ?? ''))),
}));

vi.mock('@/lib/db/seed-categories', () => ({
  ensureCompoundCategories: vi.fn().mockResolvedValue([]),
  ensureEmployerContributions: vi.fn().mockResolvedValue([]),
  mergeDuplicateCategories: vi.fn().mockResolvedValue([]),
}));

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
      groupBy: vi.fn(() => chain),
      insert: vi.fn(() => ({
        values: vi.fn((val: any) => ({
          returning: () => Promise.resolve([{ id: 'cat_created_1', ...val }]),
          then: (resolve: (v: any) => any) => Promise.resolve([{ id: 'cat_created_1', ...val }]).then(resolve),
        })),
      })),
      then: (resolve: (v: any) => any) => {
        return Promise.resolve(mockCategories).then(resolve);
      },
    };
    return chain;
  },
}));

describe('API Route: /api/categories', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCategories.length = 0;
    authFn = standardSession();
  });

  describe('GET /api/categories', () => {
    it('returns 401 unauthenticated when no session is active', async () => {
      authFn = unauthed();
      const res = await GET();
      expect(res.status).toBe(401);
    });

    it('returns decrypted categories with transaction count maps', async () => {
      mockCategories.push(
        { id: 'cat_1', userId: 'test-user-id', name: 'Groceries', color: '#10b981', isIncome: false },
        { id: 'cat_2', userId: 'test-user-id', name: 'Salary', color: '#6366f1', isIncome: true }
      );

      const res = await GET();
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(Array.isArray(json)).toBe(true);
      expect(json.length).toBe(2);
      expect(json[0].name).toBe('Groceries');
    });
  });

  describe('POST /api/categories', () => {
    it('creates a new category and returns 201', async () => {
      const payload = {
        name: 'Dining Out',
        color: '#f59e0b',
        isIncome: false,
        isDiscretionary: true,
      };

      const req = new Request('http://localhost:3000/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const res = await POST(req);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.id).toBe('cat_created_1');
      expect(json.name).toBe('Dining Out');
    });
  });
});
