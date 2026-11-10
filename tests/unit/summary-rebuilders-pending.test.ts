import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  updateCategorySpendingSummaries,
  updateCategoryIncomeSummaries,
  updateMonthlyCashFlowSummaries,
} from '@/lib/services/sync/summary-rebuilders';
import * as searchCache from '@/lib/services/search-cache';
import * as dbModule from '@/lib/db';

vi.mock('@/lib/db');
vi.mock('@/lib/server-cache', () => ({
  invalidateUserServerCache: vi.fn(),
}));
vi.mock('@/lib/services/notifications', () => ({
  checkBudgetsAndNotify: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/crypto', () => ({
  decryptField: vi.fn(async (val: string) => val),
  encryptRow: vi.fn(async (_table: string, row: any) => row),
  encryptField: vi.fn(async (val: string) => val),
}));

describe('Summary Rebuilders - Pending Transactions Exclusion', () => {
  const userId = 'user_test_pending';
  const testDek = new Uint8Array(32);

  let insertedSpending: any[] = [];
  let insertedIncome: any[] = [];
  let insertedCashFlow: any[] = [];

  beforeEach(() => {
    insertedSpending = [];
    insertedIncome = [];
    insertedCashFlow = [];
    vi.clearAllMocks();

    const createWhereResult = (rows: any[]) => {
      const p = Promise.resolve(rows) as any;
      p.limit = vi.fn().mockImplementation((n: number) => Promise.resolve(rows.slice(0, n)));
      return p;
    };

    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockImplementation((table: any) => ({
          where: vi.fn().mockImplementation(() => {
            return createWhereResult([
              {
                id: 'acc_1',
                userId,
                type: 'checking',
                isHidden: false,
                isExcludedFromNetWorth: false,
                paystubEnabled: false,
              },
              {
                id: 'cat_rent',
                userId,
                name: 'Rent / Mortgage',
                categoryType: 'standard',
                isIncome: false,
                excludeFromReports: false,
              },
              {
                id: 'cat_sal',
                userId,
                name: 'Salary',
                categoryType: 'standard',
                isIncome: true,
                excludeFromReports: false,
              },
            ]);
          }),
          limit: vi.fn().mockResolvedValue([{ paystubEnabled: false }]),
        })),
      }),
      delete: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue({}),
      }),
      transaction: vi.fn(async (callback: any) => {
        const txDb = {
          delete: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue({}),
          }),
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockImplementation((rows: any[]) => {
              insertedSpending.push(...rows);
              return {
                onConflictDoUpdate: vi.fn().mockResolvedValue({}),
              };
            }),
          }),
        };
        return callback(txDb);
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockImplementation((rows: any[]) => {
          insertedCashFlow.push(...rows);
          insertedIncome.push(...rows);
          return {
            onConflictDoUpdate: vi.fn().mockResolvedValue({}),
          };
        }),
      }),
    };

    vi.spyOn(dbModule, 'getDb').mockReturnValue(mockDb as any);
  });

  it('excludes pending transactions from category spending summary', async () => {
    const mockTxns: searchCache.CachedTransaction[] = [
      {
        description: 'Rent Nov (Posted)',
        payee: 'Landlord',
        notes: '',
        categoryName: 'Rent / Mortgage',
        accountName: 'Checking',
        amount: '-2000.00',
        categoryId: 'cat_rent',
        accountId: 'acc_1',
        date: '2026-11-02',
        ignored: false,
        source: 'bank',
        parentId: null,
        pending: false,
      },
      {
        description: 'Rent Dec (Pending)',
        payee: 'Landlord',
        notes: '',
        categoryName: 'Rent / Mortgage',
        accountName: 'Checking',
        amount: '-2000.00',
        categoryId: 'cat_rent',
        accountId: 'acc_1',
        date: '2026-11-30',
        ignored: false,
        source: 'bank',
        parentId: null,
        pending: true, // Should be excluded!
      },
    ];

    vi.spyOn(searchCache, 'getUserTransactionsFromCache').mockResolvedValue(mockTxns);

    const result = await updateCategorySpendingSummaries(userId, testDek);

    expect(result.categoryRows).toBe(1);
    expect(insertedSpending.length).toBe(1);
    expect(insertedSpending[0]).toMatchObject({
      categoryId: 'cat_rent',
      yearMonth: '2026-11',
      amount: '2000.00', // only the posted $2000, NOT $4000
      transactionCount: '1',
    });
  });

  it('excludes pending transactions from monthly cash flow summary', async () => {
    const mockTxns: searchCache.CachedTransaction[] = [
      {
        description: 'Salary (Posted)',
        payee: 'Employer',
        notes: '',
        categoryName: 'Salary',
        accountName: 'Checking',
        amount: '5000.00',
        categoryId: 'cat_sal',
        accountId: 'acc_1',
        date: '2026-11-01',
        ignored: false,
        source: 'bank',
        parentId: null,
        pending: false,
      },
      {
        description: 'Pending Bonus',
        payee: 'Employer',
        notes: '',
        categoryName: 'Salary',
        accountName: 'Checking',
        amount: '1000.00',
        categoryId: 'cat_sal',
        accountId: 'acc_1',
        date: '2026-11-15',
        ignored: false,
        source: 'bank',
        parentId: null,
        pending: true, // Should be excluded!
      },
      {
        description: 'Rent Nov (Posted)',
        payee: 'Landlord',
        notes: '',
        categoryName: 'Rent / Mortgage',
        accountName: 'Checking',
        amount: '-2000.00',
        categoryId: 'cat_rent',
        accountId: 'acc_1',
        date: '2026-11-02',
        ignored: false,
        source: 'bank',
        parentId: null,
        pending: false,
      },
      {
        description: 'Rent Dec (Pending)',
        payee: 'Landlord',
        notes: '',
        categoryName: 'Rent / Mortgage',
        accountName: 'Checking',
        amount: '-2000.00',
        categoryId: 'cat_rent',
        accountId: 'acc_1',
        date: '2026-11-30',
        ignored: false,
        source: 'bank',
        parentId: null,
        pending: true, // Should be excluded!
      },
    ];

    vi.spyOn(searchCache, 'getUserTransactionsFromCache').mockResolvedValue(mockTxns);

    const result = await updateMonthlyCashFlowSummaries(userId, testDek);

    expect(result.monthsUpdated).toBe(1);
    expect(result.transactionsProcessed).toBe(2); // Only the 2 posted transactions
  });
});
