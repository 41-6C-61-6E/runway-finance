'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface OverflowAwareProps {
  children: React.ReactNode;
  className?: string;
}

export function OverflowAware({ children, className }: OverflowAwareProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const measureRef = React.useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = React.useState(0);

  const items = React.Children.toArray(children);

  React.useLayoutEffect(() => {
    const container = containerRef.current;
    const measureContainer = measureRef.current;
    if (!container || !measureContainer || items.length === 0) {
      setVisibleCount(0);
      return;
    }

    const measure = () => {
      const containerWidth = container.offsetWidth;
      const childElements = Array.from(measureContainer.children) as HTMLElement[];
      const gap = 6;

      let totalWidth = 0;
      let count = 0;

      for (let i = 0; i < childElements.length; i++) {
        const childWidth = childElements[i].offsetWidth;
        const itemGap = i > 0 ? gap : 0;
        if (totalWidth + childWidth + itemGap <= containerWidth) {
          totalWidth += childWidth + itemGap;
          count++;
        } else {
          break;
        }
      }

      setVisibleCount(count);
    };

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(container);

    return () => observer.disconnect();
  }, [items.length]);

  const count = Math.min(visibleCount, items.length);

  return (
    <div
      ref={containerRef}
      className={cn("flex flex-nowrap items-center gap-1.5 min-w-0 overflow-hidden", className)}
      style={{ position: 'relative' }}
    >
      {items.slice(0, count)}
      <div
        ref={measureRef}
        aria-hidden="true"
        className={cn("flex flex-nowrap items-center gap-1.5", className)}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          visibility: 'hidden',
          pointerEvents: 'none',
        }}
      >
        {items}
      </div>
    </div>
  );
}
