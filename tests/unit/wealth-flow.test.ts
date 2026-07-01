import { describe, it, expect, vi, beforeEach } from 'vitest';
import { calculateWealthFlow } from '@/lib/services/wealth-flow';
import { accounts, accountSnapshots, transactions, userSettings } from '@/lib/db/schema';

let mockAccounts: any[] = [];
let mockSnapshots: any[] = [];
let mockTransactions: any[] = [];
let mockUserSettings: any[] = [];



class MockDbQueryBuilder {
  private _table: any;
  private _groupBy = false;
  private _isJoin = false;
  static callCount = 0;

  select(...args: any[]) { return this; }
  from(table: any) { this._table = table; return this; }
  innerJoin(...args: any[]) { this._isJoin = true; return this; }
  leftJoin(...args: any[]) { this._isJoin = true; return this; }
  where(...args: any[]) { return this; }
  inArray(...args: any[]) { return this; }
  groupBy(...args: any[]) { this._groupBy = true; return this; }
  limit(...args: any[]) { return this; }

  async then(onfulfilled?: (value: any) => any) {
    let result: any = []; const isGroupBy = this._groupBy; this._groupBy = false;
    if (this._table === accounts) {
      result = mockAccounts;
    } else if (this._table === accountSnapshots) {
      MockDbQueryBuilder.callCount++;
      const targetDate = (MockDbQueryBuilder.callCount === 1 || MockDbQueryBuilder.callCount === 2) ? '2026-05-31' : '2026-06-30';
      
      if (isGroupBy) {
        const uniqueAccts = Array.from(new Set(mockSnapshots.map(s => s.accountId)));
        result = uniqueAccts.map(accId => {
          const acctSnaps = mockSnapshots.filter(s => s.accountId === accId && s.snapshotDate <= targetDate);
          if (acctSnaps.length === 0) return null;
          const maxDate = acctSnaps.reduce((max, s) => s.snapshotDate > max ? s.snapshotDate : max, '');
          return { accountId: accId, maxDate };
        }).filter(Boolean);
      } else {
        const uniqueAccts = Array.from(new Set(mockSnapshots.map(s => s.accountId)));
        result = uniqueAccts.map(accId => {
          const acctSnaps = mockSnapshots.filter(s => s.accountId === accId && s.snapshotDate <= targetDate);
          if (acctSnaps.length === 0) return null;
          const maxDate = acctSnaps.reduce((max, s) => s.snapshotDate > max ? s.snapshotDate : max, '');
          return acctSnaps.find(s => s.snapshotDate === maxDate);
        }).filter(Boolean);
      }
      console.log('Query for ', targetDate, 'groupBy=', this._groupBy, 'returned', JSON.stringify(result));
    } else if (this._table === transactions || this._isJoin) {
      result = mockTransactions;
    } else if (this._table === userSettings) {
      result = mockUserSettings;
    }
    return Promise.resolve(result).then(onfulfilled);
  }
}

vi.mock('@/lib/db', () => ({
  getDb: () => new MockDbQueryBuilder(),
}));

vi.mock('@/lib/crypto', () => ({
  decryptField: async (val: string) => val,
  decryptRows: async (table: string, rows: any[]) => rows,
}));

vi.mock('@/lib/services/account-history', () => ({
  convertCurrency: (amount: number) => amount,
  roundToCents: (val: number) => Math.round(val * 100) / 100,
}));

