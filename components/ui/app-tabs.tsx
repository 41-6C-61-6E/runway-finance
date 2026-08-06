'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

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
  activeTab: string;
  onChange: (tabId: string) => void;
  variant?: 'underline' | 'pills';
  size?: 'sm' | 'md';
  className?: string;
  fullWidth?: boolean;
}

export function AppTabs({
  tabs,
  activeTab,
  onChange,
  variant = 'underline',
  size = 'md',
  className,
  fullWidth = false,
}: AppTabsProps) {
  if (variant === 'pills') {
    return (
      <div
        className={cn(
          'items-center gap-1 p-1 rounded-xl bg-muted/60 border border-border/40 max-w-full overflow-x-auto no-scrollbar',
          fullWidth ? 'flex w-full' : 'inline-flex',
          className
        )}
        role="tablist"
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              disabled={tab.disabled}
              onClick={() => !tab.disabled && onChange(tab.id)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg font-medium transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring touch-manipulation select-none disabled:opacity-50 disabled:pointer-events-none min-h-[36px] whitespace-nowrap shrink-0',
                fullWidth && 'flex-1 justify-center text-center',
                size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-sm',
                isActive
                  ? 'bg-primary/10 text-primary border border-primary/30 font-semibold shadow-xs'
                  : 'text-muted-foreground hover:text-foreground hover:bg-background/40 border border-transparent'
              )}
            >
              {Icon && <Icon className={cn('shrink-0', size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4')} />}
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
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            disabled={tab.disabled}
            onClick={() => !tab.disabled && onChange(tab.id)}
            className={cn(
              'inline-flex items-center gap-2 font-medium border-b-2 transition-all duration-150 whitespace-nowrap focus:outline-none touch-manipulation select-none disabled:opacity-50 disabled:pointer-events-none -mb-px pb-2.5 pt-1 min-h-[40px]',
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
