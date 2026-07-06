import { describe, it, expect, vi, beforeEach } from 'vitest';
import { calculateWealthFlow } from '@/lib/services/wealth-flow';

const mockState = vi.hoisted(() => {
  let mockAccounts: any[] = [];
  let mockUserSettings: any[] = [];
  const mockAccountSnapshots: Array<{ accountId: string; snapshotDate: string; balance: string }> = [];
  return { mockAccounts, mockUserSettings, mockAccountSnapshots };
});

vi.mock('@/lib/services/snapshot-balances', () => ({
  getBalancesOnDate: async (
    _db: any,
    _userId: string,
    targetDate: string,
    accountIds: string[],
    _dek: Uint8Array,
  ) => {
    const result: Record<string, number> = {};
    if (accountIds.length === 0) return result;
    for (const accId of accountIds) {
      const snaps = mockState.mockAccountSnapshots.filter(
        (s) => s.accountId === accId && s.snapshotDate <= targetDate
      );
      if (snaps.length === 0) continue;
      const maxDate = snaps.reduce((max, s) => s.snapshotDate > max ? s.snapshotDate : max, '');
      const match = snaps.find((s) => s.snapshotDate === maxDate);
      if (match) {
        result[accId] = parseFloat(match.balance) || 0;
      }
    }
    return result;
  },
  getEarliestBalances: async (
    _db: any,
    _userId: string,
    accountIds: string[],
    _dek: Uint8Array,
  ) => {
    const result: Record<string, number> = {};
    if (accountIds.length === 0) return result;
    for (const accId of accountIds) {
      const snaps = mockState.mockAccountSnapshots.filter(
        (s) => s.accountId === accId
      );
      if (snaps.length === 0) continue;
      const minDate = snaps.reduce((min, s) => s.snapshotDate < min ? s.snapshotDate : min, snaps[0].snapshotDate);
      const match = snaps.find((s) => s.snapshotDate === minDate);
      if (match) {
        result[accId] = parseFloat(match.balance) || 0;
      }
    }
    return result;
  },
}));

vi.mock('@/lib/db', () => ({
  getDb: vi.fn(),
}));

vi.mock('@/lib/crypto', () => ({
  decryptField: async (val: string) => val,
  decryptRows: async (_table: string, rows: any[]) => rows,
}));

vi.mock('@/lib/services/account-history', () => ({
  convertCurrency: (amount: number) => amount,
  roundToCents: (val: number) => Math.round(val * 100) / 100,
}));

vi.mock('@/lib/db/schema', () => ({
  accounts: 'accounts',
  userSettings: 'userSettings',
  accountSnapshots: 'accountSnapshots',
}));

