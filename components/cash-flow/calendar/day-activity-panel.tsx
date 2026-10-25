'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ExternalLink,
  Receipt,
  CalendarClock,
  Split,
  ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency } from '@/lib/utils/format';
import { cn } from '@/lib/utils';
import type { CalendarCell } from './calendar-cells';
import type { UpcomingBill } from '@/lib/services/recurring-detection';
import { formatFrequencyLabel } from '@/components/features/transactions/RecurringCard';
import { useDayTransactions } from '@/lib/hooks/use-daily-cash-flow';
import { CategorySplitBar } from './category-split-bar';

interface DayActivityPanelProps {
  cell: CalendarCell;
  flowFilter?: 'all' | 'expense' | 'income';
  search?: string;
  excludeCategoryIds?: string;
  privacyMode: boolean;
  onSelectBill?: (bill: UpcomingBill) => void;
  onSelectTransaction?: (tx: any) => void;
  onClose?: () => void;
}

export function DayActivityPanel({
  cell,
  search,
  excludeCategoryIds,
  privacyMode,
  onSelectBill,
  onSelectTransaction,
  onClose,
}: DayActivityPanelProps) {
  const isPastOrToday = cell.kind === 'past' || cell.kind === 'today';
  const actual = cell.actual;

  // For past/today, use actuals if present; for future, use projected bill totals
  const inflow = isPastOrToday ? actual?.income ?? 0 : cell.billInflow;
  const outflow = isPastOrToday ? actual?.expenses ?? 0 : cell.billOutflow;
  const net = inflow - outflow;

  // Day transactions query for past and today
  const { transactions, isLoading: isTxLoading } = useDayTransactions(
    isPastOrToday ? cell.dateStr : null,
    { search, excludeCategoryIds }
  );

  const [expandedTxns, setExpandedTxns] = useState(false);
  const INITIAL_VISIBLE_COUNT = 8;
  const visibleTxns = expandedTxns
    ? transactions
    : transactions.slice(0, INITIAL_VISIBLE_COUNT);
  const hasMoreTxns = transactions.length > INITIAL_VISIBLE_COUNT;

  // Partition bills into overdue and scheduled
  const overdueBills = cell.bills.filter((b) => b.isOverdue);
  const scheduledBills = cell.bills.filter((b) => !b.isOverdue);

  const hasAnyActivity =
    (isPastOrToday && (transactions.length > 0 || isTxLoading || overdueBills.length > 0)) ||
    cell.bills.length > 0;

  return (
    <div className="space-y-4">
      {/* 1. Daily Inflow / Outflow / Net Breakdown */}
      <div className="grid grid-cols-3 gap-2 p-3 bg-muted/40 rounded-xl border border-border/50 text-center">
        <div>
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">
            Inflow
          </span>
          <span
            className={cn(
              'text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400 tabular-nums',
              privacyMode && 'blur-xs select-none'
            )}
          >
            +{formatCurrency(inflow)}
          </span>
        </div>
        <div>
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">
            Outflow
          </span>
          <span
            className={cn(
              'text-xs font-mono font-bold tabular-nums',
              outflow < 0
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-rose-600 dark:text-rose-400',
              privacyMode && 'blur-xs select-none'
            )}
          >
            {outflow < 0 ? '+' : '-'}
            {formatCurrency(Math.abs(outflow))}
          </span>
        </div>
        <div>
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">
            Net Flow
          </span>
          <span
            className={cn(
              'text-xs font-mono font-bold tabular-nums',
              net >= 0
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-rose-600 dark:text-rose-400',
              privacyMode && 'blur-xs select-none'
            )}
          >
            {net >= 0 ? '+' : '-'}
            {formatCurrency(Math.abs(net))}
          </span>
        </div>
      </div>

      {/* 2. Category Breakdown Bar (for days with expense activity) */}
      {isPastOrToday && actual && actual.topCategories.length > 0 && actual.expenses > 0 && (
        <CategorySplitBar
          categories={actual.topCategories}
          totalExpenses={actual.expenses}
          privacyMode={privacyMode}
        />
      )}

      {/* 3. Actual Transactions Section (Past days and Today) */}
      {isPastOrToday && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Transactions ({transactions.length})
            </span>
          </div>

          {isTxLoading ? (
            <div className="space-y-2 py-2">
              <Skeleton className="h-11 w-full rounded-xl" />
              <Skeleton className="h-11 w-full rounded-xl" />
              <Skeleton className="h-11 w-full rounded-xl" />
            </div>
          ) : transactions.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2 text-center bg-muted/20 rounded-xl border border-dashed border-border/50">
              No transactions recorded for this date.
            </p>
          ) : (
            <div className="divide-y divide-border/40 border border-border/60 rounded-xl overflow-hidden bg-card shadow-2xs">
              {visibleTxns.map((tx: any) => {
                const amountVal = parseFloat(tx.amount) || 0;
                const isIncome = amountVal > 0;
                const catColor = tx.category?.color || '#94a3b8';
                const hasSplits = Boolean(tx.splits && tx.splits.length > 0);

                return (
                  <div
                    key={tx.id}
                    onClick={() => onSelectTransaction?.(tx)}
                    className="p-3 flex items-center justify-between gap-3 hover:bg-muted/30 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-2xs"
                        style={{
                          backgroundColor: `${catColor}15`,
                          border: `1px solid ${catColor}35`,
                        }}
                      >
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: catColor }}
                        />
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-xs text-foreground truncate">
                            {tx.payee || tx.description || 'Transaction'}
                          </span>
                          {tx.pending && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded font-medium bg-amber-500/15 text-amber-600 dark:text-amber-400">
                              Pending
                            </span>
                          )}
                          {hasSplits && (
                            <Split className="w-3 h-3 text-muted-foreground/70" />
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                          <span className="truncate">{tx.category?.name || 'Uncategorized'}</span>
                          {tx.accountName && <span>•</span>}
                          {tx.accountName && (
                            <span className="truncate max-w-[120px]">{tx.accountName}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span
                        className={cn(
                          'font-mono font-bold text-xs tabular-nums',
                          isIncome
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-foreground',
                          privacyMode && 'blur-xs select-none'
                        )}
                      >
                        {isIncome ? '+' : '-'}
                        {formatCurrency(Math.abs(amountVal))}
                      </span>
                    </div>
                  </div>
                );
              })}

              {hasMoreTxns && !expandedTxns && (
                <button
                  type="button"
                  onClick={() => setExpandedTxns(true)}
                  className="w-full p-2 text-xs text-primary font-medium text-center hover:bg-muted/40 transition-colors flex items-center justify-center gap-1"
                >
                  Show all {transactions.length} transactions
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* 4. Scheduled / Overdue Bills Section */}
      {(overdueBills.length > 0 || scheduledBills.length > 0) && (
        <div className="space-y-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
            {cell.kind === 'past'
              ? `Was Due / Overdue (${overdueBills.length})`
              : `Scheduled Items (${cell.bills.length})`}
          </span>

          <div className="divide-y divide-border/40 border border-border/60 rounded-xl overflow-hidden bg-card">
            {cell.bills.map((bill) => {
              const isIncome = bill.flowType === 'income';

              return (
                <div
                  key={bill.id}
                  className={cn(
                    'p-3 flex items-center justify-between gap-3 hover:bg-muted/30 transition-colors',
                    bill.isOverdue && 'bg-amber-500/[0.04]'
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{
                        backgroundColor: `${bill.categoryColor || '#6366f1'}15`,
                        border: `1px solid ${bill.categoryColor || '#6366f1'}35`,
                      }}
                    >
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: bill.categoryColor || '#6366f1' }}
                      />
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-xs text-foreground truncate">
                          {bill.displayName}
                        </span>
                        {bill.isOverdue && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400">
                            Overdue
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                        <span>{formatFrequencyLabel(bill.frequency)}</span>
                        {bill.categoryName && <span>•</span>}
                        {bill.categoryName && (
                          <span className="truncate">{bill.categoryName}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0 space-y-1">
                    <div
                      className={cn(
                        'font-bold font-mono text-xs tabular-nums',
                        isIncome
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-foreground',
                        privacyMode && 'blur-xs select-none'
                      )}
                    >
                      {isIncome ? '+' : '-'}
                      {formatCurrency(bill.amount)}
                    </div>
                    {onSelectBill && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          onClose?.();
                          onSelectBill(bill);
                        }}
                        className="h-5.5 px-2 text-[10px] font-semibold rounded-md text-primary hover:bg-primary/10"
                      >
                        Edit Rule
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 5. Deep Link to Transactions Page */}
      {isPastOrToday && (
        <div className="pt-2">
          <Link
            href={`/transactions?startDate=${cell.dateStr}&endDate=${cell.dateStr}${
              search ? `&search=${encodeURIComponent(search)}` : ''
            }`}
            onClick={onClose}
            className="w-full py-2 px-3 bg-muted/40 hover:bg-muted/70 rounded-xl border border-border/60 text-xs font-semibold text-primary flex items-center justify-center gap-1.5 transition-colors"
          >
            <Receipt className="w-3.5 h-3.5" />
            <span>Open day in Transactions tab</span>
            <ExternalLink className="w-3 h-3 ml-0.5 opacity-70" />
          </Link>
        </div>
      )}
    </div>
  );
}
