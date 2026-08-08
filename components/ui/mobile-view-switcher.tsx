'use client';

import React, { useState, useRef, type ReactNode } from 'react';
import { haptic } from '@/lib/haptics';
import { cn } from '@/lib/utils';

interface MobileViewSwitcherProps {
  main: ReactNode;
  summary: ReactNode;
  mainLabel?: string;
  summaryLabel?: string;
  className?: string;
  desktopHeader?: ReactNode;
}

export function MobileViewSwitcher({
  main,
  summary,
  mainLabel = 'Main',
  summaryLabel = 'Summary',
  className = '',
  desktopHeader,
}: MobileViewSwitcherProps) {
  const [activeTab, setActiveTab] = useState<'main' | 'summary'>('main');

  const startXRef = useRef<number | null>(null);
  const startYRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

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

    if (duration > 350 || Math.abs(dY) > 50 || Math.abs(dX) < 70) {
      return;
    }

    if (dX < -70 && activeTab === 'main') {
      // Swipe Left -> switch to Summary
      haptic.light();
      setActiveTab('summary');
    } else if (dX > 70 && activeTab === 'summary') {
      // Swipe Right -> switch to Main
      haptic.light();
      setActiveTab('main');
    }
  };

  return (
    <div className={cn("w-full", className)}>
      {/* ── Desktop View (lg and up): Desktop Header + Classic 2/3 + 1/3 Side-by-Side Grid ── */}
      <div className="hidden lg:block space-y-6">
        {desktopHeader}
        <div className="grid grid-cols-3 gap-6 items-start">
          <div className="col-span-2 space-y-6">{main}</div>
          <div className="col-span-1 sticky top-6">{summary}</div>
        </div>
      </div>

      {/* ── Mobile View (< lg): Native Swipe Guidance Indicators & Swipe Container ── */}
      <div className="lg:hidden w-full flex flex-col gap-3">
        {/* Centered Mobile Swipe Guidance Bar (Dots + Text Labels) */}
        <div className="flex items-center justify-center gap-5 py-1 px-2 select-none">
          {/* Main View Indicator */}
          <button
            type="button"
            onClick={() => {
              if (activeTab !== 'main') {
                haptic.light();
                setActiveTab('main');
              }
            }}
            className={cn(
              "flex items-center gap-1.5 text-xs transition-all duration-200 cursor-pointer min-touch-target-inline",
              activeTab === 'main'
                ? "font-bold text-foreground scale-105"
                : "font-medium text-muted-foreground/50 hover:text-muted-foreground"
            )}
          >
            <span
              className={cn(
                "w-2 h-2 rounded-full transition-all duration-200 shrink-0",
                activeTab === 'main'
                  ? "bg-primary shadow-xs shadow-primary/50 scale-125"
                  : "bg-muted-foreground/30"
              )}
            />
            <span>{mainLabel}</span>
          </button>

          {/* Divider dot */}
          <span className="text-muted-foreground/20 text-[10px] select-none">•</span>

          {/* Summary View Indicator */}
          <button
            type="button"
            onClick={() => {
              if (activeTab !== 'summary') {
                haptic.light();
                setActiveTab('summary');
              }
            }}
            className={cn(
              "flex items-center gap-1.5 text-xs transition-all duration-200 cursor-pointer min-touch-target-inline",
              activeTab === 'summary'
                ? "font-bold text-foreground scale-105"
                : "font-medium text-muted-foreground/50 hover:text-muted-foreground"
            )}
          >
            <span
              className={cn(
                "w-2 h-2 rounded-full transition-all duration-200 shrink-0",
                activeTab === 'summary'
                  ? "bg-primary shadow-xs shadow-primary/50 scale-125"
                  : "bg-muted-foreground/30"
              )}
            />
            <span>{summaryLabel}</span>
          </button>
        </div>

        {/* Swipeable View Container */}
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
  const startXRef = useRef<number | null>(null);
  const startYRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  const currentIndex = tabs.findIndex((t) => t.id === activeTabId);

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

    if (duration > 350 || Math.abs(dY) > 50 || Math.abs(dX) < 70) {
      return;
    }

    if (dX < -70 && currentIndex !== -1 && currentIndex < tabs.length - 1) {
      // Swipe Left -> next sub-tab
      haptic.light();
      onTabChange(tabs[currentIndex + 1].id);
    } else if (dX > 70 && currentIndex > 0) {
      // Swipe Right -> previous sub-tab
      haptic.light();
      onTabChange(tabs[currentIndex - 1].id);
    }
  };

  return (
    <div className={cn("w-full space-y-4", className)}>
      {desktopHeader && <div className="hidden lg:block">{desktopHeader}</div>}
      {/* Centered Mobile Swipe Guidance Bar for Sub-tabs (< lg) */}
      <div className="lg:hidden flex items-center justify-center gap-3 py-1 px-2 select-none flex-wrap">
        {tabs.map((tab, idx) => {
          const isActive = tab.id === activeTabId;
          return (
            <React.Fragment key={tab.id}>
              {idx > 0 && <span className="text-muted-foreground/20 text-[10px] select-none">•</span>}
              <button
                type="button"
                onClick={() => {
                  if (!isActive) {
                    haptic.light();
                    onTabChange(tab.id);
                  }
                }}
                className={cn(
                  "flex items-center gap-1.5 text-xs transition-all duration-200 cursor-pointer min-touch-target-inline",
                  isActive
                    ? "font-bold text-foreground scale-105"
                    : "font-medium text-muted-foreground/50 hover:text-muted-foreground"
                )}
              >
                <span
                  className={cn(
                    "w-2 h-2 rounded-full transition-all duration-200 shrink-0",
                    isActive
                      ? "bg-primary shadow-xs shadow-primary/50 scale-125"
                      : "bg-muted-foreground/30"
                  )}
                />
                <span>{tab.label}</span>
              </button>
            </React.Fragment>
          );
        })}
      </div>

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
