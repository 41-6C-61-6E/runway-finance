import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GET } from '@/app/api/cash-flow/savings-rate/route';
import { accounts, categories, userSettings } from '@/lib/db/schema';

// Mock auth
vi.mock('@/lib/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: 'test-user-id' } }),
}));

// Mock crypto context
vi.mock('@/lib/crypto-context', () => ({
  getSessionDEK: vi.fn().mockResolvedValue(new Uint8Array(32)),
}));

// Mock decryptRows
vi.mock('@/lib/crypto', () => ({
  decryptRows: vi.fn().mockImplementation((_table, rows) => Promise.resolve(rows)),
}));

// Mock search cache
const mockTransactions: any[] = [];
vi.mock('@/lib/services/search-cache', () => ({
  getUserTransactionsFromCache: vi.fn().mockImplementation(() => Promise.resolve(mockTransactions)),
}));

const mockDbState = {
  accounts: [] as any[],
  categories: [] as any[],
  userSettings: [] as any[],
};

vi.mock('@/lib/db', () => ({
  getDb: () => ({
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockImplementation((table) => {
      return {
        where: vi.fn().mockImplementation(() => {
          let res: any[] = [];
          if (table === accounts) res = mockDbState.accounts;
          if (table === categories) res = mockDbState.categories;
          if (table === userSettings) res = mockDbState.userSettings;
          return {
            limit: vi.fn().mockResolvedValue(res),
            then: (onfulfilled: any) => Promise.resolve(res).then(onfulfilled),
          };
        }),
      };
    }),
  }),
}));

