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
          {/* Ambient subtle glow background */}
          <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-violet-500/25 via-purple-500/20 to-indigo-500/25 blur-[2px] opacity-70 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none" />

          {/* Gradient Icon Badge */}
          <div className="relative flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br from-violet-500 via-purple-600 to-indigo-600 text-white shadow-xs shadow-violet-500/30 group-hover:shadow-md group-hover:shadow-violet-500/50 transition-all duration-200 border border-white/20">
            <Sparkles className="w-4 h-4 text-white group-hover:rotate-12 transition-transform duration-200" />
          </div>
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">
        <div className="flex items-center gap-1.5 font-medium">
          <span>Ask</span>
          <span className="px-1.5 py-0.5 text-micro font-semibold uppercase tracking-wider rounded bg-violet-500/20 text-violet-600 dark:text-violet-300">
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
        'border border-violet-500/30 dark:border-violet-400/25',
        'bg-gradient-to-r from-violet-500/10 via-purple-500/8 to-indigo-500/10',
        'hover:from-violet-500/20 hover:via-purple-500/15 hover:to-indigo-500/20',
        'hover:border-violet-500/50 hover:shadow-xs hover:shadow-violet-500/20',
        'active:scale-[0.98] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring',
        className
      )}
    >
      {/* Ambient luminous glow corner */}
      <div className="absolute -left-6 -top-6 w-16 h-16 rounded-full bg-violet-500/20 blur-md pointer-events-none group-hover:bg-violet-500/35 transition-colors" />

      {/* Vibrant Gradient Icon Badge */}
      <div className="relative flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 via-purple-600 to-indigo-600 text-white shadow-xs shadow-violet-500/30 group-hover:scale-105 group-hover:shadow-violet-500/50 transition-all duration-200 shrink-0 border border-white/20">
        <Sparkles className="w-4 h-4 text-white group-hover:rotate-12 transition-transform duration-200" />
      </div>

      {/* Label and AI Badge */}
      <div className="flex flex-col min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold tracking-tight text-foreground group-hover:text-primary transition-colors">
            Ask
          </span>
          <span className="px-1.5 py-0.5 text-micro font-semibold uppercase tracking-wider rounded-full bg-violet-500/15 text-violet-600 dark:text-violet-300 border border-violet-500/25">
            AI
          </span>
        </div>
        <span className="text-micro text-muted-foreground/80 truncate">
          Financial assistant
        </span>
      </div>
    </button>
  );

  if (!wrapInContainer) {
    return buttonContent;
  }

  return (
    <div
      className={cn(
        'p-2 border-t border-sidebar-border/60',
        collapsed && 'flex justify-center',
        containerClassName
      )}
    >
      {buttonContent}
    </div>
  );
}
