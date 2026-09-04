// @vitest-environment jsdom
//
// Regression test: "Debt breakdown" donut in the accounts group detail panel
// must reflect the accounts' CURRENT balances. A paid-off mortgage (balance 0,
// series omitted from history after its payoff date) must NOT be included.
//
// The old implementation walked back through the history series to find each
// account's "most recent known balance" — which for a paid-off mortgage is the
// last pre-payoff balance (stale), making the donut show a balance for an
// account that is paid off.
import React from 'react';
import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import '@testing-library/jest-dom';

// jsdom: components may need matchMedia / ResizeObserver
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

// Recharts: neutral wrappers. The Pie mock exposes its data via a data attr
// so tests can assert exactly which series feed the donut.
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  AreaChart: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  PieChart: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Pie: ({ data }: { data?: { name: string; value: number }[] }) => (
    <div data-testid="donut-pie" data-rows={(data ?? []).map((d) => `${d.name}=${d.value}`).join(';')} />
  ),
  Cell: (_: any) => null,
  Area: () => null,
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

// Heavy/unrelated chrome — not under test
vi.mock('@/components/features/charts/chart-timeframe-bar', () => ({
  ChartTimeframeBar: () => null,
}));
vi.mock('@/components/features/charts/date-window-nav', () => ({
  DateWindowNav: () => null,
}));

import GroupDetailPanel from '@/components/features/accounts/GroupDetailPanel';
import type { Account } from '@/components/features/accounts/account-types';

// Build daily history rows from startDate through 2026-09-03.
// series: accountId -> { untilDate: string | null, value } (null = never ends)
function buildHistory(series: Record<string, { untilDate: string | null; value: number }>) {
  const rows: Array<Record<string, number | string>> = [];
  const cursor = new Date('2025-09-03T12:00:00Z');
  const end = new Date('2026-09-03T12:00:00Z');
  while (cursor <= end) {
    const key = cursor.toISOString().split('T')[0];
    const row: Record<string, number | string> = { date: key };
    for (const [accountId, s] of Object.entries(series)) {
      if (s.untilDate === null || key <= s.untilDate) row[accountId] = s.value;
      // else: omitted (same as the history API does after a mortgage end date)
    }
    rows.push(row);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return rows;
}

function acct(overrides: Partial<Account> & Pick<Account, 'id' | 'name' | 'balance'>): Account {
  return {
    type: 'mortgage',
    currency: 'USD',
    institution: 'TestBank',
    isHidden: false,
    isExcludedFromNetWorth: false,
    ...overrides,
  } as Account;
}

function donutRows() {
  const el = screen.getByTestId('donut-pie');
  const raw = el.getAttribute('data-rows') ?? '';
  return raw
    .split(';')
    .filter(Boolean)
    .map((r) => {
      const idx = r.lastIndexOf('=');
      return { name: r.slice(0, idx), value: Number(r.slice(idx + 1)) };
    })
    .sort((a, b) => b.value - a.value);
}

const paidOff = acct({ id: 'acc_nationstar', name: 'Nationstar Mortgage', balance: 0 });
const bec = acct({ id: 'acc_becu', name: 'BECU Mortgage', balance: 626529 });
const student = acct({
  id: 'acc_student',
  name: 'Student Loans',
  type: 'studentloan',
  balance: '80000', // string balance (as returned for manual/imported accounts)
} as any);

describe('GroupDetailPanel — composition donut uses current balances', () => {
  it('excludes a paid-off mortgage whose history holds a large stale balance (the reported bug)', () => {
    const history = buildHistory({
      acc_nationstar: { untilDate: '2025-12-01', value: 659099 }, // last known balance before payoff
      acc_becu: { untilDate: null, value: 626529 },
      acc_student: { untilDate: null, value: 80000 },
    });

    render(
      <GroupDetailPanel
        group="Loans"
        accounts={[paidOff, bec, student]}
        historyData={history}
        hierarchyTimeframe="365d"
        onClose={() => {}}
      />
    );

    // The donut is fed ONLY from live balances — the paid-off loan is absent,
    // while its stale $659,099 historical balance must not resurrect.
    const rows = donutRows();
    expect(rows.map((r) => r.name)).toEqual(['BECU Mortgage', 'Student Loans']);
    expect(rows.map((r) => r.value)).toEqual([626529, 80000]);

    // Donut center total matches the live sum
    expect(screen.getAllByText(/706,529/).length).toBeGreaterThanOrEqual(1);
    // The header "current" total must also exclude the paid-off balance —
    // so $706,529 appears at least twice: donut center + header total
    // (not $1,365,628, which would mean the stale balance leaked in).
    expect(screen.getAllByText(/706,529/).length).toBeGreaterThanOrEqual(2);
    // Paid-off account not listed in the legend either
    expect(screen.queryByText('Nationstar Mortgage')).not.toBeInTheDocument();
  });

  it('still shows all remaining balances when the group has exactly one open account', () => {
    const history = buildHistory({
      acc_nationstar: { untilDate: '2025-12-01', value: 659099 },
      acc_becu: { untilDate: null, value: 626529 },
    });

    render(
      <GroupDetailPanel
        group="Loans"
        accounts={[paidOff, bec]}
        historyData={history}
        hierarchyTimeframe="365d"
        onClose={() => {}}
      />
    );

    // Breakdown block is hidden for a single-series group — nothing stale to draw
    expect(screen.queryByTestId('donut-pie')).not.toBeInTheDocument();
    expect(screen.queryByText('Nationstar Mortgage')).not.toBeInTheDocument();
  });

  it('shows all accounts when none are paid off', () => {
    const history = buildHistory({
      acc_nationstar: { untilDate: null, value: 659099 },
      acc_becu: { untilDate: null, value: 626529 },
    });

    render(
      <GroupDetailPanel
        group="Loans"
        accounts={[
          acct({ id: 'acc_nationstar', name: 'Nationstar Mortgage', balance: 659099 }),
          bec,
        ]}
        historyData={history}
        hierarchyTimeframe="365d"
        onClose={() => {}}
      />
    );

    const rows = donutRows();
    expect(rows).toEqual([
      { name: 'Nationstar Mortgage', value: 659099 },
      { name: 'BECU Mortgage', value: 626529 },
    ]);
    // Center total = both live balances
    expect(screen.getAllByText(/1,285,628/).length).toBeGreaterThanOrEqual(1);
  });
});
