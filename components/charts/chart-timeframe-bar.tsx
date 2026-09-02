'use client';

import { useEffect, useRef, useState, useCallback, useLayoutEffect, useMemo } from 'react';
import { ChevronDown } from 'lucide-react';
import { TIME_RANGE_PRESETS, TIME_RANGE_BAR_ORDER, type TimeRange } from './chart-filters';
import { cn } from '@/lib/utils';

interface ChartTimeframeBarProps {
  value: TimeRange;
  onChange: (value: TimeRange) => void;
  presets?: { label: string; value: TimeRange; group?: string }[];
  windowNav?: React.ReactNode;
  className?: string;
}

// Human readable tooltip for each timeframe value
const TOOLTIPS: Record<string, string> = {
  '7d': 'Last 7 days (rolling)',
  '30d': 'Last 30 days (rolling)',
  '90d': 'Last 90 days (rolling)',
  '365d': 'Last 365 days (rolling)',
  '7d_discrete': '7-day window (navigable)',
  '1m': 'One calendar month',
  '3m': 'One quarter',
  '6m': 'Half year',
  '1y': 'One calendar year',
  '3y': 'Three calendar years',
  '5y': 'Five calendar years',
  'ytd': 'Year to date',
  'all': 'All time',
};

function orderPresets(presets: { label: string; value: TimeRange }[]): { label: string; value: TimeRange }[] {
  const order = TIME_RANGE_BAR_ORDER;
  return [...presets].sort((a, b) => {
    const ai = order.indexOf(a.value);
    const bi = order.indexOf(b.value);
    if (ai === -1 && bi === -1) return 0;
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

export function ChartTimeframeBar({ value, onChange, presets, windowNav, className }: ChartTimeframeBarProps) {
  const rawPresets = presets ?? TIME_RANGE_PRESETS;
  const orderedPresets = useMemo(() => orderPresets(rawPresets), [rawPresets]);

  const barRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(orderedPresets.length);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const overflowRef = useRef<HTMLDivElement>(null);

  // Close overflow on outside click
  useEffect(() => {
    if (!overflowOpen) return;
    const handler = (e: MouseEvent) => {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) {
        setOverflowOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [overflowOpen]);

  const computeVisible = useCallback(() => {
    const bar = barRef.current;
    if (!bar) return;
    const barW = bar.clientWidth;
    if (barW === 0) return;

    const navW = navRef.current?.offsetWidth ?? 0;
    // Reserve space: nav + gaps + padding
    const padding = 16; // px-? combined
    const gap = 4;
    const overflowBtnW = 64;
    // Estimate per-pill width by label length (more accurate than flat avg)
    // base 32px + ~8px per char
    const pillWidths = orderedPresets.map(p => {
      const len = p.label.length;
      // "365D" = 4 chars, "All" = 3, etc. scale
      return 30 + len * 8 + 8; // px-2.5 + text-xs
    });

    // Find max N that fits
    let best = orderedPresets.length;
    for (let n = orderedPresets.length; n >= 1; n--) {
      const pillsW = pillWidths.slice(0, n).reduce((s, w) => s + w, 0) + Math.max(0, n - 1) * gap;
      const needOverflow = n < orderedPresets.length ? overflowBtnW + gap : 0;
      const needed = pillsW + needOverflow + navW + (navW > 0 ? gap : 0) + padding;
      if (needed <= barW) {
        best = n;
        break;
      }
      if (n === 1) best = 1;
    }
    // Ensure at least 2 on very wide, at least 1 on narrow
    if (barW < 360) best = Math.min(best, 3);
    else if (barW < 480) best = Math.min(best, 5);
    setVisibleCount(best);
  }, [orderedPresets]);

  useLayoutEffect(() => {
    computeVisible();
  }, [computeVisible]);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const ro = new ResizeObserver(() => computeVisible());
    ro.observe(bar);
    // also observe nav width changes
    if (navRef.current) ro.observe(navRef.current);
    window.addEventListener('resize', computeVisible);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', computeVisible);
    };
  }, [computeVisible]);

  // Keep active visible: if active is beyond visibleCount, swap it in
  const displayPresets = useMemo(() => {
    let visible = orderedPresets.slice(0, visibleCount);
    let overflow = orderedPresets.slice(visibleCount);
    const activeIdx = orderedPresets.findIndex(p => p.value === value);
    const isActiveVisible = visible.some(p => p.value === value);
    if (activeIdx !== -1 && !isActiveVisible && overflow.length > 0) {
      // Bring active into visible, push least important visible to overflow
      // For simplicity replace last visible with active
      const active = orderedPresets[activeIdx];
      visible = [...visible.slice(0, -1), active];
      // rebuild overflow: all not in visible
      const visibleValues = new Set(visible.map(p => p.value));
      overflow = orderedPresets.filter(p => !visibleValues.has(p.value));
    }
    return { visible, overflow };
  }, [orderedPresets, visibleCount, value]);

  const { visible, overflow } = displayPresets;
  const isOverflowActive = overflow.some(p => p.value === value);

  return (
    <div
      ref={barRef}
      className={cn(
        'flex items-center justify-between gap-2 border-b border-border bg-muted/10 px-3 py-2 sm:px-4',
        'w-full min-h-[44px]',
        className
      )}
    >
      {/* Left: timeframe pills */}
      <div className="flex items-center gap-1 min-w-0 flex-1">
        <div className="flex items-center gap-1 bg-muted/40 p-0.5 rounded-full border border-border/40 shrink-0">
          {visible.map(p => {
            const active = value === p.value;
            return (
              <button
                key={p.value}
                onClick={() => onChange(p.value)}
                title={TOOLTIPS[p.value] ?? p.label}
                className={cn(
                  'px-2.5 py-1 rounded-full text-xs font-semibold leading-none transition-all whitespace-nowrap',
                  'min-h-[26px] inline-flex items-center justify-center',
                  active
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        {overflow.length > 0 && (
          <div className="relative shrink-0" ref={overflowRef}>
            <button
              onClick={() => setOverflowOpen(v => !v)}
              className={cn(
                'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold leading-none border transition-all min-h-[26px]',
                isOverflowActive
                  ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                  : 'bg-background text-muted-foreground border-border hover:bg-muted hover:text-foreground'
              )}
            >
              <span>+{overflow.length}</span>
              <ChevronDown size={12} className={cn('shrink-0 transition-transform', overflowOpen && 'rotate-180')} />
            </button>
            {overflowOpen && (
              <div className="absolute top-full left-0 mt-1.5 bg-popover border border-border rounded-xl shadow-lg z-50 p-1 min-w-[160px] animate-in fade-in slide-in-from-top-1 duration-150">
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2.5 py-1">
                  More timeframes
                </div>
                <div className="grid grid-cols-2 gap-1 p-1">
                  {overflow.map(p => {
                    const active = value === p.value;
                    return (
                      <button
                        key={p.value}
                        onClick={() => {
                          onChange(p.value);
                          setOverflowOpen(false);
                        }}
                        title={TOOLTIPS[p.value] ?? p.label}
                        className={cn(
                          'px-2.5 py-1.5 rounded-lg text-xs font-semibold leading-none transition-colors text-center',
                          active
                            ? 'bg-primary text-primary-foreground shadow-sm'
                            : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground border border-transparent'
                        )}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
                {(overflow as any).some((p: any) => p.group) && (
                  <div className="px-2.5 pb-1 pt-0.5 text-[10px] text-muted-foreground/60 leading-tight">
                    {(overflow as any).find((p: any) => p.value === value)?.group ? `${(overflow as any).find((p: any) => p.value === value)?.group} timeframe` : ''}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right: window nav */}
      {windowNav && (
        <div ref={navRef} className="shrink-0 flex items-center">
          {windowNav}
        </div>
      )}
    </div>
  );
}
