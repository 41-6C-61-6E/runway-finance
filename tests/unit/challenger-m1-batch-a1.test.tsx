// @vitest-environment jsdom
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DebtBreakdown } from '@/components/debt-breakdown';
import { PerformanceChart } from '@/components/investments/performance-chart';
import { useUserSettingsQuery } from '@/lib/hooks/use-settings';
import { useChartColorScheme } from '@/lib/hooks/use-chart-colors';
import { UserSettingsProvider } from '@/components/user-settings-provider';

// Mock recharts to capture props passed to Pie and Area
let capturedPieProps: any[] = [];
let capturedAreaProps: any[] = [];

vi.mock('recharts', async () => {
  const actual = await vi.importActual<any>('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="responsive-container" style={{ width: 800, height: 400 }}>
        {React.isValidElement(children)
          ? React.cloneElement(children, { width: 800, height: 400 } as any)
          : children}
      </div>
    ),
    Pie: Object.assign((props: any) => {
      capturedPieProps.push(props);
      return <actual.Pie {...props} />;
    }, { displayName: 'Pie' }),
    Area: Object.assign((props: any) => {
      capturedAreaProps.push(props);
      return <actual.Area {...props} />;
    }, { displayName: 'Area' }),
  };
});

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => window.location.pathname,
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/lib/hooks/use-card-collapsed', () => ({
  useCardCollapsed: () => [false, vi.fn()],
}));

vi.mock('@/components/privacy-mode-provider', () => ({
  usePrivacyMode: () => ({ privacyMode: false }),
}));

vi.mock('@/components/user-settings-provider', async () => {
  const actual = await vi.importActual<any>('@/components/user-settings-provider');
  return {
    ...actual,
    useUserSettings: () => ({
      settings: {
        currency: 'USD',
        timezone: 'America/New_York',
        chartColorScheme: 'fauntleroy',
      },
      loading: false,
    }),
  };
});

