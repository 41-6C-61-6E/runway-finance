// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { BudgetItemTransactionsIcon, getPeriodDateRange } from '@/components/budgets/budget-transactions-tooltip';
import { BudgetTable } from '@/components/budgets/budget-table';

const mockPush = vi.fn();
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
} as any;
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
  }),
}));

const mockUseUserSettings = vi.fn();
vi.mock('@/components/user-settings-provider', () => ({
  useUserSettings: () => mockUseUserSettings(),
}));

vi.mock('@/components/budgets/budget-period-selector', () => ({
  useBudgetPeriod: () => ({
    periodType: 'monthly',
    periodKey: '2026-08',
    setPeriodType: vi.fn(),
    setPeriodKey: vi.fn(),
  }),
}));

const mockBudgets = [
  {
    id: 'b-income-1',
    categoryId: 'cat-salary',
    categoryName: 'Salary',
    categoryColor: '#10b981',
    budgeted: 5000,
    actual: 5000,
    remaining: 0,
    percentUsed: 100,
    type: 'income' as const,
  },
  {
    id: 'b-exp-1',
    categoryId: 'cat-groceries',
    categoryName: 'Groceries',
    categoryColor: '#f59e0b',
    budgeted: 600,
    actual: 450,
    remaining: 150,
    percentUsed: 75,
    type: 'expense' as const,
  },
  {
    id: 'b-ee-1',
    categoryId: 'catch-all',
    categoryName: 'Everything Else',
    categoryColor: '#64748b',
    budgeted: 1000,
    actual: 300,
    remaining: 700,
    percentUsed: 30,
    type: 'expense' as const,
    isEverythingElse: true,
    groupedBreakout: [
      {
        categoryId: 'cat-coffee',
        categoryName: 'Coffee & Snacks',
        categoryColor: '#8b5cf6',
        actual: 50,
      },
    ],
  },
];

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
  }),
  useQuery: ({ queryKey }: any) => {
    if (Array.isArray(queryKey) && queryKey[0] === 'categories') {
      return {
        data: [],
        isLoading: false,
      };
    }
    if (Array.isArray(queryKey) && queryKey[0] === 'accounts') {
      return {
        data: [],
        isLoading: false,
      };
    }
    if (Array.isArray(queryKey) && queryKey[0] === 'budget-top-transactions') {
      return {
        data: {
          data: [
            {
              id: 'tx-1',
              date: '2026-08-15',
              description: 'Trader Joe\'s',
              amount: 120.5,
              accountName: 'Checking',
            },
          ],
          total: 1,
        },
        isLoading: false,
        isError: false,
      };
    }
    return {
      data: {
        budgets: mockBudgets,
      },
      isLoading: false,
      refetch: vi.fn(),
    };
  },
}));

describe('BudgetItemTransactionsIcon and Budget Table Row Hover Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseUserSettings.mockReturnValue({
      settings: {
        budgetExclusions: {
          categoryIds: [],
          tagIds: [],
        },
      },
    });
  });

  it('computes correct date range for monthly, quarterly, and yearly periods', () => {
    const monthly = getPeriodDateRange('monthly', '2026-08');
    expect(monthly.startDate).toBe('2026-08-01');
    expect(monthly.endDate).toBe('2026-08-31');

    const quarterly = getPeriodDateRange('quarterly', '2026-Q3');
    expect(quarterly.startDate).toBe('2026-07-01');
    expect(quarterly.endDate).toBe('2026-09-30');

    const yearly = getPeriodDateRange('yearly', '2026');
    expect(yearly.startDate).toBe('2026-01-01');
    expect(yearly.endDate).toBe('2026-12-31');
  });

  it('renders BudgetItemTransactionsIcon with group-hover/row and group-hover/cat classes', () => {
    render(
      <BudgetItemTransactionsIcon
        categoryId="cat-groceries"
        categoryName="Groceries"
        periodType="monthly"
        periodKey="2026-08"
      />
    );

    const link = screen.getByRole('link', { name: /view transactions for groceries/i });
    expect(link).toBeDefined();
    expect(link.getAttribute('href')).toContain('/transactions?');
    expect(link.getAttribute('href')).toContain('categoryId=cat-groceries');
    expect(link.getAttribute('href')).toContain('startDate=2026-08-01');
    expect(link.getAttribute('href')).toContain('endDate=2026-08-31');

    // Verify hover classes for row and cat group
    expect(link.className).toContain('group-hover/row:opacity-100');
    expect(link.className).toContain('group-hover/cat:opacity-100');
    expect(link.className).toContain('sm:opacity-0');
  });

  it('ensures all desktop table rows (income and expense) contain group/row class for hover reveal', () => {
    render(<BudgetTable />);

    // In desktop view (table), income row should have group/row
    const incomeRow = document.querySelector('tr[data-budget-category-id="cat-salary"]');
    expect(incomeRow).not.toBeNull();
    expect(incomeRow?.className).toContain('group/row');

    // In desktop view (table), expense row should have group/row
    const expenseRow = document.querySelector('tr[data-budget-category-id="cat-groceries"]');
    expect(expenseRow).not.toBeNull();
    expect(expenseRow?.className).toContain('group/row');

    // Everything Else row should also have group/row
    const eeRow = document.querySelector('tr[data-budget-category-id="catch-all"]');
    expect(eeRow).not.toBeNull();
    expect(eeRow?.className).toContain('group/row');
  });

  it('ensures mobile card items contain group/row class for hover/touch reveal', () => {
    // Simulate mobile viewport
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 500 });
    render(<BudgetTable />);

    const incomeMobileCard = document.querySelector('div[data-budget-category-id="cat-salary"]');
    expect(incomeMobileCard).not.toBeNull();
    expect(incomeMobileCard?.className).toContain('group/row');

    const expenseMobileCard = document.querySelector('div[data-budget-category-id="cat-groceries"]');
    expect(expenseMobileCard).not.toBeNull();
    expect(expenseMobileCard?.className).toContain('group/row');
  });
});
