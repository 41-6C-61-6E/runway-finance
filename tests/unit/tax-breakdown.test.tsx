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
});
