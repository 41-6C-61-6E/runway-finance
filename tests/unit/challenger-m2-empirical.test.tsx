// @vitest-environment jsdom
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PlanManagementMenu } from '@/components/plans/plan-management-menu';
import { BudgetTable } from '@/components/budgets/budget-table';
import { CashVsCreditCard } from '@/components/cash-flow/cash-vs-credit-card';

// Mocks for next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/budgets',
  useSearchParams: () => new URLSearchParams(),
}));

// Mock privacy mode
vi.mock('@/components/privacy-mode-provider', () => ({
  usePrivacyMode: () => ({ privacyMode: false }),
}));

// Mock user settings
vi.mock('@/components/user-settings-provider', () => ({
  useUserSettings: () => ({
    settings: {
      currency: 'USD',
      timezone: 'America/New_York',
      chartColorScheme: 'fauntleroy',
      chartSelections: {},
    },
    loading: false,
    updateSetting: vi.fn(),
  }),
}));

// Mock budget period context with partial mock to preserve isValidPeriodKey
vi.mock('@/components/budgets/budget-period-selector', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    useBudgetPeriod: () => ({
      periodType: 'monthly',
      periodKey: '2026-11',
      setPeriodType: vi.fn(),
      setPeriodKey: vi.fn(),
      dateBounds: { startDate: '2026-11-01', endDate: '2026-11-30' },
    }),
  };
});

// Mock useDateWindow to fix queryParams to timeframe=all
vi.mock('@/lib/hooks/use-date-window', () => ({
  useDateWindow: () => ({
    timeframe: 'all',
    setTimeframe: vi.fn(),
    windowEnd: null,
    setWindowEnd: vi.fn(),
    prevWindow: null,
    nextWindow: null,
    isNextDisabled: true,
    windowLabel: 'All Time',
    periodOptions: [],
    showWindowNav: false,
    dateRange: { start: '2025-01-01', end: '2026-11-09' },
  }),
}));

// Mock recharts ResponsiveContainer to avoid layout measuring issues in jsdom
vi.mock('recharts', async () => {
  const actual = await vi.importActual<any>('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="responsive-container" style={{ width: 800, height: 400 }}>
        {children}
      </div>
    ),
  };
});

