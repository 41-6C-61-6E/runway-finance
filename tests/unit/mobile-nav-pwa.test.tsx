// @vitest-environment jsdom
import React from 'react';
import { render, cleanup } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MobileNav } from '@/components/mobile-nav';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MobileSubNavProvider } from '@/components/mobile-subnav-context';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/lib/hooks/use-hidden-pages', () => ({
  useHiddenPages: () => ({ isHidden: () => false }),
  DEV_MODE_PAGE_KEYS: [],
}));

describe('MobileNav PWA & Accessibility', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    queryClient = new QueryClient();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ devMode: false }),
    } as Response);
  });

  afterEach(() => {
    cleanup();
  });

  it('renders bottom nav links with accessible aria-labels and minimum touch targets', () => {
    const { getByLabelText } = render(
      <QueryClientProvider client={queryClient}>
        <MobileSubNavProvider>
          <MobileNav />
        </MobileSubNavProvider>
      </QueryClientProvider>
    );

    const netWorthLink = getByLabelText('Net Worth');
    expect(netWorthLink).not.toBeNull();
    expect(netWorthLink.getAttribute('href')).toBe('/');
    expect(netWorthLink.className).toContain('min-w-[44px]');
    expect(netWorthLink.className).toContain('min-h-[44px]');

    const menuButton = getByLabelText('Open navigation menu');
    expect(menuButton).not.toBeNull();
    expect(menuButton.className).toContain('min-w-[44px]');
  });

  it('persists and restores custom home navigation items with fewer than 4 items', () => {
    localStorage.setItem('mobile-home-nav-items', JSON.stringify(['net-worth', 'transactions']));

    const { getByLabelText, queryByLabelText } = render(
      <QueryClientProvider client={queryClient}>
        <MobileSubNavProvider>
          <MobileNav />
        </MobileSubNavProvider>
      </QueryClientProvider>
    );

    expect(getByLabelText('Net Worth')).not.toBeNull();
    expect(getByLabelText('Transactions')).not.toBeNull();
    expect(queryByLabelText('Spending')).toBeNull();
  });
});
