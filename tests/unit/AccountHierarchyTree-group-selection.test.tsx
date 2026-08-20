// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import '@testing-library/jest-dom';

// jsdom has no matchMedia
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

  // jsdom has no ResizeObserver (used by components/ui/overflow-aware.tsx)
  if (!('ResizeObserver' in window)) {
    (window as any).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

const mockHideSubheadings = { value: false };
vi.mock('@/lib/hooks/use-account-subheadings', () => ({
  useAccountSubheadings: () => ({ hideSubheadings: mockHideSubheadings.value }),
}));

vi.mock('@/components/user-settings-provider', () => ({
  useUserSettings: () => ({
    settings: {},
    updateSetting: vi.fn(),
    loading: false,
  }),
}));

// Child renderers: stub the heavy chart panel and the transaction feed that does a real fetch
vi.mock('@/components/features/accounts/AccountTransactions', () => ({
  AccountTransactions: ({ accountId }: { accountId: string }) => (
    <div data-testid={`account-transactions-stub-${accountId}`} />
  ),
}));
vi.mock('@/components/features/accounts/AccountDetailPanel', () => ({
  default: ({ account }: { account: { name: string } | null }) => (
    <div
      data-testid="account-detail-panel-stub"
      data-account-name={account?.name ?? 'none'}
    />
  ),
}));
vi.mock('@/components/features/accounts/GroupDetailPanel', () => ({
  default: () => <div data-testid="group-detail-panel-stub" />,
}));
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  AreaChart: () => null,
  PieChart: () => null,
  Area: () => null,
  Pie: () => null,
  Cell: () => null,
  CartesianGrid: () => null,
  ReferenceLine: () => null,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

import AccountHierarchyTree from '@/components/features/accounts/AccountHierarchyTree';
import type { Account } from '@/components/features/accounts/account-types';

const accounts: Account[] = [
  {
    id: 'acc_checking',
    name: 'Main Checking',
    type: 'checking',
    balance: 2000,
    currency: 'USD',
    institution: 'Chase',
    isHidden: false,
    isExcludedFromNetWorth: false,
  },
  {
    id: 'acc_savings',
    name: 'High Yield Savings',
    type: 'savings',
    balance: 5000,
    currency: 'USD',
    institution: 'Chase',
    isHidden: false,
    isExcludedFromNetWorth: false,
  },
];

// ~40 days of history in 5-day steps so a 1-month window holds ≥ 2 points
function makeHistoryData(): any[] {
  const rows: any[] = [];
  const now = new Date();
  for (let i = 39; i >= 0; i -= 5) {
    const d = new Date(now.getTime() - i * 86400000);
    rows.push({
      date: d.toISOString().slice(0, 10),
      acc_checking: 1000 + (39 - i) * 10,
      acc_savings: 4000 + (39 - i) * 20,
      netWorth: 6000 + (39 - i) * 30,
    });
  }
  return rows;
}

const props = {
  filteredAllAccounts: accounts,
  allTags: [],
  historyData: makeHistoryData(),
  accountsLoading: false,
  targetAccountId: null,
};

// The inline slot is mounted only when a group is selected, directly under its heading (lg:hidden;
// the desktop side column is the other render site), so the slot id is a reliable assertion point.
function assertGroupDetailVisibleInlineUnderHeading() {
  const slot = document.getElementById('hierarchy-group-detail-inline');
  expect(slot).not.toBeNull();
  expect(slot?.querySelector('[data-testid="group-detail-panel-stub"]')).toBeInTheDocument();
}

function assertGroupDetailHidden() {
  expect(document.getElementById('hierarchy-group-detail-inline')).not.toBeInTheDocument();
}

// Click the visible "Banking" group heading row (its click handler is on a parent of the label span)
async function clickBankingGroup(user: ReturnType<typeof userEvent.setup>) {
  const headerRow = screen.getByText('Banking').closest('.cursor-pointer');
  expect(headerRow).not.toBeNull();
  await user.click(headerRow!);
}

describe('AccountHierarchyTree — group selection (mobile: no desktop side panel)', () => {

  it('does not show the group detail panel before a group heading is tapped', () => {
    render(<AccountHierarchyTree {...props} />);
    assertGroupDetailHidden();
  });

  it('tapping a group heading selects it and mounts the combined (group) detail panel', async () => {
    const user = userEvent.setup();
    render(<AccountHierarchyTree {...props} />);
    await clickBankingGroup(user);
    assertGroupDetailVisibleInlineUnderHeading();
    // Tapping the same heading again must not deselect it
    await clickBankingGroup(user);
    assertGroupDetailVisibleInlineUnderHeading();
  });

  it('tapping an account deselects the group (reverts to the account detail view)', async () => {
    const user = userEvent.setup();
    render(<AccountHierarchyTree {...props} />);
    await clickBankingGroup(user);
    assertGroupDetailVisibleInlineUnderHeading();

    const accRow = screen.getByText('Main Checking').closest('.cursor-pointer');
    expect(accRow).not.toBeNull();
    await user.click(accRow!);
    assertGroupDetailHidden();
    expect(screen.getByTestId('account-detail-panel-stub')).toHaveAttribute(
      'data-account-name',
      'Main Checking'
    );
    // The mobile inline single-account chart is still wired up
    expect(
      screen.getByTestId('account-transactions-stub-acc_checking')
    ).toBeInTheDocument();
  });

  it('the chevron toggles expansion without changing the group selection', async () => {
    const user = userEvent.setup();
    render(<AccountHierarchyTree {...props} />);

    // Collapse the group first (it is expanded by default)
    await user.click(screen.getByLabelText('Collapse Banking'));
    expect(screen.queryByText('Main Checking')).not.toBeInTheDocument();
    // Collapse action must have cleared/not set any selection
    assertGroupDetailHidden();

    // Re-expand and verify no selection side effect
    await user.click(screen.getByLabelText('Expand Banking'));
    expect(screen.getByText('Main Checking')).toBeInTheDocument();
    assertGroupDetailHidden();
  });
});
