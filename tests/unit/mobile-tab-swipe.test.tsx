// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MobileTabSwipeContainer, MobileViewSwitcher } from '@/components/ui/mobile-view-switcher';

vi.mock('@/lib/haptics', () => ({
  haptic: {
    light: vi.fn(),
    medium: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('@/components/mobile-subnav-context', () => ({
  useMobileSubNav: () => ({
    registerSubNav: vi.fn(() => vi.fn()),
  }),
}));

describe('MobileTabSwipeContainer', () => {
  const tabs = [
    { id: 'tab1', label: 'First Tab' },
    { id: 'tab2', label: 'Second Tab' },
  ];

  it('renders top header tab labels on mobile viewports', () => {
    const onTabChange = vi.fn();
    const { container } = render(
      <MobileTabSwipeContainer
        tabs={tabs}
        activeTabId="tab1"
        onTabChange={onTabChange}
        header={<div data-testid="mobile-tabs-header">Tabs Header</div>}
      >
        <div>Content</div>
      </MobileTabSwipeContainer>
    );

    const header = container.querySelector('[data-testid="mobile-tabs-header"]')?.parentElement;
    expect(header?.className).not.toContain('hidden');
    expect(header?.className).toContain('w-full min-w-0');
  });

  it('provides a full-height swipe container for short content so swiping works below content', () => {
    const onTabChange = vi.fn();
    const { container } = render(
      <MobileTabSwipeContainer
        tabs={tabs}
        activeTabId="tab1"
        onTabChange={onTabChange}
      >
        <div style={{ height: 50 }}>Short content</div>
      </MobileTabSwipeContainer>
    );

    // The touch container element has the swipe handlers and minimum vertical height
    const touchContainer = container.querySelector('[class*="min-h-"]');
    expect(touchContainer).not.toBeNull();
    expect(touchContainer?.className).toContain('min-h-[calc(100svh-10rem)]');

    // Simulate swipe on empty space of the container below content
    fireEvent.touchStart(touchContainer!, {
      touches: [{ clientX: 200, clientY: 400 }],
    });
    fireEvent.touchMove(touchContainer!, {
      touches: [{ clientX: 100, clientY: 400 }],
    });
    fireEvent.touchEnd(touchContainer!, {
      changedTouches: [{ clientX: 100, clientY: 400 }],
    });

    expect(onTabChange).toHaveBeenCalledWith('tab2');
  });

  it('MobileViewSwitcher renders visible sub-nav tabs on mobile view when tabs > 1 and retains pagination dots', () => {
    const { container } = render(
      <MobileViewSwitcher
        main={<div>Main Content</div>}
        summary={<div>Summary Content</div>}
        mainLabel="Main"
        summaryLabel="Overview"
      />
    );

    // Mobile swipe view is present
    const mobileContainer = container.querySelector('.md\\:hidden');
    expect(mobileContainer).not.toBeNull();

    // AppTabs should be rendered in mobile container with underline variant tabs
    const tablist = mobileContainer?.querySelector('[role="tablist"]');
    expect(tablist).not.toBeNull();
    expect(tablist?.textContent).toContain('Main');
    expect(tablist?.textContent).toContain('Overview');

    // Dots should be present
    const dots = container.querySelector('.fixed-pagination-dots');
    expect(dots).not.toBeNull();
  });
});

