// @vitest-environment jsdom
import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { CashFlowSankey } from '@/components/cash-flow/cash-flow-sankey';
import { WealthFlowSankey } from '@/components/net-worth/wealth-flow-sankey';

const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/flows',
}));

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="recharts-responsive">{children}</div>
  ),
  Sankey: ({ children }: { children?: React.ReactNode }) => (
    <svg data-testid="recharts-sankey">{children}</svg>
  ),
  Tooltip: () => null,
}));

const mockApiFetch = vi.fn();
vi.mock('@/lib/utils/api-client', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

beforeAll(() => {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

describe('Flows Sankey mobile touch scrolling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiFetch.mockImplementation((url: string) => {
      if (url.startsWith('/api/categories')) {
        return Promise.resolve([
          { id: 'c1', parentId: null, name: 'Salary', color: '#10b981' },
          { id: 'c2', parentId: null, name: 'Food', color: '#ef4444' },
        ]);
      }
      if (url.startsWith('/api/cash-flow/categories')) {
        return Promise.resolve([
          {
            categoryId: 'c1',
            categoryName: 'Salary',
            categoryColor: '#10b981',
            isIncome: true,
            amount: 5000,
          },
          {
            categoryId: 'c2',
            categoryName: 'Food',
            categoryColor: '#ef4444',
            isIncome: false,
            amount: 1200,
          },
        ]);
      }
      if (url.startsWith('/api/accounts')) {
        return Promise.resolve([]);
      }
      if (url.startsWith('/api/wealth-flow')) {
        return Promise.resolve({
          nodes: [
            {
              id: 'inc1',
              label: 'Income',
              color: '#10b981',
              value: 1000,
              percentage: 100,
              type: 'increase',
            },
            {
              id: 'hub_net_worth_change',
              label: 'Net Worth Change',
              color: '#0ea5e9',
              value: 1000,
              percentage: 100,
              type: 'hub',
              netWorthChange: 1000,
            },
          ],
          links: [{ source: 'inc1', target: 'hub_net_worth_change', value: 1000 }],
          summary: {
            beginningNetWorth: 10000,
            endingNetWorth: 11000,
            totalIncreases: 1000,
            totalDecreases: 0,
            netWorthChange: 1000,
            percentChange: 10,
          },
        });
      }
      return Promise.resolve([]);
    });
  });

  it('CashFlowSankey scroll container allows both horizontal chart scroll and vertical page touch scrolling', async () => {
    const { container } = render(<CashFlowSankey />);

    await waitFor(() => {
      expect(container.querySelector('[data-testid="recharts-sankey"]')).not.toBeNull();
    });

    const scrollEl = container.querySelector('.scroll-contain-x');
    expect(scrollEl).not.toBeNull();
    expect(scrollEl?.className).toContain('overflow-x-auto');
    expect(scrollEl?.className).toContain('overscroll-x-contain');
    expect(scrollEl?.className).toContain('touch-manipulation');
    expect(scrollEl?.className).not.toContain('touch-pan-x');
    expect(scrollEl?.className).not.toContain('touch-pan-y');
  });

  it('WealthFlowSankey scroll container allows both horizontal chart scroll and vertical page touch scrolling', async () => {
    const { container } = render(<WealthFlowSankey />);

    await waitFor(() => {
      expect(container.querySelector('[data-testid="recharts-sankey"]')).not.toBeNull();
    });

    const scrollEl = container.querySelector('.scroll-contain-x');
    expect(scrollEl).not.toBeNull();
    expect(scrollEl?.className).toContain('overflow-x-auto');
    expect(scrollEl?.className).toContain('overscroll-x-contain');
    expect(scrollEl?.className).toContain('touch-manipulation');
    expect(scrollEl?.className).not.toContain('touch-pan-x');
    expect(scrollEl?.className).not.toContain('touch-pan-y');
  });
});
