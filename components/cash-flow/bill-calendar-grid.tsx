'use client';

import { useState, useMemo } from 'react';
import {
  Calendar as CalendarIcon,
  Clock,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { formatFrequencyLabel } from '@/components/features/transactions/RecurringCard';

export interface BillCalendarGridProps {
  bills: UpcomingBill[];
  currentDate?: Date;
  onCurrentDateChange?: (date: Date) => void;
  onSelectBill?: (bill: UpcomingBill) => void;
  onRefresh?: () => void;
}

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MOBILE_WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const localDateStr = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const formatNoCents = (amount: number) =>
  formatCurrency(Math.round(Number.isFinite(amount) ? amount : 0), 'USD', 'en-US');

export function BillCalendarGrid({
  bills,
  currentDate: externalCurrentDate,
  onSelectBill,
}: BillCalendarGridProps) {
  const { privacyMode } = usePrivacyMode();

  const currentDate = externalCurrentDate || new Date();
  const [selectedMobileDate, setSelectedMobileDate] = useState<string>(() => localDateStr(new Date()));
  const [inspectorCell, setInspectorCell] = useState<{
    dateStr: string;
    dayFormatted: string;
    bills: UpcomingBill[];
    totalInflow: number;
    totalOutflow: number;
  } | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth(); // 0-indexed

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

  // Compute calendar grid cells (prev month trailing, current month, next month leading)
  const calendarCells = useMemo(() => {
    const firstDayOfMonth = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const todayStr = localDateStr(new Date());

    const cells: {
      dateStr: string;
      dayNumber: number;
      monthShort: string;
      dayOfWeek: number;
      isCurrentMonth: boolean;
      isToday: boolean;
      bills: UpcomingBill[];
      totalOutflow: number;
      totalInflow: number;
    }[] = [];

    // 1. Previous month trailing days
    for (let i = firstDayOfMonth - 1; i >= 0; i--) {
      const dayNum = daysInPrevMonth - i;
      const prevMonthDate = new Date(year, month - 1, dayNum);
      const dStr = localDateStr(prevMonthDate);
      const dayBills = billsByDate.get(dStr) || [];
      const totalOutflow = dayBills
        .filter((b) => b.flowType === 'expense')
        .reduce((sum, b) => sum + (Number.isFinite(b.amount) ? b.amount : 0), 0);
      const totalInflow = dayBills
        .filter((b) => b.flowType === 'income')
        .reduce((sum, b) => sum + (Number.isFinite(b.amount) ? b.amount : 0), 0);

      cells.push({
        dateStr: dStr,
        dayNumber: dayNum,
        monthShort: prevMonthDate.toLocaleString('default', { month: 'short' }),
        dayOfWeek: prevMonthDate.getDay(),
        isCurrentMonth: false,
        isToday: dStr === todayStr,
        bills: dayBills,
        totalOutflow,
        totalInflow,
      });
    }

    // 2. Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      const curDate = new Date(year, month, d);
      const dStr = localDateStr(curDate);

      const dayBills = billsByDate.get(dStr) || [];
      const totalOutflow = dayBills
        .filter((b) => b.flowType === 'expense')
        .reduce((sum, b) => sum + (Number.isFinite(b.amount) ? b.amount : 0), 0);
      const totalInflow = dayBills
        .filter((b) => b.flowType === 'income')
        .reduce((sum, b) => sum + (Number.isFinite(b.amount) ? b.amount : 0), 0);

      cells.push({
        dateStr: dStr,
        dayNumber: d,
        monthShort: curDate.toLocaleString('default', { month: 'short' }),
        dayOfWeek: curDate.getDay(),
        isCurrentMonth: true,
        isToday: dStr === todayStr,
        bills: dayBills,
        totalOutflow,
        totalInflow,
      });
    }

    // 3. Next month leading days (to complete 35 or 42 grid cells)
    const remaining = (7 - (cells.length % 7)) % 7;
    const totalNeeded = cells.length + remaining < 35 ? 35 - cells.length : remaining;
    for (let d = 1; d <= totalNeeded; d++) {
      const nextMonthDate = new Date(year, month + 1, d);
      const dStr = localDateStr(nextMonthDate);

      const dayBills = billsByDate.get(dStr) || [];
      const totalOutflow = dayBills
        .filter((b) => b.flowType === 'expense')
        .reduce((sum, b) => sum + (Number.isFinite(b.amount) ? b.amount : 0), 0);
      const totalInflow = dayBills
        .filter((b) => b.flowType === 'income')
        .reduce((sum, b) => sum + (Number.isFinite(b.amount) ? b.amount : 0), 0);

      cells.push({
        dateStr: dStr,
        dayNumber: d,
        monthShort: nextMonthDate.toLocaleString('default', { month: 'short' }),
        dayOfWeek: nextMonthDate.getDay(),
        isCurrentMonth: false,
        isToday: dStr === todayStr,
        bills: dayBills,
        totalOutflow,
        totalInflow,
      });
    }

    return cells;
  }, [year, month, billsByDate]);

  // Open inspector for a given cell
  const openInspector = (cell: (typeof calendarCells)[0]) => {
    const dateObj = new Date(cell.dateStr + 'T00:00:00');
    const formatted = isNaN(dateObj.getTime())
      ? cell.dateStr
      : dateObj.toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        });

    setInspectorCell({
      dateStr: cell.dateStr,
      dayFormatted: formatted,
      bills: cell.bills,
      totalInflow: cell.totalInflow,
      totalOutflow: cell.totalOutflow,
    });
  };

  // Mobile selected day data
  const mobileSelectedCell = useMemo(() => {
    return (
      calendarCells.find((c) => c.dateStr === selectedMobileDate) || {
        dateStr: selectedMobileDate,
        dayNumber: parseInt(selectedMobileDate.split('-')[2] || '1', 10),
        monthShort: '',
        dayOfWeek: 0,
        isCurrentMonth: true,
        isToday: selectedMobileDate === localDateStr(new Date()),
        bills: billsByDate.get(selectedMobileDate) || [],
        totalOutflow: (billsByDate.get(selectedMobileDate) || [])
          .filter((b) => b.flowType === 'expense')
          .reduce((sum, b) => sum + (Number.isFinite(b.amount) ? b.amount : 0), 0),
        totalInflow: (billsByDate.get(selectedMobileDate) || [])
          .filter((b) => b.flowType === 'income')
          .reduce((sum, b) => sum + (Number.isFinite(b.amount) ? b.amount : 0), 0),
      }
    );
  }, [calendarCells, selectedMobileDate, billsByDate]);

  const mobileSelectedDateFormatted = useMemo(() => {
    const dateObj = new Date(selectedMobileDate + 'T00:00:00');
    if (isNaN(dateObj.getTime())) return selectedMobileDate;
    return dateObj.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  }, [selectedMobileDate]);

  // Find next upcoming bill date for quick jump on mobile empty state
  const nextUpcomingBillDate = useMemo(() => {
    const sortedDates = Array.from(billsByDate.keys())
      .filter((d) => d > selectedMobileDate)
      .sort();
    return sortedDates[0] || null;
  }, [billsByDate, selectedMobileDate]);

  return (
    <div className="space-y-3">
      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* DESKTOP CALENDAR VIEW (md and up): Google Calendar Clean Layout    */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <div className="hidden md:block border border-border/60 rounded-xl overflow-hidden bg-card/60 shadow-xs">
        {/* Day Header Row (Clean, Centered, Google Calendar style) */}
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
            const maxVisible = 3;
            const visibleBills = cell.bills.slice(0, maxVisible);
            const extraCount = cell.bills.length - maxVisible;

            return (
              <div
                key={idx}
                onClick={() => openInspector(cell)}
                className={cn(
                  'min-h-[135px] p-1 flex flex-col justify-start transition-colors relative group cursor-pointer',
                  !cell.isCurrentMonth && 'bg-muted/10 opacity-40',
                  hasBills ? 'hover:bg-muted/25' : 'hover:bg-muted/10'
                )}
              >
                {/* 1. Date Header: Centered & Uncluttered (Google Calendar Pattern) */}
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

                {/* 2. Events List: Sleek, Edge-to-Edge Colored Chips (Google Calendar Style) */}
                <div className="space-y-1 mt-0.5 px-0.5 flex-1 min-w-0">
                  {visibleBills.map((bill) => {
                    const isIncome = bill.flowType === 'income';

                    if (isIncome) {
                      // Format 1: Full-width Solid Emerald Banner (like Google Calendar all-day events)
                      return (
                        <div
                          key={bill.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onSelectBill) {
                              onSelectBill(bill);
                            } else {
                              openInspector(cell);
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

                    // Format 2: Sleek Tinted Bill Chip with Category Dot (Google Calendar clean line item)
                    return (
                      <div
                        key={bill.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onSelectBill) {
                            onSelectBill(bill);
                          } else {
                            openInspector(cell);
                          }
                        }}
                        className="w-full px-1.5 py-0.5 rounded-[4px] bg-muted/40 hover:bg-muted/70 text-foreground text-[11px] font-medium flex items-center justify-between gap-1.5 cursor-pointer transition-colors group/item leading-tight"
                        title={`${bill.displayName}: -${formatNoCents(bill.amount)} (${formatFrequencyLabel(bill.frequency)})`}
                      >
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          <span
                            className="w-2 h-2 rounded-full shrink-0 shadow-2xs"
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

                  {/* 3. Overflow: Clean text link '+N more' (Google Calendar style) */}
                  {extraCount > 0 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openInspector(cell);
                      }}
                      className="text-[11px] font-medium text-muted-foreground hover:text-foreground pl-1.5 pt-0.5 text-left w-full cursor-pointer transition-colors block"
                    >
                      {extraCount} more
                    </button>
                  )}
                </div>
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
        <div className="bg-card/70 border border-border/70 rounded-2xl p-3 shadow-xs">
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
              const hasOutflow = cell.totalOutflow > 0;
              const hasInflow = cell.totalInflow > 0;
              const hasOverdue = cell.bills.some((b) => b.isOverdue);

              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setSelectedMobileDate(cell.dateStr)}
                  className={cn(
                    'h-11 flex flex-col items-center justify-center rounded-xl transition-all relative',
                    !cell.isCurrentMonth && 'opacity-35',
                    isSelected
                      ? 'bg-primary text-primary-foreground font-bold shadow-xs scale-105 z-10'
                      : cell.isToday
                      ? 'ring-1.5 ring-primary font-bold text-primary hover:bg-muted/30'
                      : hasBills
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
        <div className="bg-card/70 border border-border/70 rounded-2xl p-4 shadow-xs space-y-3">
          {/* Header: Selected Date & Net Rollup */}
          <div className="flex items-center justify-between border-b border-border/50 pb-2.5">
            <div>
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                Scheduled for
              </span>
              <h3 className="text-sm font-bold text-foreground">
                {mobileSelectedDateFormatted}
              </h3>
            </div>

            {mobileSelectedCell.bills.length > 0 && (
              <div className="text-right">
                <span
                  className={cn(
                    'text-xs font-mono font-bold px-2 py-0.5 rounded-md inline-block',
                    mobileSelectedCell.totalInflow - mobileSelectedCell.totalOutflow >= 0
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                      : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20',
                    privacyMode && 'blur-xs select-none'
                  )}
                >
                  Net{' '}
                  {mobileSelectedCell.totalInflow - mobileSelectedCell.totalOutflow >= 0 ? '+' : '-'}
                  {formatCurrency(
                    Math.abs(mobileSelectedCell.totalInflow - mobileSelectedCell.totalOutflow)
                  )}
                </span>
              </div>
            )}
          </div>

          {/* List of bills on this date */}
          {mobileSelectedCell.bills.length === 0 ? (
            <div className="py-6 text-center space-y-2">
              <div className="w-9 h-9 rounded-full bg-muted/60 text-muted-foreground flex items-center justify-center mx-auto">
                <Clock className="w-4 h-4 opacity-70" />
              </div>
              <p className="text-xs text-muted-foreground">
                No bills or income scheduled for this day
              </p>
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
          ) : (
            <div className="divide-y divide-border/40">
              {mobileSelectedCell.bills.map((bill) => {
                const isIncome = bill.flowType === 'income';

                return (
                  <div
                    key={bill.id}
                    onClick={() => onSelectBill?.(bill)}
                    className="py-3 first:pt-1 last:pb-1 flex items-center justify-between gap-3 active:bg-muted/20 transition-colors cursor-pointer rounded-xl"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-2xs"
                        style={{
                          backgroundColor: `${bill.categoryColor || '#6366f1'}15`,
                          border: `1px solid ${bill.categoryColor || '#6366f1'}35`,
                        }}
                      >
                        <div
                          className="w-2.5 h-2.5 rounded-full"
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
                          {bill.accountName && <span>•</span>}
                          {bill.accountName && <span className="truncate">{bill.accountName}</span>}
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div
                        className={cn(
                          'font-bold font-mono text-xs sm:text-sm',
                          isIncome ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground',
                          privacyMode && 'blur-xs select-none'
                        )}
                      >
                        {isIncome ? '+' : '-'}
                        {formatNoCents(bill.amount)}
                      </div>
                      <span className="text-[10px] text-primary flex items-center justify-end gap-0.5 mt-0.5 font-medium">
                        Details
                        <ExternalLink className="w-2.5 h-2.5" />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
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
              <span>{inspectorCell?.dayFormatted}</span>
            </SheetTitle>
            <SheetDescription className="text-xs text-muted-foreground">
              Daily scheduled bills and cash flow details
            </SheetDescription>
          </SheetHeader>

          {/* Daily Breakdown Summary */}
          {inspectorCell && (
            <div className="py-4 space-y-4">
              <div className="grid grid-cols-3 gap-2 p-3 bg-muted/40 rounded-xl border border-border/50 text-center">
                <div>
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">
                    Inflow
                  </span>
                  <span
                    className={cn(
                      'text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400',
                      privacyMode && 'blur-xs select-none'
                    )}
                  >
                    +{formatCurrency(inspectorCell.totalInflow)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">
                    Outflow
                  </span>
                  <span
                    className={cn(
                      'text-xs font-mono font-bold text-rose-600 dark:text-rose-400',
                      privacyMode && 'blur-xs select-none'
                    )}
                  >
                    -{formatCurrency(inspectorCell.totalOutflow)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">
                    Net Flow
                  </span>
                  <span
                    className={cn(
                      'text-xs font-mono font-bold',
                      inspectorCell.totalInflow - inspectorCell.totalOutflow >= 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-rose-600 dark:text-rose-400',
                      privacyMode && 'blur-xs select-none'
                    )}
                  >
                    {inspectorCell.totalInflow - inspectorCell.totalOutflow >= 0 ? '+' : '-'}
                    {formatCurrency(
                      Math.abs(inspectorCell.totalInflow - inspectorCell.totalOutflow)
                    )}
                  </span>
                </div>
              </div>

              {/* Scheduled Items List */}
              <div className="space-y-2.5">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                  Scheduled Items ({inspectorCell.bills.length})
                </span>

                {inspectorCell.bills.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-4 text-center">
                    No items scheduled for this date.
                  </p>
                ) : (
                  <div className="divide-y divide-border/50 border border-border/60 rounded-xl overflow-hidden bg-card">
                    {inspectorCell.bills.map((bill) => {
                      const isIncome = bill.flowType === 'income';

                      return (
                        <div
                          key={bill.id}
                          className="p-3.5 flex items-center justify-between gap-3 hover:bg-muted/20 transition-colors"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div
                              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                              style={{
                                backgroundColor: `${bill.categoryColor || '#6366f1'}15`,
                                border: `1px solid ${bill.categoryColor || '#6366f1'}35`,
                              }}
                            >
                              <div
                                className="w-2.5 h-2.5 rounded-full"
                                style={{ backgroundColor: bill.categoryColor || '#6366f1' }}
                              />
                            </div>

                            <div className="min-w-0">
                              <div className="font-semibold text-xs text-foreground truncate">
                                {bill.displayName}
                              </div>
                              <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                                <span>{formatFrequencyLabel(bill.frequency)}</span>
                                {bill.categoryName && <span>•</span>}
                                {bill.categoryName && (
                                  <span className="truncate">{bill.categoryName}</span>
                                )}
                                {bill.accountName && <span>•</span>}
                                {bill.accountName && (
                                  <span className="truncate">{bill.accountName}</span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="text-right shrink-0 space-y-1">
                            <div
                              className={cn(
                                'font-bold font-mono text-xs sm:text-sm',
                                isIncome
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-foreground',
                                privacyMode && 'blur-xs select-none'
                              )}
                            >
                              {isIncome ? '+' : '-'}
                              {formatNoCents(bill.amount)}
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setInspectorCell(null);
                                onSelectBill?.(bill);
                              }}
                              className="h-6 px-2 text-[10px] font-semibold rounded-md text-primary hover:bg-primary/10"
                            >
                              Edit Rule
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

export default BillCalendarGrid;
