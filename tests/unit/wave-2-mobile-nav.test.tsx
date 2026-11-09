// @vitest-environment jsdom
import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AppTabs } from '@/components/ui/app-tabs';
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

describe('Track B Wave 2 — Mobile Navigation & Tab Visibility', () => {
  it('AppTabs underline variant aligns tabs with justify-start when not fullWidth', () => {
    const tabs = [
      { id: 'tab1', label: 'Tab 1' },
      { id: 'tab2', label: 'Tab 2' },
      { id: 'tab3', label: 'Tab 3' },
    ];
    const { container } = render(
      <AppTabs tabs={tabs} activeTab="tab1" onChange={() => {}} variant="underline" />
    );

    const tablist = container.querySelector('[role="tablist"]');
    expect(tablist).not.toBeNull();
    expect(tablist?.className).toContain('justify-start');
    expect(tablist?.className).not.toContain('justify-center');
  });

  it('MobileTabSwipeContainer displays header without hidden md:block on mobile', () => {
    const tabs = [
      { id: 'tab1', label: 'Tab 1' },
      { id: 'tab2', label: 'Tab 2' },
    ];
    const { container } = render(
      <MobileTabSwipeContainer
        tabs={tabs}
        activeTabId="tab1"
        onTabChange={() => {}}
        header={<div data-testid="sub-nav-header">Sub-Nav</div>}
        desktopHeader={<div data-testid="desktop-only-header">Desktop Only</div>}
      >
        <div>Content</div>
      </MobileTabSwipeContainer>
    );

    const header = container.querySelector('[data-testid="sub-nav-header"]')?.parentElement;
    expect(header).not.toBeNull();
    expect(header?.className).not.toContain('hidden');
    expect(header?.className).toContain('w-full min-w-0');

    const desktopHeader = container.querySelector('[data-testid="desktop-only-header"]')?.parentElement;
    expect(desktopHeader).not.toBeNull();
    expect(desktopHeader?.className).toContain('hidden md:block');
  });

  it('MobileViewSwitcher automatically provides AppTabs header on mobile when mobileTabs > 1', () => {
    const { container } = render(
      <MobileViewSwitcher
        main={<div>Main View</div>}
        summary={<div>Summary View</div>}
        mainLabel="History"
        summaryLabel="Breakdown"
      />
    );

    const mobileContainer = container.querySelector('.md\\:hidden');
    expect(mobileContainer).not.toBeNull();

    const tablist = mobileContainer?.querySelector('[role="tablist"]');
    expect(tablist).not.toBeNull();
    expect(tablist?.textContent).toContain('History');
    expect(tablist?.textContent).toContain('Breakdown');
  });
});
