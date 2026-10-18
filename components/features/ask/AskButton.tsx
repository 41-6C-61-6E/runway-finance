'use client';

import React from 'react';
import { Sparkles } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useAsk } from './AskProvider';

export interface AskButtonProps {
  className?: string;
  containerClassName?: string;
  collapsed?: boolean;
  wrapInContainer?: boolean;
}

export function AskButton({
  className,
  containerClassName,
  collapsed = false,
  wrapInContainer = true,
}: AskButtonProps) {
  const { openAsk, closeAsk, isOpen, askStatus } = useAsk();

  // Hidden when disabled or for household members (v1)
  if (askStatus && !askStatus.available) {
    if (askStatus.reason === 'disabled' || askStatus.reason === 'member') {
      return null;
    }
  }

  const gradientDef = (
    <svg
      width="0"
      height="0"
      className="absolute pointer-events-none opacity-0"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient
          id="sparkles-purple-blue-grad"
          x1="0%"
          y1="0%"
          x2="100%"
          y2="100%"
        >
          <stop offset="0%" stopColor="#a855f7" />
          <stop offset="50%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#3b82f6" />
        </linearGradient>
      </defs>
    </svg>
  );

  const buttonContent = collapsed ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          id="ask-open-button"
          type="button"
          aria-label="Ask"
          title="Ask about your finances"
          onClick={() => (isOpen ? closeAsk() : openAsk())}
          className={cn(
            'group relative flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-200',
            'hover:scale-105 active:scale-95 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring',
            className
          )}
        >
          {/* Subtle accent flair glow on hover */}
          <div className="absolute inset-0 rounded-xl bg-primary/10 blur-[1px] opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none" />

          {/* Translucent Accent Icon Tile */}
          <div
            className={cn(
              'relative flex items-center justify-center w-9 h-9 rounded-lg transition-all duration-200 border',
              isOpen
                ? 'bg-primary/20 border-primary/40 text-primary shadow-xs shadow-primary/15'
                : 'bg-gradient-to-br from-primary/15 to-primary/5 border-primary/20 text-primary group-hover:border-primary/35 group-hover:from-primary/20 group-hover:to-primary/10 shadow-xs shadow-primary/5'
            )}
          >
            <Sparkles
              className="w-4 h-4 group-hover:rotate-12 transition-transform duration-200"
              color="url(#sparkles-purple-blue-grad)"
              stroke="url(#sparkles-purple-blue-grad)"
            />
          </div>
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">
        <div className="flex items-center gap-1.5 font-medium">
          <span>Ask</span>
          <span className="px-1.5 py-0.5 text-micro font-semibold uppercase tracking-wider rounded bg-primary/15 text-primary border border-primary/25">
            AI
          </span>
        </div>
      </TooltipContent>
    </Tooltip>
  ) : (
    <button
      id="ask-open-button"
      type="button"
      aria-label="Ask"
      title="Ask about your finances"
      onClick={() => (isOpen ? closeAsk() : openAsk())}
      className={cn(
        'group relative flex w-full items-center gap-2.5 px-3 py-2 rounded-xl transition-all duration-200 text-left overflow-hidden',
        'border backdrop-blur-xs',
        isOpen
          ? 'bg-primary/15 border-primary/35 text-primary shadow-xs shadow-primary/10'
          : 'bg-primary/5 hover:bg-primary/10 border-primary/15 hover:border-primary/30 text-sidebar-foreground/80 hover:text-sidebar-foreground',
        'active:scale-[0.98] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring',
        className
      )}
    >
      {/* Subtle accent flair glow on hover */}
      <div className="absolute -left-4 -top-4 w-12 h-12 rounded-full bg-primary/10 blur-sm pointer-events-none group-hover:bg-primary/20 transition-colors" />

      {/* Translucent Accent Icon Tile */}
      <div
        className={cn(
          'relative flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-200 shrink-0 border',
          isOpen
            ? 'bg-primary/20 border-primary/40 text-primary'
            : 'bg-gradient-to-br from-primary/15 to-primary/5 border-primary/20 text-primary group-hover:border-primary/35 group-hover:from-primary/20 group-hover:to-primary/10 group-hover:scale-105'
        )}
      >
        <Sparkles
          className="w-4 h-4 group-hover:rotate-12 transition-transform duration-200"
          color="url(#sparkles-purple-blue-grad)"
          stroke="url(#sparkles-purple-blue-grad)"
        />
      </div>

      {/* Label and AI Badge */}
      <div className="flex flex-col min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium tracking-tight text-foreground group-hover:text-primary transition-colors">
            Ask
          </span>
          <span className="px-1.5 py-0.5 text-micro font-semibold uppercase tracking-wider rounded-full bg-primary/10 text-primary border border-primary/20">
            AI
          </span>
        </div>
        <span className="text-micro text-muted-foreground/75 truncate">
          Financial assistant
        </span>
      </div>
    </button>
  );

  if (!wrapInContainer) {
    return (
      <>
        {gradientDef}
        {buttonContent}
      </>
    );
  }

  return (
    <div
      className={cn(
        'p-2 border-t border-sidebar-border/60',
        collapsed && 'flex justify-center',
        containerClassName
      )}
    >
      {gradientDef}
      {buttonContent}
    </div>
  );
}
