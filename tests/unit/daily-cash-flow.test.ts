import { describe, it, expect } from 'vitest';
import {
  aggregateDailyCashFlow,
  type AggregationRow,
  type DecryptedCategoryInfo,
} from '@/lib/finance/daily-cash-flow';

describe('daily-cash-flow aggregation', () => {
  const catGroceries: DecryptedCategoryInfo = {
    id: 'cat-groceries',
    name: 'Groceries',
    color: '#10b981',
    isIncome: false,
    categoryType: 'standard',
  };
  const catSalary: DecryptedCategoryInfo = {
    id: 'cat-salary',
    name: 'Salary',
    color: '#059669',
    isIncome: true,
    categoryType: 'standard',
  };
  const catTransfer: DecryptedCategoryInfo = {
    id: 'cat-transfer',
    name: 'Transfer',
    color: '#6b7280',
    isIncome: false,
    categoryType: 'transfer',
  };
  const catCompound: DecryptedCategoryInfo = {
    id: 'cat-compound',
    name: 'Compound Flow',
    color: '#8b5cf6',
    isIncome: false,
    categoryType: 'compound',
  };
  const catExcluded: DecryptedCategoryInfo = {
    id: 'cat-excluded',
    name: 'Taxes Excluded',
    color: '#ef4444',
    isIncome: false,
    excludeFromReports: true,
  };
  const catChildOfExcluded: DecryptedCategoryInfo = {
    id: 'cat-child',
    name: 'Child Tax',
    color: '#ef4444',
    isIncome: false,
    parentId: 'cat-excluded',
  };

  const catMap = new Map<string, DecryptedCategoryInfo>([
    ['cat-groceries', catGroceries],
    ['cat-salary', catSalary],
    ['cat-transfer', catTransfer],
    ['cat-compound', catCompound],
    ['cat-excluded', catExcluded],
    ['cat-child', catChildOfExcluded],
  ]);

  it('aggregates daily cash flow correctly with classification and top items', async () => {
    const rows: AggregationRow[] = [
      {
        id: 'tx-1',
        date: '2026-10-14',
        amount: -86.5,
        categoryId: 'cat-groceries',
        pending: false,
        nameResolver: async () => 'Whole Foods',
      },
      {
        id: 'tx-2',
        date: '2026-10-14',
        amount: 3200,
        categoryId: 'cat-salary',
        pending: false,
        nameResolver: async () => 'Payroll ACME',
      },
      {
        id: 'tx-3',
        date: '2026-10-14',
        amount: -15.0,
        categoryId: null, // Uncategorized
        pending: true,
        nameResolver: async () => 'Coffee Shop',
      },
      {
        id: 'tx-4',
        date: '2026-10-14',
        amount: -500.0,
        categoryId: 'cat-transfer', // Transfer should be ignored for in/out and top items
        pending: false,
        nameResolver: async () => 'Savings Transfer',
      },
      {
        id: 'tx-5',
        date: '2026-10-14',
        amount: -100.0,
        categoryId: 'cat-excluded', // Excluded from reports
        pending: false,
        nameResolver: async () => 'Tax Payment',
      },
    ];

    const days = await aggregateDailyCashFlow(rows, catMap);

    expect(days).toHaveLength(1);
    const day = days[0];

    expect(day.date).toBe('2026-10-14');
    expect(day.income).toBe(3200);
    // Expenses: 86.5 (Groceries) + 15.0 (Uncategorized) = 101.5. Transfer & excluded not added
    expect(day.expenses).toBe(101.5);
    expect(day.net).toBe(3098.5);
    // Transaction count: 4 (Groceries, Salary, Coffee, Transfer). Excluded was skipped completely.
    expect(day.transactionCount).toBe(4);
    expect(day.pendingCount).toBe(1);

    // Top items: sorted by |amount| desc (Payroll 3200, Whole Foods 86.5, Coffee 15). Transfer excluded.
    expect(day.topItems).toHaveLength(3);
    expect(day.topItems[0]).toEqual({
      id: 'tx-2',
      name: 'Payroll ACME',
      amount: 3200,
      categoryColor: '#059669',
      pending: false,
    });
    expect(day.topItems[1]).toEqual({
      id: 'tx-1',
      name: 'Whole Foods',
      amount: -86.5,
      categoryColor: '#10b981',
      pending: false,
    });
    expect(day.topItems[2]).toEqual({
      id: 'tx-3',
      name: 'Coffee Shop',
      amount: -15,
      categoryColor: null,
      pending: true,
    });

    // Top categories: Groceries (86.5), Uncategorized (15)
    expect(day.topCategories).toHaveLength(2);
    expect(day.topCategories[0]).toEqual({
      categoryId: 'cat-groceries',
      name: 'Groceries',
      color: '#10b981',
      amount: 86.5,
    });
    expect(day.topCategories[1]).toEqual({
      categoryId: null,
      name: 'Uncategorized',
      color: null,
      amount: 15,
    });
  });

  it('handles refunds and compound categories across multiple days', async () => {
    const rows: AggregationRow[] = [
      {
        id: 'tx-10',
        date: '2026-10-12',
        amount: 25.0, // Refund to groceries
        categoryId: 'cat-groceries',
        pending: false,
        nameResolver: async () => 'Return Item',
      },
      {
        id: 'tx-11',
        date: '2026-10-15',
        amount: -50.0,
        categoryId: 'cat-compound', // Adds 50 to both income and expense
        pending: false,
        nameResolver: async () => 'Compound Item',
      },
    ];

    const days = await aggregateDailyCashFlow(rows, catMap);
    expect(days).toHaveLength(2);

    // Day 1: Refund only -> income 0, expenses -25, net 25
    const day1 = days[0];
    expect(day1.date).toBe('2026-10-12');
    expect(day1.income).toBe(0);
    expect(day1.expenses).toBe(-25);
    expect(day1.net).toBe(25);
    expect(day1.transactionCount).toBe(1);

    // Day 2: Compound -> income 50, expenses 50, net 0
    const day2 = days[1];
    expect(day2.date).toBe('2026-10-15');
    expect(day2.income).toBe(50);
    expect(day2.expenses).toBe(50);
    expect(day2.net).toBe(0);
  });

  it('returns empty array when rows are empty', async () => {
    const days = await aggregateDailyCashFlow([], catMap);
    expect(days).toEqual([]);
  });
});
