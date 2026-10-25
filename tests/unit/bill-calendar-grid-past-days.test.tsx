// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BillCalendarGrid } from '@/components/cash-flow/bill-calendar-grid';
import type { UpcomingBill } from '@/lib/services/recurring-detection';
import type { DailyCashFlowDay } from '@/lib/finance/daily-cash-flow';

let mockPrivacyMode = false;
vi.mock('@/components/privacy-mode-provider', () => ({
  usePrivacyMode: () => ({ privacyMode: mockPrivacyMode, togglePrivacyMode: vi.fn() }),
}));

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock fetch for day transactions inside inspector
global.fetch = vi.fn().mockImplementation((url: string) => {
  if (url.includes('/api/transactions')) {
    return Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [
            {
              id: 'tx-1',
              date: '2026-10-10',
              payee: 'Target Grocery',
              amount: '-45.50',
              category: { id: 'c1', name: 'Groceries', color: '#10b981' },
            },
          ],
          total: 1,
        }),
    });
  }
  return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
});

describe('BillCalendarGrid - Past Days Enhancements', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    mockPrivacyMode = false;
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  });

  const mockBills: UpcomingBill[] = [
    {
      id: 'bill-future-1',
      recurringId: 'rec-1',
      merchantName: 'Electric Utility',
      displayName: 'Electric Bill',
      amount: 140,
      expectedDate: '2026-10-25',
      frequency: 'monthly',
      flowType: 'expense',
      accountName: 'Checking',
      categoryName: 'Utilities',
      categoryColor: '#38bdf8',
      isEstimate: false,
      daysUntil: 5,
      isOverdue: false,
    },
  ];

  const mockActuals = new Map<string, DailyCashFlowDay>([
    [
      '2026-10-10',
      {
        date: '2026-10-10',
        income: 3200,
        expenses: 1240,
        net: 1960,
        transactionCount: 4,
        pendingCount: 0,
        topItems: [
          {
            id: 'tx-1',
            name: 'Target Grocery',
            amount: -45.5,
            categoryColor: '#10b981',
            pending: false,
          },
          {
            id: 'tx-2',
            name: 'Payroll ACME',
            amount: 3200,
            categoryColor: '#059669',
            pending: false,
          },
        ],
        topCategories: [
          {
            categoryId: 'c1',
            name: 'Groceries',
            color: '#10b981',
            amount: 45.5,
          },
        ],
      },
    ],
  ]);

  it('renders past day actuals, totals footer, and future bill chips', () => {
    // Current date set to October 20, 2026
    const currentDate = new Date(2026, 9, 20);

    render(
      <QueryClientProvider client={queryClient}>
        <BillCalendarGrid
          bills={mockBills}
          currentDate={currentDate}
          actualsByDate={mockActuals}
        />
      </QueryClientProvider>
    );

    // Past day 2026-10-10 should render top items and totals footer
    expect(screen.getAllByText('Target Grocery').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Payroll ACME').length).toBeGreaterThan(0);

    // Future day 2026-10-25 should render upcoming bill chip
    expect(screen.getAllByText('Electric Bill').length).toBeGreaterThan(0);
  });

  it('renders quiet indicator on an empty past day', () => {
    const currentDate = new Date(2026, 9, 20);

    render(
      <QueryClientProvider client={queryClient}>
        <BillCalendarGrid
          bills={mockBills}
          currentDate={currentDate}
          actualsByDate={mockActuals}
        />
      </QueryClientProvider>
    );

    // Multiple empty past days should display "—"
    const quietDashes = screen.getAllByText('—');
    expect(quietDashes.length).toBeGreaterThan(0);
  });

  it('opens day inspector sheet when clicking a past day cell', async () => {
    const currentDate = new Date(2026, 9, 20);

    render(
      <QueryClientProvider client={queryClient}>
        <BillCalendarGrid
          bills={mockBills}
          currentDate={currentDate}
          actualsByDate={mockActuals}
        />
      </QueryClientProvider>
    );

    // Click on cell for Oct 10
    const cellBtn = screen.getByLabelText('Calendar cell for 2026-10-10');
    fireEvent.click(cellBtn);

    // Inspector sheet should open with Breakdown
    expect(screen.getAllByText(/Inflow/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Outflow/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Net Flow/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Open day in Transactions tab/i).length).toBeGreaterThan(0);
  });

  it('applies privacy blur classes when privacyMode is enabled', () => {
    mockPrivacyMode = true;
    const currentDate = new Date(2026, 9, 20);

    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <BillCalendarGrid
          bills={mockBills}
          currentDate={currentDate}
          actualsByDate={mockActuals}
        />
      </QueryClientProvider>
    );

    const blurredElements = container.querySelectorAll('.blur-xs');
    expect(blurredElements.length).toBeGreaterThan(0);
  });
});
