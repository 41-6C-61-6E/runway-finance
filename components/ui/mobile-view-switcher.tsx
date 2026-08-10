'use client';

import React, { useState, useRef, useEffect, useMemo, type ReactNode } from 'react';
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
}: MobileViewSwitcherProps) {
  const [activeTab, setActiveTab] = useState<'main' | 'summary'>('main');
  const { registerSubNav, unregisterSubNav } = useMobileSubNav();
  const [isSummaryCollapsed, setIsSummaryCollapsed] = useCardCollapsed(summaryCardId || '_none_', false);

  const isHorizontalCollapseEnabled = Boolean(summaryCardId) && isSummaryCollapsed;

  const startXRef = useRef<number | null>(null);
  const startYRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  const subNavTabs = useMemo(() => [
    { id: 'main', label: mainLabel },
    { id: 'summary', label: summaryLabel },
  ], [mainLabel, summaryLabel]);

  useEffect(() => {
    registerSubNav(subNavTabs, activeTab, (id) => {
      if (id === 'main' || id === 'summary') {
        setActiveTab(id);
      }
    });
    return () => {
      unregisterSubNav();
    };
  }, [subNavTabs, activeTab, registerSubNav, unregisterSubNav]);

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

    if (dX < -50 && activeTab === 'main') {
      // Swipe Left -> switch to Summary
      haptic.light();
      setActiveTab('summary');
    } else if (dX > 50 && activeTab === 'summary') {
      // Swipe Right -> switch to Main
      haptic.light();
      setActiveTab('main');
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
}

export function MobileTabSwipeContainer({
  tabs,
  activeTabId,
  onTabChange,
  children,
  className = '',
  desktopHeader,
}: MobileTabSwipeContainerProps) {
  const { registerSubNav, unregisterSubNav } = useMobileSubNav();

  const startXRef = useRef<number | null>(null);
  const startYRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  const currentIndex = tabs.findIndex((t) => t.id === activeTabId);

  useEffect(() => {
    registerSubNav(tabs, activeTabId, (id) => {
      onTabChange(id);
    });
    return () => {
      unregisterSubNav();
    };
  }, [tabs, activeTabId, onTabChange, registerSubNav, unregisterSubNav]);

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
    <div className={cn("w-full space-y-4", className)}>
      {desktopHeader && <div className="hidden lg:block">{desktopHeader}</div>}
      
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
