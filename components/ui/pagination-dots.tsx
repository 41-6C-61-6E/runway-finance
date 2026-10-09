'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { haptic } from '@/lib/haptics';

export interface PaginationDotsProps {
  total: number;
  activeIndex: number;
  onChange?: (index: number) => void;
  labels?: string[];
  className?: string;
  size?: 'sm' | 'md';
}

/**
 * Minimal, tactile pagination dots indicator for mobile carousels and multi-view pages.
 * Replaces bulky floating tab capsules with an elegant, non-intrusive swipe indicator.
 */
export function PaginationDots({
  total,
  activeIndex,
  onChange,
  labels,
  className,
  size = 'md',
}: PaginationDotsProps) {
  if (total <= 1) return null;

  const handleDotClick = (index: number) => {
    if (index === activeIndex) return;
    haptic.light();
    onChange?.(index);
  };

  return (
    <nav
      aria-label="Pagination"
      className={cn(
        'inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-background/80 dark:bg-card/80 backdrop-blur-lg border border-border/50 shadow-sm select-none',
        className
      )}
    >
      {Array.from({ length: total }, (_, i) => {
        const isActive = i === activeIndex;
        const label = labels?.[i] || `Slide ${i + 1}`;

        return (
          <button
            key={i}
            type="button"
            aria-current={isActive ? 'page' : undefined}
            aria-label={`Go to slide ${i + 1}: ${label}`}
            title={label}
            onClick={() => handleDotClick(i)}
            className="p-1.5 flex items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary touch-manipulation cursor-pointer"
          >
            <span
              className={cn(
                'block rounded-full transition-all duration-300 ease-out',
                size === 'sm' ? 'h-1.5' : 'h-2',
                isActive
                  ? cn('bg-primary shadow-xs', size === 'sm' ? 'w-4' : 'w-5')
                  : cn('bg-muted-foreground/40 hover:bg-muted-foreground/70', size === 'sm' ? 'w-1.5' : 'w-2')
              )}
            />
          </button>
        );
      })}
    </nav>
  );
}
