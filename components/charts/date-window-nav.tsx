'use client';

import { useState, useEffect, useRef } from 'react';

interface DateWindowNavProps {
  prev: () => void;
  next: () => void;
  nextDisabled: boolean;
  label: string;
  options: { label: string; value: string }[];
  currentValue: string;
  onSelect: (value: string) => void;
}

export function DateWindowNav({ prev, next, nextDisabled, label, options, currentValue, onSelect }: DateWindowNavProps) {
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

  return (
    <div className="flex items-center gap-1.5">
      <button onClick={prev} className="px-3 py-1.5 sm:px-2 sm:py-0.5 rounded-md text-xs bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-all" type="button">
        &larr;
      </button>
      <div className="relative" ref={ref}>
        <button
          onClick={() => setOpen(!open)}
          className="text-xs font-medium text-foreground min-w-[100px] text-center whitespace-nowrap px-3 py-1.5 sm:px-1.5 sm:py-0.5 rounded hover:bg-muted transition-colors cursor-pointer"
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
