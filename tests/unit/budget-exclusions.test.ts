import { vi, describe, it, expect, beforeEach } from 'vitest';
import { GET } from '@/app/api/budgets/route';
import { budgets, categories, userSettings, accounts, transactions, transactionTags } from '@/lib/db/schema';

// Mock auth
vi.mock('@/lib/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: 'test-user-id' } }),
}));

// Mock crypto context
vi.mock('@/lib/crypto-context', () => ({
  getSessionDEK: vi.fn().mockResolvedValue(new Uint8Array(32)),
}));

// Mock crypto
vi.mock('@/lib/crypto', () => ({
  decryptField: vi.fn().mockImplementation((val) => Promise.resolve(val)),
  decryptRows: vi.fn().mockImplementation((_table, rows) => Promise.resolve(rows)),
  encryptRow: vi.fn().mockImplementation((_table, data) => Promise.resolve(data)),
}));

vi.mock('@/lib/db/seed-categories', () => ({
  ensureCategoryDiscretionaryColumn: vi.fn().mockResolvedValue(undefined),
}));

const mockDbState = {
  budgets: [] as any[],
  categories: [] as any[],
  userSettings: [] as any[],
  accounts: [] as any[],
  transactions: [] as any[],
  transactionTags: [] as any[],
};

vi.mock('@/lib/db', () => ({
  getDb: () => ({
    select: vi.fn().mockImplementation(() => ({
      from: vi.fn().mockImplementation((table) => ({
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockImplementation(() => {
          let res: any[] = [];
          if (table === budgets) res = mockDbState.budgets;
          else if (table === categories) res = mockDbState.categories;
          else if (table === userSettings) res = mockDbState.userSettings;
          else if (table === accounts) res = mockDbState.accounts;
          else if (table === transactions) res = mockDbState.transactions;
          else if (table === transactionTags) res = mockDbState.transactionTags;

          return {
            limit: vi.fn().mockResolvedValue(res),
            then: (onfulfilled: any) => Promise.resolve(res).then(onfulfilled),
          };
        }),
      })),
    })),
  }),
}));

describe('Budget Exclusions & Ignored Items', () => {
  beforeEach(() => {
    mockDbState.budgets = [];
    mockDbState.categories = [
      {
        id: 'cat-groceries',
        name: 'Groceries',
        color: '#10b981',
        parentId: null,
        isIncome: false,
        categoryType: 'standard',
        excludeFromReports: false,
        isDiscretionary: true,
      },
      {
        id: 'cat-reimbursable',
        name: 'Reimbursable Work Expense',
        color: '#f59e0b',
        parentId: null,
        isIncome: false,
        categoryType: 'standard',
        excludeFromReports: false,
        isDiscretionary: true,
      },
      {
        id: 'cat-transfer',
        name: 'Transfer to Savings',
        color: '#6b7280',
        parentId: null,
        isIncome: false,
        categoryType: 'transfer',
        excludeFromReports: false,
        isDiscretionary: false,
      },
    ];
    mockDbState.userSettings = [
      {
        userId: 'test-user-id',
        budgetExclusions: {
          categoryIds: ['cat-reimbursable'],
          tagIds: ['tag-split'],
        },
      },
    ];
    mockDbState.accounts = [];
    mockDbState.transactions = [];
    mockDbState.transactionTags = [];
  });

  it('omits transactions in custom excluded categories from budget actuals and unbudgeted breakout', async () => {
    mockDbState.budgets = [
      {
        id: 'b-groceries',
        userId: 'test-user-id',
        categoryId: 'cat-groceries',
        amount: '400.00',
        periodType: 'monthly',
        isRecurring: true,
        effectiveFrom: '2026-01',
        effectiveTo: null,
        categoryName: 'Groceries',
        categoryColor: '#10b981',
        isIncome: false,
        categoryType: 'standard',
        isDiscretionary: true,
      },
    ];

    mockDbState.transactions = [
      {
        id: 'tx-1',
        userId: 'test-user-id',
        categoryId: 'cat-groceries',
        amount: '-150.00',
        date: '2026-08-10',
        deleted: false,
        ignored: false,
      },
      {
        id: 'tx-2',
        userId: 'test-user-id',
        categoryId: 'cat-reimbursable',
        amount: '-300.00',
        date: '2026-08-12',
        deleted: false,
        ignored: false,
      },
    ];

    const req = new Request('http://localhost:3000/api/budgets?periodType=monthly&periodKey=2026-08');
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    // Groceries budget has actual 150
    const groceries = data.budgets.find((b: any) => b.categoryId === 'cat-groceries');
    expect(groceries).toBeDefined();
    expect(groceries.actual).toBe(150);

    // Reimbursable expense is custom-excluded, so it does not appear in Everything Else breakout
    const catchAll = data.budgets.find((b: any) => b.isEverythingElse);
    if (catchAll && catchAll.groupedBreakout) {
      const reimbursable = catchAll.groupedBreakout.find((i: any) => i.categoryId === 'cat-reimbursable');
      expect(reimbursable).toBeUndefined();
    }
  });

  it('omits transactions marked with excluded tags from budget actuals', async () => {
    mockDbState.budgets = [
      {
        id: 'b-groceries',
        userId: 'test-user-id',
        categoryId: 'cat-groceries',
        amount: '400.00',
        periodType: 'monthly',
        isRecurring: true,
        effectiveFrom: '2026-01',
        effectiveTo: null,
        categoryName: 'Groceries',
        categoryColor: '#10b981',
        isIncome: false,
        categoryType: 'standard',
        isDiscretionary: true,
      },
    ];

    mockDbState.transactions = [
      {
        id: 'tx-1',
        userId: 'test-user-id',
        categoryId: 'cat-groceries',
        amount: '-100.00',
        date: '2026-08-05',
        deleted: false,
        ignored: false,
      },
      {
        id: 'tx-2',
        userId: 'test-user-id',
        categoryId: 'cat-groceries',
        amount: '-80.00',
        date: '2026-08-06',
        deleted: false,
        ignored: false,
      },
    ];

    // tx-2 has excluded tag 'tag-split'
    mockDbState.transactionTags = [
      {
        transactionId: 'tx-2',
        tagId: 'tag-split',
      },
    ];

    const req = new Request('http://localhost:3000/api/budgets?periodType=monthly&periodKey=2026-08');
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    const groceries = data.budgets.find((b: any) => b.categoryId === 'cat-groceries');
    expect(groceries).toBeDefined();
    // Only tx-1 (-100) counted, tx-2 was excluded via tag
    expect(groceries.actual).toBe(100);
  });

  it('omits default system exclusions (transfers) from Everything Else', async () => {
    mockDbState.transactions = [
      {
        id: 'tx-transfer',
        userId: 'test-user-id',
        categoryId: 'cat-transfer',
        amount: '-500.00',
        date: '2026-08-01',
        deleted: false,
        ignored: false,
      },
    ];

    const req = new Request('http://localhost:3000/api/budgets?periodType=monthly&periodKey=2026-08');
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    // Transfers are never in Everything Else
    const catchAll = data.budgets.find((b: any) => b.isEverythingElse);
    if (catchAll && catchAll.groupedBreakout) {
      const transferItem = catchAll.groupedBreakout.find((i: any) => i.categoryId === 'cat-transfer');
      expect(transferItem).toBeUndefined();
    }
  });
});
