// @vitest-environment jsdom
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { BudgetTable } from '@/components/budgets/budget-table';

const mockPush = vi.fn();
let resizeCallback: ((entries: any[]) => void) | null = null;

global.ResizeObserver = class ResizeObserver {
  constructor(cb: (entries: any[]) => void) {
    resizeCallback = cb;
  }
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

let currentMockBudgets: any[] = [];
let currentMockAccounts: any[] = [];

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
  }),
  useQuery: ({ queryKey }: any) => {
    if (Array.isArray(queryKey) && queryKey[0] === 'categories') {
      return { data: [], isLoading: false };
    }
    if (Array.isArray(queryKey) && queryKey[0] === 'accounts') {
      return { data: currentMockAccounts, isLoading: false };
    }
    if (Array.isArray(queryKey) && queryKey[0] === 'budget-top-transactions') {
      return { data: { data: [], total: 0 }, isLoading: false, isError: false };
    }
    return {
      data: {
        budgets: currentMockBudgets,
      },
      isLoading: false,
      refetch: vi.fn(),
    };
  },
}));

describe('Budget Items Table Dynamic Scaling and Auto-Sizing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resizeCallback = null;
    mockUseUserSettings.mockReturnValue({
      settings: {
        budgetExclusions: {
          categoryIds: [],
          tagIds: [],
        },
      },
    });

    currentMockAccounts = [
      { id: 'acc-1', name: 'Main Checking' },
    ];

    currentMockBudgets = [
      {
        id: 'b-salary',
        categoryId: 'cat-salary',
        categoryName: 'Salary & Wages',
        categoryColor: '#10b981',
        budgeted: 5000,
        actual: 5000,
        remaining: 0,
        percentUsed: 100,
        type: 'income',
        fundingAccountId: 'acc-1',
      },
      {
        id: 'b-groceries',
        categoryId: 'cat-groceries',
        categoryName: 'Groceries & Supplies',
        categoryColor: '#3b82f6',
        budgeted: 600,
        actual: 450,
        remaining: 150,
        percentUsed: 75,
        type: 'expense',
        fundingAccountId: 'acc-1',
      },
    ];

    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1200 });
  });

  it('renders all columns when container width is wide (>= 850px)', () => {
    const { container } = render(<BudgetTable />);

    // Trigger ResizeObserver with 1000px
    if (resizeCallback) {
      act(() => {
        resizeCallback!([{ contentRect: { width: 1000 } }]);
      });
    }

    // Check table headers
    expect(screen.getByRole('columnheader', { name: /category/i })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: /budgeted/i })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: /actual/i })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: /variance/i })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: /progress/i })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: /account/i })).toBeTruthy();

    // Verify account name is rendered
    expect(screen.getAllByText('Main Checking').length).toBeGreaterThan(0);

    // Verify TableScroll wrapper exists and wraps the table
    const table = container.querySelector('table');
    expect(table).toBeTruthy();
    expect(table?.className).toContain('w-full');
  });

  it('hides Account column gracefully when container width is between 640px and 849px', () => {
    render(<BudgetTable />);

    if (resizeCallback) {
      act(() => {
        resizeCallback!([{ contentRect: { width: 700 } }]);
      });
    }

    expect(screen.getByRole('columnheader', { name: /category/i })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: /budgeted/i })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: /actual/i })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: /variance/i })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: /progress/i })).toBeTruthy();
    expect(screen.queryByRole('columnheader', { name: /account/i })).toBeNull();
  });

  it('hides Remaining/Variance column when container width is between 500px and 639px', () => {
    render(<BudgetTable />);

    if (resizeCallback) {
      act(() => {
        resizeCallback!([{ contentRect: { width: 550 } }]);
      });
    }

    expect(screen.getByRole('columnheader', { name: /category/i })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: /budgeted/i })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: /actual/i })).toBeTruthy();
    expect(screen.queryByRole('columnheader', { name: /variance/i })).toBeNull();
    expect(screen.getByRole('columnheader', { name: /progress/i })).toBeTruthy();
    expect(screen.queryByRole('columnheader', { name: /account/i })).toBeNull();
  });

  it('hides Progress column when container width is narrow (< 500px)', () => {
    render(<BudgetTable />);

    if (resizeCallback) {
      act(() => {
        resizeCallback!([{ contentRect: { width: 450 } }]);
      });
    }

    expect(screen.getByRole('columnheader', { name: /category/i })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: /budgeted/i })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: /actual/i })).toBeTruthy();
    expect(screen.queryByRole('columnheader', { name: /variance/i })).toBeNull();
    expect(screen.queryByRole('columnheader', { name: /progress/i })).toBeNull();
    expect(screen.queryByRole('columnheader', { name: /account/i })).toBeNull();
  });

  it('dynamically adapts when container size changes (e.g., sidebar or overview expansion)', () => {
    render(<BudgetTable />);

    // Starts wide
    if (resizeCallback) {
      act(() => {
        resizeCallback!([{ contentRect: { width: 1100 } }]);
      });
    }
    expect(screen.getByRole('columnheader', { name: /account/i })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: /variance/i })).toBeTruthy();

    // Accounts sidebar expands, narrowing budget table container to 600px
    if (resizeCallback) {
      act(() => {
        resizeCallback!([{ contentRect: { width: 600 } }]);
      });
    }
    expect(screen.queryByRole('columnheader', { name: /account/i })).toBeNull();
    expect(screen.queryByRole('columnheader', { name: /variance/i })).toBeNull();
    expect(screen.getByRole('columnheader', { name: /progress/i })).toBeTruthy();

    // Accounts sidebar collapses back, widening budget container to 900px
    if (resizeCallback) {
      act(() => {
        resizeCallback!([{ contentRect: { width: 900 } }]);
      });
    }
    expect(screen.getByRole('columnheader', { name: /account/i })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: /variance/i })).toBeTruthy();
  });
});
