'use client';

import React from 'react';
import type { DailyCategorySlice } from '@/lib/finance/daily-cash-flow';
import { formatCurrency } from '@/lib/utils/format';
import { cn } from '@/lib/utils';

interface CategorySplitBarProps {
  categories: DailyCategorySlice[];
  totalExpenses: number;
  privacyMode: boolean;
}

export function CategorySplitBar({
  categories,
  totalExpenses,
  privacyMode,
}: CategorySplitBarProps) {
  if (categories.length === 0 || totalExpenses <= 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
        Category Breakdown
      </span>

      {/* Stacked percentage bar */}
      <div className="w-full h-2 rounded-full overflow-hidden flex bg-muted/60">
        {categories.map((cat, idx) => {
          const pct = Math.max(2, Math.min(100, Math.round((cat.amount / totalExpenses) * 100)));
          return (
            <div
              key={cat.categoryId || idx}
              style={{
                width: `${pct}%`,
                backgroundColor: cat.color || '#94a3b8',
              }}
              title={`${cat.name}: ${formatCurrency(cat.amount)} (${pct}%)`}
              className="h-full first:rounded-l-full last:rounded-r-full transition-all"
            />
          );
        })}
      </div>

      {/* Legend */}
      <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
        {categories.map((cat, idx) => (
          <div key={cat.categoryId || idx} className="flex items-center justify-between gap-1.5 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: cat.color || '#94a3b8' }}
              />
              <span className="text-muted-foreground truncate text-[11px]">{cat.name}</span>
            </div>
            <span
              className={cn(
                'font-mono text-[11px] font-medium text-foreground shrink-0 tabular-nums',
                privacyMode && 'blur-xs select-none'
              )}
            >
              {formatCurrency(cat.amount)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
