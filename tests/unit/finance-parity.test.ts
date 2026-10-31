import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCashFlowSummary, getMonthlyCashFlow } from '@/lib/finance/cash-flow';
import { getCategorySpending } from '@/lib/finance/categories';
import { getCurrentNetWorth, getNetWorthSeries } from '@/lib/finance/net-worth';
import type { FinanceContext } from '@/lib/finance/context';

const mockDbState = {
  monthlyCashFlow: [] as any[],
  categorySpendingSummary: [] as any[],
  categories: [] as any[],
  netWorthSnapshots: [] as any[],
};

vi.mock('@/lib/db', () => ({
  getDb: () => ({
    select: () => ({
      from: (table: any) => ({
        where: () => ({
          orderBy: () => {
            const tableName = table[Symbol.for('drizzle:Name')] || '';
            let res: any[] = [];
            if (tableName === 'monthly_cash_flow') res = mockDbState.monthlyCashFlow;
            if (tableName === 'net_worth_snapshots') res = mockDbState.netWorthSnapshots;
            return Promise.resolve(res);
          },
          limit: () => Promise.resolve([]),
          then: (onfulfilled: any) => {
            const tableName = table[Symbol.for('drizzle:Name')] || '';
            let res: any[] = [];
            if (tableName === 'monthly_cash_flow') res = mockDbState.monthlyCashFlow;
            if (tableName === 'category_spending_summary') res = mockDbState.categorySpendingSummary;
            if (tableName === 'categories') res = mockDbState.categories;
            if (tableName === 'net_worth_snapshots') res = mockDbState.netWorthSnapshots;
            return Promise.resolve(res).then(onfulfilled);
          },
        }),
      }),
    }),
  }),
}));

vi.mock('@/lib/crypto', () => ({
  decryptField: vi.fn(async (val: string) => val),
  decryptRows: vi.fn(async (_table, rows) => rows),
}));

describe('Finance Services Parity', () => {
  const dek = new Uint8Array([1, 2, 3]);
  const mockCtx: FinanceContext = {
    userId: 'user-1',
    dek,
    settings: {
      currency: 'USD',
      timezone: 'America/New_York',
      showImportedData: { global: true, cashFlowProjections: true },
    } as any,
    now: new Date('2026-06-15T12:00:00Z'),
    getAccounts: async () => [
      {
        id: 'acc-1',
        userId: 'user-1',
        name: 'Checking',
        type: 'checking',
        balance: '5000',
        currency: 'USD',
        isExcludedFromNetWorth: false,
        isHidden: false,
      } as any,
      {
        id: 'acc-2',
        userId: 'user-1',
        name: 'Credit Card',
        type: 'credit',
        balance: '1000',
        currency: 'USD',
        isExcludedFromNetWorth: false,
        isHidden: false,
      } as any,
    ],
  };

  beforeEach(() => {
    mockDbState.monthlyCashFlow = [
      {
        userId: 'user-1',
        yearMonth: '2026-06',
        totalIncome: '6000',
        totalExpenses: '4000',
        netCashFlow: '2000',
      },
      {
        userId: 'user-1',
        yearMonth: '2026-05',
        totalIncome: '5500',
        totalExpenses: '3500',
        netCashFlow: '2000',
      },
    ];
    mockDbState.categorySpendingSummary = [
      {
        categoryId: 'cat-groceries',
        amount: '800',
        transactionCount: 8,
        yearMonth: '2026-06',
        userId: 'user-1',
      },
      {
        categoryId: 'cat-dining',
        amount: '400',
        transactionCount: 4,
        yearMonth: '2026-06',
        userId: 'user-1',
      },
    ];
    mockDbState.categories = [
      { id: 'cat-groceries', name: 'Groceries', color: '#10B981', excludeFromReports: false },
      { id: 'cat-dining', name: 'Dining Out', color: '#F59E0B', excludeFromReports: false },
    ];
    mockDbState.netWorthSnapshots = [
      {
        snapshotDate: '2026-05-31',
        netWorth: '4000',
        totalAssets: '5000',
        totalLiabilities: '1000',
      },
    ];
  });

  it('getCashFlowSummary calculates income, expenses, and savings rate', async () => {
    const summary = await getCashFlowSummary(mockCtx);
    expect(summary.totalIncome).toBe(6000);
    expect(summary.totalExpenses).toBe(4000);
    expect(summary.netIncome).toBe(2000);
    expect(summary.currentMonth).toBe('2026-06');
    expect(summary.previousMonth).toBe('2026-05');
  });

  it('getMonthlyCashFlow returns parsed monthly points', async () => {
    const series = await getMonthlyCashFlow(mockCtx, 3);
    expect(series.length).toBe(2);
    expect(series[0].yearMonth).toBe('2026-06');
    expect(series[0].netCashFlow).toBe(2000);
  });

  it('getCategorySpending aggregates totals descending', async () => {
    const cats = await getCategorySpending(mockCtx, {
      startMonth: '2026-06',
      endMonth: '2026-06',
      groupBy: 'total',
    });
    expect(cats.length).toBe(2);
    expect(cats[0].name).toBe('Groceries');
    expect(cats[0].amount).toBe(800);
    expect(cats[1].name).toBe('Dining Out');
    expect(cats[1].amount).toBe(400);
  });

  it('getCurrentNetWorth computes assets, liabilities and net worth from live accounts', async () => {
    const nw = await getCurrentNetWorth(mockCtx);
    expect(nw.totalAssets).toBe(5000);
    expect(nw.totalLiabilities).toBe(1000);
    expect(nw.netWorth).toBe(4000);
  });

  it('getNetWorthSeries includes snapshots plus live point for today', async () => {
    const series = await getNetWorthSeries(mockCtx, { months: 2 });
    expect(series.length).toBeGreaterThanOrEqual(1);
    expect(series[series.length - 1].date).toBe('2026-06-15');
    expect(series[series.length - 1].netWorth).toBe(4000);
  });
});
