'use client';

import React, { useState, useRef, useEffect, useMemo, useId, type ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import { haptic } from '@/lib/haptics';
import { cn } from '@/lib/utils';
import { useMobileSubNav } from '@/components/mobile-subnav-context';
import { useCardCollapsed } from '@/lib/hooks/use-card-collapsed';

interface MobileViewSwitcherProps {
  main: ReactNode;
  summary: ReactNode;
  mainLabel?: string;
  summaryLabel?: string;
  className?: string;
  desktopHeader?: ReactNode;
  desktopLayout?: 'grid' | 'stacked';
  summaryCardId?: string;
  /**
   * Optional sub-tabs for the main pane (e.g. Net Worth's History /
   * Breakdown). On mobile they join the sub-nav capsule alongside the
   * summary view — the same way tab pages (Spending, Investments) expose
   * their tabs — so the capsule switches between History, Breakdown and
   * Overview. The desktop layout is unaffected; the page renders its own
   * tab row there.
   */
  mainTabs?: { id: string; label: string }[];
  activeMainTab?: string;
  onMainTabChange?: (id: string) => void;
}

export function MobileViewSwitcher({
  main,
  summary,
  mainLabel = 'Main',
  summaryLabel = 'Summary',
  className = '',
  desktopHeader,
  desktopLayout = 'grid',
  summaryCardId,
  mainTabs,
  activeMainTab,
  onMainTabChange,
}: MobileViewSwitcherProps) {
  const [activeTab, setActiveTab] = useState<'main' | 'summary'>('main');
  const { registerSubNav } = useMobileSubNav();
  const subNavOwnerId = useId();
  const [isSummaryCollapsed, setIsSummaryCollapsed] = useCardCollapsed(summaryCardId || '_none_', false);

  const isHorizontalCollapseEnabled = Boolean(summaryCardId) && isSummaryCollapsed;

  const startXRef = useRef<number | null>(null);
  const startYRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  // On mobile the sub-nav capsule mirrors the page structure: one entry per
  // main sub-tab (when provided), plus the summary view at the end.
  const subNavTabs = useMemo(() => {
    const tabs = (mainTabs && mainTabs.length > 0 ? mainTabs : [{ id: 'main', label: mainLabel }])
      .map((t) => ({ id: t.id, label: t.label }));
    tabs.push({ id: 'summary', label: summaryLabel });
    return tabs;
  }, [mainTabs, mainLabel, summaryLabel]);

  // Which sub-nav entry is highlighted: the active main sub-tab, or the
  // summary view (falling back to the first main entry in the meantime).
  const subNavActiveId =
    activeTab === 'summary'
      ? 'summary'
      : (mainTabs && mainTabs.length > 0 ? (activeMainTab ?? mainTabs[0].id) : 'main');

  const handleSelectMainTab = (id: string) => {
    onMainTabChange?.(id);
    setActiveTab('main');
  };

  useEffect(() => {
    const unregister = registerSubNav(subNavTabs, subNavActiveId, (id) => {
      if (id === 'summary') {
        setActiveTab('summary');
      } else {
        handleSelectMainTab(id);
      }
    }, subNavOwnerId, 1);
    return () => {
      unregister();
    };
  }, [subNavTabs, subNavActiveId, mainTabs, onMainTabChange, registerSubNav, subNavOwnerId]);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    const target = e.target as HTMLElement;

    // Safety checks: ignore swipes initiated on controls/inputs/charts/dialogs
    if (
      target.closest('.touch-pan-y') ||
      target.closest('.scroll-contain-x') ||
      target.closest('input') ||
      target.closest('textarea') ||
      target.closest('select') ||
      target.closest('[role="dialog"]') ||
      target.closest('[role="tooltip"]') ||
      target.closest('.no-swipe') ||
      target.closest('.recharts-wrapper') ||
      target.closest('.recharts-tooltip-wrapper')
    ) {
      startXRef.current = null;
      startYRef.current = null;
      return;
    }

    startXRef.current = touch.clientX;
    startYRef.current = touch.clientY;
    startTimeRef.current = Date.now();
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (startXRef.current === null || startYRef.current === null) return;

    const touch = e.changedTouches[0];
    const duration = Date.now() - startTimeRef.current;
    const dX = touch.clientX - startXRef.current;
    const dY = touch.clientY - startYRef.current;

    startXRef.current = null;
    startYRef.current = null;

    if (duration > 400 || Math.abs(dY) > 60 || Math.abs(dX) < 50) {
      return;
    }

      // Swipe sequence on mobile: main sub-tabs (left→right), then the
      // summary view at the end.
      const viewSequence = (mainTabs && mainTabs.length > 0 ? mainTabs.map((t) => t.id) : ['main']).concat(['summary']);
      const currentView = activeTab === 'summary' ? 'summary' : (mainTabs && mainTabs.length > 0 ? (activeMainTab ?? viewSequence[0]) : 'main');
      const idx = viewSequence.indexOf(currentView);

      if (dX < -50 && idx !== -1 && idx < viewSequence.length - 1) {
        // Swipe Left -> next view
      haptic.light();
        if (viewSequence[idx + 1] === 'summary') {
          setActiveTab('summary');
        } else {
          handleSelectMainTab(viewSequence[idx + 1]);
        }
      } else if (dX > 50 && idx !== -1 && idx > 0) {
        // Swipe Right -> previous view
      haptic.light();
        if (viewSequence[idx - 1] === 'summary') {
          setActiveTab('summary');
        } else {
          handleSelectMainTab(viewSequence[idx - 1]);
        }
    }
  };

  return (
    <div className={cn("w-full", className)}>
      {/* ── Desktop View (lg and up): Choice of Grid or Stacked Layout ── */}
      <div className="hidden lg:block space-y-6">
        {desktopHeader}
        {desktopLayout === 'stacked' ? (
          <div className="space-y-6">
            {main}
            {summary}
          </div>
        ) : isHorizontalCollapseEnabled ? (
          <div className="grid grid-cols-12 gap-6 items-start">
            <div className="col-span-11 space-y-6 transition-all duration-300">{main}</div>
            <div className="col-span-1 flex justify-end sticky top-[84px] transition-all duration-300">
              <button
                onClick={() => setIsSummaryCollapsed(false)}
                className="flex flex-col items-center gap-3 py-4 px-2.5 bg-sidebar border border-sidebar-border/80 hover:bg-sidebar/90 rounded-2xl shadow-sm text-sidebar-foreground transition-all cursor-pointer group"
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
            <div className="col-span-8 space-y-6 transition-all duration-300">{main}</div>
            <div className="col-span-4 sticky top-[84px] transition-all duration-300">{summary}</div>
          </div>
        )}
      </div>

      {/* ── Mobile View (< lg): Swipeable View Container ── */}
      <div className="lg:hidden w-full flex flex-col">
        <div
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          className="w-full relative transition-all duration-200 min-h-[300px]"
        >
          {activeTab === 'main' ? (
            <div className="space-y-5 sm:space-y-6 animate-in fade-in-50 duration-150">
              {main}
            </div>
          ) : (
            <div className="space-y-5 sm:space-y-6 animate-in fade-in-50 duration-150">
              {summary}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface TabInfo {
  id: string;
  label: string;
}

interface MobileTabSwipeContainerProps {
  tabs: TabInfo[];
  activeTabId: string;
  onTabChange: (id: string) => void;
  children: ReactNode;
  className?: string;
  desktopHeader?: ReactNode;
  priority?: number;
}

export function MobileTabSwipeContainer({
  tabs,
  activeTabId,
  onTabChange,
  children,
  className = '',
  desktopHeader,
  priority = 0,
}: MobileTabSwipeContainerProps) {
  const { registerSubNav } = useMobileSubNav();
  const subNavOwnerId = useId();

  const startXRef = useRef<number | null>(null);
  const startYRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

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

    if (
      target.closest('.touch-pan-y') ||
      target.closest('.scroll-contain-x') ||
      target.closest('input') ||
      target.closest('textarea') ||
      target.closest('select') ||
      target.closest('[role="dialog"]') ||
      target.closest('[role="tooltip"]') ||
      target.closest('.no-swipe') ||
      target.closest('.recharts-wrapper') ||
      target.closest('.recharts-tooltip-wrapper')
    ) {
      startXRef.current = null;
      startYRef.current = null;
      return;
    }

    startXRef.current = touch.clientX;
    startYRef.current = touch.clientY;
    startTimeRef.current = Date.now();
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (startXRef.current === null || startYRef.current === null) return;

    const touch = e.changedTouches[0];
    const duration = Date.now() - startTimeRef.current;
    const dX = touch.clientX - startXRef.current;
    const dY = touch.clientY - startYRef.current;

    startXRef.current = null;
    startYRef.current = null;

    if (duration > 400 || Math.abs(dY) > 60 || Math.abs(dX) < 50) {
      return;
    }

    if (dX < -50 && currentIndex !== -1 && currentIndex < tabs.length - 1) {
      // Swipe Left -> next sub-tab
      haptic.light();
      onTabChange(tabs[currentIndex + 1].id);
    } else if (dX > 50 && currentIndex > 0) {
      // Swipe Right -> previous sub-tab
      haptic.light();
      onTabChange(tabs[currentIndex - 1].id);
    }
  };

  return (
    <div className={cn("w-full", className)}>
      {desktopHeader && <div className="hidden lg:block mb-3 sm:mb-3.5">{desktopHeader}</div>}
      
      {/* Touch Swipe Container */}
      <div
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="w-full"
      >
        {children}
      </div>
    </div>
  );
}
