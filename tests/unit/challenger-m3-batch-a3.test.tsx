// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { PaginationDots } from '@/components/ui/pagination-dots';

describe('Milestone 3 / Batch A3 Remediation Verification Suite', () => {
  const rootDir = path.resolve(__dirname, '../../');

  describe('1. Sub-10px Typography Floor Fixes (Rule R-5 >= 10px)', () => {
    it('milestones-projections.tsx has fontSize >= 10 in FundEventDot with enlarged rect', () => {
      const filePath = path.join(rootDir, 'components/goals/milestones-projections.tsx');
      const content = fs.readFileSync(filePath, 'utf8');

      expect(content).not.toMatch(/fontSize=\{[1-9]\b\}/);
      expect(content).toContain('fontSize={10}');
      expect(content).toContain('height={16}');
      expect(content).toContain('y={cy - 8}');
    });

    it('advice-button.tsx does not use text-micro for body description and uses CSS variables in gradient', () => {
      const filePath = path.join(rootDir, 'components/features/advice/advice-button.tsx');
      const content = fs.readFileSync(filePath, 'utf8');

      expect(content).not.toMatch(/text-micro.*Financial assistant/);
      expect(content).toContain('text-caption text-muted-foreground/75 truncate');
      expect(content).toContain('stopColor="var(--color-chart-5)"');
      expect(content).toContain('stopColor="var(--color-chart-2)"');
      expect(content).toContain('stopColor="var(--color-primary)"');
      expect(content).not.toContain('#a855f7');
    });
  });

  describe('2. Mobile Touch Target Expansions (44x44px minimum — WCAG 2.5.5)', () => {
    it('pagination-dots.tsx renders buttons with min-w-[44px] min-h-[44px]', () => {
      const { container } = render(
        <PaginationDots total={3} activeIndex={0} onChange={() => {}} />
      );
      const buttons = container.querySelectorAll('button');
      expect(buttons.length).toBe(3);
      buttons.forEach((btn) => {
        expect(btn.className).toContain('min-w-[44px]');
        expect(btn.className).toContain('min-h-[44px]');
      });
    });

    it('milestones-projections.tsx expands steppers and reset button hit areas', () => {
      const filePath = path.join(rootDir, 'components/goals/milestones-projections.tsx');
      const content = fs.readFileSync(filePath, 'utf8');

      expect(content).toContain('min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-[10px]');
      expect(content).toContain('min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 sm:h-6 sm:w-6');
    });

    it('budget-table.tsx expands row Edit and Delete action buttons on mobile', () => {
      const filePath = path.join(rootDir, 'components/budgets/budget-table.tsx');
      const content = fs.readFileSync(filePath, 'utf8');

      expect(content).toContain('min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 flex items-center justify-center -m-0.5 p-0.5 text-muted-foreground hover:text-foreground');
      expect(content).toContain('min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 flex items-center justify-center -m-0.5 p-0.5 text-muted-foreground hover:text-destructive/80');
    });

    it('transaction-table.tsx provides mobile search touch target envelope', () => {
      const filePath = path.join(rootDir, 'components/features/transactions/transaction-table.tsx');
      const content = fs.readFileSync(filePath, 'utf8');

      expect(content).toContain('min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 flex items-center justify-center');
    });

    it('settings/page.tsx expands All Settings back button and handles subtitle line clamps', () => {
      const filePath = path.join(rootDir, 'app/settings/page.tsx');
      const content = fs.readFileSync(filePath, 'utf8');

      expect(content).toContain('min-h-[44px]');
      expect(content).toContain('line-clamp-2');
      expect(content).toContain('pb-24 lg:pb-0');
    });

    it('signin/page.tsx provides 44px hit areas, brand header, elevation, and accessible labels', () => {
      const filePath = path.join(rootDir, 'app/signin/page.tsx');
      const content = fs.readFileSync(filePath, 'utf8');

      expect(content).toContain('min-w-[44px] min-h-[44px]');
      expect(content).toContain('min-h-[44px] py-2.5 inline-flex items-center justify-center');
      expect(content).toContain('Runway Finance');
      expect(content).toMatch(/shadow-(lg|xl)/);
      expect(content).toContain('<label htmlFor="username"');
      expect(content).toContain('<label htmlFor="password"');
    });
  });

  describe('3. Localized Truncations & Contrast Polish', () => {
    it('income-dividends-panel.tsx uses hidden group-hover:inline for Filter span', () => {
      const filePath = path.join(rootDir, 'components/investments/income-dividends-panel.tsx');
      const content = fs.readFileSync(filePath, 'utf8');

      expect(content).toContain('hidden group-hover:inline');
      expect(content).not.toContain('text-muted-foreground/0');
    });

    it('account-hierarchy-tree.tsx sparkline visibility uses xl:flex instead of @md:flex', () => {
      const filePath = path.join(rootDir, 'components/features/accounts/account-hierarchy-tree.tsx');
      const content = fs.readFileSync(filePath, 'utf8');

      expect(content).not.toContain('hidden @md:flex flex-shrink-0 w-32');
      const matches = content.match(/hidden xl:flex flex-shrink-0 w-32/g);
      expect(matches?.length).toBe(3);
    });

    it('goal-card.tsx clarifies dual date with explicit Projected badge', () => {
      const filePath = path.join(rootDir, 'components/goals/goal-card.tsx');
      const content = fs.readFileSync(filePath, 'utf8');

      expect(content).toContain('Projected:');
      expect(content).toContain('rounded-full bg-primary/10 text-primary font-medium border border-primary/20');
    });

    it('fire-projections-side-panel.tsx Coast FIRE balances use min-w-0 flex-wrap and semantic tokens', () => {
      const filePath = path.join(rootDir, 'components/plans/fire-projections-side-panel.tsx');
      const content = fs.readFileSync(filePath, 'utf8');

      expect(content).toContain('min-w-0 flex-wrap');
      expect(content).toContain("coastFireInfo.isReached ? 'bg-status-positive' : 'bg-primary'");
      expect(content).not.toContain('bg-cyan-500');
    });

    it('date-window-nav.tsx disabled arrow meets WCAG graphical contrast >= 3:1', () => {
      const filePath = path.join(rootDir, 'components/charts/date-window-nav.tsx');
      const content = fs.readFileSync(filePath, 'utf8');

      expect(content).toContain('opacity-40 text-muted-foreground border border-border/40 cursor-not-allowed');
      expect(content).not.toContain('text-muted-foreground/30');
    });
  });

  describe('4. Localized Code Hygiene', () => {
    it('spending-breakdown.tsx dangling pipe has hidden sm:inline', () => {
      const filePath = path.join(rootDir, 'components/cash-flow/spending-breakdown.tsx');
      const content = fs.readFileSync(filePath, 'utf8');

      expect(content).toContain('<span className="text-xs text-muted-foreground/50 hidden sm:inline">|</span>');
    });

    it('mobile-view-switcher.tsx PaginationDots uses safe-area calculation', () => {
      const filePath = path.join(rootDir, 'components/ui/mobile-view-switcher.tsx');
      const content = fs.readFileSync(filePath, 'utf8');

      expect(content).toContain('bottom-[calc(4rem+env(safe-area-inset-bottom)+0.5rem)]');
      expect(content).not.toMatch(/className="[^"]*fixed bottom-16[^"]*"/);
    });

    it('zero native alert() dialogs remain in app/ and components/', () => {
      const checkDirs = ['app', 'components'];
      let alertCount = 0;

      for (const dir of checkDirs) {
        const fullDir = path.join(rootDir, dir);
        const scan = (d: string) => {
          const entries = fs.readdirSync(d, { withFileTypes: true });
          for (const e of entries) {
            const p = path.join(d, e.name);
            if (e.isDirectory()) {
              scan(p);
            } else if (e.isFile() && /\.(tsx|ts|jsx|js)$/.test(e.name)) {
              const code = fs.readFileSync(p, 'utf8');
              const matches = code.match(/\balert\s*\(/g);
              if (matches) {
                alertCount += matches.length;
              }
            }
          }
        };
        scan(fullDir);
      }

      expect(alertCount).toBe(0);
    });

    it('ConfirmDeleteDialog is used in bulk-actions-toolbar.tsx and transaction-detail-drawer.tsx', () => {
      const bulkPath = path.join(rootDir, 'components/features/transactions/bulk-actions-toolbar.tsx');
      const bulkContent = fs.readFileSync(bulkPath, 'utf8');
      expect(bulkContent).toContain('<ConfirmDeleteDialog');
      expect(bulkContent).not.toContain('Are you sure? Confirm');

      const drawerPath = path.join(rootDir, 'components/features/transactions/transaction-detail-drawer.tsx');
      const drawerContent = fs.readFileSync(drawerPath, 'utf8');
      expect(drawerContent).toContain('<ConfirmDeleteDialog');
      expect(drawerContent).not.toContain('Are you sure? Click to confirm delete');
    });

    it('rules-tab.tsx uses EmptyState primitive', () => {
      const filePath = path.join(rootDir, 'components/features/settings/rules-tab.tsx');
      const content = fs.readFileSync(filePath, 'utf8');

      expect(content).toContain('<EmptyState');
    });

    it('orphaned-accounts-section.tsx uses formatCurrency and max-w-[220px] truncate', () => {
      const filePath = path.join(rootDir, 'components/features/settings/orphaned-accounts-section.tsx');
      const content = fs.readFileSync(filePath, 'utf8');

      expect(content).toContain('formatCurrency(a.balance');
      expect(content).toContain('max-w-[220px] truncate');
      expect(content).not.toContain('parseFloat(a.balance || \'0\').toLocaleString');
    });

    it('budget-form-dialog.tsx renders dollar prefix on Amount input', () => {
      const filePath = path.join(rootDir, 'components/budgets/budget-form-dialog.tsx');
      const content = fs.readFileSync(filePath, 'utf8');

      expect(content).toContain('pointer-events-none">$</span>');
      expect(content).toContain('className="pl-7"');
    });
  });
});
