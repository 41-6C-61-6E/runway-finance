// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PlanManagementMenu } from '@/components/plans/plan-management-menu';
import { MobileNav } from '@/components/mobile-nav';
import { MobileSubNavProvider } from '@/components/mobile-subnav-context';
import { GoalFormDialog } from '@/components/goals/goal-form-drawer';
import TransactionDetailDrawer from '@/components/features/transactions/transaction-detail-drawer';
import fs from 'fs';
import path from 'path';

// Mocks for next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/',
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
    },
    loading: false,
  }),
}));

vi.mock('@/lib/hooks/use-hidden-pages', () => ({
  useHiddenPages: () => ({ isHidden: () => false }),
  DEV_MODE_PAGE_KEYS: [],
}));

describe('Milestone 2 / Batch A2 Implementation Verification Suite', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 390 });
  });

  describe('Item 1: Budget Expense Math Normalization', () => {
    it('normalizes negative actual expense into positive value and computes negative remaining variance', () => {
      // Logic from budget-calculator.ts:870-874
      const budgeted = 4000;
      const actualRaw = -26460;
      const effectiveIsIncome = false;
      const rolloverCarryover = 0;
      const availableBudget = budgeted + rolloverCarryover;

      const normalizedActual = effectiveIsIncome ? actualRaw : Math.abs(actualRaw);
      const remaining = effectiveIsIncome ? actualRaw - budgeted : availableBudget - normalizedActual;
      const percentUsed = availableBudget > 0 ? (normalizedActual / availableBudget) * 100 : 0;

      expect(normalizedActual).toBe(26460);
      expect(remaining).toBe(-22460);
      expect(percentUsed).toBeCloseTo(661.5, 1);
      const isOver = remaining < 0;
      expect(isOver).toBe(true);
    });

    it('verifies budget-calculator.ts and budget-table.tsx normalize actual expenses to positive numbers', () => {
      const calcPath = path.resolve(__dirname, '../../lib/services/budgets/budget-calculator.ts');
      const calcContent = fs.readFileSync(calcPath, 'utf-8');
      expect(calcContent).toContain('const normalizedActual = effectiveIsIncome ? actual : Math.abs(actual);');
      expect(calcContent).toContain('const remaining = effectiveIsIncome ? actual - budgeted : availableBudget - normalizedActual;');
      expect(calcContent).toContain('const percentUsed = availableBudget > 0 ? (normalizedActual / availableBudget) * 100 : 0;');
      expect(calcContent).toContain('actual: effectiveIsIncome ? actual : normalizedActual,');

      const tablePath = path.resolve(__dirname, '../../components/budgets/budget-table.tsx');
      const tableContent = fs.readFileSync(tablePath, 'utf-8');
      expect(tableContent).toContain("formatCurrency(b.type === 'income' ? b.actual : Math.abs(b.actual))");
    });
  });

  describe('Item 2: StatBox Liability Delta Direction (Reverse Trend Color)', () => {
    it('verifies reverseTrendColor logic assigns destructive color to debt increases and positive to decreases', () => {
      const cvsccPath = path.resolve(__dirname, '../../components/cash-flow/cash-vs-credit-card.tsx');
      const cvsccContent = fs.readFileSync(cvsccPath, 'utf-8');

      // reverseTrendColor prop definition and logic
      expect(cvsccContent).toContain('reverseTrendColor?: boolean;');
      expect(cvsccContent).toContain('const isGood = reverseTrendColor ? isNegative : isPositive;');
      expect(cvsccContent).toContain('const isBad = reverseTrendColor ? isPositive : isNegative;');
      expect(cvsccContent).toContain("const trendColorClass = isGood ? 'text-chart-1' : isBad ? 'text-destructive' : 'text-muted-foreground';");

      // Credit Card Debt StatBox invocation passes raw creditChange and reverseTrendColor=true
      expect(cvsccContent).toContain('label="Credit Card Debt"');
      expect(cvsccContent).toContain('change={creditChange}');
      expect(cvsccContent).toContain('changePercent={creditChangePercent}');
      expect(cvsccContent).toContain('reverseTrendColor={true}');
    });
  });

  describe('Item 3: Plans Horizontal Overflow Elimination', () => {
    it('applies constrained width wrapper and truncate classes to plan selector Select', () => {
      const plans = [
        { id: 'p1', name: 'Pacific Coast FIRE Plan (Age 50)', isDefault: true },
        { id: 'p2', name: 'Barista FIRE Alternative', isDefault: false },
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

      // Wrapper around select should have wrapperClassName constraint
      const selectWrapper = container.querySelector('.w-44');
      expect(selectWrapper).not.toBeNull();
      expect(selectWrapper?.className).toContain('shrink');
      expect(selectWrapper?.className).toContain('min-w-0');

      // The select element inside should have truncate
      const selectEl = container.querySelector('select');
      expect(selectEl?.className).toContain('truncate');
    });

    it('verifies app/plans/page.tsx wraps AppTabs in scrollable min-w-0 container', () => {
      const pagePath = path.resolve(__dirname, '../../app/plans/page.tsx');
      const pageContent = fs.readFileSync(pagePath, 'utf-8');
      expect(pageContent).toContain('min-w-0 flex-1 overflow-x-auto no-scrollbar');
    });
  });

  describe('Item 4: Pinned Action Footers in Drawers', () => {
    it('pins GoalFormDialog footer with flex-col, overflow-hidden and sticky footer', () => {
      render(
        <QueryClientProvider client={queryClient}>
          <GoalFormDialog open={true} onClose={vi.fn()} onSuccess={vi.fn()} />
        </QueryClientProvider>
      );

      // DialogContent container should have max-h-[90dvh] flex flex-col p-0 overflow-hidden
      const dialogContent = document.querySelector('[role="dialog"]');
      expect(dialogContent).not.toBeNull();
      expect(dialogContent?.className).toContain('flex-col');
      expect(dialogContent?.className).toContain('overflow-hidden');

      // Scrollable body inside form
      const scrollBody = dialogContent?.querySelector('.overflow-y-auto');
      expect(scrollBody).not.toBeNull();

      // Submit and Cancel buttons pinned in sticky footer
      const footer = dialogContent?.querySelector('.sticky.bottom-0');
      expect(footer).not.toBeNull();
      expect(screen.getByRole('button', { name: /create goal/i })).toBeDefined();
      expect(screen.getByRole('button', { name: /cancel/i })).toBeDefined();
    });

    it('pins TransactionDetailDrawer footer with flex-col, overflow-hidden and sticky action buttons', () => {
      render(
        <QueryClientProvider client={queryClient}>
          <TransactionDetailDrawer open={true} mode="create" onClose={vi.fn()} onSuccess={vi.fn()} />
        </QueryClientProvider>
      );

      // Sheet content should be flex flex-col h-full p-0 overflow-hidden
      const sheet = document.querySelector('[role="dialog"]');
      expect(sheet).not.toBeNull();
      expect(sheet?.className).toContain('flex-col');
      expect(sheet?.className).toContain('overflow-hidden');

      // Sticky footer action buttons
      const stickyFooter = sheet?.querySelector('.sticky.bottom-0');
      expect(stickyFooter).not.toBeNull();
      expect(screen.getByRole('button', { name: /add transaction/i })).toBeDefined();
    });

    it('verifies manual-accounts-section.tsx pins Add Manual Account drawer footer', () => {
      const manualPath = path.resolve(__dirname, '../../components/features/settings/manual-accounts-section.tsx');
      const manualContent = fs.readFileSync(manualPath, 'utf-8');
      expect(manualContent).toContain('<SheetContent side="right" className="flex flex-col h-full p-0 overflow-hidden">');
      expect(manualContent).toContain('<div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">');
      expect(manualContent).toContain('<div className="flex justify-end gap-2 p-4 border-t shrink-0 sticky bottom-0 bg-background/95 backdrop-blur z-10">');
    });
  });

  describe('Item 5: Floating Avg Net Income Badge Clipping Wrapper', () => {
    it('verifies income-expense-chart.tsx wraps ChartFrame and overlay in relative container', () => {
      const chartPath = path.resolve(__dirname, '../../components/cash-flow/income-expense-chart.tsx');
      const chartContent = fs.readFileSync(chartPath, 'utf-8');

      expect(chartContent).toContain('<div className="relative">');
      expect(chartContent).toContain('<ChartFrame className="h-[260px] sm:h-[300px] touch-pan-y" name="Income and Expenses">');
      expect(chartContent).toContain('className="absolute top-2 left-1/2 -translate-x-1/2');
    });
  });

  describe('Item 6: Mobile Navigation & Layout iOS Safe Area Clearance', () => {
    it('includes safe-area-inset-bottom in mobile nav height and padding', () => {
      const { container } = render(
        <QueryClientProvider client={queryClient}>
          <MobileSubNavProvider>
            <MobileNav />
          </MobileSubNavProvider>
        </QueryClientProvider>
      );

      const nav = container.querySelector('nav');
      expect(nav).not.toBeNull();
      expect(nav?.className).toContain('fixed');
      expect(nav?.className).toContain('bottom-0');
      expect(nav?.className).toContain('h-[calc(4rem+env(safe-area-inset-bottom))]');
      expect(nav?.className).toContain('pb-[env(safe-area-inset-bottom)]');
      expect(nav?.className).toContain('bg-sidebar');
    });

    it('includes safe-area-inset-bottom in AuthenticatedLayout bottom padding', () => {
      const layoutPath = path.resolve(__dirname, '../../components/authenticated-layout.tsx');
      const layoutContent = fs.readFileSync(layoutPath, 'utf-8');
      expect(layoutContent).toContain('pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0');
    });
  });
});
