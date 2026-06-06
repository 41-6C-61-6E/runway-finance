'use client';

import * as React from 'react';
import { Filter, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CollapsibleFilterPanelProps {
  isOpen: boolean;
  onToggle: () => void;
  feedback: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  actions?: React.ReactNode;
  rightActions?: React.ReactNode;
}

export function CollapsibleFilterPanel({
  isOpen,
  onToggle,
  feedback,
  children,
  className,
  actions,
  rightActions
}: CollapsibleFilterPanelProps) {
  return (
    <div className={cn("border-b border-border bg-muted/10 px-5 py-2.5 transition-colors", className)}>
      <div className="flex items-center justify-between gap-4 min-h-[32px] w-full">
        {/* Left Side: Options toggle, Actions, and Feedback (Selected Options Indicators) */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {/* Toggle Button */}
          <button
            type="button"
            onClick={onToggle}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-background hover:bg-muted border border-border/80 rounded-lg text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-all cursor-pointer shadow-sm select-none shrink-0"
          >
            <Filter size={12} className="text-primary shrink-0" />
            <span>Options</span>
            {isOpen ? (
              <ChevronUp size={12} className="text-muted-foreground/60 shrink-0" />
            ) : (
              <ChevronDown size={12} className="text-muted-foreground/60 shrink-0" />
            )}
          </button>

          {/* Actions */}
          {actions}

          {/* Selected Filter/Date Range Feedback (displays only whole indicators that fit) */}
          {feedback && (
            <div className="text-[11px] font-medium text-muted-foreground flex flex-wrap items-center gap-1.5 overflow-hidden max-h-[26px] py-0.5 min-w-0 flex-1 [&_span]:shrink-0">
              {feedback}
            </div>
          )}
        </div>

        {/* Right-side actions (compact toggle, date nav, etc.) */}
        {rightActions && (
          <div className="flex items-center gap-3 shrink-0">
            {rightActions}
          </div>
        )}
      </div>

      {/* Collapsible Content */}
      {isOpen && (
        <div className="mt-2.5 p-4 bg-background/50 border border-border/40 rounded-xl space-y-4 animate-in fade-in slide-in-from-top-1 duration-200">
          {children}
        </div>
      )}
    </div>
  );
}
