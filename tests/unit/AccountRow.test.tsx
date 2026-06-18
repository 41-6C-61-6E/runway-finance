// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import AccountRow, { type Account } from '@/components/features/accounts/AccountRow';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

const mockUseUserSettings = vi.fn();
vi.mock('@/components/user-settings-provider', () => ({
  useUserSettings: () => mockUseUserSettings(),
}));

describe('AccountRow Component', () => {
  const mockAccount: Account = {
    id: 'acc_123',
    name: 'Chase Checking',
    type: 'checking',
    balance: '1250.55',
    currency: 'USD',
    institution: 'Chase',
    isHidden: false,
    isExcludedFromNetWorth: false,
    balanceDate: '2026-06-18',
    tags: [
      { id: 'tag_1', name: 'Personal', color: '#ff0000' },
    ],
  };

  const mockOnOpenDrawer = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseUserSettings.mockReturnValue({
      settings: {
        accountTagVisibility: {
          sidebar: true,
        },
      },
      updateSetting: vi.fn(),
      loading: false,
    });
  });

  it('renders the account name and formatted balance', () => {
    render(<AccountRow account={mockAccount} onOpenDrawer={mockOnOpenDrawer} />);

    expect(screen.getByText('Chase Checking')).toBeDefined();
    // $1,251 because formatCurrency uses minimumFractionDigits: 0, maximumFractionDigits: 0
    expect(screen.getByText('$1,251')).toBeDefined();
  });

  it('navigates to transaction page on click', () => {
    render(<AccountRow account={mockAccount} onOpenDrawer={mockOnOpenDrawer} />);

    const rowElement = screen.getByText('Chase Checking').closest('div');
    expect(rowElement).not.toBeNull();
    if (rowElement) {
      fireEvent.click(rowElement);
    }

    expect(mockPush).toHaveBeenCalledWith('/transactions?accountId=acc_123');
  });

  it('calls onOpenDrawer when edit button is clicked', () => {
    render(<AccountRow account={mockAccount} onOpenDrawer={mockOnOpenDrawer} />);

    const editButton = screen.getByTitle('Edit account');
    fireEvent.click(editButton);

    expect(mockOnOpenDrawer).toHaveBeenCalledWith(mockAccount);
  });

  it('renders tag indicators when enabled', () => {
    render(<AccountRow account={mockAccount} onOpenDrawer={mockOnOpenDrawer} />);

    const tagIndicator = screen.getByTitle('Personal');
    expect(tagIndicator).toBeDefined();
  });

  it('hides tag indicators when disabled in settings', () => {
    mockUseUserSettings.mockReturnValue({
      settings: {
        accountTagVisibility: {
          sidebar: false,
        },
      },
      updateSetting: vi.fn(),
      loading: false,
    });

    render(<AccountRow account={mockAccount} onOpenDrawer={mockOnOpenDrawer} />);

    const tagIndicator = screen.queryByTitle('Personal');
    expect(tagIndicator).toBeNull();
  });
});
