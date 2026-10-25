'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { formatCompactCurrency } from '@/lib/utils/format';
import type { CalendarCell } from './calendar-cells';

interface PastDayCellContentProps {
  cell: CalendarCell;
  flowFilter?: 'all' | 'expense' | 'income';
  privacyMode: boolean;
  onSelectTransaction?: (tx: { id: string }) => void;
  openInspector: () => void;
}

export function PastDayCellContent({
  cell,
  flowFilter = 'all',
  privacyMode,
  onSelectTransaction,
  openInspector,
}: PastDayCellContentProps) {
  const actual = cell.actual;
  const overdueBills = cell.bills.filter((b) => b.isOverdue);

  // Filter actual top items by flowFilter if active
  const candidateItems = (actual?.topItems || []).filter((item) => {
    if (flowFilter === 'expense') return item.amount < 0;
    if (flowFilter === 'income') return item.amount > 0;
    return true;
  });

  const maxTotalChips = 3;
  // Overdue chips render first
  const visibleOverdue = overdueBills.slice(0, 2);
  const remainingChipSlots = Math.max(0, maxTotalChips - visibleOverdue.length);
  const visibleActualItems = candidateItems.slice(0, remainingChipSlots);

  const totalItemCount = overdueBills.length + (actual?.transactionCount || 0);
  const renderedCount = visibleOverdue.length + visibleActualItems.length;
  const extraCount = Math.max(0, totalItemCount - renderedCount);

  const hasActivity =
    (actual && actual.transactionCount > 0) || overdueBills.length > 0;

  const showInflow =
    flowFilter !== 'expense' && actual && actual.income > 0;
  const showOutflow =
    flowFilter !== 'income' && actual && (actual.expenses > 0 || actual.expenses < 0);

  return (
    <div className="flex flex-col flex-1 min-w-0 justify-between">
      {/* 1. Chips area */}
      <div className="space-y-1 mt-0.5 px-0.5 flex-1 min-w-0">
        {/* Overdue bill chips (if any) */}
        {visibleOverdue.map((bill) => (
          <div
            key={bill.id}
            onClick={(e) => {
              e.stopPropagation();
              openInspector();
            }}
            className="w-full px-1.5 py-0.5 rounded-[4px] bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-[11px] font-medium flex items-center justify-between gap-1 leading-tight cursor-pointer hover:bg-amber-500/25 transition-colors"
            title={`Overdue: ${bill.displayName} (${bill.amount})`}
          >
            <span className="truncate flex-1 min-w-0">{bill.displayName}</span>
            <span
              className={cn(
                'font-mono text-[10px] font-semibold shrink-0 tabular-nums',
                privacyMode && 'blur-xs select-none'
              )}
            >
              -{formatCompactCurrency(bill.amount)}
            </span>
          </div>
        ))}

        {/* Actual transaction chips */}
        {visibleActualItems.map((item) => {
          const isIncome = item.amount > 0;
          return (
            <div
              key={item.id}
              onClick={(e) => {
                e.stopPropagation();
                if (onSelectTransaction) {
                  onSelectTransaction({ id: item.id });
                } else {
                  openInspector();
                }
              }}
              className="w-full px-1.5 py-0.5 rounded-[4px] bg-muted/30 hover:bg-muted/60 text-foreground text-[11px] font-medium flex items-center justify-between gap-1.5 cursor-pointer transition-colors group/item leading-tight"
              title={`${item.name}: ${item.amount >= 0 ? '+' : ''}${formatCompactCurrency(item.amount)}`}
            >
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: item.categoryColor || '#94a3b8' }}
                />
                <span className="truncate text-foreground/80 group-hover/item:text-foreground">
                  {item.name}
                </span>
              </div>
              <span
                className={cn(
                  'font-mono text-[10px] font-semibold shrink-0 tabular-nums',
                  isIncome ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground',
                  privacyMode && 'blur-xs select-none'
                )}
              >
                {isIncome ? '+' : ''}
                {formatCompactCurrency(item.amount)}
              </span>
            </div>
          );
        })}

        {/* Overflow link */}
        {extraCount > 0 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              openInspector();
            }}
            className="text-[11px] font-medium text-muted-foreground hover:text-foreground pl-1 pt-0.5 text-left w-full cursor-pointer transition-colors block"
          >
            +{extraCount} more
          </button>
        )}

        {/* Empty quiet day */}
        {!hasActivity && (
          <div className="h-full flex items-center justify-center pt-2">
            <span className="text-muted-foreground/30 text-xs select-none">—</span>
          </div>
        )}
      </div>

      {/* 2. Floating Daily Totals Pills (No divider line, distinct pill styling) */}
      {hasActivity && (showInflow || showOutflow) && (
        <div
          className={cn(
            'mt-auto pt-1 px-0.5 flex items-center gap-1 text-[10px] font-mono font-semibold tabular-nums leading-none',
            showInflow && showOutflow
              ? 'justify-between'
              : showInflow
              ? 'justify-start'
              : 'justify-end'
          )}
        >
          {/* Inflow Pill */}
          {showInflow && (
            <span
              className={cn(
                'inline-flex items-center px-1.5 py-0.5 rounded-full shadow-2xs',
                'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25',
                privacyMode && 'blur-xs select-none'
              )}
              title={`Total Inflow: +${formatCompactCurrency(actual!.income)}`}
            >
              +{formatCompactCurrency(actual!.income)}
            </span>
          )}

          {/* Outflow Pill */}
          {showOutflow && (
            <span
              className={cn(
                'inline-flex items-center px-1.5 py-0.5 rounded-full shadow-2xs',
                actual!.expenses < 0
                  ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25'
                  : 'bg-muted/70 text-foreground/80 dark:text-foreground/80 border border-border/50',
                privacyMode && 'blur-xs select-none'
              )}
              title={
                actual!.expenses < 0
                  ? `Net Refund: +${formatCompactCurrency(Math.abs(actual!.expenses))}`
                  : `Total Outflow: -${formatCompactCurrency(actual!.expenses)}`
              }
            >
              {actual!.expenses < 0 ? '+' : '-'}
              {formatCompactCurrency(Math.abs(actual!.expenses))}
              {actual!.expenses < 0 ? ' ref' : ''}
            </span>
          )}
        </div>
      )}

    </div>
  );
}
