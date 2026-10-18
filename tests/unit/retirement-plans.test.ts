import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadEnginePlan } from '@/lib/services/retirement-plans';
import type { FinanceContext } from '@/lib/finance/context';

const mockUpdate = vi.fn().mockReturnValue({
  set: vi.fn().mockReturnValue({
    where: vi.fn().mockResolvedValue([]),
  }),
});

const mockDbState = {
  planRows: [] as any[],
  accounts: [] as any[],
  events: [] as any[],
  flows: [] as any[],
  settings: [] as any[],
  liabilities: [] as any[],
  taxRules: [] as any[],
};

vi.mock('@/lib/db', () => ({
  getDb: () => ({
    select: () => ({
      from: (table: any) => ({
        where: () => ({
          limit: (n: number) => {
            const tableName = table[Symbol.for('drizzle:Name')] || '';
            if (tableName === 'plans') return Promise.resolve(mockDbState.planRows.slice(0, n));
            if (tableName === 'plan_settings') return Promise.resolve(mockDbState.settings.slice(0, n));
            if (tableName === 'system_tax_rules') return Promise.resolve(mockDbState.taxRules.slice(0, n));
            return Promise.resolve([]);
          },
          orderBy: () => Promise.resolve([]),
          then: (onfulfilled: any) => {
            const tableName = table[Symbol.for('drizzle:Name')] || '';
            let res: any[] = [];
            if (tableName === 'plans') res = mockDbState.planRows;
            if (tableName === 'plan_accounts') res = mockDbState.accounts;
            if (tableName === 'plan_events') res = mockDbState.events;
            if (tableName === 'plan_flows') res = mockDbState.flows;
            if (tableName === 'plan_settings') res = mockDbState.settings;
            if (tableName === 'plan_liabilities') res = mockDbState.liabilities;
            if (tableName === 'system_tax_rules') res = mockDbState.taxRules;
            return Promise.resolve(res).then(onfulfilled);
          },
        }),
      }),
    }),
    update: mockUpdate,
  }),
}));

vi.mock('@/lib/crypto', () => ({
  decryptRow: vi.fn(async (_table, row) => ({ ...row })),
  encryptRow: vi.fn(async (_table, row) => ({ ...row })),
}));

describe('loadEnginePlan', () => {
  const dek = new Uint8Array([1, 2, 3]);
  const mockCtx: FinanceContext = {
    userId: 'user-1',
    dataUserId: 'user-1',
    dek,
    role: 'primary',
    hiddenAccountIds: new Set(),
    settings: {} as any,
    now: new Date('2026-06-01T00:00:00Z'),
    getAccounts: async () => [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockDbState.planRows = [
      {
        id: 'plan-1',
        userId: 'user-1',
        name: 'FIRE Plan',
        isDefault: true,
        primarySalary: '0', // needs migration
        primaryBirthYear: 1990,
        retirementAge: 55,
      },
    ];
    mockDbState.accounts = [];
    mockDbState.events = [
      {
        id: 'event-salary',
        type: 'salary',
        owner: 'primary',
        amount: '120000',
        startTriggerType: 'year',
        startTriggerValue: '2026',
      },
    ];
    mockDbState.flows = [];
    mockDbState.settings = [];
    mockDbState.liabilities = [];
    mockDbState.taxRules = [];
  });

  it('performs NO db writes when persistMigration is false (Ask mode)', async () => {
    const result = await loadEnginePlan(mockCtx, 'plan-1', { persistMigration: false });
    expect(result).not.toBeNull();
    expect(result?.planMeta.name).toBe('FIRE Plan');
    // Migrated salary in memory should be 120000
    expect(result?.enginePlan.primarySalary).toBe(120000);
    // But no DB update should occur!
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('performs db update when persistMigration is true', async () => {
    const result = await loadEnginePlan(mockCtx, 'plan-1', { persistMigration: true });
    expect(result).not.toBeNull();
    expect(result?.enginePlan.primarySalary).toBe(120000);
    // DB update should have been called
    expect(mockUpdate).toHaveBeenCalled();
  });
});
