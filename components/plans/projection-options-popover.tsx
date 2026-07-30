'use client';

import { useState } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';

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
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative inline-block text-left">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        title="Projection Options"
        className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
          isOpen
            ? 'bg-primary text-primary-foreground border-primary shadow-xs'
            : 'bg-card text-muted-foreground hover:text-foreground border-border hover:bg-muted/80'
        }`}
      >
        <SlidersHorizontal className="w-3.5 h-3.5" />
      </button>

      {isOpen && (
        <>
          {/* Click-outside listener */}
          <div
            className="fixed inset-0 z-40"
            onClick={(e) => {
              e.stopPropagation();
              setIsOpen(false);
            }}
          />

          {/* Solid Popover Panel */}
          <div
            className="absolute right-0 top-full mt-2 w-72 bg-card border border-border rounded-2xl shadow-xl p-4 z-50 space-y-4 text-left animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border pb-2.5">
              <div className="flex items-center gap-2 font-bold text-xs text-foreground">
                <SlidersHorizontal className="w-3.5 h-3.5 text-primary" />
                <span>Projection Options</span>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
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
            </div>
          </div>
        </>
      )}
    </div>
  );
}
