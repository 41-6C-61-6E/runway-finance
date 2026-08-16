'use client';

import { useState } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';

interface ProjectionOptionsPopoverProps {
  dollarMode: 'real' | 'nominal';
  onToggleDollarMode: (mode: 'real' | 'nominal') => void;
  viewMode: 'deterministic' | 'monte_carlo';
  onToggleViewMode: (mode: 'deterministic' | 'monte_carlo') => void;
}

export function ProjectionOptionsPopover({
  dollarMode,
  onToggleDollarMode,
  viewMode,
  onToggleViewMode,
}: ProjectionOptionsPopoverProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Projection Options"
          className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
            open
              ? 'bg-primary text-primary-foreground border-primary shadow-xs'
              : 'bg-card text-muted-foreground hover:text-foreground border-border hover:bg-muted/80'
          }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-72 p-4 space-y-4 rounded-2xl shadow-xl border-border bg-card">
        <div className="flex items-center justify-between border-b border-border pb-2.5">
          <div className="flex items-center gap-2 font-bold text-xs text-foreground">
            <SlidersHorizontal className="w-3.5 h-3.5 text-primary" />
            <span>Projection Options</span>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-muted transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* 1. Valuation Currency */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
            Valuation Currency
          </label>
          <div className="grid grid-cols-2 gap-1.5 bg-muted/50 p-1 rounded-xl border border-border">
            <button
              type="button"
              onClick={() => onToggleDollarMode('real')}
              className={`py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer text-center ${
                dollarMode === 'real'
                  ? 'bg-primary text-primary-foreground shadow-2xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Real (Today's $)
            </button>
            <button
              type="button"
              onClick={() => onToggleDollarMode('nominal')}
              className={`py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer text-center ${
                dollarMode === 'nominal'
                  ? 'bg-primary text-primary-foreground shadow-2xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Nominal ($)
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground px-0.5">
            {dollarMode === 'real'
              ? "Today's Dollars (Real): Adjusts future balances for inflation to show purchasing power."
              : 'Future Dollars (Nominal): Shows raw estimated dollar amounts in future years.'}
          </p>
        </div>

        {/* 2. Simulation Model */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
            Simulation Model
          </label>
          <div className="grid grid-cols-2 gap-1.5 bg-muted/50 p-1 rounded-xl border border-border">
            <button
              type="button"
              onClick={() => onToggleViewMode('deterministic')}
              className={`py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer text-center ${
                viewMode === 'deterministic'
                  ? 'bg-card text-foreground border border-border shadow-2xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Deterministic
            </button>
            <button
              type="button"
              onClick={() => onToggleViewMode('monte_carlo')}
              className={`py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer text-center ${
                viewMode === 'monte_carlo'
                  ? 'bg-amber-500 text-white shadow-2xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Monte Carlo
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground px-0.5">
            {viewMode === 'deterministic'
              ? 'Deterministic: Projects net worth using constant expected annual return rates.'
              : 'Monte Carlo: Runs 250 randomized market trials to model sequence-of-returns risk.'}
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
