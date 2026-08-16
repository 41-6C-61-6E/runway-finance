'use client';

import * as React from 'react';
import { HelpCircle, type LucideIcon } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export interface IconTipProps {
  content: React.ReactNode;
  icon?: LucideIcon;
  size?: number;
  className?: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  children?: React.ReactNode;
  'aria-label'?: string;
}

export function IconTip({
  content,
  icon: Icon = HelpCircle,
  size = 14,
  className,
  side = 'top',
  align = 'center',
  children,
  'aria-label': ariaLabel,
}: IconTipProps) {
  if (!content) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {children ? (
          children
        ) : (
          <button
            type="button"
            className={cn(
              'inline-flex items-center justify-center text-muted-foreground/70 hover:text-foreground transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-full p-0.5',
              className
            )}
            aria-label={ariaLabel || (typeof content === 'string' ? content : 'More information')}
          >
            <Icon size={size} className="shrink-0" />
          </button>
        )}
      </TooltipTrigger>
      <TooltipContent side={side} align={align} className="max-w-xs text-xs">
        {content}
      </TooltipContent>
    </Tooltip>
  );
}
