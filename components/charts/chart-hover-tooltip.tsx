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
  const touchStartPosRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const isDraggingRef = useRef(false);

  const updatePos = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  }, []);

  // Dismiss on any scroll
  useEffect(() => {
    if (!pos) return;
    const handleScroll = () => {
      setPos(null);
    };
    window.addEventListener('scroll', handleScroll, { passive: true, capture: true });
    return () => window.removeEventListener('scroll', handleScroll, true);
  }, [pos]);

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    touchStartPosRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now(),
    };
    isDraggingRef.current = false;
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!touchStartPosRef.current || e.touches.length !== 1) return;
    const touch = e.touches[0];
    const dx = touch.clientX - touchStartPosRef.current.x;
    const dy = touch.clientY - touchStartPosRef.current.y;
    // If finger moves more than 8px, user is dragging/scrolling
    if (Math.hypot(dx, dy) > 8) {
      isDraggingRef.current = true;
      setPos(null);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!touchStartPosRef.current || isDraggingRef.current) {
      touchStartPosRef.current = null;
      isDraggingRef.current = false;
      return;
    }

    const elapsed = Date.now() - touchStartPosRef.current.time;
    // Short tap only (< 300ms)
    if (elapsed < 300) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        if (pos) {
          setPos(null);
        } else {
          setPos({
            x: touchStartPosRef.current.x - rect.left,
            y: touchStartPosRef.current.y - rect.top,
          });
        }
      }
    }
    touchStartPosRef.current = null;
    isDraggingRef.current = false;
  };

  return (
    <div
      ref={containerRef}
      onMouseEnter={updatePos}
      onMouseMove={updatePos}
      onMouseLeave={() => setPos(null)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
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
