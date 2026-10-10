// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { HoldingsAllocation } from '@/components/investments/holdings-allocation';

vi.mock('@/lib/hooks/use-card-collapsed', () => ({
  useCardCollapsed: () => [false, vi.fn()],
}));

vi.mock('recharts', async () => {
  const actual = await vi.importActual<any>('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="responsive-container" style={{ width: 800, height: 400 }}>
        {children}
      </div>
    ),
  };
});

const mockHoldings = [
  {
    accountId: 'acc-1',
    accountName: 'Roth IRA',
    institutionName: 'Vanguard',
    securityId: 'sec-1',
    ticker: 'VTI',
    name: 'Vanguard Total Stock Market ETF',
    quantity: 50,
    price: 250,
    value: 12500,
    costBasis: 10000,
    unrealizedGainLoss: 2500,
    unrealizedReturnPct: 25,
    portfolioWeight: 50,
    currency: 'USD',
  },
  {
    accountId: 'acc-2',
    accountName: 'Taxable Brokerage',
    institutionName: 'Fidelity',
    securityId: 'sec-2',
    ticker: 'BND',
    name: 'Vanguard Total Bond Market ETF',
    quantity: 150,
    price: 80,
    value: 12000,
    costBasis: 12000,
    unrealizedGainLoss: 0,
    unrealizedReturnPct: 0,
    portfolioWeight: 48,
    currency: 'USD',
  },
];

const mockAccounts = [
  {
    id: 'acc-1',
    name: 'Roth IRA',
    balance: 12500,
    institution: 'Vanguard',
    type: 'rothira',
  },
  {
    id: 'acc-2',
    name: 'Taxable Brokerage',
    balance: 12000,
    institution: 'Fidelity',
    type: 'brokerage',
  },
];

describe('HoldingsAllocation Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders allocation view controls (Group by) with Asset active by default, and no Rebalance tab', () => {
    render(<HoldingsAllocation holdings={mockHoldings} accounts={mockAccounts} />);

    // Allocation view content is visible
    expect(screen.getByText(/group by/i)).toBeDefined();
    const assetTab = screen.getByRole('tab', { name: /^asset$/i });
    expect(assetTab).toBeDefined();
    expect(assetTab.getAttribute('aria-selected')).toBe('true');

    expect(screen.getByRole('tab', { name: /^account$/i })).toBeDefined();
    expect(screen.getByRole('tab', { name: /^class$/i })).toBeDefined();
    expect(screen.getByRole('tab', { name: /^wrapper$/i })).toBeDefined();

    // Rebalance tab and strategy controls should NOT exist
    expect(screen.queryByRole('tab', { name: /^rebalance$/i })).toBeNull();
    expect(screen.queryByText(/target strategy/i)).toBeNull();
  });

  it('allows switching the "Group by" dimension in the allocation view', async () => {
    const user = userEvent.setup();
    render(<HoldingsAllocation holdings={mockHoldings} accounts={mockAccounts} />);

    const classTab = screen.getByRole('tab', { name: /^class$/i });
    expect(classTab.getAttribute('aria-selected')).toBe('false');

    await user.click(classTab);
    expect(classTab.getAttribute('aria-selected')).toBe('true');

    // Equities & Fixed Income should be in legend
    expect(screen.getByText('Equities')).toBeDefined();
    expect(screen.getByText('Fixed Income')).toBeDefined();
  });

  it('renders and toggles Show all holdings button when more than 7 holdings exist', async () => {
    const user = userEvent.setup();
    const manyHoldings = Array.from({ length: 10 }, (_, i) => ({
      accountId: 'acc-1',
      accountName: 'Roth IRA',
      institutionName: 'Vanguard',
      securityId: `sec-${i}`,
      ticker: `TCK${i}`,
      name: `Fund ${i}`,
      quantity: 10,
      price: 100,
      value: 1000 * (10 - i),
      costBasis: 900 * (10 - i),
      unrealizedGainLoss: 100 * (10 - i),
      unrealizedReturnPct: 10,
      portfolioWeight: 10,
      currency: 'USD',
    }));

    render(<HoldingsAllocation holdings={manyHoldings} accounts={mockAccounts} />);

    // Check "Show all 10 holdings" button is visible
    const showAllBtn = screen.getByRole('button', { name: /show all 10 holdings/i });
    expect(showAllBtn).toBeDefined();

    // Click to expand
    await user.click(showAllBtn);
    expect(screen.getByRole('button', { name: /show less/i })).toBeDefined();

    // Click to collapse back
    await user.click(screen.getByRole('button', { name: /show less/i }));
    expect(screen.getByRole('button', { name: /show all 10 holdings/i })).toBeDefined();
  });
});