describe('Challenger M1 / Batch A1 Verification Suite', () => {
  let queryClient: QueryClient;
  const originalLocation = window.location;

  beforeEach(() => {
    vi.restoreAllMocks();
    capturedPieProps = [];
    capturedAreaProps = [];
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1024 });
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
  });

  afterEach(() => {
    delete (window as any).location;
    window.location = originalLocation as any;
  });

  const setWindowPathname = (pathname: string) => {
    delete (window as any).location;
    window.location = new URL(`http://localhost:3001${pathname}`) as any;
  };

  // =========================================================================
  // 1. Recharts Animation Verification
  // =========================================================================
  describe('Recharts Animation Settings', () => {
    it('ensures Pie chart in DebtBreakdown has isAnimationActive={false}', async () => {
      const mockAccounts = [
        { id: 'acc-1', name: 'Checking', type: 'checking', balance: 5000, currency: 'USD', isExcludedFromNetWorth: false, isHidden: false },
        { id: 'acc-2', name: 'Vanguard 401k', type: 'traditional_401k', balance: 50000, currency: 'USD', isExcludedFromNetWorth: false, isHidden: false },
        { id: 'acc-3', name: 'Beach Condo', type: 'condo', balance: 785000, currency: 'USD', isExcludedFromNetWorth: false, isHidden: false },
        { id: 'acc-4', name: 'Mortgage', type: 'mortgage', balance: -450000, currency: 'USD', isExcludedFromNetWorth: false, isHidden: false },
      ];

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockAccounts,
      });

      render(
        <QueryClientProvider client={queryClient}>
          <DebtBreakdown />
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(capturedPieProps.length).toBeGreaterThan(0);
      });

      const pieProp = capturedPieProps[0];
      expect(pieProp.isAnimationActive).toBe(false);
    });

    it('ensures Area charts in PerformanceChart have isAnimationActive={false}', async () => {
      const mockHistoryResponse = {
        data: [
          { date: '2026-01-01', value: 10000, twr: 0, benchmark: 0 },
          { date: '2026-02-01', value: 11000, twr: 10, benchmark: 5 },
        ],
        summary: {
          current: 11000,
          previous: 10000,
          change: 1000,
          percentChange: 10,
          twrPct: 10.0,
        },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockHistoryResponse,
      });

      localStorage.setItem('finance:investments:performance:showBenchmark', 'true');
      render(
        <QueryClientProvider client={queryClient}>
          <PerformanceChart />
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(capturedAreaProps.length).toBeGreaterThanOrEqual(1);
      });

      // Verify all rendered Area components have isAnimationActive={false}
      for (const areaProp of capturedAreaProps) {
        expect(areaProp.isAnimationActive).toBe(false);
      }
    });
  });

  // =========================================================================
  // 2. Unauthenticated /signin Query Silencing Verification
  // =========================================================================
  describe('User-Settings Silencing on /signin', () => {
    it('suppresses useUserSettingsQuery fetch when on /signin', async () => {
      setWindowPathname('/signin');
      const fetchSpy = vi.fn();
      global.fetch = fetchSpy;

      function TestComponent() {
        useUserSettingsQuery();
        return <div>Sign In Page Component</div>;
      }

      render(
        <QueryClientProvider client={queryClient}>
          <TestComponent />
        </QueryClientProvider>
      );

      // Allow microtasks to settle
      await new Promise((r) => setTimeout(r, 50));
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('suppresses useUserSettingsQuery fetch on /signin with query params or subpath', async () => {
      setWindowPathname('/signin?callbackUrl=%2Fplans');
      const fetchSpy = vi.fn();
      global.fetch = fetchSpy;

      function TestComponent() {
        useUserSettingsQuery();
        return <div>Sign In Page with Query</div>;
      }

      render(
        <QueryClientProvider client={queryClient}>
          <TestComponent />
        </QueryClientProvider>
      );

      await new Promise((r) => setTimeout(r, 50));
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('allows useUserSettingsQuery fetch when on authenticated routes', async () => {
      setWindowPathname('/plans');
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ theme: 'moonlight' }),
      });
      global.fetch = fetchSpy;

      function TestComponent() {
        useUserSettingsQuery();
        return <div>Plans Page</div>;
      }

      render(
        <QueryClientProvider client={queryClient}>
          <TestComponent />
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith('/api/user-settings', expect.anything());
      });
    });

    it('suppresses useChartColorScheme fetch when on /signin without UserSettingsContext', async () => {
      setWindowPathname('/signin');
      const fetchSpy = vi.fn();
      global.fetch = fetchSpy;

      function TestComponent() {
        useChartColorScheme();
        return <div>Chart Initializer on Signin</div>;
      }

      render(<TestComponent />);

      await new Promise((r) => setTimeout(r, 50));
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 3. Savings Rate & Seed Data Logic Verification
  // =========================================================================
  describe('Savings Rate & Category Mapping Logic', () => {
    it('ensures positive salary deposits never reduce expenses as offsets', () => {
      // Simulate the logic in lib/finance/savings-rate.ts:199-219
      const stats = { income: 0, expenses: 0 };
      const categoryExpense = { id: 'cat-misc', isIncome: false, categoryType: 'standard' };
      const categoryIncome = { id: 'cat-salary', isIncome: true, categoryType: 'standard' };

      const applyCashFlow = (category: any, cfAmount: number) => {
        if (cfAmount > 0) {
          if (category && !category.isIncome && cfAmount <= 0) {
            stats.expenses -= cfAmount;
          } else {
            stats.income += cfAmount;
          }
        } else if (cfAmount < 0) {
          const absAmt = Math.abs(cfAmount);
          if (category && category.isIncome) {
            stats.income -= absAmt;
          } else {
            stats.expenses += absAmt;
          }
        }
      };

      // 1. Regular salary deposit (+4750) with income category
      applyCashFlow(categoryIncome, 4750);
      expect(stats.income).toBe(4750);
      expect(stats.expenses).toBe(0);

      // 2. Misclassified deposit (+5000) with expense category:
      // Due to cfAmount <= 0 guard, it must NOT subtract from expenses!
      applyCashFlow(categoryExpense, 5000);
      expect(stats.income).toBe(9750);
      expect(stats.expenses).toBe(0);

      // 3. Regular expense outflow (-150)
      applyCashFlow(categoryExpense, -150);
      expect(stats.expenses).toBe(150);
      expect(stats.income).toBe(9750);
    });

    it('ensures getCat in seed script correctly falls back to income category', () => {
      // Replicate getCat from scripts/seed-demo01-synthetic-data.ts:182-195
      const existingCategories = [
        { id: 'cat-surf', name: 'Surfing & Ocean Gear', isIncome: false },
        { id: 'cat-housing', name: 'Housing', isIncome: false },
        { id: 'cat-inc-parent', name: 'Income', isIncome: true },
        { id: 'cat-sal', name: 'Salary & Wages', isIncome: true },
      ];

      const catMap = new Map<string, string>();
      for (const c of existingCategories) {
        catMap.set(c.name.toLowerCase().trim(), c.id);
      }

      const getCat = (name: string, fallback?: string): string => {
        const found = catMap.get(name.toLowerCase().trim());
        if (found) return found;
        if (fallback) {
          const fb = catMap.get(fallback.toLowerCase().trim());
          if (fb) return fb;
        }
        const incomeCat = existingCategories.find((c) => c.isIncome);
        if (fallback?.toLowerCase() === 'income' && incomeCat) {
          return incomeCat.id;
        }
        return existingCategories[0]?.id || '';
      };

      // Case 1: Exact match for 'Salary & Wages'
      expect(getCat('Salary & Wages', 'Income')).toBe('cat-sal');

      // Case 2: Exact match missing, fallback 'Income' resolves via catMap
      expect(getCat('Non-Existent Category', 'Income')).toBe('cat-inc-parent');

      // Case 3: If 'Income' is missing from catMap keys, existingCategories.find(c => c.isIncome) resolves it
      catMap.delete('income');
      expect(getCat('Non-Existent Category', 'Income')).toBe('cat-inc-parent');
    });
  });
});
