'use client';

import React, { useState, useMemo } from 'react';
import {
  Calendar as CalendarIcon,
  Clock,
  ArrowRight,
  ArrowLeft,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { formatCurrency } from '@/lib/utils/format';
import { usePrivacyMode } from '@/components/privacy-mode-provider';
import { cn } from '@/lib/utils';
import type { UpcomingBill } from '@/lib/services/recurring-detection';
import type { DailyCashFlowDay } from '@/lib/finance/daily-cash-flow';
import { formatFrequencyLabel } from '@/components/features/transactions/RecurringCard';
import {
  buildCalendarCells,
  HEAT_CLASSES,
  localDateStr,
  type CalendarCell,
} from './calendar/calendar-cells';
import { PastDayCellContent } from './calendar/past-day-cell-content';
import { DayActivityPanel } from './calendar/day-activity-panel';

export interface BillCalendarGridProps {
  bills: UpcomingBill[];
  currentDate?: Date;
  onCurrentDateChange?: (date: Date) => void;
  onSelectBill?: (bill: UpcomingBill) => void;
  onRefresh?: () => void;
  // New props for past days activity
  actualsByDate?: Map<string, DailyCashFlowDay>;
  actualsLoading?: boolean;
  flowFilter?: 'all' | 'expense' | 'income';
  search?: string;
  excludeCategoryIds?: string;
  onSelectTransaction?: (tx: any) => void;
}

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MOBILE_WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const formatNoCents = (amount: number) =>
  formatCurrency(Math.round(Number.isFinite(amount) ? amount : 0), 'USD', 'en-US');

export function BillCalendarGrid({
  bills,
  currentDate: externalCurrentDate,
  onSelectBill,
  actualsByDate,
  actualsLoading,
  flowFilter = 'all',
  search,
  excludeCategoryIds,
  onSelectTransaction,
}: BillCalendarGridProps) {
  const { privacyMode } = usePrivacyMode();

  const currentDate = externalCurrentDate || new Date();
  const [selectedMobileDate, setSelectedMobileDate] = useState<string>(() => localDateStr(new Date()));
  const [inspectorCell, setInspectorCell] = useState<CalendarCell | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth(); // 0-indexed
  const todayStr = localDateStr(new Date());

  // Group bills by date string "YYYY-MM-DD"
  const billsByDate = useMemo(() => {
    const map = new Map<string, UpcomingBill[]>();
    for (const bill of bills) {
      if (!bill.expectedDate) continue;
      const existing = map.get(bill.expectedDate) || [];
      existing.push(bill);
      map.set(bill.expectedDate, existing);
    }
    return map;
  }, [bills]);

  // Compute all calendar cells (prev month trailing, current month, next month leading)
  const calendarCells = useMemo(() => {
    return buildCalendarCells({
      year,
      month,
      todayStr,
      billsByDate,
      actualsByDate: actualsByDate || new Map(),
      flowFilter,
    });
  }, [year, month, todayStr, billsByDate, actualsByDate, flowFilter]);

  // Mobile selected day data
  const mobileSelectedCell = useMemo(() => {
    return (
      calendarCells.find((c) => c.dateStr === selectedMobileDate) || {
        dateStr: selectedMobileDate,
        dayNumber: parseInt(selectedMobileDate.split('-')[2] || '1', 10),
        monthShort: '',
        dayOfWeek: 0,
        isCurrentMonth: true,
        isToday: selectedMobileDate === todayStr,
        kind: selectedMobileDate < todayStr ? 'past' : selectedMobileDate === todayStr ? 'today' : 'future',
        bills: billsByDate.get(selectedMobileDate) || [],
        billInflow: 0,
        billOutflow: 0,
        actual: actualsByDate?.get(selectedMobileDate),
        heatLevel: 0,
      } as CalendarCell
    );
  }, [calendarCells, selectedMobileDate, todayStr, billsByDate, actualsByDate]);

  const mobileSelectedDateFormatted = useMemo(() => {
    const dateObj = new Date(selectedMobileDate + 'T00:00:00');
    if (isNaN(dateObj.getTime())) return selectedMobileDate;
    return dateObj.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  }, [selectedMobileDate]);

  // Quick jump links on mobile empty states
  const nextUpcomingBillDate = useMemo(() => {
    const sortedDates = Array.from(billsByDate.keys())
      .filter((d) => d > selectedMobileDate)
      .sort();
    return sortedDates[0] || null;
  }, [billsByDate, selectedMobileDate]);

  const prevActiveDate = useMemo(() => {
    const activeDates = calendarCells
      .filter(
        (c) =>
          c.dateStr < selectedMobileDate &&
          ((c.actual && c.actual.transactionCount > 0) || c.bills.length > 0)
      )
      .map((c) => c.dateStr);
    return activeDates[activeDates.length - 1] || null;
  }, [calendarCells, selectedMobileDate]);

  const formatDayTooltip = (cell: CalendarCell) => {
    if (cell.kind === 'past') {
      const act = cell.actual;
      if (!act || act.transactionCount === 0) {
        return `${cell.dateStr}: No transactions recorded`;
      }
      return `${cell.dateStr} · ${act.transactionCount} transactions · Spent ${formatNoCents(
        act.expenses
      )} · Inflow +${formatNoCents(act.income)}${
        act.pendingCount > 0 ? ` · ${act.pendingCount} pending` : ''
      }`;
    }
    return `${cell.dateStr}: ${cell.bills.length} scheduled item(s)`;
  };

  return (
    <div className="space-y-3">
      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* DESKTOP CALENDAR VIEW (md and up): Google Calendar Clean Layout    */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <div className="hidden md:block border border-border/60 rounded-xl overflow-hidden bg-card/60 shadow-2xs">
        {/* Day Header Row */}
        <div className="grid grid-cols-7 border-b border-border/60 bg-muted/20 text-center text-[11px] font-semibold text-muted-foreground tracking-wider py-2">
          {WEEKDAYS.map((day) => (
            <div key={day} className="py-0.5">
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Day Cells Grid */}
        <div className="grid grid-cols-7 divide-x divide-y divide-border/50 bg-card/40">
          {calendarCells.map((cell, idx) => {
            const hasBills = cell.bills.length > 0;
            const isPast = cell.kind === 'past';
            const isToday = cell.kind === 'today';
            const heatClass = (isPast || isToday) ? HEAT_CLASSES[cell.heatLevel] : '';

            return (
              <div
                key={idx}
                role="button"
                tabIndex={0}
                onClick={() => setInspectorCell(cell)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setInspectorCell(cell);
                  }
                }}
                title={formatDayTooltip(cell)}
                aria-label={`Calendar cell for ${cell.dateStr}`}
                className={cn(
                  'min-h-[135px] p-1 flex flex-col justify-between transition-colors relative group cursor-pointer focus:outline-hidden focus:ring-1 focus:ring-primary/60',
                  !cell.isCurrentMonth && 'bg-muted/10 opacity-40',
                  heatClass,
                  hasBills || (cell.actual && cell.actual.transactionCount > 0)
                    ? 'hover:bg-muted/25'
                    : 'hover:bg-muted/10'
                )}
              >
                {/* 1. Date Header: Centered & Uncluttered */}
                <div className="flex justify-center pt-1 pb-1 shrink-0">
                  {cell.isToday ? (
                    <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground font-semibold text-xs flex items-center justify-center shadow-xs">
                      {cell.dayNumber}
                    </span>
                  ) : (
                    <span
                      className={cn(
                        'text-xs font-normal text-center select-none',
                        cell.isCurrentMonth ? 'text-foreground/80' : 'text-muted-foreground/40'
                      )}
                    >
                      {cell.dayNumber === 1 ? `${cell.monthShort} 1` : cell.dayNumber}
                    </span>
                  )}
                </div>

                {/* 2. Cell Content */}
                {isPast ? (
                  // PAST DAY: Render actuals chips + pinned daily totals footer
                  <>
                    <PastDayCellContent
                      cell={cell}
                      flowFilter={flowFilter}
                      privacyMode={privacyMode}
                      onSelectTransaction={onSelectTransaction}
                      openInspector={() => setInspectorCell(cell)}
                    />
                    {actualsLoading && !cell.actual && (
                      <div className="px-2 pb-1">
                        <Skeleton className="h-2.5 w-3/4 mx-auto rounded-md" />
                      </div>
                    )}
                  </>
                ) : isToday ? (
                  // TODAY: Combined bills + actual activity
                  <>
                    <PastDayCellContent
                      cell={cell}
                      flowFilter={flowFilter}
                      privacyMode={privacyMode}
                      onSelectTransaction={onSelectTransaction}
                      openInspector={() => setInspectorCell(cell)}
                    />
                  </>
                ) : (
                  // FUTURE DAY: Scheduled recurring bills
                  <div className="space-y-1 mt-0.5 px-0.5 flex-1 min-w-0">
                    {cell.bills.slice(0, 3).map((bill) => {
                      const isIncome = bill.flowType === 'income';

                      if (isIncome) {
                        return (
                          <div
                            key={bill.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onSelectBill) {
                                onSelectBill(bill);
                              } else {
                                setInspectorCell(cell);
                              }
                            }}
                            className="w-full px-1.5 py-0.5 rounded-[4px] bg-emerald-600/85 hover:bg-emerald-600 text-white text-[11px] font-medium flex items-center justify-between gap-1 shadow-2xs cursor-pointer transition-colors leading-tight"
                            title={`${bill.displayName}: +${formatNoCents(bill.amount)}`}
                          >
                            <span className="truncate flex-1 min-w-0">{bill.displayName}</span>
                            <span
                              className={cn(
                                'font-mono text-[11px] font-semibold shrink-0 tabular-nums',
                                privacyMode && 'blur-xs select-none'
                              )}
                            >
                              +{formatNoCents(bill.amount)}
                            </span>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={bill.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onSelectBill) {
                              onSelectBill(bill);
                            } else {
                              setInspectorCell(cell);
                            }
                          }}
                          className="w-full px-1.5 py-0.5 rounded-[4px] bg-muted/40 hover:bg-muted/70 text-foreground text-[11px] font-medium flex items-center justify-between gap-1.5 cursor-pointer transition-colors group/item leading-tight"
                          title={`${bill.displayName}: -${formatNoCents(bill.amount)} (${formatFrequencyLabel(bill.frequency)})`}
                        >
                          <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            <span
                              className="w-1.5 h-1.5 rounded-full shrink-0 shadow-2xs"
                              style={{ backgroundColor: bill.categoryColor || '#38bdf8' }}
                            />
                            <span className="truncate text-foreground/90 group-hover/item:text-foreground">
                              {bill.displayName}
                            </span>
                          </div>
                          <span
                            className={cn(
                              'font-mono text-[11px] font-medium text-muted-foreground group-hover/item:text-foreground shrink-0 tabular-nums',
                              privacyMode && 'blur-xs select-none'
                            )}
                          >
                            -{formatNoCents(bill.amount)}
                          </span>
                        </div>
                      );
                    })}

                    {cell.bills.length > 3 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setInspectorCell(cell);
                        }}
                        className="text-[11px] font-medium text-muted-foreground hover:text-foreground pl-1.5 pt-0.5 text-left w-full cursor-pointer transition-colors block"
                      >
                        +{cell.bills.length - 3} more
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* MOBILE CALENDAR VIEW (< md): Simple Split Month + Agenda Stream    */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <div className="block md:hidden space-y-4">
        {/* Mini-Month Dot Calendar */}
        <div className="bg-card/70 border border-border/70 rounded-2xl p-3 shadow-2xs">
          {/* Weekday Row */}
          <div className="grid grid-cols-7 text-center text-xs font-semibold text-muted-foreground mb-2">
            {MOBILE_WEEKDAYS.map((day, i) => (
              <div key={i} className="py-1">
                {day}
              </div>
            ))}
          </div>

          {/* Compact Day Number + Status Dots */}
          <div className="grid grid-cols-7 gap-y-1">
            {calendarCells.map((cell, idx) => {
              const isSelected = cell.dateStr === selectedMobileDate;
              const hasBills = cell.bills.length > 0;
              const hasOutflow = cell.billOutflow > 0;
              const hasInflow = cell.billInflow > 0;
              const hasOverdue = cell.bills.some((b) => b.isOverdue);
              const heatClass =
                !isSelected && !cell.isToday && (cell.kind === 'past' || cell.kind === 'today')
                  ? HEAT_CLASSES[cell.heatLevel]
                  : '';

              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setSelectedMobileDate(cell.dateStr)}
                  className={cn(
                    'h-11 flex flex-col items-center justify-center rounded-xl transition-all relative',
                    !cell.isCurrentMonth && 'opacity-35',
                    heatClass,
                    isSelected
                      ? 'bg-primary text-primary-foreground font-bold shadow-xs scale-105 z-10'
                      : cell.isToday
                      ? 'ring-1.5 ring-primary font-bold text-primary hover:bg-muted/30'
                      : hasBills || (cell.actual && cell.actual.transactionCount > 0)
                      ? 'hover:bg-muted/40 font-medium'
                      : 'text-muted-foreground hover:bg-muted/20'
                  )}
                >
                  <span className="text-xs leading-none">{cell.dayNumber}</span>

                  {/* Micro event indicator dots */}
                  <div className="flex items-center gap-0.5 mt-1 h-1.5">
                    {hasOverdue ? (
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    ) : (
                      <>
                        {hasOutflow && (
                          <span
                            className={cn(
                              'w-1.5 h-1.5 rounded-full',
                              isSelected ? 'bg-primary-foreground' : 'bg-rose-500'
                            )}
                          />
                        )}
                        {hasInflow && (
                          <span
                            className={cn(
                              'w-1.5 h-1.5 rounded-full',
                              isSelected ? 'bg-primary-foreground' : 'bg-emerald-500'
                            )}
                          />
                        )}
                      </>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Synchronized Day Agenda Stream */}
        <div className="bg-card/70 border border-border/70 rounded-2xl p-4 shadow-2xs space-y-3">
          {/* Header: Selected Date & Status */}
          <div className="flex items-center justify-between border-b border-border/50 pb-2.5">
            <div>
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                {mobileSelectedCell.kind === 'past'
                  ? 'Activity on'
                  : mobileSelectedCell.kind === 'today'
                  ? 'Today'
                  : 'Scheduled for'}
              </span>
              <h3 className="text-sm font-bold text-foreground">
                {mobileSelectedDateFormatted}
              </h3>
            </div>
          </div>

          {/* Activity Panel */}
          {(!mobileSelectedCell.actual || mobileSelectedCell.actual.transactionCount === 0) &&
          mobileSelectedCell.bills.length === 0 ? (
            <div className="py-6 text-center space-y-2">
              <div className="w-9 h-9 rounded-full bg-muted/60 text-muted-foreground flex items-center justify-center mx-auto">
                <Clock className="w-4 h-4 opacity-70" />
              </div>
              <p className="text-xs text-muted-foreground">
                {mobileSelectedCell.kind === 'past'
                  ? 'No transactions recorded for this day'
                  : 'No bills or income scheduled for this day'}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                {mobileSelectedCell.kind === 'past' && prevActiveDate && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedMobileDate(prevActiveDate)}
                    className="text-xs h-7.5 px-3 rounded-lg text-primary hover:bg-primary/10"
                  >
                    <ArrowLeft className="w-3 h-3 mr-1" />
                    Previous active day
                  </Button>
                )}
                {nextUpcomingBillDate && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedMobileDate(nextUpcomingBillDate)}
                    className="text-xs h-7.5 px-3 rounded-lg text-primary hover:bg-primary/10"
                  >
                    Next scheduled bill
                    <ArrowRight className="w-3 h-3 ml-1" />
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <DayActivityPanel
              cell={mobileSelectedCell}
              flowFilter={flowFilter}
              search={search}
              excludeCategoryIds={excludeCategoryIds}
              privacyMode={privacyMode}
              onSelectBill={onSelectBill}
              onSelectTransaction={onSelectTransaction}
            />
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* DESKTOP DAY INSPECTOR (Radix Sheet)                                */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <Sheet open={!!inspectorCell} onOpenChange={(open) => !open && setInspectorCell(null)}>
        <SheetContent side="right" className="w-full sm:max-w-md p-6 overflow-y-auto">
          <SheetHeader className="border-b border-border/50 pb-4">
            <SheetTitle className="text-base font-bold flex items-center gap-2">
              <CalendarIcon className="w-4 h-4 text-primary" />
              <span>
                {inspectorCell
                  ? new Date(inspectorCell.dateStr + 'T00:00:00').toLocaleDateString('en-US', {
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric',
                    })
                  : ''}
              </span>
            </SheetTitle>
            <SheetDescription className="text-xs text-muted-foreground">
              {inspectorCell?.kind === 'past'
                ? 'Daily transactions, category breakdown, and cash flow'
                : inspectorCell?.kind === 'today'
                ? "Today's activity and scheduled recurring items"
                : 'Scheduled bills and projected cash flow'}
            </SheetDescription>
          </SheetHeader>

          {inspectorCell && (
            <div className="py-4">
              <DayActivityPanel
                cell={inspectorCell}
                flowFilter={flowFilter}
                search={search}
                excludeCategoryIds={excludeCategoryIds}
                privacyMode={privacyMode}
                onSelectBill={onSelectBill}
                onSelectTransaction={onSelectTransaction}
                onClose={() => setInspectorCell(null)}
              />
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

export default BillCalendarGrid;
