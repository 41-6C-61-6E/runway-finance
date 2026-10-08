// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
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

let currentMockBudgets: any[] = [];

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
  }),
  useQuery: ({ queryKey }: any) => {
    if (Array.isArray(queryKey) && queryKey[0] === 'categories') {
      return { data: [], isLoading: false };
    }
    if (Array.isArray(queryKey) && queryKey[0] === 'accounts') {
      return { data: [], isLoading: false };
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

describe('Budget Progress Bar Coloring matches Progress State', () => {
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

  describe('Desktop View', () => {
    beforeEach(() => {
      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1024 });
    });

    it('colors over-budget expense items with bg-destructive', () => {
      currentMockBudgets = [
        {
          id: 'b-over',
          categoryId: 'cat-dining',
          categoryName: 'Dining Out',
          budgeted: 300,
          actual: 400,
          remaining: -100,
          percentUsed: 133.3,
          type: 'expense',
        },
      ];

      render(<BudgetTable />);
      const progressbar = screen.getByRole('progressbar', { name: /dining out/i });
      const fillBar = progressbar.firstElementChild;
      expect(fillBar?.className).toContain('bg-destructive');
      expect(fillBar?.className).not.toContain('bg-primary');
    });

    it('colors warning (>85%) expense items with bg-amber-500', () => {
      currentMockBudgets = [
        {
          id: 'b-warn',
          categoryId: 'cat-groceries',
          categoryName: 'Groceries',
          budgeted: 500,
          actual: 450,
          remaining: 50,
          percentUsed: 90,
          type: 'expense',
        },
      ];

      render(<BudgetTable />);
      const progressbar = screen.getByRole('progressbar', { name: /groceries/i });
      const fillBar = progressbar.firstElementChild;
      expect(fillBar?.className).toContain('bg-amber-500');
      expect(fillBar?.className).not.toContain('bg-destructive');
    });

    it('colors on-track (<=85%) expense items with budget-progress-fill consistently across all widths', () => {
      currentMockBudgets = [
        {
          id: 'b-ok',
          categoryId: 'cat-gas',
          categoryName: 'Gas',
          budgeted: 200,
          actual: 80,
          remaining: 120,
          percentUsed: 40,
          type: 'expense',
        },
      ];

      render(<BudgetTable />);
      const progressbar = screen.getByRole('progressbar', { name: /gas/i });
      const fillBar = progressbar.firstElementChild;
      expect(fillBar?.className).toContain('budget-progress-fill');
      expect(fillBar?.className).not.toContain('bg-destructive');
      expect(fillBar?.className).not.toContain('bg-amber-500');
    });

    it('colors envelope budget items according to envelopeStatus', () => {
      currentMockBudgets = [
        {
          id: 'b-env-within',
          categoryId: 'cat-vacation',
          categoryName: 'Vacation',
          nativePeriodType: 'yearly',
          nativeAmount: 6000,
          budgeted: 500,
          actual: 200,
          envelopeSpent: 2000,
          envelopeRemaining: 4000,
          envelopePercentUsed: 33.3,
          envelopeStatus: 'within',
          prorated: true,
          type: 'expense',
        },
        {
          id: 'b-env-nearly',
          categoryId: 'cat-home',
          categoryName: 'Home Repairs',
          nativePeriodType: 'yearly',
          nativeAmount: 5000,
          budgeted: 416,
          actual: 200,
          envelopeSpent: 4600,
          envelopeRemaining: 400,
          envelopePercentUsed: 92,
          envelopeStatus: 'nearlyUsed',
          prorated: true,
          type: 'expense',
        },
        {
          id: 'b-env-exceeded',
          categoryId: 'cat-tech',
          categoryName: 'Tech Gear',
          nativePeriodType: 'yearly',
          nativeAmount: 2000,
          budgeted: 166,
          actual: 2500,
          envelopeSpent: 2500,
          envelopeRemaining: -500,
          envelopePercentUsed: 125,
          envelopeStatus: 'exceeded',
          prorated: true,
          type: 'expense',
        },
      ];

      render(<BudgetTable />);

      const withinBar = screen.getByRole('progressbar', { name: /vacation/i }).firstElementChild;
      expect(withinBar?.className).toContain('bg-constructive');

      const nearlyBar = screen.getByRole('progressbar', { name: /home repairs/i }).firstElementChild;
      expect(nearlyBar?.className).toContain('bg-amber-500');

      const exceededBar = screen.getByRole('progressbar', { name: /tech gear/i }).firstElementChild;
      expect(exceededBar?.className).toContain('bg-destructive');
    });

    it('colors income budget items: target met with budget-progress-fill, target not met with bg-amber-500', () => {
      currentMockBudgets = [
        {
          id: 'b-inc-met',
          categoryId: 'cat-salary',
          categoryName: 'Salary',
          budgeted: 5000,
          actual: 5200,
          remaining: 200,
          percentUsed: 104,
          type: 'income',
        },
        {
          id: 'b-inc-unmet',
          categoryId: 'cat-side',
          categoryName: 'Side Hustle',
          budgeted: 1000,
          actual: 400,
          remaining: -600,
          percentUsed: 40,
          type: 'income',
        },
      ];

      render(<BudgetTable />);

      const metBar = screen.getByRole('progressbar', { name: /salary/i }).firstElementChild;
      expect(metBar?.className).toContain('budget-progress-fill');
      expect(metBar?.className).not.toContain('bg-destructive');

      const unmetBar = screen.getByRole('progressbar', { name: /side hustle/i }).firstElementChild;
      expect(unmetBar?.className).toContain('bg-amber-500');
      expect(unmetBar?.className).not.toContain('bg-destructive');
    });
  });

  describe('Mobile View', () => {
    beforeEach(() => {
      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 500 });
    });

    it('colors mobile budget cards matching progress state', () => {
      currentMockBudgets = [
        {
          id: 'm-over',
          categoryId: 'cat-dining',
          categoryName: 'Dining Out',
          budgeted: 300,
          actual: 400,
          remaining: -100,
          percentUsed: 133.3,
          type: 'expense',
        },
        {
          id: 'm-warn',
          categoryId: 'cat-groceries',
          categoryName: 'Groceries',
          budgeted: 500,
          actual: 450,
          remaining: 50,
          percentUsed: 90,
          type: 'expense',
        },
        {
          id: 'm-ok',
          categoryId: 'cat-gas',
          categoryName: 'Gas',
          budgeted: 200,
          actual: 80,
          remaining: 120,
          percentUsed: 40,
          type: 'expense',
        },
        {
          id: 'm-inc-met',
          categoryId: 'cat-salary',
          categoryName: 'Salary',
          budgeted: 5000,
          actual: 5000,
          remaining: 0,
          percentUsed: 100,
          type: 'income',
        },
        {
          id: 'm-inc-unmet',
          categoryId: 'cat-side',
          categoryName: 'Side Gig',
          budgeted: 1000,
          actual: 600,
          remaining: -400,
          percentUsed: 60,
          type: 'income',
        },
        {
          id: 'm-env',
          categoryId: 'cat-vacation',
          categoryName: 'Vacation',
          nativePeriodType: 'yearly',
          nativeAmount: 6000,
          budgeted: 500,
          actual: 200,
          envelopeSpent: 2000,
          envelopeRemaining: 4000,
          envelopePercentUsed: 33.3,
          envelopeStatus: 'within',
          prorated: true,
          type: 'expense',
        },
      ];

      render(<BudgetTable />);

      const overBar = screen.getByRole('progressbar', { name: /\$400 of \$300 used/i }).firstElementChild;
      expect(overBar?.className).toContain('bg-destructive');

      const warnBar = screen.getByRole('progressbar', { name: /\$450 of \$500 used/i }).firstElementChild;
      expect(warnBar?.className).toContain('bg-amber-500');

      const okBar = screen.getByRole('progressbar', { name: /\$80 of \$200 used/i }).firstElementChild;
      expect(okBar?.className).toContain('budget-progress-fill');

      const incMetBar = screen.getByRole('progressbar', { name: /\$5,000 of \$5,000 used/i }).firstElementChild;
      expect(incMetBar?.className).toContain('budget-progress-fill');
      expect(incMetBar?.className).not.toContain('bg-red-500');

      const incUnmetBar = screen.getByRole('progressbar', { name: /\$600 of \$1,000 used/i }).firstElementChild;
      expect(incUnmetBar?.className).toContain('bg-amber-500');

      const envBar = screen.getByRole('progressbar', { name: /\$2,000 of \$6,000 used/i }).firstElementChild;
      expect(envBar?.className).toContain('bg-constructive');
    });
  });
});
