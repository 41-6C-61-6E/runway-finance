// @vitest-environment jsdom
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TransactionTable from '@/components/features/transactions/TransactionTable';

const mockUseUserSettings = vi.fn();
vi.mock('@/components/user-settings-provider', () => ({
  useUserSettings: () => mockUseUserSettings(),
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

// Mock IntersectionObserver
class MockIntersectionObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
global.IntersectionObserver = MockIntersectionObserver as any;

describe('TransactionTable - Tags Visibility & Recurring Labels', () => {
  let queryClient: QueryClient;

  const mockTransaction = {
    id: 'tx-1',
    date: '2026-10-10',
    description: 'Netflix Monthly Subscription',
    payee: 'Netflix',
    amount: '15.99',
    pending: false,
    reviewed: true,
    categoryId: 'cat-1',
    categoryName: 'Entertainment',
    accountName: 'Chase Sapphire',
    accountType: 'credit',
    tags: [{ id: 'tag-1', name: 'Subscription', color: '#6366f1' }],
    accountTags: [{ id: 'atag-1', name: 'Personal', color: '#10b981' }],
  };

  const mockRecurring = {
    items: [
      {
        id: 'rec-1',
        displayName: 'Netflix',
        merchantName: 'Netflix',
        pattern: 'netflix',
        frequency: 'monthly',
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/recurring')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockRecurring),
        });
      }
      if (url.includes('/api/categories')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([{ id: 'cat-1', name: 'Entertainment', color: '#6366f1' }]),
        });
      }
      if (url.includes('/api/transactions')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            data: [mockTransaction],
            total: 1,
            hasMore: false,
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
      });
    });
  });

  it('hides tags in the register when accountTagVisibility.transactions is false', async () => {
    mockUseUserSettings.mockReturnValue({
      settings: {
        accountTagVisibility: {
          transactions: false,
        },
      },
      updateSetting: vi.fn(),
    });

    render(
      <QueryClientProvider client={queryClient}>
        <TransactionTable
          filters={{
            accountId: null,
            accountIds: null,
            accountTypes: null,
            categoryId: null,
            categoryIds: null,
            excludeCategoryIds: null,
            excludeTagIds: null,
            tagId: null,
            tagIds: null,
            accountTagIds: null,
            search: null,
            type: null,
            startDate: null,
            endDate: null,
            pending: null,
            reviewed: null,
            minAmount: null,
            maxAmount: null,
            categorizedByAi: null,
            sort: 'date',
            order: 'desc',
          }}
          compactView={false}
          onSelectAll={vi.fn()}
        />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Netflix')).toBeDefined();
    });

    // Tag pills should not be displayed
    expect(screen.queryByText('#Subscription')).toBeNull();
  });

  it('shows tags in the register when accountTagVisibility.transactions is true', async () => {
    mockUseUserSettings.mockReturnValue({
      settings: {
        accountTagVisibility: {
          transactions: true,
        },
      },
      updateSetting: vi.fn(),
    });

    render(
      <QueryClientProvider client={queryClient}>
        <TransactionTable
          filters={{
            accountId: null,
            accountIds: null,
            accountTypes: null,
            categoryId: null,
            categoryIds: null,
            excludeCategoryIds: null,
            excludeTagIds: null,
            tagId: null,
            tagIds: null,
            accountTagIds: null,
            search: null,
            type: null,
            startDate: null,
            endDate: null,
            pending: null,
            reviewed: null,
            minAmount: null,
            maxAmount: null,
            categorizedByAi: null,
            sort: 'date',
            order: 'desc',
          }}
          compactView={false}
          onSelectAll={vi.fn()}
        />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Netflix')).toBeDefined();
    });

    // Tag pill should be displayed
    expect(screen.getByText('#Subscription')).toBeDefined();
  });

  it('renders recurring icon but does NOT render the frequency word', async () => {
    mockUseUserSettings.mockReturnValue({
      settings: {
        accountTagVisibility: {
          transactions: true,
        },
      },
      updateSetting: vi.fn(),
    });

    render(
      <QueryClientProvider client={queryClient}>
        <TransactionTable
          filters={{
            accountId: null,
            accountIds: null,
            accountTypes: null,
            categoryId: null,
            categoryIds: null,
            excludeCategoryIds: null,
            excludeTagIds: null,
            tagId: null,
            tagIds: null,
            accountTagIds: null,
            search: null,
            type: null,
            startDate: null,
            endDate: null,
            pending: null,
            reviewed: null,
            minAmount: null,
            maxAmount: null,
            categorizedByAi: null,
            sort: 'date',
            order: 'desc',
          }}
          compactView={false}
          onSelectAll={vi.fn()}
        />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Netflix')).toBeDefined();
    });

    // Recurring badge with aria-label should exist
    const recurringBadge = screen.getByLabelText(/Recurring transaction: Netflix/i);
    expect(recurringBadge).toBeDefined();

    // The text 'monthly' should NOT be present in the badge/document
    expect(screen.queryByText('monthly')).toBeNull();
    expect(screen.queryByText('Monthly')).toBeNull();
  });

  it('hides tags in compact view when accountTagVisibility.transactions is false', async () => {
    mockUseUserSettings.mockReturnValue({
      settings: {
        accountTagVisibility: {
          transactions: false,
        },
      },
      updateSetting: vi.fn(),
    });

    render(
      <QueryClientProvider client={queryClient}>
        <TransactionTable
          filters={{
            accountId: null,
            accountIds: null,
            accountTypes: null,
            categoryId: null,
            categoryIds: null,
            excludeCategoryIds: null,
            excludeTagIds: null,
            tagId: null,
            tagIds: null,
            accountTagIds: null,
            search: null,
            type: null,
            startDate: null,
            endDate: null,
            pending: null,
            reviewed: null,
            minAmount: null,
            maxAmount: null,
            categorizedByAi: null,
            sort: 'date',
            order: 'desc',
          }}
          compactView={true}
          onSelectAll={vi.fn()}
        />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Netflix')).toBeDefined();
    });

    // Tag pills should not be displayed in compact view
    expect(screen.queryByText('#Subscription')).toBeNull();

    // In compact view, recurring badge exists with icon only
    const recurringBadge = screen.getByLabelText(/Recurring: Netflix/i);
    expect(recurringBadge).toBeDefined();
    expect(screen.queryByText('monthly')).toBeNull();
  });
});
