import { useState, useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

interface ChartTooltipProps {
  children: ReactNode;
  x?: number;
  y?: number;
  containerRef?: React.RefObject<HTMLDivElement | null>;
  className?: string;
}

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

function getHorizontalScrollParent(element: HTMLElement): HTMLElement | null {
  let parent = element.parentElement;

  while (parent && parent !== document.body) {
    const { overflowX } = window.getComputedStyle(parent);
    if (/(auto|scroll|overlay)/.test(overflowX)) return parent;
    parent = parent.parentElement;
  }

  return null;
}

export function ChartTooltip({ children, x, y, containerRef, className }: ChartTooltipProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const isCustomPositioned = typeof x === 'number' && typeof y === 'number';

  useIsomorphicLayoutEffect(() => {
    const el = ref.current;
    const container = containerRef?.current;
    setPosition(null);
    if (!el || !container || !isCustomPositioned || Number.isNaN(x) || Number.isNaN(y)) return;

    const margin = 12;
    const scrollParent = getHorizontalScrollParent(container);

    const updatePosition = () => {
      const containerRect = container.getBoundingClientRect();
      const tooltipRect = el.getBoundingClientRect();
      const scrollLeft = scrollParent?.scrollLeft ?? 0;

      // Recharts coordinates are relative to the chart's unscrolled content.
      // Convert them to viewport coordinates before applying the clamp.
      const anchorLeft = containerRect.left + (x ?? 0) - scrollLeft;
      const anchorTop = containerRect.top + (y ?? 0);
      const maxLeft = Math.max(margin, window.innerWidth - tooltipRect.width - margin);
      const maxTop = Math.max(margin, window.innerHeight - tooltipRect.height - margin);

      setPosition({
        left: Math.min(Math.max(margin, anchorLeft), maxLeft),
        top: Math.min(Math.max(margin, anchorTop), maxTop),
      });
    };

    updatePosition();

    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(updatePosition)
      : null;
    resizeObserver?.observe(el);
    resizeObserver?.observe(container);

    window.addEventListener('resize', updatePosition, { passive: true });
    window.addEventListener('scroll', updatePosition, { passive: true, capture: true });
    scrollParent?.addEventListener('scroll', updatePosition, { passive: true });

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      scrollParent?.removeEventListener('scroll', updatePosition);
    };
  }, [children, x, y, containerRef, isCustomPositioned]);

  const tooltipContent = (
    <div
      ref={ref}
      className={cn(
        "z-[100] max-w-[280px] min-w-[160px] overflow-hidden rounded-xl border border-border bg-popover px-3 py-2 text-xs font-medium text-popover-foreground shadow-xl animate-in fade-in-0 zoom-in-95 space-y-1 break-words",
        className
      )}
      style={{
        position: containerRef ? 'fixed' : isCustomPositioned ? 'absolute' : 'relative',
        ...(isCustomPositioned && !containerRef ? { left: `${x}px`, top: `${y}px` } : {}),
        ...(containerRef && position ? { left: `${position.left}px`, top: `${position.top}px` } : {}),
        width: 'max-content',
        maxWidth: 'min(280px, calc(100vw - 24px))',
        maxHeight: 'calc(100vh - 24px)',
        overflowY: 'auto',
        overflowX: 'hidden',
        overflowWrap: 'break-word',
        wordBreak: 'break-word',
        hyphens: 'auto' as any,
        visibility: containerRef && !position ? 'hidden' : 'visible',
        transition: 'opacity 0.15s ease-out',
        boxSizing: 'border-box',
        pointerEvents: 'none',
      }}
    >
      {children}
    </div>
  );

  if (containerRef && typeof window !== 'undefined') {
    return createPortal(tooltipContent, document.body);
  }

  return tooltipContent;
}

interface TooltipRowProps {
  label: string;
  value: string;
  color?: string;
  className?: string;
}

export function TooltipRow({ label, value, color, className }: TooltipRowProps) {
  return (
    <div className={cn("flex items-start justify-between gap-2 w-full text-xs leading-relaxed break-words", className)}>
      <span className="flex items-center gap-1.5 min-w-0 flex-1 break-words">
        {color && (
          <span
            className="inline-block w-2 h-2 rounded-full shrink-0 mt-0.5"
            style={{ background: color }}
          />
        )}
        <span className="text-muted-foreground break-words min-w-0 flex-1">{label}:</span>
      </span>
      <span className="blur-number font-semibold shrink-0 text-foreground text-right break-all tabular-nums">{value}</span>
    </div>
  );
}

interface TooltipHeaderProps {
  children: ReactNode;
  className?: string;
}

export function TooltipHeader({ children, className }: TooltipHeaderProps) {
  return (
    <div className={cn("font-bold text-xs text-foreground pb-1 mb-1 border-b border-border/50 break-words whitespace-normal leading-snug", className)}>
      {children}
    </div>
  );
}
