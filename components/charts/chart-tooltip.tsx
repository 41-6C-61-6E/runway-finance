import { useState, useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

interface ChartTooltipProps {
  children: ReactNode;
  x?: number;
  y?: number;
  containerRef?: React.RefObject<HTMLDivElement | null>;
}

export function ChartTooltip({ children, x, y, containerRef }: ChartTooltipProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [translateX, setTranslateX] = useState<number>(0);
  const [translateY, setTranslateY] = useState<number>(0);

  useIsomorphicLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (containerRef && containerRef.current && typeof x === 'number' && typeof y === 'number') {
      const containerRect = containerRef.current.getBoundingClientRect();
      const initialLeft = containerRect.left + x;
      const initialTop = containerRect.top + y;
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
      style={{
        position: containerRef ? 'fixed' : 'absolute',
        zIndex: 9999,
        background: 'var(--color-card)',
        border: '1px solid var(--color-border)',
        borderRadius: '0.5rem',
        boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
        color: 'var(--color-foreground)',
        fontSize: '10px',
        padding: '8px 12px',
        lineHeight: 1.5,
        minWidth: 160,
        maxWidth: 'min(380px, calc(100vw - 32px))',
        maxHeight: 'calc(100vh - 32px)',
        overflowY: 'auto',
        width: 'max-content',
        transform: `translate(${translateX}px, ${translateY}px)`,
        transition: 'transform 0.05s ease-out',
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
}

export function TooltipRow({ label, value, color }: TooltipRowProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', width: '100%' }}>
      {color && (
        <span
          style={{
            display: 'inline-block',
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: color,
            flexShrink: 0,
          }}
        />
      )}
      <span style={{ 
        color: 'var(--color-muted-foreground)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        minWidth: 0,
        flexShrink: 1
      }}>{label}:</span>
      <span className="blur-number" style={{ fontWeight: 600, flexShrink: 0, marginLeft: 'auto' }}>{value}</span>
    </div>
  );
}

interface TooltipHeaderProps {
  children: ReactNode;
}

export function TooltipHeader({ children }: TooltipHeaderProps) {
  return (
    <div style={{ fontWeight: 700, marginBottom: 4, fontSize: 11 }}>
      {children}
    </div>
  );
}

