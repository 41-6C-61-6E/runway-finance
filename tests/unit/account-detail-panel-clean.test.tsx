// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import AccountDetailPanel from '@/components/features/accounts/AccountDetailPanel';
import type { Account } from '@/components/features/accounts/account-types';

beforeAll(() => {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: { data: [] },
    isLoading: false,
    error: null,
  }),
}));

vi.mock('@/lib/hooks/use-date-window', () => ({
  useDateWindow: () => ({
    timeframe: 'all',
    windowEnd: '2026-10-10',
    setWindowEnd: vi.fn(),
    prevWindow: vi.fn(),
    nextWindow: vi.fn(),
    isNextDisabled: true,
    windowLabel: 'All time',
    periodOptions: [],
    showWindowNav: false,
    dateRange: { start: '2026-01-01', end: '2026-10-10' },
  }),
}));

vi.mock('@/components/charts/chart-timeframe-bar', () => ({
  ChartTimeframeBar: () => <div data-testid="chart-timeframe-bar" />,
}));

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  AreaChart: ({ children }: any) => <div>{children}</div>,
  Area: () => null,
  CartesianGrid: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
}));

describe('AccountDetailPanel Clean Styling', () => {
  const mockAccount: Account = {
    id: 'acc-1',
    name: 'Checking Account',
    type: 'checking',
    balance: 5000,
    currency: 'USD',
    institution: 'Chase',
    isHidden: false,
    isExcludedFromNetWorth: false,
  };

  it('renders a single clean account panel without nested rounded-2xl outline boxes for chart and recent activity', () => {
    const { container } = render(
      <AccountDetailPanel
        account={mockAccount}
        historyData={[
          { date: '2026-01-01', 'acc-1': 4000 },
          { date: '2026-02-01', 'acc-1': 5000 },
        ]}
        hierarchyTimeframe="all"
        onClose={vi.fn()}
      />
    );

    // The outer panel has rounded-2xl border
    const outerPanel = container.firstChild as HTMLElement;
    expect(outerPanel).toHaveClass('rounded-2xl');
    expect(outerPanel).toHaveClass('border');

    // Inner chart and recent activity containers should NOT have nested rounded-2xl border boxes
    const innerRounded2xlBoxes = container.querySelectorAll('.rounded-2xl');
    // Only the top-level outer panel should have rounded-2xl
    expect(innerRounded2xlBoxes.length).toBe(1);
  });
});
