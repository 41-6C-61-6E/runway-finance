// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TransactionTable from '@/components/features/transactions/transaction-table';

const mockUseUserSettings = vi.fn();
vi.mock('@/components/user-settings-provider', () => ({
  useUserSettings: () => mockUseUserSettings(),
}));

beforeAll(() => {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };

  class MockIntersectionObserver {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
  global.IntersectionObserver =
    MockIntersectionObserver as unknown as typeof IntersectionObserver;
});

const baseFilters = {
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
};

describe('TransactionTable - Desktop Category Pill Consistency', () => {
  let queryClient: QueryClient;
  let fetchMock: ReturnType<typeof vi.fn>;

  const mockTransactions = [
    {
      id: 'tx-cat',
      date: '2026-10-10',
      description: 'NETFLIX.COM',
      payee: 'Netflix',
      amount: '-15.99',
      pending: false,
      postedDate: null,
      reviewed: true,
      categoryId: 'cat-ent',
      category: { id: 'cat-ent', name: 'Entertainment', color: '#6366f1' },
      accountName: 'Chase Sapphire',
      accountType: 'credit',
      categorizedByAi: true,
      tags: [],
      accountTags: [],
    },
    {
      id: 'tx-uncat',
      date: '2026-10-09',
      description: 'COFFEE SHOP',
      payee: 'Coffee Shop',
      amount: '-6.50',
      pending: false,
      postedDate: null,
      reviewed: false,
      categoryId: null,
      category: null,
      accountName: 'Checking',
      accountType: 'checking',
      categorizedByAi: false,
      tags: [],
      accountTags: [],
    },
  ];

  const mockCategories = [
    {
      id: 'cat-ent',
      parentId: null,
      name: 'Entertainment',
      color: '#6366f1',
      isIncome: false,
    },
    {
      id: 'cat-food',
      parentId: null,
      name: 'Groceries',
      color: '#22c55e',
      isIncome: false,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1440,
    });
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
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

    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    mockUseUserSettings.mockReturnValue({
      settings: { accountTagVisibility: { transactions: true } },
      updateSetting: vi.fn(),
    });

    fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/api/recurring')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ items: [] }),
        });
      }
      if (url.includes('/api/categories')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockCategories),
        });
      }
      if (url.includes('/api/transactions/') && init?.method === 'PATCH') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ ok: true }),
        });
      }
      if (url.includes('/api/transactions')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              data: mockTransactions,
              total: mockTransactions.length,
              totalAmount: -22.49,
            }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
      });
    });

    global.fetch = fetchMock as unknown as typeof fetch;
  });

  function getPillSnapshot() {
    const catButton = screen.getByRole('button', {
      name: 'Change category: Entertainment',
    });
    const catPill = catButton.querySelector('span.category-pill');
    const uncatButton = screen.getByRole('button', { name: 'Assign category' });
    const uncatPill = uncatButton.querySelector('span');

    expect(catPill).not.toBeNull();
    expect(uncatPill).not.toBeNull();

    return {
      catClasses: catPill!.className.split(/\s+/).sort(),
      uncatClasses: uncatPill!.className.split(/\s+/).sort(),
      catRaw: catPill!.className,
      uncatRaw: uncatPill!.className,
    };
  }

  it('uses identical enlarged category and uncategorized pill sizing across Detailed and Compact desktop views', async () => {
    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <TransactionTable
          filters={baseFilters}
          onSelectAll={vi.fn()}
          compactView={false}
        />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Entertainment')).toBeDefined();
      expect(screen.getByText('Uncategorized')).toBeDefined();
    });

    const detailed = getPillSnapshot();
    expect(detailed.catClasses).toEqual(
      expect.arrayContaining(['category-pill', 'text-[0.8125rem]', 'leading-5', 'px-2.5', 'py-0.5', 'rounded-full']),
    );
    expect(detailed.catRaw).not.toContain('text-[10px]');
    expect(detailed.catRaw).not.toContain('text-xs');

    expect(detailed.uncatClasses).toEqual(
      expect.arrayContaining(['bg-muted', 'text-[0.8125rem]', 'leading-5', 'px-2.5', 'py-0.5', 'rounded-full']),
    );
    expect(detailed.uncatRaw).not.toContain('text-[11px]');
    expect(detailed.uncatRaw).not.toContain('text-xs');
    expect(detailed.uncatRaw).not.toContain('italic');

    rerender(
      <QueryClientProvider client={queryClient}>
        <TransactionTable
          filters={baseFilters}
          onSelectAll={vi.fn()}
          compactView={true}
        />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Entertainment')).toBeDefined();
      expect(screen.getByText('Uncategorized')).toBeDefined();
    });

    const compact = getPillSnapshot();
    expect(compact.catClasses).toEqual(detailed.catClasses);
    expect(compact.uncatClasses).toEqual(detailed.uncatClasses);
  });

  it.each([
    { label: 'Detailed', compactView: false },
    { label: 'Compact', compactView: true },
  ])(
    'opens category dropdown and updates via PATCH without triggering row click in $label view',
    async ({ compactView }) => {
      const onTransactionClick = vi.fn();

      render(
        <QueryClientProvider client={queryClient}>
          <TransactionTable
            filters={baseFilters}
            onSelectAll={vi.fn()}
            onTransactionClick={onTransactionClick}
            compactView={compactView}
          />
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText('Uncategorized')).toBeDefined();
      });

      const assignBtn = screen.getByRole('button', { name: 'Assign category' });
      fireEvent.click(assignBtn);

      expect(onTransactionClick).not.toHaveBeenCalled();
      expect(screen.getByPlaceholderText('Search categories...')).toBeDefined();

      const groceriesOption = screen.getByRole('button', { name: 'Groceries' });
      fireEvent.click(groceriesOption);

      await waitFor(() => {
        const patchCall = fetchMock.mock.calls.find(
          ([u, init]) =>
            String(u).includes('/api/transactions/tx-uncat') &&
            (init as RequestInit | undefined)?.method === 'PATCH',
        );
        expect(patchCall).toBeDefined();
        expect(JSON.parse(String((patchCall?.[1] as RequestInit).body))).toEqual({
          categoryId: 'cat-food',
        });
      });

      const noThanksBtn = await screen.findByRole('button', {
        name: 'No thanks',
      });
      fireEvent.click(noThanksBtn);

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: 'Change category: Groceries' }),
        ).toBeDefined();
      });
    },
  );
});
