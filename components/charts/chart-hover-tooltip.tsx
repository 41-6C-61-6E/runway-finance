'use client';

import { useState, useRef, useCallback, useEffect, type ReactNode, type ReactElement } from 'react';
import { ChartTooltip } from '@/components/charts/chart-tooltip';

interface ChartHoverTooltipProps {
  content: ReactNode;
  children: ReactElement;
}

export function ChartHoverTooltip({ content, children }: ChartHoverTooltipProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => {
      setIsMobile(
        typeof window !== 'undefined' &&
        (window.innerWidth < 768 || window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window)
      );
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const updatePos = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (isMobile) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  }, [isMobile]);

  // Dismiss on any scroll
  useEffect(() => {
    if (!pos) return;
    const handleScroll = () => {
      setPos(null);
    };
    window.addEventListener('scroll', handleScroll, { passive: true, capture: true });
    return () => window.removeEventListener('scroll', handleScroll, true);
  }, [pos]);

  // Completely bypass tooltips on mobile views and touch devices
  if (isMobile) {
    return children;
  }

  return (
    <div
      ref={containerRef}
      onMouseEnter={updatePos}
      onMouseMove={updatePos}
      onMouseLeave={() => setPos(null)}
    >
      {children}
      {pos && (
        <ChartTooltip x={pos.x} y={pos.y} containerRef={containerRef}>
          {content}
        </ChartTooltip>
      )}
    </div>
  );
}
