// @vitest-environment jsdom
import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MobileNav } from '@/components/mobile-nav';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

vi.mock('next/navigation', () => ({
  usePathname: () => '/transactions',
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

vi.mock('@/components/privacy-provider', () => ({
  usePrivacy: () => ({
    privacyMode: false,
    togglePrivacyMode: vi.fn(),
  }),
}));

vi.mock('next-auth/react', () => ({
  useSession: () => ({
    data: { user: { name: 'Demo User', email: 'demo@example.com' } },
    status: 'authenticated',
  }),
  signOut: vi.fn(),
}));

class MockVisualViewport extends EventTarget {
  width = 390;
  height: number;
  offsetTop: number;
  offsetLeft = 0;
  pageTop = 0;
  pageLeft = 0;
  scale = 1;

  constructor(height = 844, offsetTop = 0) {
    super();
    this.height = height;
    this.offsetTop = offsetTop;
  }
}

describe('MobileNav & Sheet keyboard behavior', () => {
  const originalVisualViewport = window.visualViewport;
  const originalFetch = global.fetch;
  const originalScrollHeightDescriptor = Object.getOwnPropertyDescriptor(
    document.documentElement,
    'scrollHeight',
  );
  const originalScrollYDescriptor = Object.getOwnPropertyDescriptor(window, 'scrollY');
  const originalScrollXDescriptor = Object.getOwnPropertyDescriptor(window, 'scrollX');
  let mockVv: MockVisualViewport;
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockVv = new MockVisualViewport(844, 0);
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ devMode: false }),
    }) as unknown as typeof fetch;

    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 390,
    });
    Object.defineProperty(window, 'innerHeight', {
      writable: true,
      configurable: true,
      value: 844,
    });
    Object.defineProperty(document.documentElement, 'scrollHeight', {
      configurable: true,
      value: 2000,
    });
    Object.defineProperty(window, 'scrollY', {
      writable: true,
      configurable: true,
      value: 250,
    });
    Object.defineProperty(window, 'scrollX', {
      writable: true,
      configurable: true,
      value: 0,
    });
    Object.defineProperty(window, 'visualViewport', {
      writable: true,
      configurable: true,
      value: mockVv,
    });
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('max-width: 767px') || query.includes('pointer: coarse'),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    delete document.documentElement.dataset.keyboardOpen;
    document.body.removeAttribute('data-scroll-locked');
    Object.defineProperty(window, 'visualViewport', {
      writable: true,
      configurable: true,
      value: originalVisualViewport,
    });
    if (originalScrollHeightDescriptor) {
      Object.defineProperty(
        document.documentElement,
        'scrollHeight',
        originalScrollHeightDescriptor,
      );
    } else {
      delete (document.documentElement as unknown as Record<string, unknown>).scrollHeight;
    }
    if (originalScrollYDescriptor) {
      Object.defineProperty(window, 'scrollY', originalScrollYDescriptor);
    }
    if (originalScrollXDescriptor) {
      Object.defineProperty(window, 'scrollX', originalScrollXDescriptor);
    }
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('renders MobileNav glass buttons without transform-gpu and performs 1px scroll round-trip when keyboard closes', async () => {
    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const rafSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((cb: FrameRequestCallback) => {
        cb(0);
        return 1;
      });

    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <MobileNav />
      </QueryClientProvider>,
    );
    const nav = container.querySelector('nav');
    expect(nav).not.toBeNull();
    expect(nav?.className).toContain('fixed');
    expect(nav?.className).toContain('bottom-0');
    expect(nav?.className).toContain('pointer-events-none');
    expect(nav?.className).not.toContain('transform-gpu');
    expect(container.querySelectorAll('nav .glass-nav-button').length).toBeGreaterThan(0);

    act(() => {
      mockVv.height = 480;
      mockVv.dispatchEvent(new Event('resize'));
    });
    expect(document.documentElement.dataset.keyboardOpen).toBe('true');

    act(() => {
      mockVv.height = 844;
      mockVv.dispatchEvent(new Event('resize'));
    });
    expect(document.documentElement.dataset.keyboardOpen).toBeUndefined();
    expect(rafSpy).toHaveBeenCalled();
    expect(scrollToSpy).toHaveBeenNthCalledWith(1, 0, 249);
    expect(scrollToSpy).toHaveBeenNthCalledWith(2, 0, 250);
  });

  it('re-pins fixed nav when body data-scroll-locked is removed even without keyboard opening', async () => {
    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MobileNav />
      </QueryClientProvider>,
    );

    await act(async () => {
      document.body.setAttribute('data-scroll-locked', '1');
    });

    await act(async () => {
      document.body.removeAttribute('data-scroll-locked');
    });

    await waitFor(() => {
      expect(scrollToSpy).toHaveBeenNthCalledWith(1, 0, 249);
      expect(scrollToSpy).toHaveBeenNthCalledWith(2, 0, 250);
    });
  });

  it('prevents SheetContent onCloseAutoFocus from focusing background trigger on mobile when offsetTop is 0', async () => {
    const Wrapper = () => {
      const [open, setOpen] = React.useState(false);
      return (
        <div>
          <button type="button" onClick={() => setOpen(true)}>
            Open Row
          </button>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetContent side="right">
              <SheetHeader>
                <SheetTitle>Row Details</SheetTitle>
              </SheetHeader>
              <button type="button" onClick={() => setOpen(false)}>
                Dismiss Sheet
              </button>
            </SheetContent>
          </Sheet>
        </div>
      );
    };

    render(<Wrapper />);
    const triggerBtn = screen.getByRole('button', { name: 'Open Row' });
    act(() => {
      triggerBtn.focus();
      triggerBtn.click();
    });

    await screen.findByRole('dialog');
    const focusSpy = vi.spyOn(triggerBtn, 'focus');

    const dismissBtn = screen.getByRole('button', { name: 'Dismiss Sheet' });
    act(() => {
      dismissBtn.click();
    });

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(focusSpy).not.toHaveBeenCalled();
    expect(document.activeElement).not.toBe(triggerBtn);
  });

  it('prevents auto-focusing inputs on mobile Sheet open while preserving desktop autofocus', async () => {
    const { rerender } = render(
      <Sheet open={true} onOpenChange={vi.fn()}>
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle>Edit Transaction</SheetTitle>
          </SheetHeader>
          <input aria-label="Amount" defaultValue="10.00" />
        </SheetContent>
      </Sheet>,
    );

    const dialog = await screen.findByRole('dialog');
    const mobileInput = screen.getByLabelText('Amount');
    expect(document.activeElement).not.toBe(mobileInput);
    expect(document.activeElement).toBe(dialog);

    // Unmount and re-open at desktop width & fine pointer
    rerender(
      <Sheet open={false} onOpenChange={vi.fn()}>
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle>Edit Transaction</SheetTitle>
          </SheetHeader>
          <input aria-label="Amount" defaultValue="10.00" />
        </SheetContent>
      </Sheet>,
    );

    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1280,
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

    rerender(
      <Sheet open={true} onOpenChange={vi.fn()}>
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle>Edit Transaction</SheetTitle>
          </SheetHeader>
          <input aria-label="Amount" defaultValue="10.00" />
        </SheetContent>
      </Sheet>,
    );

    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByLabelText('Amount'));
    });
  });

  it('sets --sheet-vv-bottom and --sheet-vv-max-height when mobile keyboard opens', async () => {
    render(
      <Sheet open={true} onOpenChange={vi.fn()}>
        <SheetContent side="bottom">
          <SheetHeader>
            <SheetTitle>Choose category</SheetTitle>
          </SheetHeader>
          <input aria-label="Search categories" />
        </SheetContent>
      </Sheet>,
    );

    const dialog = await screen.findByRole('dialog');
    expect(dialog.className).toContain('sheet-bottom-mobile');

    act(() => {
      mockVv.height = 500;
      mockVv.offsetTop = 20;
      mockVv.dispatchEvent(new Event('resize'));
    });

    expect(dialog.style.getPropertyValue('--sheet-vv-bottom')).toBe('324px');
    expect(dialog.style.getPropertyValue('--sheet-vv-max-height')).toBe('484px');

    act(() => {
      mockVv.height = 844;
      mockVv.offsetTop = 0;
      mockVv.dispatchEvent(new Event('resize'));
    });

    expect(dialog.style.getPropertyValue('--sheet-vv-bottom')).toBe('');
    expect(dialog.style.getPropertyValue('--sheet-vv-max-height')).toBe('');
  });
});
