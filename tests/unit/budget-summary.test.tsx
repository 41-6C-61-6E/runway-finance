// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { BudgetSummary } from '@/components/budgets/budget-summary';

const mockToggleCollapsed = vi.fn();
let mockCollapsedState: Record<string, boolean> = {
  budgetSummary: false,
  budgetPacingDetails: true,
};

vi.mock('@/lib/hooks/use-card-collapsed', () => ({
  useCardCollapsed: (cardId: string, defaultVal: boolean = false) => {
    const isCol = mockCollapsedState[cardId] !== undefined ? mockCollapsedState[cardId] : defaultVal;
    return [
      isCol,
      (val: boolean) => {
        mockCollapsedState[cardId] = val;
        mockToggleCollapsed(cardId, val);
      },
    ];
  },
}));

vi.mock('@/components/budgets/budget-period-selector', () => ({
  useBudgetPeriod: () => ({
    periodType: 'monthly',
    periodKey: '2026-08',
    setPeriodType: vi.fn(),
    setPeriodKey: vi.fn(),
  }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: {
      budgets: [
        {
          id: 'b1',
          categoryId: 'c1',
          categoryName: 'Groceries',
          budgeted: 500,
          actual: 200,
          remaining: 300,
          percentUsed: 40,
          type: 'expense',
          isDiscretionary: true,
        },
        {
          id: 'b2',
          categoryId: 'c2',
          categoryName: 'Rent',
          budgeted: 1500,
          actual: 1500,
          remaining: 0,
          percentUsed: 100,
          type: 'expense',
          isDiscretionary: false,
        },
        {
          id: 'b3',
          categoryId: 'c3',
          categoryName: 'Salary',
          budgeted: 3000,
          actual: 3000,
          remaining: 0,
          percentUsed: 100,
          type: 'income',
        },
      ],
    },
    isLoading: false,
  }),
}));

// Mock recharts ResponsiveContainer and Pie
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  PieChart: ({ children }: any) => <div>{children}</div>,
  Pie: ({ children }: any) => <div>{children}</div>,
  Cell: () => <div />,
}));

describe('BudgetSummary Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCollapsedState = {
      budgetSummary: false,
      budgetPacingDetails: true,
    };
  });

  it('renders the budget status pill with status label and expand/collapse caret', () => {
    render(<BudgetSummary />);

    const statusPill = screen.getByRole('button', { name: /expand budget pacing details/i });
    expect(statusPill).toBeDefined();
    expect(statusPill.textContent).toContain('On Track');
  });

  it('toggles persistent pacing info in the sidebar when clicking the status pill', () => {
    const { rerender } = render(<BudgetSummary />);

    // Initially collapsed, persistent details not shown in sidebar
    expect(screen.queryByText('Budget Status Analysis')).toBeNull();

    const statusPill = screen.getByRole('button', { name: /expand budget pacing details/i });
    fireEvent.click(statusPill);

    expect(mockToggleCollapsed).toHaveBeenCalledWith('budgetPacingDetails', false);

    // Re-render with updated state (expanded)
    mockCollapsedState.budgetPacingDetails = false;
    rerender(<BudgetSummary />);

    // Now persistent details should be rendered
    expect(screen.getByText('Budget Status Analysis')).toBeDefined();
    expect(screen.getByText(/Month Pacing:/i)).toBeDefined();
    expect(screen.getByText(/Fixed Expenses \(Essential\):/i)).toBeDefined();
    expect(screen.getByText(/Variable Pace:/i)).toBeDefined();
    expect(screen.getByText(/Remaining Budget Cushion:/i)).toBeDefined();

    // The button aria-label should now reflect collapse state
    const collapsePill = screen.getByRole('button', { name: /collapse budget pacing details/i });
    expect(collapsePill).toBeDefined();
  });

  it('renders target vs actual savings rate when income budget is present', () => {
    render(<BudgetSummary />);

    expect(screen.getByText('Target Savings Rate')).toBeDefined();
    // Planned savings rate: (3000 - 2000) / 3000 = 33% target
    // Actual savings rate: (3000 - 1700) / 3000 = 43%
    expect(screen.getByText('43%')).toBeDefined();
    expect(screen.getByText('/ 33% target')).toBeDefined();
  });
});