describe('wealth-flow service', () => {
  const mockDek = new Uint8Array(32);

  beforeEach(() => {
    mockAccounts = [];
    mockSnapshots = [];
    mockTransactions = [];
    mockUserSettings = [{ showImportedData: { global: true, cashFlowProjections: true }, paystubEnabled: true, currency: 'USD' }];
    MockDbQueryBuilder.callCount = 0;
  });

  it('correctly calculates positive net worth change with balanced reconciliation', async () => {
    mockAccounts = [
      { id: 'checking-1', userId: 'user_1', name: 'Checking', type: 'checking', currency: 'USD', isHidden: false, isExcludedFromNetWorth: false },
      { id: 'brokerage-1', userId: 'user_1', name: 'Brokerage', type: 'brokerage', currency: 'USD', isHidden: false, isExcludedFromNetWorth: false },
      { id: 'mortgage-1', userId: 'user_1', name: 'Mortgage', type: 'mortgage', currency: 'USD', isHidden: false, isExcludedFromNetWorth: false },
    ];

    mockSnapshots = [
      { accountId: 'checking-1', snapshotDate: '2026-05-31', balance: '1000.00' },
      { accountId: 'brokerage-1', snapshotDate: '2026-05-31', balance: '5000.00' },
      { accountId: 'mortgage-1', snapshotDate: '2026-05-31', balance: '-200000.00' },
      { accountId: 'checking-1', snapshotDate: '2026-06-30', balance: '2000.00' },
      { accountId: 'brokerage-1', snapshotDate: '2026-06-30', balance: '6500.00' },
      { accountId: 'mortgage-1', snapshotDate: '2026-06-30', balance: '-199000.00' },
    ];

    mockTransactions = [
      { id: 't1', accountId: 'checking-1', amount: '5000.00', date: '2026-06-05', categoryId: 'c-income', categoryName: 'Salary', categoryType: 'standard', isIncome: true, excludeFromReports: false, parentId: null, categoryColor: '#000', payee: 'Employer' },
      { id: 't2', accountId: 'checking-1', amount: '-2000.00', date: '2026-06-10', categoryId: 'c-expense', categoryName: 'Rent', categoryType: 'standard', isIncome: false, excludeFromReports: false, parentId: null, categoryColor: '#000', payee: 'Landlord' },
      { id: 't3', accountId: 'checking-1', amount: '-1000.00', date: '2026-06-15', categoryId: 'c-transfer', categoryName: 'Transfer', categoryType: 'transfer', isIncome: false, excludeFromReports: false, parentId: null, categoryColor: '#000', payee: 'Transfer Out' },
      { id: 't3b', accountId: 'brokerage-1', amount: '1000.00', date: '2026-06-15', categoryId: 'c-transfer', categoryName: 'Transfer', categoryType: 'transfer', isIncome: true, excludeFromReports: false, parentId: null, categoryColor: '#000', payee: 'Transfer In' },
      { id: 't4', accountId: 'brokerage-1', amount: '100.00', date: '2026-06-25', categoryId: 'c-interest', categoryName: 'Interest & Dividends', categoryType: 'standard', isIncome: true, excludeFromReports: false, parentId: null, categoryColor: '#000', payee: 'Dividend' },
    ];

    const result = await calculateWealthFlow('user_1', '2026-06', '2026-06', mockDek);

    // Net worth calculations
    expect(result.summary.beginningNetWorth).toBe(-194000);
    expect(result.summary.endingNetWorth).toBe(-190500);
    expect(result.summary.netWorthChange).toBe(3500);

    // Income
    const incIncome = result.nodes.find(n => n.id === 'inc_c-income');
    expect(incIncome).toBeDefined();
    expect(incIncome!.value).toBe(5000);

    // Interest & Dividends
    const incInterest = result.nodes.find(n => n.id === 'inc_c-interest');
    expect(incInterest).toBeDefined();
    expect(incInterest!.value).toBe(100);

    // Expenses
    const expExpenses = result.nodes.find(n => n.id === 'exp_expenses');
    expect(expExpenses).toBeDefined();
    expect(expExpenses!.value).toBe(2000);

    // Net worth change is represented as the central hub imbalance, not as a flow node.
    const nwIncrease = result.nodes.find(n => n.id === 'use_net_wealth_generated');
    expect(nwIncrease).toBeUndefined();
    const hub = result.nodes.find(n => n.id === 'hub_net_worth_change');
    expect(hub).toBeDefined();
    expect(hub!.label).toBe('Net Worth Increase');
    expect(hub!.netWorthChange).toBe(3500);
    expect(result.links.some(l => l.source === 'hub_net_worth_change' && l.target === 'use_net_wealth_generated')).toBe(false);

    // Market Gains
    // Brokerage: Beg 5000, End 6500. Delta = 1500. Tx = 1000 (transfer) + 100 (interest) = 1100.
    // Gap (Growth) = 400.
    const marketGains = result.nodes.find(n => n.id === 'inc_market_gains');
    expect(marketGains).toBeDefined();
    expect(marketGains!.value).toBe(400);

    // Balance Adjustments:
    // Checking ends $1,000 below tracked transaction activity, while mortgage principal paydown
    // increases net worth by $1,000. These should appear on opposite sides of the flow.
    const incAdjustments = result.nodes.find(n => n.id === 'inc_balance_adjustments');
    expect(incAdjustments).toBeDefined();
    expect(incAdjustments!.value).toBe(1000);

    const expAdjustments = result.nodes.find(n => n.id === 'exp_balance_adjustments');
    expect(expAdjustments).toBeDefined();
    expect(expAdjustments!.value).toBe(1000);
  });

  it('treats negative-balance mortgage paydown as positive wealth flow', async () => {
    mockAccounts = [
      { id: 'mortgage-1', userId: 'user_1', name: 'Mortgage', type: 'mortgage', currency: 'USD', isHidden: false, isExcludedFromNetWorth: false },
    ];

    mockSnapshots = [
      { accountId: 'mortgage-1', snapshotDate: '2026-05-31', balance: '-200000.00' },
      { accountId: 'mortgage-1', snapshotDate: '2026-06-30', balance: '-199000.00' },
    ];

    const result = await calculateWealthFlow('user_1', '2026-06', '2026-06', mockDek);

    expect(result.summary.beginningNetWorth).toBe(-200000);
    expect(result.summary.endingNetWorth).toBe(-199000);
    expect(result.summary.netWorthChange).toBe(1000);

    const incAdjustments = result.nodes.find(n => n.id === 'inc_balance_adjustments');
    expect(incAdjustments).toBeDefined();
    expect(incAdjustments!.value).toBe(1000);
    expect(result.nodes.find(n => n.id === 'exp_balance_adjustments')).toBeUndefined();
  });

  it('keeps a mortgage in beginning net worth when it is paid off during the selected period', async () => {
    mockAccounts = [
      {
        id: 'mortgage-1',
        userId: 'user_1',
        name: 'Mortgage',
        type: 'mortgage',
        currency: 'USD',
        isHidden: false,
        isExcludedFromNetWorth: false,
        metadata: { mortgageStatus: 'paid_off', payoffDate: '2026-06-15' },
      },
    ];

    mockSnapshots = [
      { accountId: 'mortgage-1', snapshotDate: '2026-05-31', balance: '-200000.00' },
    ];

    const result = await calculateWealthFlow('user_1', '2026-06', '2026-06', mockDek);

    expect(result.summary.beginningNetWorth).toBe(-200000);
    expect(result.summary.endingNetWorth).toBe(0);
    expect(result.summary.netWorthChange).toBe(200000);

    const incAdjustments = result.nodes.find(n => n.id === 'inc_balance_adjustments');
    expect(incAdjustments).toBeDefined();
    expect(incAdjustments!.value).toBe(200000);
  });

  it('handles reconciliation gap by routing surplus/deficit', async () => {
    mockAccounts = [{ id: 'checking-1', userId: 'u1', name: 'C', type: 'checking', currency: 'USD', isHidden: false, isExcludedFromNetWorth: false }];
    mockSnapshots = [
      { accountId: 'checking-1', snapshotDate: '2026-05-31', balance: '1000.00' },
      { accountId: 'checking-1', snapshotDate: '2026-06-30', balance: '2000.00' }, // Delta = 1000
    ];
    mockTransactions = []; // No transactions = 1000 Balance Adjustment
    const result = await calculateWealthFlow('user_1', '2026-06', '2026-06', mockDek);
    const incAdjustments = result.nodes.find(n => n.id === 'inc_balance_adjustments');
    expect(incAdjustments).toBeDefined();
    expect(incAdjustments!.value).toBe(1000);
    const nwIncrease = result.nodes.find(n => n.id === 'use_net_wealth_generated');
    expect(nwIncrease).toBeUndefined();
    const hub = result.nodes.find(n => n.id === 'hub_net_worth_change');
    expect(hub).toBeDefined();
    expect(hub!.netWorthChange).toBe(1000);
  });

  it('classifies nodes with correct groups for net worth decrease scenario', async () => {
    mockAccounts = [{ id: 'checking-1', userId: 'u1', name: 'C', type: 'checking', currency: 'USD', isHidden: false, isExcludedFromNetWorth: false }];
    mockSnapshots = [
      { accountId: 'checking-1', snapshotDate: '2026-05-31', balance: '3000.00' },
      { accountId: 'checking-1', snapshotDate: '2026-06-30', balance: '1000.00' }, // Delta = -2000
    ];
    mockTransactions = [
      { id: 't1', accountId: 'checking-1', amount: '-2000.00', date: '2026-06-15', categoryId: 'c-exp', categoryName: 'Exp', categoryType: 'standard', isIncome: false, excludeFromReports: false, parentId: null, categoryColor: '#000', payee: 'X' },
    ];
    const result = await calculateWealthFlow('user_1', '2026-06', '2026-06', mockDek);
    
    // NW decrease is represented as the central hub imbalance, not as a flow node.
    const nwDecrease = result.nodes.find(n => n.id === 'inc_net_wealth_lost');
    expect(nwDecrease).toBeUndefined();
    const hub = result.nodes.find(n => n.id === 'hub_net_worth_change');
    expect(hub).toBeDefined();
    expect(hub!.label).toBe('Net Worth Decrease');
    expect(hub!.netWorthChange).toBe(-2000);
    expect(result.links.some(l => l.source === 'inc_net_wealth_lost' && l.target === 'hub_net_worth_change')).toBe(false);
  });

  it('uses base currency from user settings', async () => {
    mockUserSettings = [{ currency: 'EUR' }];
    mockAccounts = [
      { id: 'acc-1', userId: 'user_1', name: 'Euro Checking', type: 'checking', currency: 'EUR', isHidden: false, isExcludedFromNetWorth: false },
    ];
    mockSnapshots = [
      { accountId: 'acc-1', snapshotDate: '2026-05-31', balance: '100.00' },
      { accountId: 'acc-1', snapshotDate: '2026-06-30', balance: '200.00' },
    ];
    const result = await calculateWealthFlow('user_1', '2026-06', '2026-06', mockDek);
    expect(result.summary.baseCurrency).toBe('EUR');
    expect(result.summary.netWorthChange).toBe(100);
  });
});
