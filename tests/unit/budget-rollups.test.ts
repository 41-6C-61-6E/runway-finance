import { vi, describe, it, expect, beforeEach } from 'vitest';
import { GET } from '@/app/api/budgets/route';
import { budgets, categories, userSettings, accounts, transactions } from '@/lib/db/schema';

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

          return {
            limit: vi.fn().mockResolvedValue(res),
            then: (onfulfilled: any) => Promise.resolve(res).then(onfulfilled),
          };
        }),
      })),
    })),
  }),
}));

describe('Budget Timeframe Rollups', () => {
  beforeEach(() => {
    mockDbState.budgets = [];
    mockDbState.categories = [
      {
        id: 'cat-groceries',
        name: 'Groceries',
        color: '#10b981',
        parentId: null,
        isIncome: false,
        categoryType: 'expense',
        excludeFromReports: false,
        isDiscretionary: true,
      },
      {
        id: 'cat-insurance',
        name: 'Insurance',
        color: '#6366f1',
        parentId: null,
        isIncome: false,
        categoryType: 'expense',
        excludeFromReports: false,
        isDiscretionary: false,
      },
      {
        id: 'cat-salary',
        name: 'Salary',
        color: '#22c55e',
        parentId: null,
        isIncome: true,
        categoryType: 'income',
        excludeFromReports: false,
        isDiscretionary: false,
      },
    ];
    mockDbState.userSettings = [{ userId: 'test-user-id' }];
    mockDbState.accounts = [];
    mockDbState.transactions = [];
  });

  it('monthly budget rolls into quarterly view with 3x amount and nativePeriodType="monthly"', async () => {
    mockDbState.budgets = [
      {
        id: 'b-1',
        userId: 'test-user-id',
        categoryId: 'cat-groceries',
        amount: '500.00',
        periodType: 'monthly',
        isRecurring: true,
        effectiveFrom: '2026-01',
        effectiveTo: null,
        categoryName: 'Groceries',
        categoryColor: '#10b981',
        isIncome: false,
        categoryType: 'expense',
        isDiscretionary: true,
      },
    ];

    const req = new Request('http://localhost:3000/api/budgets?periodType=quarterly&periodKey=2026-Q3');
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.budgets).toHaveLength(1);
    const item = data.budgets[0];
    expect(item.categoryId).toBe('cat-groceries');
    expect(item.nativePeriodType).toBe('monthly');
    expect(item.nativeAmount).toBe(500);
    expect(item.budgeted).toBe(1500); // 500 * 3
  });

  it('monthly budget rolls into yearly view with 12x amount and nativePeriodType="monthly"', async () => {
    mockDbState.budgets = [
      {
        id: 'b-1',
        userId: 'test-user-id',
        categoryId: 'cat-groceries',
        amount: '500.00',
        periodType: 'monthly',
        isRecurring: true,
        effectiveFrom: '2026-01',
        effectiveTo: null,
        categoryName: 'Groceries',
        categoryColor: '#10b981',
        isIncome: false,
        categoryType: 'expense',
        isDiscretionary: true,
      },
    ];

    const req = new Request('http://localhost:3000/api/budgets?periodType=yearly&periodKey=2026');
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.budgets).toHaveLength(1);
    const item = data.budgets[0];
    expect(item.categoryId).toBe('cat-groceries');
    expect(item.nativePeriodType).toBe('monthly');
    expect(item.nativeAmount).toBe(500);
    expect(item.budgeted).toBe(6000); // 500 * 12
  });

  it('quarterly budget rolls into yearly view with 4x amount and nativePeriodType="quarterly"', async () => {
    mockDbState.budgets = [
      {
        id: 'b-2',
        userId: 'test-user-id',
        categoryId: 'cat-insurance',
        amount: '1200.00',
        periodType: 'quarterly',
        isRecurring: true,
        effectiveFrom: '2026-Q1',
        effectiveTo: null,
        categoryName: 'Insurance',
        categoryColor: '#6366f1',
        isIncome: false,
        categoryType: 'expense',
        isDiscretionary: false,
      },
    ];

    const req = new Request('http://localhost:3000/api/budgets?periodType=yearly&periodKey=2026');
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.budgets).toHaveLength(1);
    const item = data.budgets[0];
    expect(item.categoryId).toBe('cat-insurance');
    expect(item.nativePeriodType).toBe('quarterly');
    expect(item.nativeAmount).toBe(1200);
    expect(item.budgeted).toBe(4800); // 1200 * 4
  });

  it('direct quarterly budget overrides rolled-up monthly budget in quarterly view', async () => {
    mockDbState.budgets = [
      {
        id: 'b-monthly',
        userId: 'test-user-id',
        categoryId: 'cat-groceries',
        amount: '500.00',
        periodType: 'monthly',
        isRecurring: true,
        effectiveFrom: '2026-01',
        effectiveTo: null,
        categoryName: 'Groceries',
        categoryColor: '#10b981',
        isIncome: false,
      },
      {
        id: 'b-quarterly',
        userId: 'test-user-id',
        categoryId: 'cat-groceries',
        amount: '1800.00',
        periodType: 'quarterly',
        isRecurring: true,
        effectiveFrom: '2026-Q1',
        effectiveTo: null,
        categoryName: 'Groceries',
        categoryColor: '#10b981',
        isIncome: false,
      },
    ];

    const req = new Request('http://localhost:3000/api/budgets?periodType=quarterly&periodKey=2026-Q3');
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.budgets).toHaveLength(1);
    const item = data.budgets[0];
    expect(item.id).toBe('b-quarterly');
    expect(item.nativePeriodType).toBe('quarterly');
    expect(item.nativeAmount).toBe(1800);
    expect(item.budgeted).toBe(1800);
  });

  it('direct yearly budget overrides rolled-up quarterly and monthly budgets in yearly view', async () => {
    mockDbState.budgets = [
      {
        id: 'b-monthly',
        userId: 'test-user-id',
        categoryId: 'cat-groceries',
        amount: '500.00',
        periodType: 'monthly',
        isRecurring: true,
        effectiveFrom: '2026-01',
        effectiveTo: null,
        categoryName: 'Groceries',
        categoryColor: '#10b981',
        isIncome: false,
      },
      {
        id: 'b-yearly',
        userId: 'test-user-id',
        categoryId: 'cat-groceries',
        amount: '7000.00',
        periodType: 'yearly',
        isRecurring: true,
        effectiveFrom: '2026',
        effectiveTo: null,
        categoryName: 'Groceries',
        categoryColor: '#10b981',
        isIncome: false,
      },
    ];

    const req = new Request('http://localhost:3000/api/budgets?periodType=yearly&periodKey=2026');
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.budgets).toHaveLength(1);
    const item = data.budgets[0];
    expect(item.id).toBe('b-yearly');
    expect(item.nativePeriodType).toBe('yearly');
    expect(item.nativeAmount).toBe(7000);
    expect(item.budgeted).toBe(7000);
  });
});
