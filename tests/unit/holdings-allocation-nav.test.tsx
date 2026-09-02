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

describe('HoldingsAllocation Navigation Redesign', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders primary view tabs (Allocation and Rebalance) with Allocation active by default', () => {
    render(<HoldingsAllocation holdings={mockHoldings} accounts={mockAccounts} />);

    // Primary view tabs
    const allocationTab = screen.getByRole('tab', { name: /^allocation$/i });
    const rebalanceTab = screen.getByRole('tab', { name: /^rebalance$/i });

    expect(allocationTab).toBeDefined();
    expect(rebalanceTab).toBeDefined();
    expect(allocationTab.getAttribute('aria-selected')).toBe('true');
    expect(rebalanceTab.getAttribute('aria-selected')).toBe('false');

    // Allocation view content is visible
    expect(screen.getByText(/group by/i)).toBeDefined();
    expect(screen.getByRole('tab', { name: /^asset$/i })).toBeDefined();
    expect(screen.getByRole('tab', { name: /^account$/i })).toBeDefined();
    expect(screen.getByRole('tab', { name: /^class$/i })).toBeDefined();
    expect(screen.getByRole('tab', { name: /^wrapper$/i })).toBeDefined();
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

  it('switches to Rebalance view with target strategy pills and comparison table', async () => {
    const user = userEvent.setup();
    render(<HoldingsAllocation holdings={mockHoldings} accounts={mockAccounts} />);

    const rebalanceTab = screen.getByRole('tab', { name: /^rebalance$/i });
    await user.click(rebalanceTab);

    expect(rebalanceTab.getAttribute('aria-selected')).toBe('true');

    // Rebalance view controls
    expect(screen.getByText(/target strategy/i)).toBeDefined();
    expect(screen.getByRole('tab', { name: /three-fund/i })).toBeDefined();
    expect(screen.getByRole('tab', { name: /classic balanced/i })).toBeDefined();
    expect(screen.getByRole('tab', { name: /aggressive growth/i })).toBeDefined();
    expect(screen.getByRole('tab', { name: /capital preservation/i })).toBeDefined();

    // Rebalancing table columns
    expect(screen.getByText('Asset Class')).toBeDefined();
    expect(screen.getByText('Action Needed')).toBeDefined();

    // "Group by" should NOT be visible in rebalance view
    expect(screen.queryByText(/group by/i)).toBeNull();
  });

  it('updates selected target strategy model in Rebalance view', async () => {
    const user = userEvent.setup();
    render(<HoldingsAllocation holdings={mockHoldings} accounts={mockAccounts} />);

    const rebalanceTab = screen.getByRole('tab', { name: /^rebalance$/i });
    await user.click(rebalanceTab);

    const aggressiveTab = screen.getByRole('tab', { name: /aggressive growth/i });
    expect(aggressiveTab.getAttribute('aria-selected')).toBe('false');

    await user.click(aggressiveTab);
    expect(aggressiveTab.getAttribute('aria-selected')).toBe('true');
  });

  it('can navigate back from Rebalance to Allocation view', async () => {
    const user = userEvent.setup();
    render(<HoldingsAllocation holdings={mockHoldings} accounts={mockAccounts} />);

    const rebalanceTab = screen.getByRole('tab', { name: /^rebalance$/i });
    await user.click(rebalanceTab);
    expect(screen.getByText(/target strategy/i)).toBeDefined();

    const allocationTab = screen.getByRole('tab', { name: /^allocation$/i });
    await user.click(allocationTab);
    expect(screen.getByText(/group by/i)).toBeDefined();
    expect(screen.queryByText(/target strategy/i)).toBeNull();
  });
});

