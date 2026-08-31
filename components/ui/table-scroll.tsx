'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface TableScrollProps {
  children: React.ReactNode;
  className?: string;
  /** Maximum visible height before the table scrolls vertically too. */
  maxHeight?: string | number;
  /** Show the right-edge fade only while more content is actually off-screen. */
  showFade?: boolean;
}

/**
 * Mobile-friendly horizontal scroller for data tables.
 *
 * Wraps a `<table>` (or table-like block) so it scrolls *inside* the viewport
 * instead of widening the page: the wrapper is `relative min-w-0` (safe inside
 * flex columns) and the edge fade signals that more columns exist off-screen.
 */
export function TableScroll({
  children,
  className,
  maxHeight,
  showFade = true,
}: TableScrollProps) {
  const scrollerRef = React.useRef<HTMLDivElement>(null);
  const [canScrollRight, setCanScrollRight] = React.useState(false);

  const update = React.useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    setCanScrollRight(el.scrollWidth - el.clientWidth > 4);
  }, []);

  React.useLayoutEffect(() => {
    update();
    const el = scrollerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [update]);

  return (
    <div className={cn('relative min-w-0 w-full', className)}>
      <div
        ref={scrollerRef}
        onScroll={update}
        className="no-scrollbar scroll-contain-x touch-pan-x overflow-x-auto overflow-y-auto overscroll-x-contain rounded-lg"
        style={maxHeight ? { maxHeight } : undefined}
      >
        {children}
      </div>
      {showFade && canScrollRight && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-card to-transparent"
        />
      )}
    </div>
  );
}
