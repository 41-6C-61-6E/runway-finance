// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PaginationDots } from '@/components/ui/pagination-dots';
import { AdviceButton } from '@/components/features/advice/advice-button';
import { BudgetMobileList } from '@/components/budgets/table/budget-mobile-list';
import { CashVsCreditCard } from '@/components/cash-flow/cash-vs-credit-card';

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
} as any;

// Mock next/navigation
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
  }),
}));

// Mock advice context for AdviceButton
vi.mock('@/components/features/advice/advice-provider', () => ({
  useAdvice: () => ({
    openAdvice: vi.fn(),
    closeAdvice: vi.fn(),
    isOpen: false,
    adviceStatus: { available: true, reason: null },
  }),
}));

describe('Empirical Challenger Suite: Milestone 3 / Batch A3 Verification & Stress Tests', () => {
  const rootDir = path.resolve(__dirname, '../../');

  describe('1. Sub-10px Typography Floor Fixes (Rule R-5 >= 10px)', () => {
    it('milestones-projections.tsx: FundEventDot enforces fontSize >= 10 and expanded bounding rect', () => {
      const filePath = path.join(rootDir, 'components/goals/milestones-projections.tsx');
      const content = fs.readFileSync(filePath, 'utf8');

      // Verify no sub-10 font size in FundEventDot
      const dotMatch = content.match(/function FundEventDot[\s\S]*?return \([\s\S]*?<\/g>\s*\);/);
      expect(dotMatch).toBeTruthy();
      const dotCode = dotMatch![0];

      expect(dotCode).not.toMatch(/fontSize=\{[1-9]\b\}/);
      expect(dotCode).toContain('fontSize={10}');
      expect(dotCode).toContain('height={16}');
      expect(dotCode).toContain('y={cy - 8}');
      expect(dotCode).toContain('Math.min(180, text.length * 6.2 + 12)');
    });

    it('advice-button.tsx: does not violate Rule R-5 on body description text and uses semantic tokens', () => {
      const filePath = path.join(rootDir, 'components/features/advice/advice-button.tsx');
      const content = fs.readFileSync(filePath, 'utf8');

      // text-micro is restricted to chart axis ticks and small indicator badges (like the "AI" badge)
      // The body description "Financial assistant" must use text-caption (11px+)
      expect(content).not.toMatch(/text-micro[^>]*>\s*Financial assistant/);
      expect(content).toContain('text-caption text-muted-foreground/75 truncate');

      // Verify gradient stops use semantic design variables instead of raw hex values
      expect(content).toContain('stopColor="var(--color-chart-5)"');
      expect(content).toContain('stopColor="var(--color-chart-2)"');
      expect(content).toContain('stopColor="var(--color-primary)"');
      expect(content).not.toContain('#a855f7');
      expect(content).not.toContain('#6366f1');
      expect(content).not.toContain('#3b82f6');
    });

    it('global scan: zero text-[8px] or text-[9px] classes exist in app/ and components/', () => {
      const dirs = ['app', 'components'];
      const sub10Classes: { file: string; line: number; match: string }[] = [];

      for (const dir of dirs) {
        const fullDir = path.join(rootDir, dir);
        const scan = (d: string) => {
          const entries = fs.readdirSync(d, { withFileTypes: true });
          for (const e of entries) {
            const p = path.join(d, e.name);
            if (e.isDirectory()) {
              scan(p);
            } else if (e.isFile() && /\.(tsx|ts|jsx|js)$/.test(e.name)) {
              const lines = fs.readFileSync(p, 'utf8').split('\n');
              lines.forEach((line, idx) => {
                const m = line.match(/\btext-\[[1-9]px\]/);
                if (m) {
                  sub10Classes.push({ file: p, line: idx + 1, match: m[0] });
                }
              });
            }
          }
        };
        scan(fullDir);
      }

      expect(sub10Classes).toEqual([]);
    });

    it('global scan: zero SVG/inline fontSize values < 10 exist across app/ and components/', () => {
      const dirs = ['app', 'components'];
      const sub10FontSizes: { file: string; line: number; text: string }[] = [];

      for (const dir of dirs) {
        const fullDir = path.join(rootDir, dir);
        const scan = (d: string) => {
          const entries = fs.readdirSync(d, { withFileTypes: true });
          for (const e of entries) {
            const p = path.join(d, e.name);
            if (e.isDirectory()) {
              scan(p);
            } else if (e.isFile() && /\.(tsx|ts|jsx|js)$/.test(e.name)) {
              const lines = fs.readFileSync(p, 'utf8').split('\n');
              lines.forEach((line, idx) => {
                // Match fontSize={1-9} or fontSize: 1-9
                const m = line.match(/\bfontSize\s*[:=]\s*([1-9])\b/);
                if (m) {
                  sub10FontSizes.push({ file: p, line: idx + 1, text: line.trim() });
                }
              });
            }
          }
        };
        scan(fullDir);
      }

      expect(sub10FontSizes).toEqual([]);
    });
  });

  describe('2. Code Hygiene: Zero native alert() / confirm() / prompt() calls', () => {
    it('verifies 0 native alert() calls across app/ and components/', () => {
      const dirs = ['app', 'components'];
      const alertCalls: { file: string; line: number; text: string }[] = [];

      for (const dir of dirs) {
        const fullDir = path.join(rootDir, dir);
        const scan = (d: string) => {
          const entries = fs.readdirSync(d, { withFileTypes: true });
          for (const e of entries) {
            const p = path.join(d, e.name);
            if (e.isDirectory()) {
              scan(p);
            } else if (e.isFile() && /\.(tsx|ts|jsx|js)$/.test(e.name)) {
              const lines = fs.readFileSync(p, 'utf8').split('\n');
              lines.forEach((line, idx) => {
                // Avoid comments or notification domain terms
                const clean = line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');
                if (/\b(window\.)?alert\s*\(/.test(clean)) {
                  alertCalls.push({ file: p, line: idx + 1, text: line.trim() });
                }
              });
            }
          }
        };
        scan(fullDir);
      }

      expect(alertCalls).toEqual([]);
    });

    it('verifies 0 native window.confirm() or prompt() calls across app/ and components/', () => {
      const dirs = ['app', 'components'];
      const nativeDialogs: { file: string; line: number; text: string }[] = [];

      for (const dir of dirs) {
        const fullDir = path.join(rootDir, dir);
        const scan = (d: string) => {
          const entries = fs.readdirSync(d, { withFileTypes: true });
          for (const e of entries) {
            const p = path.join(d, e.name);
            if (e.isDirectory()) {
              scan(p);
            } else if (e.isFile() && /\.(tsx|ts|jsx|js)$/.test(e.name)) {
              const lines = fs.readFileSync(p, 'utf8').split('\n');
              lines.forEach((line, idx) => {
                const clean = line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');
                if (/\b(window\.)?(confirm|prompt)\s*\(/.test(clean)) {
                  nativeDialogs.push({ file: p, line: idx + 1, text: line.trim() });
                }
              });
            }
          }
        };
        scan(fullDir);
      }

      expect(nativeDialogs).toEqual([]);
    });

    it('verifies ConfirmDeleteDialog is adopted in bulk-actions-toolbar and transaction-detail-drawer', () => {
      const bulkContent = fs.readFileSync(
        path.join(rootDir, 'components/features/transactions/bulk-actions-toolbar.tsx'),
        'utf8'
      );
      expect(bulkContent).toContain('<ConfirmDeleteDialog');
      expect(bulkContent).not.toContain('Are you sure? Confirm');

      const drawerContent = fs.readFileSync(
        path.join(rootDir, 'components/features/transactions/transaction-detail-drawer.tsx'),
        'utf8'
      );
      expect(drawerContent).toContain('<ConfirmDeleteDialog');
      expect(drawerContent).not.toContain('Are you sure? Click to confirm delete');
    });

    it('verifies EmptyState primitive is adopted in rules-tab.tsx', () => {
      const content = fs.readFileSync(
        path.join(rootDir, 'components/features/settings/rules-tab.tsx'),
        'utf8'
      );
      expect(content).toContain('<EmptyState');
    });

    it('verifies formatCurrency is adopted in orphaned-accounts-section.tsx', () => {
      const content = fs.readFileSync(
        path.join(rootDir, 'components/features/settings/orphaned-accounts-section.tsx'),
        'utf8'
      );
      expect(content).toContain('formatCurrency(a.balance');
      expect(content).not.toContain('parseFloat(a.balance');
    });
  });

  describe('3. Mobile Touch Targets (44x44px minimum — WCAG 2.5.5)', () => {
    it('pagination-dots.tsx: renders interactive dots with min-w-[44px] min-h-[44px] touch envelope', () => {
      const onChange = vi.fn();
      const { container } = render(
        <PaginationDots total={4} activeIndex={1} onChange={onChange} labels={['A', 'B', 'C', 'D']} />
      );

      const buttons = container.querySelectorAll('button');
      expect(buttons.length).toBe(4);

      buttons.forEach((btn, idx) => {
        expect(btn.className).toContain('min-w-[44px]');
        expect(btn.className).toContain('min-h-[44px]');
        expect(btn.getAttribute('aria-label')).toBe(`Go to slide ${idx + 1}: ${['A', 'B', 'C', 'D'][idx]}`);
      });

      fireEvent.click(buttons[2]);
      expect(onChange).toHaveBeenCalledWith(2);
    });

    it('milestones-projections.tsx: stepper buttons and reset button provide min-w-[44px] and min-h-[44px] on mobile', () => {
      const content = fs.readFileSync(
        path.join(rootDir, 'components/goals/milestones-projections.tsx'),
        'utf8'
      );

      // Reset button
      expect(content).toContain('min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-[10px]');
      // Stepper decrease and increase buttons
      expect(content).toContain('min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 sm:h-6 sm:w-6');
    });

    it('app/settings/page.tsx: All Settings back button provides min-h-[44px] mobile touch envelope', () => {
      const content = fs.readFileSync(path.join(rootDir, 'app/settings/page.tsx'), 'utf8');
      expect(content).toContain('min-h-[44px]');
      expect(content).toContain('px-3.5 py-2.5');
    });

    it('app/signin/page.tsx: password reveal toggle and mode toggle provide 44px minimum mobile touch envelopes', () => {
      const content = fs.readFileSync(path.join(rootDir, 'app/signin/page.tsx'), 'utf8');

      // Password visibility button
      expect(content).toContain('min-w-[44px] min-h-[44px]');
      // Sign In / Sign Up mode toggle
      expect(content).toContain('min-h-[44px] py-2.5 inline-flex items-center justify-center');
    });

    it('transaction-table.tsx: search button provides min-w-[44px] min-h-[44px] on mobile', () => {
      const content = fs.readFileSync(
        path.join(rootDir, 'components/features/transactions/transaction-table.tsx'),
        'utf8'
      );
      expect(content).toContain('min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0');
    });

    it('REMEDIATED: BudgetMobileList in components/budgets/table/budget-mobile-list.tsx enforces 44x44px touch targets on mobile Edit/Delete row actions', () => {
      const mobileListPath = path.join(
        rootDir,
        'components/budgets/table/budget-mobile-list.tsx'
      );
      const content = fs.readFileSync(mobileListPath, 'utf8');

      expect(content).toContain('label="Edit budget"');
      expect(content).toContain('label="Delete budget"');

      // Verify both Edit and Delete IconButton components have the 44x44px minimum envelope
      const editButtonMatches = content.match(/<IconButton[\s\S]*?label="Edit budget"[\s\S]*?\/>/g);
      expect(editButtonMatches).toBeTruthy();
      expect(editButtonMatches?.length).toBe(2);

      editButtonMatches?.forEach((btn) => {
        const hasMin44 = btn.includes('min-w-[44px]') && btn.includes('min-h-[44px]');
        expect({
          buttonSnippet: btn.replace(/\s+/g, ' '),
          hasMin44TouchTarget: hasMin44,
        }).toEqual({
          buttonSnippet: expect.stringContaining('label="Edit budget"'),
          hasMin44TouchTarget: true,
        });
      });

      const deleteButtonMatches = content.match(/<IconButton[\s\S]*?label="Delete budget"[\s\S]*?\/>/g);
      expect(deleteButtonMatches).toBeTruthy();
      expect(deleteButtonMatches?.length).toBe(2);

      deleteButtonMatches?.forEach((btn) => {
        const hasMin44 = btn.includes('min-w-[44px]') && btn.includes('min-h-[44px]');
        expect({
          buttonSnippet: btn.replace(/\s+/g, ' '),
          hasMin44TouchTarget: hasMin44,
        }).toEqual({
          buttonSnippet: expect.stringContaining('label="Delete budget"'),
          hasMin44TouchTarget: true,
        });
      });
    });

    it('BudgetMobileList DOM: mounted buttons have min 44x44 envelopes and invoke handlers', () => {
      const mockQueryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });

      const mockIncomeBudget = {
        id: 'inc-1',
        categoryId: 'cat-inc',
        categoryName: 'Salary Income',
        amount: 8000,
        actual: 8000,
        isIncome: true,
        periodType: 'monthly',
        budgetType: 'fixed',
        nativeAmount: 8000,
        nativePeriodType: 'monthly',
      };

      const mockExpenseBudget = {
        id: 'exp-1',
        categoryId: 'cat-exp',
        categoryName: 'Groceries',
        amount: 800,
        actual: 650,
        isIncome: false,
        periodType: 'monthly',
        budgetType: 'envelope',
        nativeAmount: 800,
        nativePeriodType: 'monthly',
      };

      let editCalled: any = null;
      let deleteCalled: any = null;
      let showFormCalled: any = null;

      const { container } = render(
        <QueryClientProvider client={mockQueryClient}>
          <BudgetMobileList
            incomeBudgets={[mockIncomeBudget as any]}
            expenseBudgets={[mockExpenseBudget as any]}
            flashCategoryId={null}
            getTxUrl={() => '/transactions'}
            periodType="monthly"
            periodKey="2026-11"
            periodSuffix="/mo"
            formatCurrency={(v) => `$${v}`}
            isEnvelope={() => false}
            renderEnvelopeBadge={() => null}
            setEditBudget={(b) => { editCalled = b; }}
            setShowForm={(v) => { showFormCalled = v; }}
            setDeleteBudget={(b) => { deleteCalled = b; }}
            expandedCatchAll={false}
            setExpandedCatchAll={vi.fn()}
            handleConvertToBudget={vi.fn()}
            convertingCatId={null}
          />
        </QueryClientProvider>
      );

      const editButtons = screen.getAllByLabelText('Edit budget');
      const deleteButtons = screen.getAllByLabelText('Delete budget');

      expect(editButtons.length).toBe(2);
      expect(deleteButtons.length).toBe(2);

      // Verify each button has 44px min dimension classes
      [...editButtons, ...deleteButtons].forEach((btn) => {
        expect(btn.className).toContain('min-w-[44px]');
        expect(btn.className).toContain('min-h-[44px]');
      });

      // Verify click handlers
      fireEvent.click(editButtons[0]);
      expect(editCalled).toEqual(mockIncomeBudget);
      expect(showFormCalled).toBe(true);

      fireEvent.click(deleteButtons[1]);
      expect(deleteCalled).toEqual(mockExpenseBudget);
    });
  });

  describe('4. CashVsCreditCard: StatBox zero-delta edge case handling', () => {
    it('cash-vs-credit-card.tsx: StatBox treats change > 0 as positive, rendering zero delta as neutral', () => {
      const filePath = path.join(rootDir, 'components/cash-flow/cash-vs-credit-card.tsx');
      const content = fs.readFileSync(filePath, 'utf8');

      // Verify isPositive check is strictly positive (> 0)
      expect(content).toContain('const isPositive = change !== null && change > 0;');
      // Verify Minus icon is rendered when change === 0
      expect(content).toContain('change === 0 && <Minus className="w-3 h-3 text-muted-foreground" />');
    });

    it('CashVsCreditCard DOM: renders zero-delta balances with Minus icon and text-muted-foreground', async () => {
      const mockQueryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });

      // Both current and history[0] have the exact same amounts: zero delta
      const mockZeroDeltaData = {
        current: {
          cashOnHand: 10000,
          creditCardDebt: 5000,
          netPosition: 5000,
          coverageRatio: 2.0,
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
            creditCardDebt: 5000,
            netPosition: 5000,
            coverageRatio: 2.0,
          },
        ],
        accounts: {
          cash: [{ id: 'a1', name: 'Checking Account', balance: 10000, type: 'depository' }],
          credit: [{ id: 'a2', name: 'Credit Card', balance: 5000, type: 'credit' }],
        },
      };

      global.fetch = vi.fn().mockImplementation(async () => {
        return {
          ok: true,
          json: async () => mockZeroDeltaData,
        };
      });

      const { container } = render(
        <QueryClientProvider client={mockQueryClient}>
          <CashVsCreditCard />
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(container.textContent).toContain('Credit Card Debt');
      });

      const statBoxes = container.querySelectorAll('.flex.flex-col.gap-0\\.5');
      const cashBox = Array.from(statBoxes).find((el) =>
        el.textContent?.toLowerCase().includes('cash on hand')
      );
      const debtBox = Array.from(statBoxes).find((el) =>
        el.textContent?.toLowerCase().includes('credit card debt')
      );

      expect(cashBox).toBeDefined();
      expect(debtBox).toBeDefined();

      // For cash on hand (normal trend):
      // Change is $0 (0.0%). Must render Minus icon and text-muted-foreground, NO TrendingUp/TrendingDown
      const cashMinus = cashBox?.querySelector('svg.lucide-minus');
      const cashTrendingUp = cashBox?.querySelector('svg.lucide-trending-up');
      const cashTrendingDown = cashBox?.querySelector('svg.lucide-trending-down');
      expect(cashMinus).not.toBeNull();
      expect(cashMinus?.getAttribute('class')).toContain('text-muted-foreground');
      expect(cashTrendingUp).toBeNull();
      expect(cashTrendingDown).toBeNull();

      const cashChangeText = cashBox?.querySelector('.flex.items-center.gap-1.text-\\[11px\\] span');
      expect(cashChangeText?.className).toContain('text-muted-foreground');
      expect(cashChangeText?.textContent).toMatch(/\$0 \(0(\.0)?%\)/);
      expect(cashChangeText?.textContent).not.toContain('+');

      // For credit card debt (reverseTrendColor = true):
      // Change is $0 (0.0%). Must STILL render Minus icon and text-muted-foreground, NOT text-destructive
      const debtMinus = debtBox?.querySelector('svg.lucide-minus');
      const debtTrendingUp = debtBox?.querySelector('svg.lucide-trending-up');
      const debtTrendingDown = debtBox?.querySelector('svg.lucide-trending-down');
      expect(debtMinus).not.toBeNull();
      expect(debtMinus?.getAttribute('class')).toContain('text-muted-foreground');
      expect(debtTrendingUp).toBeNull();
      expect(debtTrendingDown).toBeNull();

      const debtChangeText = debtBox?.querySelector('.flex.items-center.gap-1.text-\\[11px\\] span');
      expect(debtChangeText?.className).toContain('text-muted-foreground');
      expect(debtChangeText?.textContent).toMatch(/\$0 \(0(\.0)?%\)/);
      expect(debtChangeText?.textContent).not.toContain('+');
    });
  });
});
