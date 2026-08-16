import { describe, it, expect, vi, beforeEach } from 'vitest';
import { healProductionAccounts } from '@/lib/services/heal-accounts';
import { getTableName } from 'drizzle-orm';

const mockState: Record<string, any[]> = {
  accounts: [],
  plaid_connections: [],
  simplifin_connections: [],
  account_snapshots: [],
};

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/lib/crypto-context', () => ({
  getServerDEK: vi.fn().mockResolvedValue(new Uint8Array(32)),
}));

vi.mock('@/lib/services/plaid-sync', () => ({
  syncPlaidConnection: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/lib/db', () => ({
  getDb: () => {
    const chain: any = {
      _table: null,
      select: vi.fn(() => chain),
      from: vi.fn((t: any) => {
        chain._table = t;
        return chain;
      }),
      where: vi.fn(() => chain),
      update: vi.fn((t: any) => ({
        set: vi.fn((val: any) => ({
          where: vi.fn(() => {
            const name = getTableName(t) || t?._?.name || t?.name;
            if (name && mockState[name]) {
              for (const row of mockState[name]) {
                Object.assign(row, val);
              }
            }
            return Promise.resolve();
          }),
        })),
      })),
      delete: vi.fn((t: any) => ({
        where: vi.fn(() => {
          mockState.account_snapshots.length = 0;
          return Promise.resolve();
        }),
      })),
      then: (resolve: (v: any) => any) => {
        const name = getTableName(chain._table) || chain._table?._?.name || chain._table?.name || '';
        const rows = mockState[name] || [];
        return Promise.resolve([...rows]).then(resolve);
      },
    };
    return chain;
  },
}));

describe('Account Self-Healing Service (heal-accounts.ts)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.accounts.length = 0;
    mockState.plaid_connections.length = 0;
    mockState.simplifin_connections.length = 0;
    mockState.account_snapshots.length = 0;
  });

  it('re-enables active account found in Plaid disabledAccounts and resets cursor', async () => {
    mockState.plaid_connections.push({
      id: 'plaid_conn_1',
      userId: 'user_1',
      disabledAccounts: ['ext_acc_1'],
      cursor: 'cursor_123',
    });

    mockState.accounts.push({
      id: 'acc_1',
      userId: 'user_1',
      plaidConnectionId: 'plaid_conn_1',
      externalId: 'ext_acc_1',
      balanceDate: new Date('2026-06-01'),
    });

    mockState.account_snapshots.push({
      accountId: 'acc_1',
      userId: 'user_1',
      isSynthetic: false,
      snapshotDate: '2026-06-15',
    });

    await healProductionAccounts();

    const conn = mockState.plaid_connections[0];
    expect(conn.disabledAccounts).toEqual([]);
    expect(conn.cursor).toBeNull();

    const { syncPlaidConnection } = await import('@/lib/services/plaid-sync');
    expect(syncPlaidConnection).toHaveBeenCalledWith('plaid_conn_1', 'user_1', expect.any(Uint8Array));
  });

  it('repairs mismatched ACT- external ID to correct Plaid ID when single disabled account exists', async () => {
    mockState.plaid_connections.push({
      id: 'plaid_conn_2',
      userId: 'user_2',
      disabledAccounts: ['plaid_real_id'],
      cursor: 'cur_abc',
    });

    mockState.accounts.push({
      id: 'acc_mismatched',
      userId: 'user_2',
      plaidConnectionId: 'plaid_conn_2',
      externalId: 'ACT-manual-123',
      balanceDate: new Date('2026-05-01'),
    });

    await healProductionAccounts();

    const acc = mockState.accounts[0];
    expect(acc.externalId).toBe('plaid_real_id');

    const conn = mockState.plaid_connections[0];
    expect(conn.disabledAccounts).toEqual([]);
    expect(conn.cursor).toBeNull();
  });
});
