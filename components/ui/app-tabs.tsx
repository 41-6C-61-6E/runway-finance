'use client';

import * as React from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { glassSurface, glassItemBase, glassItemActive, glassItemInactive } from '@/components/ui/seg-pill';
import { useScrollFades, ScrollFadeOverlays } from '@/components/ui/scroll-fade';

export interface TabItem {
  id: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  count?: number;
  badge?: string;
  disabled?: boolean;
}

export interface AppTabsProps {
  tabs: TabItem[];
  activeTab?: string;
  onChange?: (tabId: string) => void;
  variant?: 'underline' | 'pills';
  size?: 'sm' | 'md';
  className?: string;
  fullWidth?: boolean;
  urlParam?: string;
  'aria-label'?: string;
}

interface AppTabsInnerProps extends AppTabsProps {
  activeTab: string;
  onChange: (tabId: string) => void;
}

function AppTabsInner({
  tabs,
  activeTab,
  onChange,
  variant = 'underline',
  size = 'md',
  className,
  fullWidth = false,
  'aria-label': ariaLabel,
}: AppTabsInnerProps) {
  const pillsRef = React.useRef<HTMLDivElement>(null);
  const { fadeRef, fades, update } = useScrollFades<HTMLDivElement>();
  // Keep the active pill visible in a horizontal scroller (mobile chip rows).
  React.useLayoutEffect(() => {
    const scroller = pillsRef.current;
    if (!scroller || variant !== 'pills') return;
    const active = scroller.querySelector<HTMLButtonElement>('[data-active="true"]');
    if (active) active.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [activeTab, variant, tabs.length]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;

    const enabledTabs = tabs.filter((t) => !t.disabled);
    const currentIndex = enabledTabs.findIndex((t) => t.id === activeTab);
    if (currentIndex === -1) return;

    let nextIndex = currentIndex;
    if (e.key === 'ArrowRight') {
      nextIndex = (currentIndex + 1) % enabledTabs.length;
    } else if (e.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + enabledTabs.length) % enabledTabs.length;
    }

    const nextTab = enabledTabs[nextIndex];
    if (nextTab) {
      onChange(nextTab.id);
    }
  };

  if (variant === 'pills') {
    return (
      <div className={cn('relative min-w-0 max-w-full', fullWidth ? 'w-full' : 'w-max', className)}>
        <div
          ref={(node) => {
            pillsRef.current = node;
            fadeRef.current = node;
          }}
          onScroll={update}
          className={cn(
            'flex items-center gap-1 p-1 rounded-full max-w-full overflow-x-auto no-scrollbar scroll-contain-x touch-pan-x',
            glassSurface,
            fullWidth && 'w-full'
          )}
          role="tablist"
          aria-label={ariaLabel}
          onKeyDown={handleKeyDown}
        >
          {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              data-active={isActive || undefined}
              role="tab"
              aria-selected={isActive}
              aria-controls={`tabpanel-${tab.id}`}
              id={`tab-${tab.id}`}
              tabIndex={isActive ? 0 : -1}
              disabled={tab.disabled}
              onClick={() => !tab.disabled && onChange(tab.id)}
              className={cn(
                'inline-flex items-center gap-1.5 min-h-9 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring touch-manipulation disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap shrink-0',
                fullWidth && 'flex-1 justify-center text-center',
                size === 'sm' ? 'px-2.5 py-0.5 text-xs' : 'px-3 py-1 text-xs sm:text-sm',
                glassItemBase,
                isActive ? glassItemActive : glassItemInactive
              )}
            >
              {Icon && <Icon className={cn('shrink-0', size === 'sm' ? 'w-3.5 h-3.5' : 'w-3.5 h-3.5 sm:w-4 sm:h-4')} />}
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span
                  className={cn(
                    'px-1.5 py-0.2 rounded-full text-[10px] font-semibold',
                    isActive ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
                  )}
                >
                  {tab.count}
                </span>
              )}
              {tab.badge && (
                <span
                  className={cn(
                    'px-1.5 py-0.2 rounded-full text-[10px] font-semibold',
                    isActive ? 'bg-primary/20 text-primary' : 'bg-primary/15 text-primary'
                  )}
                >
                  {tab.badge}
                </span>
              )}
          </button>
          );
          })}
        </div>
        <ScrollFadeOverlays {...fades} />
      </div>
    );
  }

  // Underline variant
  return (
    <div
      className={cn(
        'flex items-center border-b border-border/40 overflow-x-auto no-scrollbar scroll-contain-x touch-pan-x',
        fullWidth ? 'w-full gap-2 sm:gap-4' : 'gap-4 md:gap-6',
        className
      )}
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            aria-controls={`tabpanel-${tab.id}`}
            id={`tab-${tab.id}`}
            tabIndex={isActive ? 0 : -1}
            disabled={tab.disabled}
            onClick={() => !tab.disabled && onChange(tab.id)}
            className={cn(
              'inline-flex items-center gap-2 font-medium border-b-2 transition-all duration-150 whitespace-nowrap focus:outline-none touch-manipulation select-none disabled:opacity-50 disabled:pointer-events-none -mb-px pb-1.5 pt-0.5 min-h-[34px]',
              fullWidth && 'flex-1 justify-center text-center',
              size === 'sm' ? 'text-xs' : 'text-sm',
              isActive
                ? 'border-primary text-primary font-semibold'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            )}
          >
            {Icon && <Icon className={cn('shrink-0', size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4')} />}
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span
                className={cn(
                  'px-1.5 py-0.5 rounded-full text-[10px] font-semibold',
                  isActive ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
                )}
              >
                {tab.count}
              </span>
            )}
            {tab.badge && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-primary/15 text-primary">
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function AppTabsWithUrlSync({ urlParam, ...props }: AppTabsProps & { urlParam: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const activeTabFromUrl = searchParams ? searchParams.get(urlParam) : null;
  const activeTab = props.activeTab ?? activeTabFromUrl ?? props.tabs[0]?.id;

  const handleTabChange = (tabId: string) => {
    if (searchParams && pathname) {
      const params = new URLSearchParams(searchParams.toString());
      params.set(urlParam, tabId);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    }
    props.onChange?.(tabId);
  };

  return <AppTabsInner {...props} activeTab={activeTab} onChange={handleTabChange} />;
}

export function AppTabs({ urlParam, activeTab: controlledActiveTab, onChange, ...props }: AppTabsProps) {
  if (urlParam) {
    return <AppTabsWithUrlSync {...props} urlParam={urlParam} activeTab={controlledActiveTab} onChange={onChange} />;
  }

  const activeTab = controlledActiveTab ?? props.tabs[0]?.id;
  const handleChange = onChange ?? (() => {});

  return <AppTabsInner {...props} activeTab={activeTab} onChange={handleChange} />;
}
