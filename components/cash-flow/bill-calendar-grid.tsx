'use client';

import { useState, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  List,
  LayoutGrid,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AppTabs } from '@/components/ui/app-tabs';
import { CollapsibleFilterPanel } from '@/components/ui/collapsible-filter-panel';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatCurrency } from '@/lib/utils/format';
import { usePrivacyMode } from '@/components/privacy-mode-provider';
import { cn } from '@/lib/utils';
import type { UpcomingBill } from '@/lib/services/recurring-detection';
import { formatFrequencyLabel } from '@/components/features/transactions/RecurringCard';

interface BillCalendarGridProps {
  bills: UpcomingBill[];
  flowFilter: 'all' | 'expense' | 'income';
  onFlowFilterChange: (filter: 'all' | 'expense' | 'income') => void;
  viewMode: 'calendar' | 'timeline';
  onViewModeChange: (mode: 'calendar' | 'timeline') => void;
  onRefresh?: () => void;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const CENTS: Intl.NumberFormatOptions = { minimumFractionDigits: 2, maximumFractionDigits: 2 };

const localDateStr = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const formatCents = (amount: number) =>
  formatCurrency(Number.isFinite(amount) ? amount : 0, 'USD', 'en-US', CENTS);

export function BillCalendarGrid({
  bills,
  flowFilter,
  onFlowFilterChange,
  viewMode,
  onViewModeChange,
}: BillCalendarGridProps) {
  const { privacyMode } = usePrivacyMode();

  // Current active calendar month / year view state
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [showOptions, setShowOptions] = useState(false);
  const [selectedDayBills, setSelectedDayBills] = useState<{
    dateStr: string;
    dayFormatted: string;
    bills: UpcomingBill[];
    totalInflow: number;
    totalOutflow: number;
  } | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth(); // 0-indexed

  const monthName = currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

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
        isCurrentMonth: false,
        isToday: dStr === todayStr,
        bills: dayBills,
        totalOutflow,
        totalInflow,
      });
    }

    return cells;
  }, [year, month, billsByDate]);



  const handleCellClick = (cell: (typeof calendarCells)[0]) => {
    if (cell.bills.length > 0) {
      const dateObj = new Date(cell.dateStr + 'T00:00:00');
      const formatted = isNaN(dateObj.getTime())
        ? cell.dateStr
        : dateObj.toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          });

      setSelectedDayBills({
        dateStr: cell.dateStr,
        dayFormatted: formatted,
        bills: cell.bills,
        totalInflow: cell.totalInflow,
        totalOutflow: cell.totalOutflow,
      });
    }
  };

  return (
    <div className="space-y-4">
      {/* ── Calendar Controls Bar ── */}
      <div className="bg-muted hover:bg-muted/85 border border-border rounded-xl transition-all duration-200 overflow-visible">
        <CollapsibleFilterPanel
          isOpen={showOptions}
          onToggle={() => setShowOptions((v) => !v)}
          activeFilterCount={
            (flowFilter !== 'all' ? 1 : 0) + (viewMode !== 'calendar' ? 1 : 0)
          }
          feedbackItems={
            flowFilter !== 'all' || viewMode !== 'calendar' ? [
              <div key="chips" className="flex items-center gap-2 flex-wrap">
                {flowFilter !== 'all' && (
                  <span className="bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider animate-in fade-in duration-150">
                    {flowFilter === 'expense' ? 'Bills' : 'Income'}
                  </span>
                )}
                {viewMode !== 'calendar' && (
                  <span className="bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider animate-in fade-in duration-150">
                    Timeline
                  </span>
                )}
              </div>,
            ] : undefined
          }

          rightActions={
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={handlePrevMonth}
                className="h-8 w-8 rounded-lg"
                aria-label="Previous Month"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>

              <h2 className="text-sm sm:text-base font-bold text-foreground min-w-[120px] sm:min-w-[140px] text-center">
                {monthName}
              </h2>

              <Button
                variant="outline"
                size="icon"
                onClick={handleNextMonth}
                className="h-8 w-8 rounded-lg"
                aria-label="Next Month"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={handleToday}
                className="text-xs h-8 px-2.5 font-medium"
              >
                Today
              </Button>
            </div>
          }
          className="border-b-0 bg-transparent px-3 sm:px-4 py-2"
        >
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 p-3 bg-muted/20 border border-border/20 rounded-xl">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mr-1 select-none">
                <CalendarIcon className="w-3 h-3" />
                Flow
              </span>
              <AppTabs
                tabs={[
                  { id: 'all', label: 'All' },
                  { id: 'expense', label: 'Bills' },
                  { id: 'income', label: 'Income' },
                ]}
                activeTab={flowFilter}
                onChange={(tab) => onFlowFilterChange(tab as any)}
                variant="pills"
                size="sm"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 p-3 bg-muted/20 border border-border/20 rounded-xl">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mr-1 select-none">
                <LayoutGrid className="w-3 h-3" />
                View
              </span>
              <div className="flex items-center bg-muted/60 p-0.5 rounded-lg border border-border/50">
                <button
                  onClick={() => onViewModeChange('calendar')}
                  className={cn(
                    'p-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1',
                    viewMode === 'calendar'
                      ? 'bg-background text-foreground shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                  title="Month Grid View"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">Calendar</span>
                </button>
                <button
                  onClick={() => onViewModeChange('timeline')}
                  className={cn(
                    'p-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1',
                    viewMode === 'timeline'
                      ? 'bg-background text-foreground shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                  title="Timeline List View"
                >
                  <List className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">Timeline</span>
                </button>
              </div>
            </div>
          </div>
        </CollapsibleFilterPanel>
      </div>

      {/* ── 7-Day Monthly Calendar Grid ── */}
      <div className="bg-card border border-border/60 rounded-2xl overflow-hidden shadow-xs">
        {/* Day Header Row */}
        <div className="grid grid-cols-7 border-b border-border/50 bg-muted/30 text-center text-[11px] sm:text-xs font-bold text-muted-foreground uppercase tracking-wider py-2">
          {WEEKDAYS.map((day) => (
            <div key={day} className="py-0.5">
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Day Cells */}
        <div className="grid grid-cols-7 divide-x divide-y divide-border/40 bg-card">
          {calendarCells.map((cell, idx) => {
            const hasBills = cell.bills.length > 0;

            return (
              <div
                key={idx}
                onClick={() => handleCellClick(cell)}
                className={cn(
                  'min-h-[85px] sm:min-h-[110px] p-1.5 sm:p-2 flex flex-col justify-between transition-colors',
                  !cell.isCurrentMonth && 'bg-muted/15 opacity-45',
                  cell.isToday && 'bg-primary/[0.04] ring-1 ring-inset ring-primary/40',
                  hasBills && 'cursor-pointer hover:bg-muted/30'
                )}
              >
                {/* Cell Header: Day Number & Positive/Negative Rollups */}
                <div className="flex items-start justify-between gap-1">
                  <span
                    className={cn(
                      'text-xs font-semibold rounded-full w-5 h-5 flex items-center justify-center shrink-0',
                      cell.isToday
                        ? 'bg-primary text-primary-foreground font-bold'
                        : cell.isCurrentMonth
                        ? 'text-foreground'
                        : 'text-muted-foreground'
                    )}
                  >
                    {cell.dayNumber}
                  </span>

                  {/* Top-Right Rollup Badges (both positive income & negative outflow) */}
                  <div className="flex flex-col items-end leading-none gap-0.5 min-w-0">
                    {cell.totalInflow > 0 && (
                      <span
                        className={cn(
                          'text-[10px] font-mono font-bold text-emerald-600 dark:text-emerald-400 truncate',
                          privacyMode && 'blur-xs select-none'
                        )}
                        title={`Total Inflow: +${formatCurrency(cell.totalInflow)}`}
                      >
                        +{formatCurrency(cell.totalInflow)}
                      </span>
                    )}
                    {cell.totalOutflow > 0 && (
                      <span
                        className={cn(
                          'text-[10px] font-mono font-bold text-rose-600 dark:text-rose-400 truncate',
                          privacyMode && 'blur-xs select-none'
                        )}
                        title={`Total Outflow: -${formatCurrency(cell.totalOutflow)}`}
                      >
                        -{formatCurrency(cell.totalOutflow)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Scheduled Bills in Day Cell */}
                <div className="space-y-1 my-1 overflow-hidden">
                  {cell.bills.slice(0, 2).map((bill) => {
                    const isIncome = bill.flowType === 'income';

                    return (
                      <div
                        key={bill.id}
                        className={cn(
                          'px-1.5 py-0.5 rounded-md text-[10px] font-medium flex items-center justify-between gap-1 border truncate shadow-2xs',
                          isIncome
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                            : 'bg-background text-foreground border-border/80'
                        )}
                        title={`${bill.displayName}: ${formatCents(bill.amount)}`}
                      >
                        <div className="flex items-center gap-1 min-w-0 truncate">
                          <div
                            className="w-1.5 h-1.5 rounded-full shrink-0"
                            style={{ backgroundColor: bill.categoryColor || '#6366f1' }}
                          />
                          <span className="truncate">{bill.displayName}</span>
                        </div>
                        <span
                          className={cn(
                            'font-mono shrink-0 text-micro font-semibold',
                            privacyMode && 'blur-xs select-none'
                          )}
                        >
                          {isIncome ? '+' : '-'}
                          {formatCents(bill.amount)}
                        </span>
                      </div>
                    );
                  })}

                  {cell.bills.length > 2 && (
                    <div className="text-micro font-semibold text-muted-foreground text-center bg-muted/40 rounded py-0.5">
                      +{cell.bills.length - 2} more
                    </div>
                  )}
                </div>

                {/* Bottom spacer for clean alignment */}
                <div className="h-0.5" />
              </div>
            );
          })}
        </div>
      </div>

      {bills.length === 0 && (
        <p className="text-center text-xs text-muted-foreground py-4">
          No recurring bills in this window
        </p>
      )}

      {/* ── Day Details Dialog ── */}
      <Dialog open={!!selectedDayBills} onOpenChange={(open) => !open && setSelectedDayBills(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-2 text-base">
              <div className="flex items-center gap-2">
                <CalendarIcon className="w-4 h-4 text-primary" />
                <span>{selectedDayBills?.dayFormatted}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs font-mono">
                {selectedDayBills && selectedDayBills.totalInflow > 0 && (
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                    +{formatCurrency(selectedDayBills.totalInflow)}
                  </span>
                )}
                {selectedDayBills && selectedDayBills.totalOutflow > 0 && (
                  <span className="text-rose-600 dark:text-rose-400 font-bold">
                    -{formatCurrency(selectedDayBills.totalOutflow)}
                  </span>
                )}
              </div>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 pt-2">
            <div className="divide-y divide-border/50 border border-border/60 rounded-xl overflow-hidden bg-card">
              {selectedDayBills?.bills.map((bill) => {
                const isIncome = bill.flowType === 'income';

                return (
                  <div key={bill.id} className="p-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                        style={{
                          backgroundColor: `${bill.categoryColor || '#6366f1'}20`,
                          border: `1px solid ${bill.categoryColor || '#6366f1'}40`,
                        }}
                      >
                        <div
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: bill.categoryColor || '#6366f1' }}
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-sm text-foreground truncate">
                          {bill.displayName}
                        </div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                          <span>{formatFrequencyLabel(bill.frequency)}</span>
                          {bill.categoryName && <span>•</span>}
                          {bill.categoryName && <span className="truncate">{bill.categoryName}</span>}
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div
                        className={cn(
                          'font-bold font-mono text-sm',
                          isIncome ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground',
                          privacyMode && 'blur-xs select-none'
                        )}
                      >
                        {isIncome ? '+' : '-'}
                        {formatCents(bill.amount)}
                      </div>
                      {bill.accountName && (
                        <div className="text-[10px] text-muted-foreground truncate">
                          {bill.accountName}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
