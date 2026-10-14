'use client';

import * as React from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

interface SidebarCollapseButtonProps {
  onClick: () => void;
  className?: string;
  label?: string;
}

/**
 * Compact floating collapse button positioned at the top-right of sidebar overview/scorecard cards.
 * Avoids any empty top header bar or horizontal dividing lines, allowing card content
 * to begin immediately at the top while preserving horizontal sidebar collapse on desktop.
 */
export function SidebarCollapseButton({
  onClick,
  className,
  label = 'Collapse sidebar',
}: SidebarCollapseButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          className={cn(
            'absolute top-3 right-3 sm:top-3.5 sm:right-3.5 z-20',
            'w-7 h-7 rounded-lg',
            'text-muted-foreground/60 hover:text-foreground hover:bg-muted/60',
            'transition-all duration-150 cursor-pointer',
            'hidden sm:flex items-center justify-center',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
            className
          )}
          aria-label={label}
        >
          <ChevronRight className="w-4 h-4 transition-transform duration-150 hover:translate-x-0.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="left" className="text-xs font-medium">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
