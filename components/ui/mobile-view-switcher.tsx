'use client';

import React, { useState, useRef, useId, useEffect, useMemo, useCallback, type ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import { haptic } from '@/lib/haptics';
import { cn } from '@/lib/utils';
import { useMobileSubNav } from '@/components/mobile-subnav-context';
import { useCardCollapsed } from '@/lib/hooks/use-card-collapsed';
import { PaginationDots } from '@/components/ui/pagination-dots';
import { AppTabs } from '@/components/ui/app-tabs';

interface TabInfo {
  id: string;
  label: string;
}

interface MobileViewSwitcherProps {
  main: ReactNode;
  summary: ReactNode;
  mainLabel?: string;
  summaryLabel?: string;
  className?: string;
  desktopHeader?: ReactNode;
  desktopLayout?: 'grid' | 'stacked';
  summaryCardId?: string;
  mainTabs?: TabInfo[];
  activeMainTab?: string;
  onMainTabChange?: (id: string) => void;
}

/**
 * Responsive layout container for desktop sidebars and summaries.
 * On desktop (md+): Renders side-by-side grid or stacked layout with expand/collapse.
 * On mobile (<md): Renders an in-page underline tab bar (e.g. History | Breakdown | Overview or Table | Overview)
 * with horizontal swiping, clean transitions, and pagination dots.
 */
export function MobileViewSwitcher({
  main,
  summary,
  mainLabel = 'Main',
  summaryLabel = 'Overview',
  className = '',
  desktopHeader,
  desktopLayout = 'grid',
  summaryCardId,
  mainTabs,
  activeMainTab,
  onMainTabChange,
}: MobileViewSwitcherProps) {
  const [isSummaryCollapsed, setIsSummaryCollapsed] = useCardCollapsed(summaryCardId || '_none_', false);
  const isHorizontalCollapseEnabled = Boolean(summaryCardId) && isSummaryCollapsed;

  // Build the combined tab list for mobile
  const mobileTabs = useMemo<TabInfo[]>(() => {
    if (mainTabs && mainTabs.length > 0) {
      return [...mainTabs, { id: 'summary', label: summaryLabel }];
    }
    return [
      { id: 'main', label: mainLabel },
      { id: 'summary', label: summaryLabel },
    ];
  }, [mainTabs, mainLabel, summaryLabel]);

  // Track active mobile tab
  const [internalTab, setInternalTab] = useState<string>(() => {
    if (mainTabs && mainTabs.length > 0) {
      return activeMainTab || mainTabs[0].id;
    }
    return 'main';
  });

  // Keep internal tab in sync if parent changes activeMainTab
  useEffect(() => {
    if (activeMainTab && internalTab !== 'summary') {
      setInternalTab(activeMainTab);
    }
  }, [activeMainTab, internalTab]);

  const handleMobileTabChange = useCallback((tabId: string) => {
    setInternalTab(tabId);
    if (tabId !== 'summary') {
      onMainTabChange?.(tabId);
    }
  }, [onMainTabChange]);

  const isSummaryActive = internalTab === 'summary';

  return (
    <div className={cn("w-full", className)}>
      {/* ── Desktop View (md and up): Choice of Grid or Stacked Layout ── */}
      <div className="hidden md:block space-y-6">
        {desktopHeader}
        {desktopLayout === 'stacked' ? (
          <div className="space-y-6">
            {mainTabs && mainTabs.length > 1 && (
              <div className="mb-3 sm:mb-3.5">
                <AppTabs
                  tabs={mainTabs}
                  activeTab={activeMainTab || internalTab}
                  onChange={(tabId) => onMainTabChange?.(tabId)}
                  variant="underline"
                />
              </div>
            )}
            {main}
            {summary}
          </div>
        ) : isHorizontalCollapseEnabled ? (
          <div className="grid grid-cols-12 gap-6 items-start">
            <div className="col-span-11 space-y-6 transition-all duration-300">
              {mainTabs && mainTabs.length > 1 && (
                <div className="mb-3 sm:mb-3.5">
                  <AppTabs
                    tabs={mainTabs}
                    activeTab={activeMainTab || internalTab}
                    onChange={(tabId) => onMainTabChange?.(tabId)}
                    variant="underline"
                  />
                </div>
              )}
              {main}
            </div>
            <div className="col-span-1 flex justify-end sticky top-[84px] transition-all duration-300">
              <button
                onClick={() => setIsSummaryCollapsed(false)}
                className="flex flex-col items-center gap-3 py-4 px-2.5 bg-sidebar border border-sidebar-border/80 hover:bg-sidebar/90 rounded-2xl shadow-xs text-sidebar-foreground transition-all cursor-pointer group"
                title={`Expand ${summaryLabel}`}
                type="button"
              >
                <ChevronLeft className="w-4 h-4 text-primary group-hover:-translate-x-0.5 transition-transform shrink-0" />
                <span className="text-[11px] font-bold tracking-widest text-muted-foreground uppercase [writing-mode:vertical-lr] rotate-180 shrink-0 select-none">
                  {summaryLabel}
                </span>
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-12 gap-6 items-start">
            <div className="col-span-8 space-y-6 transition-all duration-300">
              {mainTabs && mainTabs.length > 1 && (
                <div className="mb-3 sm:mb-3.5">
                  <AppTabs
                    tabs={mainTabs}
                    activeTab={activeMainTab || internalTab}
                    onChange={(tabId) => onMainTabChange?.(tabId)}
                    variant="underline"
                  />
                </div>
              )}
              {main}
            </div>
            <div className="col-span-4 sticky top-[84px] transition-all duration-300">{summary}</div>
          </div>
        )}
      </div>

      {/* ── Mobile View (< md): First-class Underline Tabs & Swipe Navigation ── */}
      <div className="md:hidden w-full">
        <MobileTabSwipeContainer
          tabs={mobileTabs}
          activeTabId={internalTab}
          onTabChange={handleMobileTabChange}
          header={
            <div className="mb-3 sm:mb-3.5">
              <AppTabs
                tabs={mobileTabs}
                activeTab={internalTab}
                onChange={handleMobileTabChange}
                variant="underline"
              />
            </div>
          }
        >
          <div className="space-y-5 sm:space-y-6">
            {isSummaryActive ? summary : main}
          </div>
        </MobileTabSwipeContainer>
      </div>
    </div>
  );
}

interface MobileTabSwipeContainerProps {
  tabs: TabInfo[];
  activeTabId: string;
  onTabChange: (id: string) => void;
  children: ReactNode;
  className?: string;
  desktopHeader?: ReactNode;
  header?: ReactNode;
  priority?: number;
  showDots?: boolean;
}

/**
 * Mobile tab swipe container.
 * Detects horizontal swipes cleanly without rubber-band translation bouncing.
 * Transitions directly to adjacent tab with subtle haptic feedback and clean fade in.
 * Handles edge-to-edge swipes so browser back/forward history navigation is prevented.
 */
export function MobileTabSwipeContainer({
  tabs,
  activeTabId,
  onTabChange,
  children,
  className = '',
  desktopHeader,
  header,
  priority = 0,
  showDots = true,
}: MobileTabSwipeContainerProps) {
  const { registerSubNav } = useMobileSubNav();
  const subNavOwnerId = useId();

  const startXRef = useRef<number | null>(null);
  const startYRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const directionLockedRef = useRef<'horizontal' | 'vertical' | null>(null);

  const currentIndex = tabs.findIndex((t) => t.id === activeTabId);

  useEffect(() => {
    const unregister = registerSubNav(tabs, activeTabId, (id) => {
      onTabChange(id);
    }, subNavOwnerId, priority);
    return () => {
      unregister();
    };
  }, [tabs, activeTabId, onTabChange, registerSubNav, subNavOwnerId, priority]);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    const target = e.target as HTMLElement;

    // Exclude form controls, dialogs, sliders, horizontal tables, and marked elements
    if (
      target.closest('input') ||
      target.closest('textarea') ||
      target.closest('select') ||
      target.closest('[role="slider"]') ||
      target.closest('[role="dialog"]') ||
      target.closest('[data-no-swipe]') ||
      target.closest('.no-swipe') ||
      target.closest('.scroll-contain-x') ||
      target.closest('table')
    ) {
      startXRef.current = null;
      startYRef.current = null;
      return;
    }

    startXRef.current = touch.clientX;
    startYRef.current = touch.clientY;
    startTimeRef.current = Date.now();
    directionLockedRef.current = null;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (startXRef.current === null || startYRef.current === null) return;
    const touch = e.touches[0];
    const dx = touch.clientX - startXRef.current;
    const dy = touch.clientY - startYRef.current;

    // Direction intent locking: require clear horizontal intent (> 1.2x dy and displacement > 10px)
    if (!directionLockedRef.current) {
      if (Math.hypot(dx, dy) < 10) return;
      if (Math.abs(dy) >= Math.abs(dx)) {
        directionLockedRef.current = 'vertical';
        return;
      }
      if (Math.abs(dx) > Math.abs(dy) * 1.2) {
        directionLockedRef.current = 'horizontal';
      }
    }

    if (directionLockedRef.current === 'horizontal') {
      if (e.cancelable) {
        e.preventDefault();
      }
      e.stopPropagation();
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (startXRef.current === null || startYRef.current === null) return;
    const touch = e.changedTouches[0];
    const dx = touch ? touch.clientX - startXRef.current : 0;
    const duration = Date.now() - startTimeRef.current;
    const velocity = Math.abs(dx) / Math.max(duration, 1);

    const isHorizontal = directionLockedRef.current === 'horizontal';

    startXRef.current = null;
    startYRef.current = null;
    directionLockedRef.current = null;

    if (isHorizontal) {
      e.stopPropagation();

      const shouldSwitch = Math.abs(dx) > 35 || (velocity > 0.3 && Math.abs(dx) > 20);

      if (shouldSwitch) {
        if (dx < -20 && currentIndex !== -1 && currentIndex < tabs.length - 1) {
          // Swipe Left -> next tab
          haptic.light();
          onTabChange(tabs[currentIndex + 1].id);
        } else if (dx > 20 && currentIndex > 0) {
          // Swipe Right -> previous tab
          haptic.light();
          onTabChange(tabs[currentIndex - 1].id);
        }
      }
    }
  };

  const handleTouchCancel = () => {
    startXRef.current = null;
    startYRef.current = null;
    directionLockedRef.current = null;
  };

  return (
    <div className={cn("w-full", className)}>
      {desktopHeader && <div className="hidden md:block mb-3 sm:mb-3.5">{desktopHeader}</div>}
      {header && <div className="mb-3 sm:mb-3.5">{header}</div>}
      
      {/* Touch Swipe Container with clean fade transition and no rubber-band bounce */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
        className="w-full"
      >
        <div key={activeTabId} className="w-full animate-in fade-in-50 duration-150">
          {children}
        </div>
      </div>

      {/* Pagination dots indicator for tabs on mobile: static and fixed above the main bottom nav */}
      {showDots && tabs.length > 1 && (
        <div
          className="fixed left-0 right-0 z-40 flex justify-center pointer-events-none md:hidden fixed-pagination-dots transition-all duration-300"
          style={{
            bottom: 'calc(env(safe-area-inset-bottom, 0px) + 64px)',
          }}
        >
          <div className="pointer-events-auto">
            <PaginationDots
              total={tabs.length}
              activeIndex={Math.max(0, currentIndex)}
              labels={tabs.map((t) => t.label)}
              onChange={(idx) => {
                if (tabs[idx]) {
                  onTabChange(tabs[idx].id);
                }
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
