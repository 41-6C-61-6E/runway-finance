// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
import FlowsPage from '@/app/flows/page';

// Mock the heavy chart components with lightweight markers so we can
// assert which panels are mounted.
vi.mock('@/components/net-worth/wealth-flow-sankey', () => ({
  WealthFlowSankey: () => <div data-testid="wealth-chart" />,
}));
vi.mock('@/components/cash-flow/cash-flow-sankey', () => ({
  CashFlowSankey: () => <div data-testid="cash-chart" />,
}));
vi.mock('@/components/cash-flow/income-expense-chart', () => ({
  IncomeExpenseChart: () => <div data-testid="income-chart" />,
}));
vi.mock('@/lib/hooks/use-chart-visibility', () => ({
  useChartVisibility: () => ({ isVisible: () => true }),
}));
vi.mock('@/components/page-header', () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock('@/components/page-content', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
}));

/**
 * Regression test: clicking the Cash / Income tabs must actually switch the
 * flow view. We assert the strong, explicit contract:
 *   - only the active tab's chart is mounted (the pattern every other
 *     tabbed page in the app uses, and what lib/fetch-cache was built for), and
 *   - no panel is left mounted in the dimmed "keep-mounted" style
 *     (pointer-events-none + opacity-60), which painted stale panels over
 *     the active one because opacity < 1 creates stacking contexts.
 */
describe('Flows page tabs', () => {
  it('shows only the Wealth chart initially', () => {
    render(<FlowsPage />);
    expect(screen.getByTestId('wealth-chart')).toBeTruthy();
    expect(screen.queryByTestId('cash-chart')).toBeNull();
    expect(screen.queryByTestId('income-chart')).toBeNull();
  });

  it('switches to the Cash view when the Cash tab is clicked', () => {
    render(<FlowsPage />);

    fireEvent.click(screen.getByRole('tab', { name: 'Cash' }));

    expect(screen.getByTestId('cash-chart')).toBeTruthy();
    expect(screen.queryByTestId('wealth-chart')).toBeNull();
    expect(screen.queryByTestId('income-chart')).toBeNull();
  });

  it('switches to the Income view when the Income tab is clicked', () => {
    render(<FlowsPage />);

    fireEvent.click(screen.getByRole('tab', { name: 'Cash' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Income' }));

    expect(screen.getByTestId('income-chart')).toBeTruthy();
    expect(screen.queryByTestId('cash-chart')).toBeNull();
    expect(screen.queryByTestId('wealth-chart')).toBeNull();
  });

  it('restores the Wealth view when Wealth is re-selected', () => {
    render(<FlowsPage />);

    fireEvent.click(screen.getByRole('tab', { name: 'Cash' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Wealth' }));

    expect(screen.getByTestId('wealth-chart')).toBeTruthy();
    expect(screen.queryByTestId('cash-chart')).toBeNull();
  });

  it('never leaves a dimmed keep-mounted panel in the DOM', () => {
    render(<FlowsPage />);

    fireEvent.click(screen.getByRole('tab', { name: 'Cash' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Income' }));

    // The old keep-mounted pattern rendered every visited panel with an
    // aria-hidden wrapper plus "pointer-events-none opacity-60". Those
    // wrappers created stacking contexts that painted the stale panel over
    // the newly selected view. Assert the pattern is gone from the page.
    expect(document.querySelector('.opacity-60')).toBeNull();
    const hiddenPanels = Array.from(
      document.querySelectorAll('main [aria-hidden="true"]')
    );
    expect(hiddenPanels).toHaveLength(0);
  });
});
