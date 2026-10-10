// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
import { TaxBreakdown } from '@/components/investments/tax-breakdown';

vi.mock('@/lib/hooks/use-card-collapsed', () => ({
  useCardCollapsed: () => [false, vi.fn()],
}));

describe('TaxBreakdown Component', () => {
  it('correctly maps accounts to their standard tax wrappers when no rothPercentage is set', () => {
    const mockAccounts = [
      {
        id: 'acc_1',
        name: 'My 401(k)',
        type: '401k',
        balance: 10000,
        institution: 'Fidelity',
        metadata: null,
      },
      {
        id: 'acc_2',
        name: 'Roth IRA',
        type: 'rothira',
        balance: 5000,
        institution: 'Vanguard',
        metadata: null,
      },
      {
        id: 'acc_3',
        name: 'Taxable Brokerage',
        type: 'brokerage',
        balance: 20000,
        institution: 'Schwab',
        metadata: null,
      },
    ];

    render(<TaxBreakdown accounts={mockAccounts} />);

    // Tax-Deferred should have 10,000 (from 401k)
    expect(screen.getByText('Tax-Deferred')).toBeDefined();
    expect(screen.getByText('$10,000')).toBeDefined();

    // Tax-Free should have 5,000 (from rothira)
    expect(screen.getByText('Tax-Free')).toBeDefined();
    expect(screen.getByText('$5,000')).toBeDefined();

    // Taxable should have 20,000 (from brokerage)
    expect(screen.getByText('Taxable')).toBeDefined();
    expect(screen.getByText('$20,000')).toBeDefined();
  });

  it('correctly splits balances when rothPercentage is set on an account', () => {
    const mockAccounts = [
      {
        id: 'acc_1',
        name: 'My Mixed 401(k)',
        type: '401k',
        balance: 10000, // $10,000 total balance
        institution: 'Fidelity',
        metadata: { rothPercentage: 40 }, // 40% Roth, 60% Traditional
      },
      {
        id: 'acc_2',
        name: 'Roth IRA',
        type: 'rothira',
        balance: 5000,
        institution: 'Vanguard',
        metadata: null,
      },
    ];

    render(<TaxBreakdown accounts={mockAccounts} />);

    // Total Tax-Free should be:
    // $5,000 (Roth IRA) + $4,000 (40% of $10,000 401k) = $9,000
    expect(screen.getByText('Tax-Free')).toBeDefined();
    expect(screen.getByText('$9,000')).toBeDefined();

    // Total Tax-Deferred should be:
    // $6,000 (60% of $10,000 401k) = $6,000
    expect(screen.getByText('Tax-Deferred')).toBeDefined();
    expect(screen.getByText('$6,000')).toBeDefined();
  });

  it('handles stringified metadata gracefully', () => {
    const mockAccounts = [
      {
        id: 'acc_1',
        name: 'My Mixed 401(k)',
        type: '401k',
        balance: 10000,
        institution: 'Fidelity',
        metadata: '{"rothPercentage": 30}', // Stringified metadata
      },
    ];

    render(<TaxBreakdown accounts={mockAccounts} />);

    // $3,000 (30%) Tax-Free, $7,000 (70%) Tax-Deferred
    expect(screen.getByText('Tax-Free')).toBeDefined();
    expect(screen.getByText('$3,000')).toBeDefined();
    expect(screen.getByText('Tax-Deferred')).toBeDefined();
    expect(screen.getByText('$7,000')).toBeDefined();
  });

  it('renders scorecard style conventions including hero metrics, pill badges, and distribution', () => {
    const mockAccounts = [
      {
        id: 'acc_1',
        name: '401(k)',
        type: '401k',
        balance: 60000,
        institution: 'Fidelity',
      },
      {
        id: 'acc_2',
        name: 'Roth IRA',
        type: 'rothira',
        balance: 40000,
        institution: 'Vanguard',
      },
      {
        id: 'acc_3',
        name: 'Brokerage',
        type: 'brokerage',
        balance: 100000,
        institution: 'Schwab',
      },
    ];

    const { container } = render(<TaxBreakdown accounts={mockAccounts} />);

    // Verify scorecard styling class conventions on root container
    const rootEl = container.firstChild as HTMLElement;
    expect(rootEl.className).toContain('bg-sidebar');
    expect(rootEl.className).toContain('border-sidebar-border');
    expect(rootEl.className).toContain('rounded-2xl');

    // Verify Scorecard header
    expect(screen.getByText('Scorecard')).toBeDefined();

    // Total = $200,000; Tax-Advantaged (401k + Roth) = $100,000 (50%); Brokerage = $100,000
    expect(screen.getByText('Tax-Advantaged Assets')).toBeDefined();
    expect(screen.getAllByText('$100,000').length).toBe(2);
    expect(screen.getAllByText(/50%/).length).toBeGreaterThan(0);
    expect(screen.getByText('Sheltered')).toBeDefined();

    // Verify Wrapper Distribution section and Wrapper Breakdown section
    expect(screen.getByText('Wrapper Distribution')).toBeDefined();
    expect(screen.getByText('Wrapper Breakdown')).toBeDefined();
    expect(screen.getByText('Majority of your portfolio is sheltered in tax-free & tax-deferred accounts.')).toBeDefined();
  });

  it('supports custom title prop', () => {
    const mockAccounts = [
      { id: 'acc_1', name: '401k', type: '401k', balance: 5000, institution: null },
    ];

    render(<TaxBreakdown accounts={mockAccounts} title={<span>Custom Tax Overview</span>} />);
    expect(screen.getByText('Custom Tax Overview')).toBeDefined();
  });
});

