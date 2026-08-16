import { describe, it, expect, vi, beforeEach } from 'vitest';
import { populatePlanWithUserFinances } from '@/lib/services/plan-auto-populator';
import { getTableName } from 'drizzle-orm';

const mockState: Record<string, any[]> = {
  accounts: [],
  paystubs: [],
  plans: [],
  plan_accounts: [],
  plan_events: [],
  plan_flows: [],
  plan_settings: [],
};

vi.mock('@/lib/crypto', () => ({
  encryptRow: vi.fn((_table, data) => Promise.resolve({ ...data })),
  decryptRow: vi.fn((_table, row) => Promise.resolve({ ...row })),
}));

vi.mock('@/lib/db', () => ({
  getDb: () => {
    const createChain = (initialTable?: any) => {
      let currentTable = initialTable;
      const chain: any = {
        select: vi.fn(() => createChain(currentTable)),
        from: vi.fn((t: any) => {
          currentTable = t;
          return chain;
        }),
        where: vi.fn(() => chain),
        limit: vi.fn(() => chain),
        then: (resolve: (v: any) => any) => {
          const name = getTableName(currentTable) || currentTable?._?.name || currentTable?.name || '';
          const rows = mockState[name] || [];
          return Promise.resolve([...rows]).then(resolve);
        },
      };
      return chain;
    };

    return {
      select: vi.fn(() => createChain()),
      insert: vi.fn((t: any) => ({
        values: vi.fn((val: any) => {
          const name = getTableName(t) || t?._?.name || t?.name;
          const inserted = { id: `id-${Math.random().toString(36).slice(2, 7)}`, ...val };
          if (name && mockState[name]) {
            mockState[name].push(inserted);
          }
          return {
            returning: () => Promise.resolve([inserted]),
            then: (resolve: (v: any) => any) => Promise.resolve([inserted]).then(resolve),
          };
        }),
      })),
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
          const name = getTableName(t) || t?._?.name || t?.name;
          if (name && mockState[name]) {
            mockState[name] = mockState[name].filter((item) => item.planId !== 'cloned_plan_1' && item.planId !== 'target_plan_1');
          }
          return Promise.resolve();
        }),
      })),
    };
  },
}));

describe('Plan Auto Populator (plan-auto-populator.ts)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(mockState)) {
      mockState[key] = [];
    }
  });

  it('populates fresh plan with eligible user accounts and estimates salary from paystubs', async () => {
    mockState.accounts.push(
      { id: 'acc_inv', name: 'Vanguard 401k', type: '401k', balance: '50000', isHidden: false, isExcludedFromNetWorth: false },
      { id: 'acc_sav', name: 'High Yield Savings', type: 'savings', balance: '20000', isHidden: false, isExcludedFromNetWorth: false },
      { id: 'acc_cc', name: 'Credit Card', type: 'credit', balance: '1500', isHidden: false, isExcludedFromNetWorth: false } // should be skipped
    );

    mockState.paystubs.push({
      id: 'stub_1',
      grossCurrent: '4000.00', // 4000 * 26 = 104,000 estimated salary
    });

    const dek = new Uint8Array(32);
    await populatePlanWithUserFinances('target_plan_1', 'user_1', dek);

    // Credit card should be excluded from plan_accounts
    expect(mockState.plan_accounts.length).toBe(2);
    const plan401k = mockState.plan_accounts.find((a) => a.name === 'Vanguard 401k');
    expect(plan401k).toBeDefined();
    expect(plan401k?.type).toBe('traditional_401k');
    expect(plan401k?.contributionMode).toBe('percentage');

    const planSav = mockState.plan_accounts.find((a) => a.name === 'High Yield Savings');
    expect(planSav).toBeDefined();
    expect(planSav?.type).toBe('cash');
  });

  it('clones an existing plan when sourcePlanId is provided', async () => {
    mockState.plan_accounts.push({
      id: 'src_acc_1',
      planId: 'src_plan',
      name: 'Source IRA',
      type: 'roth_ira',
      balance: '30000',
    });
    mockState.plan_events.push({
      id: 'src_ev_1',
      planId: 'src_plan',
      name: 'Retirement Expenses',
      amount: '50000',
    });

    const dek = new Uint8Array(32);
    await populatePlanWithUserFinances('cloned_plan_1', 'user_1', dek, 'src_plan');

    const clonedAccounts = mockState.plan_accounts.filter((a) => a.planId === 'cloned_plan_1');
    expect(clonedAccounts.length).toBe(1);
    expect(clonedAccounts[0].planId).toBe('cloned_plan_1');

    const clonedEvents = mockState.plan_events.filter((e) => e.planId === 'cloned_plan_1');
    expect(clonedEvents.length).toBe(1);
    expect(clonedEvents[0].planId).toBe('cloned_plan_1');
  });
});
