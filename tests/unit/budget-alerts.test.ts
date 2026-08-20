// @vitest-environment jsdom
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { checkBudgetsAndNotify } from '@/lib/services/notifications';

// Mock web-push
vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(async () => ({ statusCode: 201 })),
  },
}));

// Mock crypto
vi.mock('@/lib/crypto', () => ({
  decryptField: vi.fn(async (val) => val),
  encryptField: vi.fn(async (val) => val),
}));

let mockUserSettings: any = {};
let mockBudgets: any[] = [];
let mockCategories: any[] = [];
let mockTransactions: any[] = [];
let insertedNotifications: any[] = [];

import { getTableName } from 'drizzle-orm';

class MockDbQueryBuilder {
  private table: any;

  constructor(table?: any) {
    this.table = table;
  }

  select(...args: any[]) { return this; }
  from(table: any) { this.table = table; return this; }
  leftJoin(table: any, ...args: any[]) { return this; }
  where(...args: any[]) { return this; }
  limit(...args: any[]) { return this; }
  orderBy(...args: any[]) { return this; }
  insert(table: any) { this.table = table; return this; }
  values(val: any) {
    const name = getTableName(this.table);
    if (name === 'user_notifications') {
      insertedNotifications.push(val);
    }
    return this;
  }
  onConflictDoNothing(config?: any) { return this; }
  returning(...args: any[]) { return this; }

  then(onfulfilled?: (value: any) => any) {
    let resolvedVal: any = [];
    const name = getTableName(this.table);
    if (name === 'user_settings') {
      resolvedVal = [mockUserSettings];
    } else if (name === 'budgets') {
      resolvedVal = mockBudgets;
    } else if (name === 'categories') {
      resolvedVal = mockCategories;
    } else if (name === 'transactions') {
      resolvedVal = mockTransactions;
    } else if (name === 'accounts') {
      resolvedVal = [];
    } else if (name === 'transaction_tags') {
      resolvedVal = [];
    } else if (name === 'push_subscriptions') {
      resolvedVal = [];
    } else if (name === 'user_notifications') {
      resolvedVal = [{ id: 'notif-123' }];
    } else if (name === 'sent_notifications') {
      resolvedVal = [{ id: 'sent-123' }];
    }
    return Promise.resolve(resolvedVal).then(onfulfilled);
  }
}

vi.mock('@/lib/db', () => ({
  getDb: () => new MockDbQueryBuilder(),
}));

describe('checkBudgetsAndNotify', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertedNotifications = [];

    // Set default user settings
    mockUserSettings = {
      userId: 'user-1',
      notifyBudgetAlerts: true,
      budgetAlertThreshold: 80,
    };

    // Set up a mock budget of $100 for category 'Food'
    mockBudgets = [
      {
        id: 'budget-1',
        categoryId: 'cat-food',
        amount: '100',
        isRecurring: true,
        yearMonth: null,
        notes: null,
        categoryName: 'Food',
        isIncome: false,
        categoryType: 'expense',
      },
    ];

    // Set up categories list
    mockCategories = [
      {
        id: 'cat-food',
        name: 'Food',
        parentId: null,
        isIncome: false,
      },
    ];
  });

  it('does not alert if spending is below warning threshold', async () => {
    // Spent 50 out of 100 (50%, below 80% threshold)
    mockTransactions = [
      { amount: '-50' },
    ];

    await checkBudgetsAndNotify('user-1', new Uint8Array());

    expect(insertedNotifications.length).toBe(0);
  });

  it('sends a warning alert showing 100% when budget is exactly full', async () => {
    // Spent exactly 100 out of 100 (100% full, but not exceeded)
    mockTransactions = [
      { amount: '-100' },
    ];

    await checkBudgetsAndNotify('user-1', new Uint8Array());

    expect(insertedNotifications.length).toBe(1);
    expect(insertedNotifications[0].title).toBe('Budget Warning: Food');
    expect(insertedNotifications[0].body).toContain("You've spent $100 (100%) of your $100 budget for Food.");
  });

  it('sends a warning alert showing actual percentage spent when above threshold but below full', async () => {
    // Spent 90 out of 100 (90%)
    mockTransactions = [
      { amount: '-90' },
    ];

    await checkBudgetsAndNotify('user-1', new Uint8Array());

    expect(insertedNotifications.length).toBe(1);
    expect(insertedNotifications[0].title).toBe('Budget Warning: Food');
    expect(insertedNotifications[0].body).toContain("You've spent $90 (90%) of your $100 budget for Food.");
  });

  it('sends an exceeded alert when budget is strictly exceeded', async () => {
    // Spent 101 out of 100 (exceeded)
    mockTransactions = [
      { amount: '-101' },
    ];

    await checkBudgetsAndNotify('user-1', new Uint8Array());

    expect(insertedNotifications.length).toBe(1);
    expect(insertedNotifications[0].title).toBe('Budget Exceeded: Food');
    expect(insertedNotifications[0].body).toContain("You've spent $101 of your $100 budget for Food.");
  });

  it('handles 410 Gone push failure gracefully', async () => {
    const webpush = (await import('web-push')).default;
    const error410 = Object.assign(new Error('Gone'), { statusCode: 410 });
    vi.mocked(webpush.sendNotification).mockRejectedValueOnce(error410);

    mockTransactions = [
      { amount: '-150' },
    ];

    // Should complete without throwing
    await expect(checkBudgetsAndNotify('user-1', new Uint8Array())).resolves.not.toThrow();
    expect(insertedNotifications.length).toBe(1);
  });

  it('does not double count child category spending against parent when child has direct budget', async () => {
    // Parent: Food ($300), Child: Groceries ($500)
    mockBudgets = [
      {
        id: 'budget-parent',
        categoryId: 'cat-food',
        amount: '300',
        isRecurring: true,
        yearMonth: null,
        notes: null,
        categoryName: 'Food',
        isIncome: false,
        categoryType: 'expense',
      },
      {
        id: 'budget-child',
        categoryId: 'cat-groceries',
        amount: '500',
        isRecurring: true,
        yearMonth: null,
        notes: null,
        categoryName: 'Groceries',
        isIncome: false,
        categoryType: 'expense',
      },
    ];

    mockCategories = [
      { id: 'cat-food', name: 'Food', parentId: null, isIncome: false },
      { id: 'cat-groceries', name: 'Groceries', parentId: 'cat-food', isIncome: false },
    ];

    // Spent $400 on groceries (under 500 grocery budget) and $0 direct on food
    mockTransactions = [
      { amount: '-400', categoryId: 'cat-groceries' },
    ];

    await checkBudgetsAndNotify('user-1', new Uint8Array());

    // Groceries is at $400 / $500 = 80%, so it gets a warning alert.
    // BUT Food should NOT get an alert because Groceries has its own budget!
    expect(insertedNotifications.length).toBe(1);
    expect(insertedNotifications[0].title).toBe('Budget Warning: Groceries');
  });

  it('ignores retired recurring budgets whose effectiveTo is in the past', async () => {
    mockBudgets = [
      {
        id: 'budget-retired',
        categoryId: 'cat-food',
        amount: '100',
        isRecurring: true,
        effectiveFrom: '2020-01',
        effectiveTo: '2020-12', // Expired
        yearMonth: null,
        notes: null,
        categoryName: 'Food',
        isIncome: false,
        categoryType: 'expense',
      },
    ];

    mockTransactions = [
      { amount: '-150' },
    ];

    await checkBudgetsAndNotify('user-1', new Uint8Array());

    expect(insertedNotifications.length).toBe(0);
  });
});