describe('Milestone 2 / Batch A2 Empirical Stress Suite', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1280 });
  });

  describe('1. Budget Calculation Oracle: Negative & Positive Expense Values', () => {
    // Pure calculation oracle matching budget-calculator.ts:870-874 logic
    function calculateBudget({
      budgeted,
      actual,
      effectiveIsIncome,
      rolloverCarryover = 0,
      rollover = false,
    }: {
      budgeted: number;
      actual: number;
      effectiveIsIncome: boolean;
      rolloverCarryover?: number;
      rollover?: boolean;
    }) {
      const availableBudget = (rollover && !effectiveIsIncome) ? budgeted + rolloverCarryover : budgeted;
      const normalizedActual = effectiveIsIncome ? actual : Math.abs(actual);
      const remaining = effectiveIsIncome ? actual - budgeted : availableBudget - normalizedActual;
      const percentUsed = availableBudget > 0 ? (normalizedActual / availableBudget) * 100 : 0;
      return {
        availableBudget,
        normalizedActual,
        remaining,
        percentUsed,
        actualEmitted: effectiveIsIncome ? actual : normalizedActual,
      };
    }

    it('handles negative expense actuals and normalizes remaining and percentUsed identically to positive actuals', () => {
      // Scenario A: Negative actual expense (-$400 spent on $500 budget)
      const resNeg = calculateBudget({
        budgeted: 500,
        actual: -400,
        effectiveIsIncome: false,
      });
      expect(resNeg.normalizedActual).toBe(400);
      expect(resNeg.actualEmitted).toBe(400);
      expect(resNeg.remaining).toBe(100);
      expect(resNeg.percentUsed).toBe(80);

      // Scenario B: Positive actual expense ($400 spent on $500 budget)
      const resPos = calculateBudget({
        budgeted: 500,
        actual: 400,
        effectiveIsIncome: false,
      });
      expect(resPos.normalizedActual).toBe(400);
      expect(resPos.actualEmitted).toBe(400);
      expect(resPos.remaining).toBe(100);
      expect(resPos.percentUsed).toBe(80);

      // Invariant: For expenses, actual = -X and actual = X must produce identical results
      expect(resNeg).toEqual(resPos);
    });

    it('correctly reports deficit (negative remaining) when expense actual exceeds budget, for both -X and +X', () => {
      // Overspend: $750 spent on $500 budget
      const resNegOver = calculateBudget({
        budgeted: 500,
        actual: -750,
        effectiveIsIncome: false,
      });
      expect(resNegOver.normalizedActual).toBe(750);
      expect(resNegOver.remaining).toBe(-250); // deficit of $250
      expect(resNegOver.percentUsed).toBe(150);

      const resPosOver = calculateBudget({
        budgeted: 500,
        actual: 750,
        effectiveIsIncome: false,
      });
      expect(resPosOver.normalizedActual).toBe(750);
      expect(resPosOver.remaining).toBe(-250);
      expect(resPosOver.percentUsed).toBe(150);

      expect(resNegOver).toEqual(resPosOver);
    });

    it('handles zero budget edge case without division-by-zero NaN', () => {
      const resZeroBudget = calculateBudget({
        budgeted: 0,
        actual: -150,
        effectiveIsIncome: false,
      });
      expect(resZeroBudget.normalizedActual).toBe(150);
      expect(resZeroBudget.remaining).toBe(-150);
      expect(resZeroBudget.percentUsed).toBe(0);
      expect(Number.isFinite(resZeroBudget.percentUsed)).toBe(true);
      expect(Number.isNaN(resZeroBudget.percentUsed)).toBe(false);
    });

    it('handles rollover carryover correctly with negative expense spending', () => {
      const resRollover = calculateBudget({
        budgeted: 400,
        actual: -450,
        effectiveIsIncome: false,
        rolloverCarryover: 100,
        rollover: true,
      });
      expect(resRollover.availableBudget).toBe(500);
      expect(resRollover.normalizedActual).toBe(450);
      expect(resRollover.remaining).toBe(50); // within $500 total available
      expect(resRollover.percentUsed).toBe(90);
    });

    it('preserves raw signed actuals for income categories', () => {
      // Income deposit $6000 against $5000 budget
      const resIncomeSurplus = calculateBudget({
        budgeted: 5000,
        actual: 6000,
        effectiveIsIncome: true,
      });
      expect(resIncomeSurplus.normalizedActual).toBe(6000);
      expect(resIncomeSurplus.remaining).toBe(1000); // $1000 above target
      expect(resIncomeSurplus.percentUsed).toBe(120);

      // Income deficit $3500 against $5000 budget
      const resIncomeDeficit = calculateBudget({
        budgeted: 5000,
        actual: 3500,
        effectiveIsIncome: true,
      });
      expect(resIncomeDeficit.normalizedActual).toBe(3500);
      expect(resIncomeDeficit.remaining).toBe(-1500); // $1500 below target
      expect(resIncomeDeficit.percentUsed).toBe(70);
    });
  });

  describe('2. Budget Table UI: Defense against negative expense values', () => {
    it('renders positive currency string in budget table cell even when actual is negative in input', () => {
      const mockBudgetsData = {
        budgets: [
          {
            id: 'b-exp-neg',
            categoryId: 'cat-groceries',
            categoryName: 'Groceries',
            categoryColor: '#10b981',
            type: 'expense',
            budgeted: 500,
            actual: -400, // Defensively test raw negative actual
            remaining: 100,
            percentUsed: 80,
            periodType: 'monthly',
            isRecurring: true,
          },
        ],
        period: { startDate: '2026-11-01', endDate: '2026-11-30' },
      };

      queryClient.setQueryData(['budgets', 'monthly', '2026-11'], mockBudgetsData);
      queryClient.setQueryData(['categories'], []);
      queryClient.setQueryData(['accounts'], []);

      const { container } = render(
        <QueryClientProvider client={queryClient}>
          <BudgetTable />
        </QueryClientProvider>
      );

      const groceriesRow = container.querySelector('[data-budget-category-id="cat-groceries"]');
      expect(groceriesRow).not.toBeNull();

      // The actual cell should format as positive $400, NOT -$400
      expect(groceriesRow?.textContent).toContain('$400');
      expect(groceriesRow?.textContent).not.toContain('-$400');
    });

    it('highlights overspent expense category with text-destructive on remaining variance cell', () => {
      const mockBudgetsData = {
        budgets: [
          {
            id: 'b-exp-over',
            categoryId: 'cat-dining',
            categoryName: 'Dining Out',
            categoryColor: '#ef4444',
            type: 'expense',
            budgeted: 300,
            actual: 450,
            remaining: -150,
            percentUsed: 150,
            periodType: 'monthly',
            isRecurring: true,
          },
        ],
        period: { startDate: '2026-11-01', endDate: '2026-11-30' },
      };

      queryClient.setQueryData(['budgets', 'monthly', '2026-11'], mockBudgetsData);
      queryClient.setQueryData(['categories'], []);
      queryClient.setQueryData(['accounts'], []);

      const { container } = render(
        <QueryClientProvider client={queryClient}>
          <BudgetTable />
        </QueryClientProvider>
      );

      const diningRow = container.querySelector('[data-budget-category-id="cat-dining"]');
      expect(diningRow).not.toBeNull();

      // Variance cell should have text-destructive
      const destructiveCells = diningRow?.querySelectorAll('.text-destructive');
      expect(destructiveCells && destructiveCells.length > 0).toBe(true);
      expect(diningRow?.textContent).toContain('-$150');
    });
  });

  describe('3. CashVsCreditCard StatBox: Reverse Trend Color & Directions', () => {
    it('renders positive debt increase (+10%, +$500) with TrendingUp in text-destructive', async () => {
      const mockCashVsCreditData = {
        current: {
          cashOnHand: 10000,
          creditCardDebt: 5500, // +$500 increase compared to history[0]
          netPosition: 4500,
          coverageRatio: 1.82,
        },
        history: [
          {
            date: '2026-10-01',
            cashOnHand: 10000,
            creditCardDebt: 5000,
            netPosition: 5000,
            coverageRatio: 2.0,
          },
          {
            date: '2026-11-01',
            cashOnHand: 10000,
            creditCardDebt: 5500,
            netPosition: 4500,
            coverageRatio: 1.82,
          },
        ],
        accounts: {
          cash: [{ id: 'a1', name: 'Checking Account', balance: 10000, type: 'depository' }],
          credit: [{ id: 'a2', name: 'Credit Card', balance: 5500, type: 'credit' }],
        },
      };

      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        return {
          ok: true,
          json: async () => mockCashVsCreditData,
        };
      });

      const { container } = render(
        <QueryClientProvider client={queryClient}>
          <CashVsCreditCard />
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(container.textContent).toContain('Credit Card Debt');
      });

      // Locate Credit Card Debt StatBox
      const statBoxes = container.querySelectorAll('.flex.flex-col.gap-0\\.5');
      const debtBox = Array.from(statBoxes).find((el) =>
        el.textContent?.toLowerCase().includes('credit card debt')
      );
      expect(debtBox).toBeDefined();

      // Debt change: $500 (+10%)
      expect(debtBox?.textContent).toContain('$500 (+10%)');

      // The icon should be TrendingUp (lucide-trending-up)
      const trendingUpIcon = debtBox?.querySelector('svg.lucide-trending-up');
      const trendingDownIcon = debtBox?.querySelector('svg.lucide-trending-down');
      expect(trendingUpIcon).not.toBeNull();
      expect(trendingDownIcon).toBeNull();

      // Trend color class on icon and text must be text-destructive
      expect(trendingUpIcon?.getAttribute('class')).toContain('text-destructive');
      const textSpan = debtBox?.querySelector('span.text-destructive');
      expect(textSpan).not.toBeNull();
      expect(textSpan?.textContent).toContain('$500 (+10%)');
    });

    it('renders negative debt reduction (-10%, -$500) with TrendingDown in text-chart-1', async () => {
      const mockCashVsCreditData = {
        current: {
          cashOnHand: 10000,
          creditCardDebt: 4500, // -$500 decrease compared to history[0]
          netPosition: 5500,
          coverageRatio: 2.22,
        },
        history: [
          {
            date: '2026-10-01',
            cashOnHand: 10000,
            creditCardDebt: 5000,
            netPosition: 5000,
            coverageRatio: 2.0,
          },
          {
            date: '2026-11-01',
            cashOnHand: 10000,
            creditCardDebt: 4500,
            netPosition: 5500,
            coverageRatio: 2.22,
          },
        ],
        accounts: {
          cash: [{ id: 'a1', name: 'Checking Account', balance: 10000, type: 'depository' }],
          credit: [{ id: 'a2', name: 'Credit Card', balance: 4500, type: 'credit' }],
        },
      };

      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        return {
          ok: true,
          json: async () => mockCashVsCreditData,
        };
      });

      const { container } = render(
        <QueryClientProvider client={queryClient}>
          <CashVsCreditCard />
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(container.textContent).toContain('Credit Card Debt');
      });

      // Locate Credit Card Debt StatBox
      const statBoxes = container.querySelectorAll('.flex.flex-col.gap-0\\.5');
      const debtBox = Array.from(statBoxes).find((el) =>
        el.textContent?.toLowerCase().includes('credit card debt')
      );
      expect(debtBox).toBeDefined();

      // Debt change: -$500 (-10%)
      expect(debtBox?.textContent).toContain('-$500 (-10%)');

      // The icon should be TrendingDown (lucide-trending-down)
      const trendingUpIcon = debtBox?.querySelector('svg.lucide-trending-up');
      const trendingDownIcon = debtBox?.querySelector('svg.lucide-trending-down');
      expect(trendingDownIcon).not.toBeNull();
      expect(trendingUpIcon).toBeNull();

      // Trend color class on icon and text must be text-chart-1 (green/positive)
      expect(trendingDownIcon?.getAttribute('class')).toContain('text-chart-1');
      const textSpan = debtBox?.querySelector('span.text-chart-1');
      expect(textSpan).not.toBeNull();
      expect(textSpan?.textContent).toContain('-$500 (-10%)');
    });

    it('documents edge case: zero change behavior (change = 0)', async () => {
      const mockCashVsCreditData = {
        current: {
          cashOnHand: 5000,
          creditCardDebt: 5000,
          netPosition: 0,
          coverageRatio: 1.0,
        },
        history: [
          {
            date: '2026-10-01',
            cashOnHand: 5000,
            creditCardDebt: 5000,
            netPosition: 0,
            coverageRatio: 1.0,
          },
          {
            date: '2026-11-01',
            cashOnHand: 5000,
            creditCardDebt: 5000, // zero change
            netPosition: 0,
            coverageRatio: 1.0,
          },
        ],
        accounts: {
          cash: [{ id: 'a1', name: 'Checking Account', balance: 5000, type: 'depository' }],
          credit: [{ id: 'a2', name: 'Credit Card', balance: 5000, type: 'credit' }],
        },
      };

      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        return {
          ok: true,
          json: async () => mockCashVsCreditData,
        };
      });

      const { container } = render(
        <QueryClientProvider client={queryClient}>
          <CashVsCreditCard />
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(container.textContent).toContain('Credit Card Debt');
      });

      const statBoxes = container.querySelectorAll('.flex.flex-col.gap-0\\.5');
      const debtBox = Array.from(statBoxes).find((el) =>
        el.textContent?.toLowerCase().includes('credit card debt')
      );
      expect(debtBox).toBeDefined();

      // Minus icon is rendered when change === 0
      const minusIcon = debtBox?.querySelector('svg.lucide-minus');
      expect(minusIcon).not.toBeNull();
    });
  });

  describe('4. Plans Layout Width & Overflow Elimination', () => {
    it('constrains plan selector select width with responsive classes and truncate', () => {
      const plans = [
        { id: 'p1', name: 'Very Long Plan Name That Could Stretch The Layout Far Beyond Its Container Bounds (Age 65)', isDefault: true },
      ];

      const { container } = render(
        <PlanManagementMenu
          plans={plans as any}
          selectedPlan={plans[0] as any}
          onSelectPlan={vi.fn()}
          onOpenWizardNew={vi.fn()}
          onOpenWizardEdit={vi.fn()}
          onSetDefaultPlan={vi.fn()}
          onResetDefaultPlan={vi.fn()}
          onOpenExport={vi.fn()}
          onOpenDeleteConfirm={vi.fn()}
          updating={false}
        />
      );

      const selectWrapper = container.querySelector('.w-44');
      expect(selectWrapper).not.toBeNull();
      expect(selectWrapper?.className).toContain('sm:w-52');
      expect(selectWrapper?.className).toContain('lg:w-60');
      expect(selectWrapper?.className).toContain('shrink');
      expect(selectWrapper?.className).toContain('min-w-0');

      const selectEl = container.querySelector('select');
      expect(selectEl?.className).toContain('truncate');
    });
  });
});
