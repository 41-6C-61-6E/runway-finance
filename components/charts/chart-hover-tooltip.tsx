'use client';

import { useState, useRef, useCallback, type ReactNode, type ReactElement } from 'react';
import { ChartTooltip } from '@/components/charts/chart-tooltip';

interface ChartHoverTooltipProps {
  content: ReactNode;
  children: ReactElement;
}

export function ChartHoverTooltip({ content, children }: ChartHoverTooltipProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  const updatePos = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  }, []);

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
