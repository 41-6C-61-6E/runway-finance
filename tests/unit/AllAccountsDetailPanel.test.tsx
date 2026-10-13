// @vitest-environment jsdom

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import '@testing-library/jest-dom';

beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  if (!('ResizeObserver' in window)) {
    (window as any).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  AreaChart: ({ children }: { children?: React.ReactNode }) => <div data-testid="area-chart">{children}</div>,
  ComposedChart: ({ children }: { children?: React.ReactNode }) => <div data-testid="composed-chart">{children}</div>,
  Line: ({ name, dataKey }: { name?: string; dataKey?: string }) => (
    <div data-testid={`line-series-${name ?? dataKey}`} />
  ),
  PieChart: ({ children }: { children?: React.ReactNode }) => <div data-testid="pie-chart">{children}</div>,
  Pie: ({ data }: { data?: { name: string; value: number }[] }) => (
    <div
      data-testid="donut-pie"
      data-rows={(data ?? []).map((d) => `${d.name}=${d.value}`).join(';')}
    />
  ),
  Cell: () => null,
  Area: ({ name, fill }: { name?: string; fill?: string }) => (
    <div data-testid={`area-series-${name}`} data-fill={fill} />
  ),
  CartesianGrid: () => null,
  ReferenceLine: () => null,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

vi.mock('@/lib/hooks/use-date-window', () => ({
  useDateWindow: () => ({
    timeframe: '365d',
    setTimeframe: vi.fn(),
    windowEnd: '2026-09-03',
    setWindowEnd: vi.fn(),
    prevWindow: vi.fn(),
    nextWindow: vi.fn(),
    isNextDisabled: false,
    windowLabel: 'Last 365 Days',
    monthRange: { start: '2025-09-01', end: '2025-09-30' },
    dateRange: { start: '2025-09-03', end: '2026-09-03' },
    periodOptions: [],
    showWindowNav: false,
  }),
}));

vi.mock('@/components/features/charts/chart-timeframe-bar', () => ({
  ChartTimeframeBar: () => null,
}));
vi.mock('@/components/features/charts/date-window-nav', () => ({
  DateWindowNav: () => null,
}));

import AllAccountsDetailPanel from '@/components/features/accounts/AllAccountsDetailPanel';
import type { Account } from '@/components/features/accounts/account-types';

const testAccounts: Account[] = [
  {
    id: 'acc_checking',
    name: 'Primary Checking',
    type: 'checking',
    balance: 15000,
    currency: 'USD',
    institution: 'Chase',
    isHidden: false,
    isExcludedFromNetWorth: false,
  },
  {
    id: 'acc_invest',
    name: 'Vanguard Brokerage',
    type: 'investment',
    balance: 85000,
    currency: 'USD',
    institution: 'Vanguard',
    isHidden: false,
    isExcludedFromNetWorth: false,
  },
  {
    id: 'acc_mortgage',
    name: 'Home Mortgage',
    type: 'mortgage',
    balance: -200000,
    currency: 'USD',
    institution: 'Wells Fargo',
    isHidden: false,
    isExcludedFromNetWorth: false,
  },
  {
    id: 'acc_house',
    name: 'Primary Home',
    type: 'realestate',
    balance: 500000,
    currency: 'USD',
    institution: 'Property',
    isHidden: false,
    isExcludedFromNetWorth: false,
  },
];

const mockHistory = [
  {
    date: '2026-01-01',
    acc_checking: 10000,
    acc_invest: 70000,
    acc_mortgage: 210000,
    acc_house: 480000,
    netWorth: 350000,
  },
  {
    date: '2026-09-03',
    acc_checking: 15000,
    acc_invest: 85000,
    acc_mortgage: 200000,
    acc_house: 500000,
    netWorth: 400000,
  },
];

describe('AllAccountsDetailPanel', () => {
  it('renders header, account count, and calls onClose', async () => {
    const user = userEvent.setup();
    const handleClose = vi.fn();

    render(
      <AllAccountsDetailPanel
        accounts={testAccounts}
        historyData={mockHistory}
        hierarchyTimeframe="365d"
        onClose={handleClose}
      />
    );

    // Title and count
    expect(screen.getByText('All Accounts')).toBeInTheDocument();
    expect(screen.getByText('4 accounts')).toBeInTheDocument();

    // Close button
    const closeBtn = screen.getByLabelText('Close all accounts overview');
    await user.click(closeBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('defaults to By Group mode and allows toggling to Net Worth', async () => {
    const user = userEvent.setup();

    render(
      <AllAccountsDetailPanel
        accounts={testAccounts}
        historyData={mockHistory}
        hierarchyTimeframe="365d"
        onClose={() => {}}
      />
    );

    // Default mode is By Group (Balance Sheet with Net Worth line)
    expect(screen.getByText('Group Breakdown Over Time')).toBeInTheDocument();
    expect(screen.getByTestId('composed-chart')).toBeInTheDocument();
    expect(screen.getByTestId('area-series-Banking')).toBeInTheDocument();
    expect(screen.getByTestId('area-series-Investments')).toBeInTheDocument();
    expect(screen.getByTestId('area-series-Loans')).toBeInTheDocument();
    expect(screen.getByTestId('area-series-Real Estate')).toBeInTheDocument();
    expect(screen.getByTestId('line-series-Net Worth')).toBeInTheDocument();

    // Verify Real Estate gradient URL does not contain spaces
    const realEstateEl = screen.getByTestId('area-series-Real Estate');
    const fillAttr = realEstateEl.getAttribute('data-fill') ?? '';
    expect(fillAttr).toMatch(/^url\(#gradient-group-all-.*-real-estate\)$/);
    expect(fillAttr).not.toContain(' ');

    // Switch to Net Worth
    await user.click(screen.getByRole('button', { name: 'Net Worth' }));
    expect(screen.getByText('Net Worth Trend')).toBeInTheDocument();
    expect(screen.getByTestId('area-series-Net Worth')).toBeInTheDocument();
    const netWorthFill = screen.getByTestId('area-series-Net Worth').getAttribute('data-fill') ?? '';
    expect(netWorthFill).toMatch(/^url\(#gradient-all-accounts-networth-.*\)$/);
    expect(netWorthFill).not.toContain(' ');
  });

  it('segregates Asset Allocation and Debt Breakdown in donut chart', async () => {
    const user = userEvent.setup();

    render(
      <AllAccountsDetailPanel
        accounts={testAccounts}
        historyData={mockHistory}
        hierarchyTimeframe="365d"
        onClose={() => {}}
      />
    );

    // Initial view is Asset allocation (no debts in the asset pie)
    expect(screen.getByText('Asset allocation')).toBeInTheDocument();
    expect(screen.getByText('Total Assets')).toBeInTheDocument();
    const donutEl = screen.getByTestId('donut-pie');
    let rows = donutEl.getAttribute('data-rows') ?? '';
    expect(rows).toContain('Real Estate=500000');
    expect(rows).toContain('Investments=85000');
    expect(rows).toContain('Banking=15000');
    expect(rows).not.toContain('Loans');

    // Toggle to Debts breakdown
    const debtsBtn = screen.getByRole('button', { name: /Debts/i });
    await user.click(debtsBtn);

    expect(screen.getByText('Debt breakdown')).toBeInTheDocument();
    expect(screen.getByText('Total Debt')).toBeInTheDocument();
    rows = donutEl.getAttribute('data-rows') ?? '';
    expect(rows).toContain('Loans=200000');
    expect(rows).not.toContain('Real Estate');
  });
});
