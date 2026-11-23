// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TransactionTable from '@/components/features/transactions/transaction-table';
import TransactionDetailDrawer from '@/components/features/transactions/transaction-detail-drawer';
import { shiftDaysUTC, toDateString } from '@/lib/utils/date';

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
  global.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;
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

describe('TransactionMobileList (phone layout)', () => {
  let queryClient: QueryClient;
  let fetchMock: ReturnType<typeof vi.fn>;

  const todayKey = toDateString(new Date());
  const yesterdayKey = shiftDaysUTC(todayKey, -1);

  const mockTransactions = [
    {
      id: 'tx-today',
      date: todayKey,
      description: 'NETFLIX.COM',
      payee: 'Netflix',
      amount: '-15.99',
      pending: false,
      reviewed: true,
      categoryId: 'cat-ent',
      category: { id: 'cat-ent', name: 'Entertainment', color: '#6366f1' },
      accountName: 'Chase Sapphire',
      accountType: 'credit',
      categorizedByAi: false,
      tags: [{ id: 'tag-1', name: 'Subscription', color: '#6366f1' }],
      accountTags: [{ id: 'atag-1', name: 'Personal', color: '#10b981' }],
    },
    {
      id: 'tx-yesterday',
      date: yesterdayKey,
      description: 'ACME PAYROLL',
      payee: 'Acme Payroll',
      amount: '2500.00',
      pending: false,
      reviewed: true,
      categoryId: 'cat-inc',
      category: { id: 'cat-inc', name: 'Paycheck', color: '#10b981' },
      accountName: 'Checking',
      accountType: 'checking',
      categorizedByAi: false,
      tags: [],
      accountTags: [],
    },
    {
      id: 'tx-older',
      date: '2025-12-31',
      description: 'COFFEE SHOP',
      payee: null,
      amount: '-6.50',
      pending: true,
      reviewed: false,
      categoryId: null,
      category: null,
      accountName: 'Amex Gold',
      accountType: 'credit',
      categorizedByAi: false,
      tags: [],
      accountTags: [],
    },
    {
      id: 'tx-split-parent',
      date: '2025-12-31',
      description: 'Target Run',
      payee: 'Target',
      amount: '-80.00',
      pending: false,
      reviewed: true,
      categoryId: null,
      category: null,
      accountName: 'Checking',
      accountType: 'checking',
      categorizedByAi: false,
      tags: [],
      accountTags: [],
      splits: [
        {
          id: 'split-1',
          amount: '-50.00',
          description: 'Groceries',
          categoryId: 'cat-food',
          categoryName: 'Groceries',
          categoryColor: '#22c55e',
          notes: null,
        },
        {
          id: 'split-2',
          amount: '-30.00',
          description: 'Household',
          categoryId: 'cat-home',
          categoryName: 'Home',
          categoryColor: '#f59e0b',
          notes: null,
        },
      ],
    },
  ];

  const mockCategories = [
    { id: 'cat-ent', parentId: null, name: 'Entertainment', color: '#6366f1', isIncome: false },
    { id: 'cat-inc', parentId: null, name: 'Paycheck', color: '#10b981', isIncome: true },
    { id: 'cat-food', parentId: null, name: 'Groceries', color: '#22c55e', isIncome: false },
  ];

  const mockRecurring = {
    items: [
      {
        id: 'rec-1',
        displayName: 'Netflix',
        merchantName: 'Netflix',
        matchPattern: 'netflix',
        frequency: 'monthly',
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 390 });
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('max-width: 767px'),
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
      settings: {
        accountTagVisibility: { transactions: true },
      },
      updateSetting: vi.fn(),
    });

    fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/api/recurring')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockRecurring),
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
      if (url.includes('/api/transactions') && url.includes('totalAmountOnly=true')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ totalAmount: 2397.51 }),
        });
      }
      if (url.includes('/api/transactions')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              data: mockTransactions,
              total: mockTransactions.length,
              totalAmount: 2397.51,
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

  it('renders date-grouped mobile rows without search spyglass or trailing chevrons', async () => {
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <TransactionTable filters={baseFilters} onSelectAll={vi.fn()} />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Netflix')).toBeDefined();
    });

    expect(screen.getByRole('heading', { name: 'Today' })).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Yesterday' })).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Wed, Dec 31, 2025' })).toBeDefined();

    // No inline Google search button or trailing chevrons on mobile rows
    expect(screen.queryByLabelText(/Search on Google/i)).toBeNull();
    expect(container.querySelectorAll('.lucide-chevron-right')).toHaveLength(0);

    // No per-row dividers inside list containers, only date section bottom dividers
    expect(container.querySelectorAll('.divide-y')).toHaveLength(0);
    expect(container.querySelectorAll('section .border-b')).toHaveLength(3);

    // Pending row keeps subtle background tint without left vertical accent bar
    const pendingRow = screen.getByLabelText(/COFFEE SHOP \(pending\)/i);
    expect(pendingRow.className).toContain('bg-primary/');
    expect(pendingRow.className).not.toContain('border-l-2');

    // Positive vs expense styling
    const positiveEl = screen.getByText('+$2,500.00');
    expect(positiveEl.className).toContain('text-emerald-600');
    const expenseEl = screen.getByText('-$15.99');
    expect(expenseEl.className).toContain('text-foreground');
    expect(expenseEl.className).not.toContain('text-emerald-600');

    // Pending badge, recurring icon (without frequency text), and tags
    expect(screen.getByText('Pending')).toBeDefined();
    expect(screen.getByLabelText(/Recurring: Netflix/i)).toBeDefined();
    expect(screen.queryByText('monthly')).toBeNull();
    expect(screen.queryByText('Monthly')).toBeNull();
    expect(screen.getByText('#Subscription')).toBeDefined();
    expect(screen.getByText('#Personal')).toBeDefined();
  });

  it('switches sort via mobile selector, drops date headers, and shows inline dates', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <TransactionTable filters={baseFilters} onSelectAll={vi.fn()} />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Netflix')).toBeDefined();
    });

    const sortSelect = screen.getByLabelText('Sort transactions');
    fireEvent.change(sortSelect, { target: { value: 'amount:desc' } });

    await waitFor(() => {
      const calls = fetchMock.mock.calls.map(([u]) => String(u));
      expect(calls.some((u) => u.includes('sort=amount') && u.includes('order=desc'))).toBe(true);
    });

    expect(screen.queryByRole('heading', { name: 'Today' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Yesterday' })).toBeNull();
    expect(screen.getAllByText('Dec 31').length).toBeGreaterThan(0);
  });

  it('opens bottom category sheet without triggering row click and updates category via PATCH', async () => {
    const onTransactionClick = vi.fn();

    render(
      <QueryClientProvider client={queryClient}>
        <TransactionTable
          filters={baseFilters}
          onSelectAll={vi.fn()}
          onTransactionClick={onTransactionClick}
        />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('COFFEE SHOP')).toBeDefined();
    });

    // Tapping row opens detail drawer callback
    const netflixRow = screen.getByLabelText(/Netflix, -\$15\.99/i);
    fireEvent.click(netflixRow);
    expect(onTransactionClick).toHaveBeenCalledTimes(1);
    expect(onTransactionClick).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'tx-today' }),
    );

    // Tapping Uncategorized pill opens Sheet without triggering row click
    const catButton = screen.getByRole('button', { name: 'Assign category' });
    fireEvent.click(catButton);
    expect(onTransactionClick).toHaveBeenCalledTimes(1);

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeDefined();
    expect(document.activeElement?.tagName).not.toBe('INPUT');
    expect(document.activeElement?.tagName).not.toBe('TEXTAREA');

    const groceriesOption = screen.getByRole('button', { name: 'Groceries' });
    fireEvent.click(groceriesOption);

    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(
        ([u, init]) =>
          String(u).includes('/api/transactions/tx-older') &&
          (init as RequestInit | undefined)?.method === 'PATCH',
      );
      expect(patchCall).toBeDefined();
      expect(JSON.parse(String((patchCall?.[1] as RequestInit).body))).toEqual({
        categoryId: 'cat-food',
      });
    });

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  it('renders split children indented and opens parent transaction when tapped', async () => {
    const onTransactionClick = vi.fn();

    render(
      <QueryClientProvider client={queryClient}>
        <TransactionTable
          filters={baseFilters}
          onSelectAll={vi.fn()}
          onTransactionClick={onTransactionClick}
        />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Target')).toBeDefined();
    });

    expect(screen.getByText('2 splits')).toBeDefined();
    const splitRow = screen.getByLabelText(/Split: Groceries/i);
    fireEvent.click(splitRow);
    expect(onTransactionClick).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'tx-split-parent' }),
    );
  });

  it('hides tags on mobile when accountTagVisibility.transactions is false', async () => {
    mockUseUserSettings.mockReturnValue({
      settings: {
        accountTagVisibility: { transactions: false },
      },
      updateSetting: vi.fn(),
    });

    render(
      <QueryClientProvider client={queryClient}>
        <TransactionTable filters={baseFilters} onSelectAll={vi.fn()} />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Netflix')).toBeDefined();
    });

    expect(screen.queryByText('#Subscription')).toBeNull();
    expect(screen.queryByText('#Personal')).toBeNull();
  });

  it('renders Google look up link inside TransactionDetailDrawer in edit mode', async () => {
    render(
      <TransactionDetailDrawer
        open={true}
        mode="edit"
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        transaction={{
          id: 'tx-1',
          date: '2026-11-22',
          postedDate: null,
          description: 'SQ *BLUE BOTTLE',
          payee: 'Blue Bottle Coffee',
          memo: null,
          amount: '-6.25',
          categoryId: null,
          categoryName: null,
          categoryColor: null,
          accountName: 'Sapphire',
          notes: null,
          reviewed: false,
          ignored: false,
          pending: false,
          categorizedByAi: false,
        }}
      />,
    );

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeDefined();
    expect(document.activeElement?.tagName).not.toBe('INPUT');
    expect(document.activeElement?.tagName).not.toBe('TEXTAREA');

    const lookupLink = await screen.findByRole('link', { name: /Look up/i });
    expect(lookupLink.getAttribute('href')).toBe(
      `https://www.google.com/search?q=${encodeURIComponent('Blue Bottle Coffee SQ *BLUE BOTTLE')}`,
    );
    expect(lookupLink.getAttribute('target')).toBe('_blank');
    expect(screen.getByRole('button', { name: /Delete Transaction/i })).toBeDefined();
  });
});
