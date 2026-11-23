// @vitest-environment jsdom
import React from 'react';
import { render, cleanup, fireEvent } from '@testing-library/react';
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
    // jsdom defaults to 1024px (>= the md breakpoint) where the bottom bar
    // is hidden in favor of the desktop sidebar. Mock a typical phone width.
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 390 });
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
    expect(netWorthLink.className).toContain('min-w-11');
    expect(netWorthLink.className).toContain('min-h-11');

    const menuButton = getByLabelText('Open navigation menu');
    expect(menuButton).not.toBeNull();
    expect(menuButton.className).toContain('min-w-11');
  });

  it('persists and restores custom home navigation items with fewer than 4 items', () => {
    localStorage.setItem('mobile-home-nav-items', JSON.stringify(['net-worth', 'transactions']));

    const { getByLabelText, container } = render(
      <QueryClientProvider client={queryClient}>
        <MobileSubNavProvider>
          <MobileNav />
        </MobileSubNavProvider>
      </QueryClientProvider>
    );

    expect(getByLabelText('Net Worth')).not.toBeNull();
    expect(getByLabelText('Transactions')).not.toBeNull();

    // The bar now auto-fills empty slots with default pages, but the user's
    // saved items keep their persisted order and still lead the bar.
    const barLinks = Array.from(container.querySelectorAll('nav a')).map((a) => a.getAttribute('aria-label'));
    expect(barLinks[0]).toBe('Net Worth');
    expect(barLinks[1]).toBe('Transactions');
    // The offline preview page is never auto-filled into the home bar.
    expect(barLinks).not.toContain('Offline mode (preview)');
  });

  it('renders floating individual frosted-glass nav buttons with compact bottom safe-area padding', () => {
    const { container, getByLabelText } = render(
      <QueryClientProvider client={queryClient}>
        <MobileSubNavProvider>
          <MobileNav />
        </MobileSubNavProvider>
      </QueryClientProvider>
    );

    const nav = container.querySelector('nav');
    expect(nav).not.toBeNull();
    expect(nav?.className).toContain('fixed');
    expect(nav?.className).toContain('bottom-0');
    expect(nav?.className).toContain('pointer-events-none');
    expect(nav?.className).toContain('pb-[max(1rem,calc(env(safe-area-inset-bottom,0px)*0.65))]');
    expect(nav?.className).not.toContain('bg-sidebar');
    expect(nav?.className).not.toContain('h-[calc(4rem+env(safe-area-inset-bottom))]');

    const netWorthLink = getByLabelText('Net Worth');
    expect(netWorthLink.className).toContain('pointer-events-auto');
    expect(netWorthLink.className).toContain('rounded-full');
    expect(netWorthLink.className).toContain('glass-nav-button-active');
    expect(netWorthLink.className).toContain('min-w-11');
    expect(netWorthLink.className).toContain('min-h-11');

    const menuButton = getByLabelText('Open navigation menu');
    expect(menuButton.className).toContain('pointer-events-auto');
    expect(menuButton.className).toContain('rounded-full');
    expect(menuButton.className).toContain('glass-nav-button');
    expect(menuButton.className).toContain('h-13');
    expect(menuButton.className).toContain('w-13');
    expect(menuButton.className).toContain('min-w-11');
    expect(menuButton.className).toContain('min-h-11');
  });

  it('fits 4 page items on standard iPhones, expands on larger phones, and keeps Edit Layout 1:1 in sync', () => {
    const cases = [
      { width: 390, expectedLinks: 4 },
      { width: 430, expectedLinks: 4 },
      { width: 480, expectedLinks: 5 },
    ];

    for (const { width, expectedLinks } of cases) {
      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: width });

      const { container, getByLabelText, getByText, unmount } = render(
        <QueryClientProvider client={queryClient}>
          <MobileSubNavProvider>
            <MobileNav />
          </MobileSubNavProvider>
        </QueryClientProvider>
      );

      const navLinks = Array.from(container.querySelectorAll('nav a'));
      expect(navLinks).toHaveLength(expectedLinks);
      expect(container.querySelectorAll('nav a, nav button')).toHaveLength(expectedLinks + 1);

      for (const btn of [...navLinks, getByLabelText('Open navigation menu')]) {
        expect(btn.className).toContain('h-13');
        expect(btn.className).toContain('w-13');
      }

      fireEvent.click(getByLabelText('Open navigation menu'));
      fireEvent.click(getByText('Edit Layout'));

      const barLabels = navLinks.map((a) => a.getAttribute('aria-label'));
      const editSlotLabels = Array.from(container.querySelectorAll('[data-slot-index] span')).map(
        (el) => el.textContent?.trim(),
      );
      expect(editSlotLabels).toHaveLength(expectedLinks);
      expect(editSlotLabels).toEqual(barLabels);

      unmount();
    }
  });
});
