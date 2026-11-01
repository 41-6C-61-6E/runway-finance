import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET as getHealth } from '@/app/api/health/route';
import { GET as getVersion } from '@/app/api/version/route';
import { GET as getAccounts } from '@/app/api/accounts/route';
import { GET as getCategories } from '@/app/api/categories/route';
import { GET as getTags } from '@/app/api/tags/route';
import { GET as getUserSettings } from '@/app/api/user-settings/route';
import { GET as getBugReportingConfig } from '@/app/api/bug-reporting/config/route';
import { GET as getNotifications } from '@/app/api/notifications/route';
import { standardSession, unauthed } from '@/tests/unit/mocks/session';

let currentAuth = standardSession();

vi.mock('auth', () => ({
  auth: () => currentAuth(),
}));
vi.mock('@/lib/auth', () => ({
  auth: () => currentAuth(),
}));

vi.mock('@/lib/crypto-context', () => ({
  getSessionDEK: vi.fn().mockResolvedValue(new Uint8Array(32)),
}));

vi.mock('@/lib/crypto', () => ({
  decryptRows: vi.fn((_table, rows) => Promise.resolve(rows.map((r: any) => ({ ...r })))),
  decryptField: vi.fn((val) => Promise.resolve(String(val ?? ''))),
}));

vi.mock('@/lib/services/account-sync-health', () => ({
  computeAccountSyncStatuses: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/lib/db/seed-categories', () => ({
  ensureCompoundCategories: vi.fn().mockResolvedValue([]),
  ensureEmployerContributions: vi.fn().mockResolvedValue([]),
  mergeDuplicateCategories: vi.fn().mockResolvedValue([]),
}));

const mockDbRows: any[] = [];
vi.mock('@/lib/db', () => ({
  getDb: () => {
    const chain: any = {
      select: vi.fn(() => chain),
      from: vi.fn(() => chain),
      where: vi.fn(() => chain),
      orderBy: vi.fn(() => chain),
      leftJoin: vi.fn(() => chain),
      groupBy: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      insert: vi.fn(() => chain),
      values: vi.fn(() => chain),
      returning: vi.fn(() => chain),
      delete: vi.fn(() => chain),
      update: vi.fn(() => chain),
      set: vi.fn(() => chain),
      transaction: vi.fn((cb: any) => cb(chain)),
      then: (resolve: (v: any) => any) => Promise.resolve(mockDbRows).then(resolve),
    };
    return chain;
  },
  getPool: vi.fn(() => ({
    query: vi.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }),
  })),
}));

describe('API Route Characterization Snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbRows.length = 0;
    currentAuth = standardSession();
  });

  describe('GET /api/health and /api/version', () => {
    it('characterizes /api/health response envelope', async () => {
      const res = await getHealth();
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe('ok');
      expect(json.database).toBe('connected');
    });

    it('characterizes /api/version response envelope', async () => {
      const res = await getVersion();
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(Object.keys(json).sort()).toMatchSnapshot();
    });
  });

  describe('Unauthenticated Rejection Snapshots', () => {
    beforeEach(() => {
      currentAuth = unauthed();
    });

    it('characterizes 401 unauthenticated response shape for /api/accounts', async () => {
      const req = new Request('http://localhost:3001/api/accounts');
      const res = await getAccounts(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json).toMatchSnapshot();
    });

    it('characterizes 401 unauthenticated response shape for /api/categories', async () => {
      const res = await getCategories();
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json).toMatchSnapshot();
    });

    it('characterizes 401 unauthenticated response shape for /api/tags', async () => {
      const res = await getTags();
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json).toMatchSnapshot();
    });

    it('characterizes 401 unauthenticated response shape for /api/user-settings', async () => {
      const res = await getUserSettings();
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json).toMatchSnapshot();
    });

    it('characterizes 401 unauthenticated response shape for /api/notifications', async () => {
      const req = new Request('http://localhost:3001/api/notifications');
      const res = await getNotifications(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json).toMatchSnapshot();
    });
  });

  describe('Authenticated Success Snapshots', () => {
    it('characterizes /api/accounts empty response', async () => {
      const req = new Request('http://localhost:3001/api/accounts');
      const res = await getAccounts(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toMatchSnapshot();
    });

    it('characterizes /api/categories empty response', async () => {
      const res = await getCategories();
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toMatchSnapshot();
    });

    it('characterizes /api/tags empty response', async () => {
      const res = await getTags();
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toMatchSnapshot();
    });

    it('characterizes /api/bug-reporting/config response', async () => {
      const res = await getBugReportingConfig();
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toMatchSnapshot();
    });
  });
});
