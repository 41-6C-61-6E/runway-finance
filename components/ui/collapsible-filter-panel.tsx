'use client';

import * as React from 'react';
import { Filter, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { OverflowAware } from '@/components/ui/overflow-aware';

interface CollapsibleFilterPanelProps {
  isOpen: boolean;
  onToggle: () => void;
  feedback?: React.ReactNode;
  feedbackItems?: React.ReactNode[];
  children: React.ReactNode;
  className?: string;
  actions?: React.ReactNode;
  centerContent?: React.ReactNode;
  rightActions?: React.ReactNode;
  activeFilterCount?: number;
}

export function CollapsibleFilterPanel({
  isOpen,
  onToggle,
  feedback,
  feedbackItems,
  children,
  className,
  actions,
  centerContent,
  rightActions,
  activeFilterCount,
}: CollapsibleFilterPanelProps) {
  return (
    <div className={cn("border-b border-border bg-muted/10 px-5 py-1 transition-colors", className)}>
      <div className="flex items-center justify-between gap-2.5 min-h-[32px] w-full">
        {/* Left Side: Options toggle & Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Toggle Button */}
          <button
            type="button"
            onClick={onToggle}
            className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 h-8 py-2 bg-background hover:bg-muted border border-border/80 rounded-lg text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-all cursor-pointer shadow-sm select-none shrink-0 min-touch-target-inline"
          >
            <Filter size={12} className="text-primary shrink-0" />
            <span className="hidden sm:inline">Options</span>
            {activeFilterCount != null && activeFilterCount > 0 && (
              <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[9px] font-bold bg-primary/20 text-primary">
                {activeFilterCount}
              </span>
            )}
            {isOpen ? (
              <ChevronUp size={12} className="text-muted-foreground/60 shrink-0" />
            ) : (
              <ChevronDown size={12} className="text-muted-foreground/60 shrink-0" />
            )}
          </button>

          {/* Actions */}
          {actions}
        </div>

        {/* Center Content (e.g. dynamic search bar) or Selected Filter/Date Range Feedback */}
        {centerContent ? (
          <div className="flex-1 min-w-0 flex items-center gap-2">
            {centerContent}
            {feedbackItems && feedbackItems.length > 0 && (
              <OverflowAware className="hidden xl:flex text-[11px] font-medium text-muted-foreground py-0 min-w-0 shrink [&_span]:shrink-0 [&_span]:inline-flex [&_span]:items-center [&_span]:leading-none">
                {feedbackItems}
              </OverflowAware>
            )}
          </div>
        ) : (
          feedbackItems && feedbackItems.length > 0 ? (
            <OverflowAware className="hidden md:flex text-[11px] font-medium text-muted-foreground py-0 min-w-0 flex-1 [&_span]:shrink-0 [&_span]:inline-flex [&_span]:items-center [&_span]:leading-none">
              {feedbackItems}
            </OverflowAware>
          ) : feedback && (
            <div className="hidden md:flex text-[11px] font-medium text-muted-foreground flex-wrap items-center gap-1.5 overflow-hidden max-h-[24px] py-0 min-w-0 flex-1 [&_span]:shrink-0 [&_span]:inline-flex [&_span]:items-center [&_span]:leading-none">
              {feedback}
            </div>
          )
        )}

        {/* Right-side actions (compact toggle, date nav, etc.) */}
        {rightActions && (
          <div className="flex items-center gap-2 shrink-0">
            {rightActions}
          </div>
        )}
      </div>

      {/* Mobile-only: scrollable active filter chips when panel is closed */}
      {!isOpen && feedbackItems && feedbackItems.length > 0 && (
        <div className="flex md:hidden items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 pt-0.5 -mx-1 px-1">
          {feedbackItems.map((item, i) => (
            <span key={i} className="shrink-0 text-[10px] font-medium text-muted-foreground inline-flex items-center leading-none">
              {item}
            </span>
          ))}
        </div>
      )}

      {/* Collapsible Content */}
      {isOpen && (
        <div className="mt-1.5 p-4 bg-background/50 border border-border/40 rounded-xl space-y-4 animate-in fade-in slide-in-from-top-1 duration-200">
          {children}
        </div>
      )}
    </div>
  );
}
