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

let mockPeriodKey = '2026-08';
vi.mock('@/components/budgets/budget-period-selector', () => ({
  useBudgetPeriod: () => ({
    periodType: 'monthly',
    periodKey: mockPeriodKey,
    setPeriodType: vi.fn(),
    setPeriodKey: vi.fn(),
  }),
}));

let mockBudgets: any[] = [
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
];

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: {
      budgets: mockBudgets,
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

  it('does not mark the entire budget Over Budget when an item is only projected to be exceeded', () => {
    // Current period 2026-10 with active days elapsed
    mockPeriodKey = '2026-10';
    mockBudgets = [
      {
        id: 'b-rent',
        categoryId: 'c-rent',
        categoryName: 'Rent',
        budgeted: 1000,
        actual: 1000,
        remaining: 0,
        percentUsed: 100,
        type: 'expense',
        isDiscretionary: false,
      },
      {
        id: 'b-groceries',
        categoryId: 'c-groceries',
        categoryName: 'Groceries',
        budgeted: 500,
        // Early spending that at daily pace will project over 500, but actual spending (250) is still within budget!
        actual: 250,
        remaining: 250,
        percentUsed: 50,
        type: 'expense',
        isDiscretionary: true,
      },
    ];

    // Expand pacing details
    mockCollapsedState.budgetPacingDetails = false;
    render(<BudgetSummary />);

    // The status pill must NOT show "Over Budget"
    const statusPill = screen.getByRole('button', { name: /collapse budget pacing details/i });
    expect(statusPill.textContent).not.toContain('Over Budget');

    // It should show a friendly Pacing Note instead of making the entire budget over
    expect(screen.getByText(/Pacing Note:/i)).toBeDefined();
    expect(screen.getAllByText(/Actual spending is currently within budget/i).length).toBeGreaterThan(0);
  });

  it('marks the budget Over Budget when actual spending strictly exceeds total budget', () => {
    mockPeriodKey = '2026-10';
    mockBudgets = [
      {
        id: 'b-rent',
        categoryId: 'c-rent',
        categoryName: 'Rent',
        budgeted: 1000,
        actual: 1200,
        remaining: -200,
        percentUsed: 120,
        type: 'expense',
        isDiscretionary: false,
      },
      {
        id: 'b-groceries',
        categoryId: 'c-groceries',
        categoryName: 'Groceries',
        budgeted: 500,
        actual: 600,
        remaining: -100,
        percentUsed: 120,
        type: 'expense',
        isDiscretionary: true,
      },
    ];

    render(<BudgetSummary />);

    // Total actual (1800) > total budgeted (1500), so actual status is Over Budget
    const statusPill = screen.getByRole('button', { name: /expand budget pacing details/i });
    expect(statusPill.textContent).toContain('Over Budget');
  });
});
