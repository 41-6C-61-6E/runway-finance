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

export function ChartTooltip({ children, x, y, containerRef, className }: ChartTooltipProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [translateX, setTranslateX] = useState<number>(0);
  const [translateY, setTranslateY] = useState<number>(0);
  const isCustomPositioned = typeof x === 'number' && typeof y === 'number';

  useIsomorphicLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (containerRef && containerRef.current && isCustomPositioned && !Number.isNaN(x) && !Number.isNaN(y)) {
      const containerRect = containerRef.current.getBoundingClientRect();
      const initialLeft = containerRect.left + (x ?? 0);
      const initialTop = containerRect.top + (y ?? 0);
      el.style.left = `${initialLeft}px`;
      el.style.top = `${initialTop}px`;
    }

    // Reset styles to measure original position
    el.style.transform = 'none';

    const rect = el.getBoundingClientRect();
    let tx = 0;
    let ty = 0;

    if (rect.right > window.innerWidth) {
      tx = -(rect.right - window.innerWidth + 12);
    } else if (rect.left < 0) {
      tx = -rect.left + 12;
    }

    if (rect.bottom > window.innerHeight) {
      ty = -(rect.bottom - window.innerHeight + 12);
    } else if (rect.top < 0) {
      ty = -rect.top + 12;
    }

    setTranslateX(tx);
    setTranslateY(ty);
  }, [children, x, y, containerRef]);

  const tooltipContent = (
    <div
      ref={ref}
      className={cn(
        "z-[100] max-w-xs overflow-hidden rounded-xl border border-border bg-popover px-3 py-2 text-xs font-medium text-popover-foreground shadow-xl animate-in fade-in-0 zoom-in-95 space-y-1",
        className
      )}
      style={{
        position: containerRef ? 'fixed' : isCustomPositioned ? 'absolute' : 'relative',
        ...(isCustomPositioned && !containerRef ? { left: `${x}px`, top: `${y}px` } : {}),
        maxWidth: 'min(380px, calc(100vw - 32px))',
        maxHeight: 'calc(100vh - 32px)',
        overflowY: 'auto',
        width: 'max-content',
        transform: `translate(${translateX}px, ${translateY}px)`,
        transition: 'transform 0.05s ease-out, opacity 0.15s ease-out',
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
    <div className={cn("flex items-center gap-1.5 whitespace-nowrap w-full text-xs leading-relaxed", className)}>
      {color && (
        <span
          className="inline-block w-2 h-2 rounded-full shrink-0"
          style={{ background: color }}
        />
      )}
      <span className="text-muted-foreground truncate min-w-0 shrink flex-1">{label}:</span>
      <span className="blur-number font-semibold shrink-0 ml-auto text-foreground">{value}</span>
    </div>
  );
}

interface TooltipHeaderProps {
  children: ReactNode;
  className?: string;
}

export function TooltipHeader({ children, className }: TooltipHeaderProps) {
  return (
    <div className={cn("font-bold text-xs text-foreground pb-1 mb-1 border-b border-border/50", className)}>
      {children}
    </div>
  );
}


