'use client';

import { useState, useEffect, useRef } from 'react';
import { getPreciseDateRange, getPeriodLabel } from '@/lib/utils/date-window';
import { formatChartDateRange } from '@/lib/utils/chart-format';

interface DateWindowNavProps {
  prev: () => void;
  next: () => void;
  nextDisabled: boolean;
  label: string;
  options: { label: string; value: string }[];
  currentValue: string;
  onSelect: (value: string) => void;
  timeframe?: string;
}

export function DateWindowNav({ prev, next, nextDisabled, label, options, currentValue, onSelect, timeframe }: DateWindowNavProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isRolling = timeframe === '1d' || timeframe === '7d' || timeframe === '30d' || timeframe === '365d';

  if (isRolling) {
    const range = getPreciseDateRange(timeframe as any);
    const dateRangeStr = formatChartDateRange(range.start, range.end);
    const windowLabel = getPeriodLabel('', timeframe as any);

    return (
      <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground bg-muted/30 px-3 py-1.5 rounded-lg border border-border/40 select-none">
        <span>{windowLabel}</span>
        <span className="text-[10px] text-muted-foreground/60 font-normal">({dateRangeStr})</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <button onClick={prev} className="px-3 py-1.5 sm:px-2 sm:py-0.5 rounded-md text-xs bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-all" type="button">
        &larr;
      </button>
      <div className="group relative font-sans" ref={ref}>
        {timeframe === '1d_discrete' ? (
          <>
            <button
              className="text-xs font-medium text-foreground min-w-[100px] text-center whitespace-nowrap px-3 py-1.5 sm:px-1.5 sm:py-0.5 rounded transition-colors group-hover:bg-muted cursor-pointer"
              type="button"
            >
              {label}
            </button>
            <input
              type="date"
              value={currentValue}
              max={new Date().toISOString().split('T')[0]}
              onClick={(e) => {
                try {
                  (e.target as HTMLInputElement).showPicker();
                } catch (err) {
                  // Fallback
                }
              }}
              onChange={(e) => {
                if (e.target.value) {
                  onSelect(e.target.value);
                }
              }}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            />
          </>
        ) : (
          <>
            <button
              onClick={() => options.length > 0 && setOpen(!open)}
              className={`text-xs font-medium text-foreground min-w-[100px] text-center whitespace-nowrap px-3 py-1.5 sm:px-1.5 sm:py-0.5 rounded transition-colors ${
                options.length > 0 ? 'hover:bg-muted cursor-pointer' : 'cursor-default'
              }`}
              type="button"
            >
              {label}
            </button>
            {open && (
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 w-40 bg-card border border-border rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
                {options.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => { onSelect(opt.value); setOpen(false); }}
                    className={`w-full text-left px-3 py-1.5 text-[11px] hover:bg-muted transition-colors cursor-pointer ${
                      opt.value === currentValue ? 'font-semibold text-primary' : 'text-foreground/80'
                    }`}
                    type="button"
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
      <button
        onClick={next}
        disabled={nextDisabled}
        className={`px-3 py-1.5 sm:px-2 sm:py-0.5 rounded-md text-xs transition-all ${
          nextDisabled
            ? 'bg-muted/50 text-muted-foreground/30 cursor-not-allowed'
            : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground'
        }`}
        type="button"
      >
        &rarr;
      </button>
    </div>
  );
}