describe('wealth-flow service (snapshot-only)', () => {
  const mockDek = new Uint8Array(32);

  beforeEach(() => {
    mockState.mockAccounts = [];
    mockState.mockUserSettings = [{ currency: 'USD', showImportedData: { global: true, cashFlowProjections: true }, paystubEnabled: true }];
    mockState.mockAccountSnapshots.length = 0;
  });

  async function runWealthFlow(
    startDate: string,
    endDate: string,
    filterAccountIds?: string[],
  ) {
    const dbMock = {
      select: vi.fn(() => ({
        from: vi.fn((table: any) => ({
          where: vi.fn(() => {
            const makeThenable = () => ({
              then: (onfulfilled: any) => {
                let result: any[] = [];
                if (table === 'userSettings') result = mockState.mockUserSettings;
                else if (table === 'accounts') result = mockState.mockAccounts;
                return Promise.resolve(result).then(onfulfilled);
              },
            });
            const thenable: any = makeThenable();
            thenable.limit = vi.fn(() => makeThenable());
            return thenable;
          }),
        })),
      })),
    };

    const dbModule = await import('@/lib/db');
    (dbModule.getDb as any).mockReturnValue(dbMock);

    return calculateWealthFlow('user_1', startDate, endDate, mockDek, filterAccountIds);
  }

  it('calculates positive net worth change from asset growth', async () => {
    mockState.mockAccounts = [
      { id: 'checking-1', userId: 'user_1', name: 'Checking', type: 'checking', currency: 'USD', isHidden: false, isExcludedFromNetWorth: false },
      { id: 'savings-1', userId: 'user_1', name: 'Savings', type: 'savings', currency: 'USD', isHidden: false, isExcludedFromNetWorth: false },
    ];
    mockState.mockAccountSnapshots.push(
      { accountId: 'checking-1', snapshotDate: '2026-05-31', balance: '1000.00' },
      { accountId: 'savings-1', snapshotDate: '2026-05-31', balance: '5000.00' },
      { accountId: 'checking-1', snapshotDate: '2026-06-30', balance: '3000.00' },
      { accountId: 'savings-1', snapshotDate: '2026-06-30', balance: '5500.00' },
    );

    const result = await runWealthFlow('2026-06-01', '2026-06-30');

    expect(result.summary.beginningNetWorth).toBe(6000);
    expect(result.summary.endingNetWorth).toBe(8500);
    expect(result.summary.netWorthChange).toBe(2500);
    expect(result.summary.totalIncreases).toBe(2500);
    expect(result.summary.totalDecreases).toBe(0);

    const incCash = result.nodes.find(n => n.id === 'inc_cash');
    expect(incCash).toBeDefined();
    expect(incCash!.value).toBe(2500);
    expect(incCash!.type).toBe('increase');
    expect(incCash!.accounts).toHaveLength(2);

    const hub = result.nodes.find(n => n.id === 'hub_net_worth_change');
    expect(hub).toBeDefined();
    expect(hub!.netWorthChange).toBe(2500);
    expect(hub!.label).toBe('Net Worth Increase');
    expect(hub!.visualImbalance).toBe(2500);

    expect(result.links.some(l => l.source === 'inc_cash' && l.target === 'hub_net_worth_change')).toBe(true);
  });

  it('calculates negative net worth change from asset decline', async () => {
    mockState.mockAccounts = [
      { id: 'checking-1', userId: 'user_1', name: 'Checking', type: 'checking', currency: 'USD', isHidden: false, isExcludedFromNetWorth: false },
    ];
    mockState.mockAccountSnapshots.push(
      { accountId: 'checking-1', snapshotDate: '2026-05-31', balance: '5000.00' },
      { accountId: 'checking-1', snapshotDate: '2026-06-30', balance: '2000.00' },
    );

    const result = await runWealthFlow('2026-06-01', '2026-06-30');

    expect(result.summary.beginningNetWorth).toBe(5000);
    expect(result.summary.endingNetWorth).toBe(2000);
    expect(result.summary.netWorthChange).toBe(-3000);
    expect(result.summary.totalIncreases).toBe(0);
    expect(result.summary.totalDecreases).toBe(3000);

    const decCash = result.nodes.find(n => n.id === 'dec_cash');
    expect(decCash).toBeDefined();
    expect(decCash!.value).toBe(3000);
    expect(decCash!.type).toBe('decrease');

    const hub = result.nodes.find(n => n.id === 'hub_net_worth_change');
    expect(hub).toBeDefined();
    expect(hub!.netWorthChange).toBe(-3000);
    expect(hub!.label).toBe('Net Worth Decrease');
    expect(hub!.visualImbalance).toBe(-3000);
  });

  it('handles mixed asset and liability accounts', async () => {
    mockState.mockAccounts = [
      { id: 'checking-1', userId: 'user_1', name: 'Checking', type: 'checking', currency: 'USD', isHidden: false, isExcludedFromNetWorth: false },
      { id: 'brokerage-1', userId: 'user_1', name: 'Brokerage', type: 'brokerage', currency: 'USD', isHidden: false, isExcludedFromNetWorth: false },
      { id: 'mortgage-1', userId: 'user_1', name: 'Mortgage', type: 'mortgage', currency: 'USD', isHidden: false, isExcludedFromNetWorth: false },
      { id: 'credit-1', userId: 'user_1', name: 'Credit Card', type: 'credit', currency: 'USD', isHidden: false, isExcludedFromNetWorth: false },
    ];
    mockState.mockAccountSnapshots.push(
      { accountId: 'checking-1', snapshotDate: '2026-05-31', balance: '1000.00' },
      { accountId: 'brokerage-1', snapshotDate: '2026-05-31', balance: '10000.00' },
      { accountId: 'mortgage-1', snapshotDate: '2026-05-31', balance: '-200000.00' },
      { accountId: 'credit-1', snapshotDate: '2026-05-31', balance: '-500.00' },
      { accountId: 'checking-1', snapshotDate: '2026-06-30', balance: '4000.00' },
      { accountId: 'brokerage-1', snapshotDate: '2026-06-30', balance: '10500.00' },
      { accountId: 'mortgage-1', snapshotDate: '2026-06-30', balance: '-199000.00' },
      { accountId: 'credit-1', snapshotDate: '2026-06-30', balance: '-300.00' },
    );

    const result = await runWealthFlow('2026-06-01', '2026-06-30');

    expect(result.summary.beginningNetWorth).toBe(-189500);
    expect(result.summary.endingNetWorth).toBe(-184800);
    expect(result.summary.netWorthChange).toBe(4700);

    const incCash = result.nodes.find(n => n.id === 'inc_cash');
    expect(incCash).toBeDefined();
    expect(incCash!.value).toBe(3000);

    const incInvestments = result.nodes.find(n => n.id === 'inc_investments');
    expect(incInvestments).toBeDefined();
    expect(incInvestments!.value).toBe(500);

    const incMortgage = result.nodes.find(n => n.id === 'inc_mortgage');
    expect(incMortgage).toBeDefined();
    expect(incMortgage!.value).toBe(1000);

    const incCreditLoans = result.nodes.find(n => n.id === 'inc_credit_loans');
    expect(incCreditLoans).toBeDefined();
    expect(incCreditLoans!.value).toBe(200);

    expect(result.nodes.filter(n => n.type === 'decrease')).toHaveLength(0);
    expect(result.summary.totalIncreases).toBe(4700);
    expect(result.summary.totalDecreases).toBe(0);
  });

  it('handles mixed signs within the same account group', async () => {
    mockState.mockAccounts = [
      { id: 'checking-1', userId: 'user_1', name: 'Checking A', type: 'checking', currency: 'USD', isHidden: false, isExcludedFromNetWorth: false },
      { id: 'checking-2', userId: 'user_1', name: 'Checking B', type: 'checking', currency: 'USD', isHidden: false, isExcludedFromNetWorth: false },
    ];
    mockState.mockAccountSnapshots.push(
      { accountId: 'checking-1', snapshotDate: '2026-05-31', balance: '1000.00' },
      { accountId: 'checking-2', snapshotDate: '2026-05-31', balance: '2000.00' },
      { accountId: 'checking-1', snapshotDate: '2026-06-30', balance: '4000.00' },
      { accountId: 'checking-2', snapshotDate: '2026-06-30', balance: '1500.00' },
    );

    const result = await runWealthFlow('2026-06-01', '2026-06-30');

    expect(result.summary.netWorthChange).toBe(2500);
    expect(result.summary.totalIncreases).toBe(3000);
    expect(result.summary.totalDecreases).toBe(500);

    const incCash = result.nodes.find(n => n.id === 'inc_cash');
    expect(incCash).toBeDefined();
    expect(incCash!.value).toBe(3000);
    expect(incCash!.accounts).toHaveLength(1);
    expect(incCash!.accounts![0].id).toBe('checking-1');

    const decCash = result.nodes.find(n => n.id === 'dec_cash');
    expect(decCash).toBeDefined();
    expect(decCash!.value).toBe(500);
    expect(decCash!.accounts).toHaveLength(1);
    expect(decCash!.accounts![0].id).toBe('checking-2');
  });

  it('uses earliest snapshot as beginning balance for new accounts', async () => {
    mockState.mockAccounts = [
      { id: 'new-checking', userId: 'user_1', name: 'New Account', type: 'checking', currency: 'USD', isHidden: false, isExcludedFromNetWorth: false },
    ];
    mockState.mockAccountSnapshots.push(
      { accountId: 'new-checking', snapshotDate: '2026-06-15', balance: '5000.00' },
    );

    const result = await runWealthFlow('2026-06-01', '2026-06-30');

    expect(result.summary.beginningNetWorth).toBe(0);
    expect(result.summary.endingNetWorth).toBe(5000);
    expect(result.summary.netWorthChange).toBe(5000);
    expect(result.summary.totalIncreases).toBe(0);
    expect(result.summary.totalDecreases).toBe(0);

    const incCash = result.nodes.find(n => n.id === 'inc_cash');
    expect(incCash).toBeUndefined();
  });

  it('skips accounts with neither beginning nor ending snapshot', async () => {
    mockState.mockAccounts = [
      { id: 'orphan', userId: 'user_1', name: 'Orphan', type: 'checking', currency: 'USD', isHidden: false, isExcludedFromNetWorth: false },
    ];
    mockState.mockAccountSnapshots.length = 0;

    const result = await runWealthFlow('2026-06-01', '2026-06-30');

    expect(result.nodes.filter(n => n.type !== 'hub')).toHaveLength(0);
    expect(result.summary.beginningNetWorth).toBe(0);
    expect(result.summary.endingNetWorth).toBe(0);
    expect(result.summary.netWorthChange).toBe(0);
  });

  it('returns empty result when no reportable accounts match filter', async () => {
    mockState.mockAccounts = [
      { id: 'hidden-1', userId: 'user_1', name: 'Hidden', type: 'checking', currency: 'USD', isHidden: true, isExcludedFromNetWorth: false },
    ];

    const result = await runWealthFlow('2026-06-01', '2026-06-30');

    expect(result.nodes).toHaveLength(0);
    expect(result.links).toHaveLength(0);
    expect(result.summary.beginningNetWorth).toBe(0);
    expect(result.summary.endingNetWorth).toBe(0);
  });

  it('respects account filtering', async () => {
    mockState.mockAccounts = [
      { id: 'acc-1', userId: 'user_1', name: 'Account 1', type: 'checking', currency: 'USD', isHidden: false, isExcludedFromNetWorth: false },
      { id: 'acc-2', userId: 'user_1', name: 'Account 2', type: 'checking', currency: 'USD', isHidden: false, isExcludedFromNetWorth: false },
    ];
    mockState.mockAccountSnapshots.push(
      { accountId: 'acc-1', snapshotDate: '2026-05-31', balance: '100.00' },
      { accountId: 'acc-2', snapshotDate: '2026-05-31', balance: '200.00' },
      { accountId: 'acc-1', snapshotDate: '2026-06-30', balance: '300.00' },
      { accountId: 'acc-2', snapshotDate: '2026-06-30', balance: '800.00' },
    );

    const resultFull = await runWealthFlow('2026-06-01', '2026-06-30');
    expect(resultFull.summary.netWorthChange).toBe(800);

    const resultFiltered = await runWealthFlow('2026-06-01', '2026-06-30', ['acc-1']);
    expect(resultFiltered.summary.netWorthChange).toBe(200);
    expect(resultFiltered.summary.totalIncreases).toBe(200);
  });

  it('uses base currency from user settings', async () => {
    mockState.mockUserSettings = [{ currency: 'EUR' }];
    mockState.mockAccounts = [
      { id: 'acc-1', userId: 'user_1', name: 'Euro Account', type: 'checking', currency: 'EUR', isHidden: false, isExcludedFromNetWorth: false },
    ];
    mockState.mockAccountSnapshots.push(
      { accountId: 'acc-1', snapshotDate: '2026-05-31', balance: '100.00' },
      { accountId: 'acc-1', snapshotDate: '2026-06-30', balance: '300.00' },
    );

    const result = await runWealthFlow('2026-06-01', '2026-06-30');
    expect(result.summary.baseCurrency).toBe('EUR');
    expect(result.summary.netWorthChange).toBe(200);
  });

  it('correctly handles liability decrease as net worth increase', async () => {
    mockState.mockAccounts = [
      { id: 'mortgage-1', userId: 'user_1', name: 'Mortgage', type: 'mortgage', currency: 'USD', isHidden: false, isExcludedFromNetWorth: false },
    ];
    mockState.mockAccountSnapshots.push(
      { accountId: 'mortgage-1', snapshotDate: '2026-05-31', balance: '-200000.00' },
      { accountId: 'mortgage-1', snapshotDate: '2026-06-30', balance: '-198000.00' },
    );

    const result = await runWealthFlow('2026-06-01', '2026-06-30');

    expect(result.summary.beginningNetWorth).toBe(-200000);
    expect(result.summary.endingNetWorth).toBe(-198000);
    expect(result.summary.netWorthChange).toBe(2000);

    const incMortgage = result.nodes.find(n => n.id === 'inc_mortgage');
    expect(incMortgage).toBeDefined();
    expect(incMortgage!.value).toBe(2000);
    expect(incMortgage!.accounts![0].signedNWDelta).toBe(2000);
  });

  it('correctly handles liability increase as net worth decrease', async () => {
    mockState.mockAccounts = [
      { id: 'credit-1', userId: 'user_1', name: 'Credit Card', type: 'credit', currency: 'USD', isHidden: false, isExcludedFromNetWorth: false },
    ];
    mockState.mockAccountSnapshots.push(
      { accountId: 'credit-1', snapshotDate: '2026-05-31', balance: '-500.00' },
      { accountId: 'credit-1', snapshotDate: '2026-06-30', balance: '-1200.00' },
    );

    const result = await runWealthFlow('2026-06-01', '2026-06-30');

    expect(result.summary.beginningNetWorth).toBe(-500);
    expect(result.summary.endingNetWorth).toBe(-1200);
    expect(result.summary.netWorthChange).toBe(-700);

    const decCreditLoans = result.nodes.find(n => n.id === 'dec_credit_loans');
    expect(decCreditLoans).toBeDefined();
    expect(decCreditLoans!.value).toBe(700);
  });
});
