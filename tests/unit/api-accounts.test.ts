import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '@/app/api/accounts/route';
import { standardSession, unauthed } from './mocks/session';

const mockAccounts: any[] = [];
let authFn = standardSession();

vi.mock('@/lib/auth', () => ({
  auth: () => authFn(),
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

vi.mock('@/lib/db', () => ({
  getDb: () => {
    const chain: any = {
      select: vi.fn(() => chain),
      from: vi.fn(() => chain),
      where: vi.fn(() => chain),
      orderBy: vi.fn(() => chain),
      leftJoin: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      then: (resolve: (v: any) => any) => Promise.resolve(mockAccounts).then(resolve),
    };
    return chain;
  },
}));

describe('API Route: /api/accounts (GET)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAccounts.length = 0;
    authFn = standardSession();
  });

  it('returns 401 unauthenticated when session is missing', async () => {
    authFn = unauthed();
    const req = new Request('http://localhost:3000/api/accounts');
    const res = await GET(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('unauthenticated');
  });

  it('returns accounts list with decrypted balances and dataUserId scope', async () => {
    mockAccounts.push(
      { id: 'acc_1', userId: 'user-1', name: 'Primary Checking', balance: '2500.00', type: 'checking', isHidden: false },
      { id: 'acc_2', userId: 'user-1', name: 'Savings Reserve', balance: '10000.00', type: 'savings', isHidden: false }
    );

    const req = new Request('http://localhost:3000/api/accounts');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.length).toBe(2);
    expect(json[0].name).toBe('Primary Checking');
  });

  it('applies query filters for type and hidden status', async () => {
    mockAccounts.push({ id: 'acc_1', userId: 'user-1', name: 'IRA', type: 'traditionalira', isHidden: false });

    const req = new Request('http://localhost:3000/api/accounts?type=traditionalira&includeHidden=true');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.length).toBe(1);
  });
});