describe('Savings Rate API Route', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-09T10:00:00Z'));

    mockTransactions.length = 0;
    mockDbState.accounts = [];
    mockDbState.categories = [];
    mockDbState.userSettings = [{ userId: 'test-user-id', paystubEnabled: false }];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calculates 0% savings when there is no income or savings', async () => {
    mockDbState.accounts = [
      { id: 'acc-checking', name: 'Checking', type: 'checking', userId: 'test-user-id', isHidden: false, isExcludedFromNetWorth: false },
    ];
    mockDbState.categories = [
      { id: 'cat-groceries', name: 'Groceries', categoryType: 'standard', isIncome: false, excludeFromReports: false },
    ];

    mockTransactions.push({
      id: 'tx-1',
      accountId: 'acc-checking',
      amount: '-150.00',
      date: '2026-06-15',
      categoryId: 'cat-groceries',
      categoryName: 'Groceries',
      ignored: false,
    });

    const request = new Request('http://localhost/api/cash-flow/savings-rate?months=2');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.length).toBe(1); // Only June contains transactions
    expect(data[0].yearMonth).toBe('2026-06');
    expect(data[0].income).toBe(0);
    expect(data[0].savingsRate).toBe(0);
    expect(data[0].savings.cash).toBe(-150.00); // Net cash flow is -150
  });

  it('calculates savings rate correctly with connected savings account transfers', async () => {
    mockDbState.accounts = [
      { id: 'acc-checking', name: 'Checking', type: 'checking', userId: 'test-user-id', isHidden: false, isExcludedFromNetWorth: false },
      { id: 'acc-savings', name: 'Savings Account', type: 'savings', userId: 'test-user-id', isHidden: false, isExcludedFromNetWorth: false },
    ];
    mockDbState.categories = [
      { id: 'cat-salary', name: 'Salary', categoryType: 'standard', isIncome: true, excludeFromReports: false },
      { id: 'cat-transfer', name: 'Transfer to Savings', categoryType: 'transfer', isIncome: false, excludeFromReports: false },
    ];

    // Inflow: $5000 salary
    mockTransactions.push({
      id: 'tx-1',
      accountId: 'acc-checking',
      amount: '5000.00',
      date: '2026-06-01',
      categoryId: 'cat-salary',
      categoryName: 'Salary',
      ignored: false,
    });

    // Checking outflow: transfer $2000 to savings (ignored because we have connected savings account)
    mockTransactions.push({
      id: 'tx-2',
      accountId: 'acc-checking',
      amount: '-2000.00',
      date: '2026-06-10',
      categoryId: 'cat-transfer',
      categoryName: 'Transfer to Savings',
      ignored: false,
    });

    // Savings inflow: transfer $2000 in (counted because savings is a connected savings account)
    mockTransactions.push({
      id: 'tx-3',
      accountId: 'acc-savings',
      amount: '2000.00',
      date: '2026-06-10',
      categoryId: 'cat-transfer',
      categoryName: 'Transfer to Savings',
      ignored: false,
    });

    const request = new Request('http://localhost/api/cash-flow/savings-rate?months=2');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data[0].income).toBe(5000);
    expect(data[0].savings.savingsAccount).toBe(2000);
    expect(data[0].savings.cash).toBe(3000); // 5000 income - 2000 savings transfer
    expect(data[0].savingsRate).toBe(1.0); // Total savings is 2000 + 3000 = 5000 (100% savings rate)
  });

  it('calculates savings rate correctly with paystub retirement deductions', async () => {
    mockDbState.userSettings = [{ userId: 'test-user-id', paystubEnabled: true }];
    mockDbState.accounts = [
      { id: 'acc-checking', name: 'Checking', type: 'checking', userId: 'test-user-id', isHidden: false, isExcludedFromNetWorth: false },
      { id: 'acc-paystub', name: 'From Paystub', type: 'paystub', userId: 'test-user-id', isHidden: true, isExcludedFromNetWorth: true },
    ];
    mockDbState.categories = [
      { id: 'cat-salary', name: 'Salary', categoryType: 'standard', isIncome: true, excludeFromReports: false },
      { id: 'cat-401k', name: '401k / Retirement', categoryType: 'compound', isIncome: true, excludeFromReports: false },
      { id: 'cat-taxes', name: 'Federal Withholding', categoryType: 'compound', isIncome: true, excludeFromReports: false },
    ];

    // Paystub gross income: $4000
    mockTransactions.push({
      id: 'tx-pay-gross',
      accountId: 'acc-paystub',
      amount: '4000.00',
      date: '2026-06-01',
      categoryId: 'cat-salary',
      categoryName: 'Salary',
      source: 'paystub',
      ignored: false,
    });

    // Paystub 401k deduction: -$400
    mockTransactions.push({
      id: 'tx-pay-401k',
      accountId: 'acc-paystub',
      amount: '-400.00',
      date: '2026-06-01',
      categoryId: 'cat-401k',
      categoryName: '401k / Retirement',
      source: 'paystub',
      ignored: false,
    });

    // Paystub tax deduction: -$800
    mockTransactions.push({
      id: 'tx-pay-taxes',
      accountId: 'acc-paystub',
      amount: '-800.00',
      date: '2026-06-01',
      categoryId: 'cat-taxes',
      categoryName: 'Federal Withholding',
      source: 'paystub',
      ignored: false,
    });

    // Net paycheck deposit in checking: $2800. Rent expense: -$1800.
    mockDbState.categories.push({ id: 'cat-rent', name: 'Rent', categoryType: 'standard', isIncome: false, excludeFromReports: false });
    mockTransactions.push({
      id: 'tx-rent',
      accountId: 'acc-checking',
      amount: '-1800.00',
      date: '2026-06-05',
      categoryId: 'cat-rent',
      categoryName: 'Rent',
      ignored: false,
    });

    const request = new Request('http://localhost/api/cash-flow/savings-rate?months=2');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    // Gross Income = 4000 (salary) + 400 (401k compound) + 800 (taxes compound) = 5200
    // Expenses = 400 (401k) + 800 (taxes) + 1800 (rent) = 3000
    // Net cash flow = 5200 - 3000 = 2200
    expect(data[0].income).toBe(5200);
    expect(data[0].savings.retirement).toBe(400); // From paystub
    expect(data[0].savings.cash).toBe(2200); // Surplus cash (net cash flow)
    expect(data[0].savingsRate).toBe(0.5); // (400 + 2200) / 5200 = 50%
  });

  it('supports custom filters: account exclusion, category exclusion, customized savings components, and adjust denominator', async () => {
    mockDbState.userSettings = [{ userId: 'test-user-id', paystubEnabled: true }];
    mockDbState.accounts = [
      { id: 'acc-checking', name: 'Checking', type: 'checking', userId: 'test-user-id', isHidden: false, isExcludedFromNetWorth: false },
      { id: 'acc-savings', name: 'Savings Account', type: 'savings', userId: 'test-user-id', isHidden: false, isExcludedFromNetWorth: false },
      { id: 'acc-paystub', name: 'From Paystub', type: 'paystub', userId: 'test-user-id', isHidden: true, isExcludedFromNetWorth: true },
    ];
    mockDbState.categories = [
      { id: 'cat-salary', name: 'Salary', categoryType: 'standard', isIncome: true, excludeFromReports: false },
      { id: 'cat-401k', name: '401k / Retirement', categoryType: 'compound', isIncome: true, excludeFromReports: false },
      { id: 'cat-rent', name: 'Rent', categoryType: 'standard', isIncome: false, excludeFromReports: false },
      { id: 'cat-dining', name: 'Dining Out', categoryType: 'standard', isIncome: false, excludeFromReports: false },
    ];

    // Paycheck income
    mockTransactions.push({
      id: 'tx-pay-gross',
      accountId: 'acc-paystub',
      amount: '4000.00',
      date: '2026-06-01',
      categoryId: 'cat-salary',
      categoryName: 'Salary',
      source: 'paystub',
      ignored: false,
    });

    // Paystub 401k deduction
    mockTransactions.push({
      id: 'tx-pay-401k',
      accountId: 'acc-paystub',
      amount: '-400.00',
      date: '2026-06-01',
      categoryId: 'cat-401k',
      categoryName: '401k / Retirement',
      source: 'paystub',
      ignored: false,
    });

    // Rent expense
    mockTransactions.push({
      id: 'tx-rent',
      accountId: 'acc-checking',
      amount: '-1500.00',
      date: '2026-06-05',
      categoryId: 'cat-rent',
      categoryName: 'Rent',
      ignored: false,
    });

    // Dining Out expense (to be excluded)
    mockTransactions.push({
      id: 'tx-dining',
      accountId: 'acc-checking',
      amount: '-200.00',
      date: '2026-06-07',
      categoryId: 'cat-dining',
      categoryName: 'Dining Out',
      ignored: false,
    });

    // 1. Account Exclusion Verification: Exclude checking account entirely (removes rent/dining)
    {
      const request = new Request('http://localhost/api/cash-flow/savings-rate?months=2&excludedAccounts=acc-checking');
      const response = await GET(request);
      const data = await response.json();
      expect(response.status).toBe(200);
      // Income = 4000 + 400 = 4400, Expenses = 400. Checking transactions (rent, dining) are excluded!
      expect(data[0].income).toBe(4400);
      expect(data[0].expenses).toBe(400);
    }

    // 2. Category Exclusion Verification: Exclude Dining Out category
    {
      const request = new Request('http://localhost/api/cash-flow/savings-rate?months=2&excludedCategories=cat-dining');
      const response = await GET(request);
      const data = await response.json();
      expect(response.status).toBe(200);
      // Income = 4400, Expenses = 400 (401k) + 1500 (rent) = 1900. Dining Out is excluded!
      expect(data[0].income).toBe(4400);
      expect(data[0].expenses).toBe(1900);
    }

    // 3. Custom Savings Components Verification: Include retirement, exclude cash
    {
      const request = new Request('http://localhost/api/cash-flow/savings-rate?months=2&savingsComponents=retirement');
      const response = await GET(request);
      const data = await response.json();
      expect(response.status).toBe(200);
      // Leftover cash/surplus should be 0 in response, retirement should be 400
      expect(data[0].savings.retirement).toBe(400);
      expect(data[0].savings.cash).toBe(0);
      // Savings rate = 400 / 4400 = 0.0909 (9.09%)
      expect(data[0].savingsRate).toBe(0.0909);
    }

    // 4. Denominator Adjustment Verification: adjustIncomeDenominator=true
    {
      const request = new Request('http://localhost/api/cash-flow/savings-rate?months=2&savingsComponents=retirement&adjustIncomeDenominator=true');
      const response = await GET(request);
      const data = await response.json();
      expect(response.status).toBe(200);
      // Income used for denominator should be: stats.income (4400) + paystubRetirement (400) = 4800
      // Savings rate = 400 / 4800 = 0.0833 (8.33%)
      expect(data[0].savingsRate).toBe(0.0833);
    }
  });
});
