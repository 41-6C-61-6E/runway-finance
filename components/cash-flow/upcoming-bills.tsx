'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { invalidateAfterTransactionChange } from '@/lib/query-invalidation';
import { usePersistentState } from '@/lib/hooks/use-persistent-state';
import {
  CalendarClock,
  AlertCircle,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  List,
  Search,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AppTabs } from '@/components/ui/app-tabs';
import { usePrivacyMode } from '@/components/privacy-mode-provider';
import { cn } from '@/lib/utils';
import type { UpcomingBill } from '@/lib/services/recurring-detection';
import type { RecurringItem } from '@/components/features/transactions/RecurringCard';
import { formatFrequencyLabel } from '@/components/features/transactions/RecurringCard';
import { BillCalendarGrid } from '@/components/cash-flow/bill-calendar-grid';
import RecurringDetailDrawer from '@/components/features/transactions/RecurringDetailDrawer';
import TransactionDetailDrawer from '@/components/features/transactions/TransactionDetailDrawer';
import { formatCurrency } from '@/lib/utils/format';
import { useDailyCashFlow } from '@/lib/hooks/use-daily-cash-flow';
import {
  computeGridRange,
  localDateStr,
} from './calendar/calendar-cells';

const formatNoCents = (amount: number) =>
  formatCurrency(Math.round(Number.isFinite(amount) ? amount : 0), 'USD', 'en-US');

export function UpcomingBills() {
  const queryClient = useQueryClient();
  const { privacyMode } = usePrivacyMode();

  const [bills, setBills] = useState<UpcomingBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [viewMode, setViewMode] = usePersistentState<'calendar' | 'timeline'>(
    'finance:upcoming-bills:viewMode',
    'calendar'
  );
  const [flowFilter, setFlowFilter] = usePersistentState<'all' | 'expense' | 'income'>(
    'finance:upcoming-bills:flowFilter',
    'all'
  );
  const [daysHorizon] = usePersistentState<number>(
    'finance:upcoming-bills:daysHorizon',
    60
  );
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce search query by 300ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Recurring drawer detail state
  const [selectedRecurringItem, setSelectedRecurringItem] = useState<RecurringItem | null>(null);
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);

  // Transaction drawer detail state
  const [selectedTx, setSelectedTx] = useState<any | null>(null);
  const [txDrawerOpen, setTxDrawerOpen] = useState(false);

  const [categories, setCategories] = useState<{ id: string; name: string; color: string; isDiscretionary?: boolean }[]>([]);
  const [hiddenFromTxCategoryIds, setHiddenFromTxCategoryIds] = useState<string>('');

  // Month navigation helpers
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthName = currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });
  const todayStr = useMemo(() => localDateStr(new Date()), []);

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  // Fetch categories on mount
  useEffect(() => {
    fetch('/api/categories')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (Array.isArray(data)) {
          setCategories(
            data.map((c: any) => ({
              id: c.id,
              name: c.name,
              color: c.color || '#6366f1',
              isDiscretionary: c.isDiscretionary ?? true,
            }))
          );

          const hiddenIds = data
            .filter((c: any) => c.hideFromTransactions)
            .map((c: any) => c.id);
          if (hiddenIds.length > 0) {
            setHiddenFromTxCategoryIds(hiddenIds.join(','));
          }
        }
      })
      .catch(() => {});
  }, []);

  const fetchUpcoming = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(`/api/recurring/upcoming?days=${daysHorizon}&flowType=${flowFilter}`);
      if (res.ok) {
        const data = await res.json();
        setBills(data.bills || []);
      } else {
        setError(true);
      }
    } catch (err) {
      console.error('Failed to fetch upcoming bills:', err);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [daysHorizon, flowFilter]);

  useEffect(() => {
    fetchUpcoming();
  }, [fetchUpcoming]);

  // Compute actuals range for past days query
  const gridRange = useMemo(() => computeGridRange(year, month), [year, month]);
  const actualsRange = useMemo(() => {
    if (gridRange.gridStart > todayStr) return null; // strictly future month
    return {
      startDate: gridRange.gridStart,
      endDate: gridRange.gridEnd < todayStr ? gridRange.gridEnd : todayStr,
    };
  }, [gridRange, todayStr]);

  // Fetch daily cash flow actuals for past days
  const {
    byDate: actualsByDate,
    isLoading: isActualsLoading,
    isError: isActualsError,
    refetch: refetchActuals,
  } = useDailyCashFlow(actualsRange, debouncedSearch);

  // Filter bills by search query
  const filteredBills = useMemo(() => {
    if (!debouncedSearch.trim()) return bills;
    const q = debouncedSearch.toLowerCase().trim();
    return bills.filter(
      (b) =>
        b.displayName?.toLowerCase().includes(q) ||
        b.merchantName?.toLowerCase().includes(q) ||
        b.categoryName?.toLowerCase().includes(q) ||
        b.accountName?.toLowerCase().includes(q)
    );
  }, [bills, debouncedSearch]);


  // Open recurring drawer when a bill is selected
  const handleOpenBillDetails = async (bill: UpcomingBill) => {
    try {
      const res = await fetch(`/api/recurring/${bill.recurringId}`);
      if (res.ok) {
        const item = await res.json();
        setSelectedRecurringItem(item);
        setDetailDrawerOpen(true);
        return;
      }
    } catch (e) {
      console.error('Failed to fetch recurring details', e);
    }

    // Fallback: construct lightweight RecurringItem from UpcomingBill
    setSelectedRecurringItem({
      id: bill.recurringId,
      userId: '',
      merchantName: bill.merchantName,
      displayName: bill.displayName,
      customName: null,
      notes: null,
      accountId: null,
      accountName: bill.accountName,
      categoryId: null,
      categoryName: bill.categoryName,
      categoryColor: bill.categoryColor,
      frequency: bill.frequency,
      averageAmount: bill.amount,
      lastAmount: bill.amount,
      monthlyAmount: bill.amount,
      annualAmount: bill.amount,
      lastDate: bill.expectedDate,
      nextExpectedDate: bill.expectedDate,
      daysUntilNext: bill.daysUntil,
      isOverdue: bill.isOverdue,
      flowType: bill.flowType,
      isConfirmed: true,
      isDismissed: false,
      isPaused: false,
      occurrenceCount: 1,
      confidence: 100,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    setDetailDrawerOpen(true);
  };

  const handleRecurringDrawerSuccess = () => {
    fetchUpcoming();
  };

  // Open transaction detail drawer
  const handleOpenTxDetails = async (txStub: { id: string }) => {
    try {
      const res = await fetch(`/api/transactions/${txStub.id}`);
      if (res.ok) {
        const fullTx = await res.json();
        setSelectedTx(fullTx);
        setTxDrawerOpen(true);
        return;
      }
    } catch (err) {
      console.error('Failed to fetch transaction details:', err);
    }
    setSelectedTx(txStub);
    setTxDrawerOpen(true);
  };

  const handleTxDrawerSuccess = () => {
    invalidateAfterTransactionChange(queryClient);
    fetchUpcoming();
  };

  // Group bills chronologically for Timeline view
  const groupedTimeline = useMemo(() => {
    const tomorrowDate = new Date();
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const tomorrowStr = localDateStr(tomorrowDate);

    const endOfWeekDate = new Date();
    endOfWeekDate.setDate(endOfWeekDate.getDate() + 7);
    const endOfWeekStr = localDateStr(endOfWeekDate);

    const currentMonth = todayStr.slice(0, 7);

    const groups: { title: string; subtitle?: string; badge?: string; isAlert?: boolean; items: UpcomingBill[] }[] = [];

    const overdue = filteredBills.filter((b) => b.isOverdue);
    const todayBills = filteredBills.filter((b) => !b.isOverdue && b.expectedDate === todayStr);
    const tomorrowBills = filteredBills.filter((b) => !b.isOverdue && b.expectedDate === tomorrowStr);
    const thisWeekBills = filteredBills.filter(
      (b) => !b.isOverdue && b.expectedDate > tomorrowStr && b.expectedDate <= endOfWeekStr
    );
    const thisMonthBills = filteredBills.filter(
      (b) => !b.isOverdue && b.expectedDate > endOfWeekStr && b.expectedDate.startsWith(currentMonth)
    );
    const futureBills = filteredBills.filter(
      (b) => !b.isOverdue && b.expectedDate > endOfWeekStr && !b.expectedDate.startsWith(currentMonth)
    );

    if (overdue.length > 0) {
      groups.push({
        title: 'Overdue / Past Expected',
        badge: `${overdue.length} overdue`,
        isAlert: true,
        items: overdue,
      });
    }

    if (todayBills.length > 0) {
      groups.push({
        title: 'Today',
        subtitle: todayStr,
        items: todayBills,
      });
    }

    if (tomorrowBills.length > 0) {
      groups.push({
        title: 'Tomorrow',
        subtitle: tomorrowStr,
        items: tomorrowBills,
      });
    }

    if (thisWeekBills.length > 0) {
      groups.push({
        title: 'This Week',
        items: thisWeekBills,
      });
    }

    if (thisMonthBills.length > 0) {
      groups.push({
        title: 'Later This Month',
        items: thisMonthBills,
      });
    }

    if (futureBills.length > 0) {
      groups.push({
        title: 'Next Month & Beyond',
        items: futureBills,
      });
    }

    return groups;
  }, [filteredBills, todayStr]);

  return (
    <div className="w-full space-y-3">
      {/* ── Persistent Navigation & View Controls Bar ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 py-1">
        {/* Left: Today Button, Chevrons & Month Title (only in Calendar view) */}
        {viewMode === 'calendar' ? (
          <div className="flex items-center gap-2 sm:gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleToday}
              className="text-xs h-8 px-3 font-semibold rounded-lg border-border/80 hover:bg-muted/70 transition-colors"
            >
              Today
            </Button>

            <div className="flex items-center">
              <Button
                variant="ghost"
                size="icon"
                onClick={handlePrevMonth}
                className="h-8 w-8 rounded-full hover:bg-muted"
                aria-label="Previous Month"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleNextMonth}
                className="h-8 w-8 rounded-full hover:bg-muted"
                aria-label="Next Month"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>

            <h2 className="text-lg sm:text-xl font-semibold text-foreground tracking-tight">
              {monthName}
            </h2>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <h2 className="text-lg sm:text-xl font-semibold text-foreground tracking-tight">
              Timeline
            </h2>
          </div>
        )}

        {/* Right: Flow Filters, Search & View Toggles */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
          {/* Flow Filter Pills */}
          <div className="flex items-center">
            <AppTabs
              tabs={[
                { id: 'all', label: 'All' },
                { id: 'expense', label: 'Bills' },
                { id: 'income', label: 'Income' },
              ]}
              activeTab={flowFilter}
              onChange={(tab) => setFlowFilter(tab as any)}
              variant="pills"
              size="sm"
            />
          </div>

          {/* Search Input */}
          <div className="relative flex-1 sm:w-44 min-w-[120px]">
            <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-8 pl-8 pr-7 bg-muted/40 hover:bg-muted/70 focus:bg-background border border-border/60 rounded-lg text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                title="Clear search"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* View Mode Toggle: Calendar <-> Timeline */}
          <div className="flex items-center bg-muted/60 p-0.5 rounded-lg border border-border/50">
            <button
              onClick={() => setViewMode('calendar')}
              className={cn(
                'p-1.5 px-2 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5',
                viewMode === 'calendar'
                  ? 'bg-background text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              title="Month Calendar View"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Calendar</span>
            </button>
            <button
              onClick={() => setViewMode('timeline')}
              className={cn(
                'p-1.5 px-2 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5',
                viewMode === 'timeline'
                  ? 'bg-background text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              title="Timeline List View"
            >
              <List className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Timeline</span>
            </button>
          </div>
        </div>
      </div>


      {/* ── Non-blocking retry alert if daily cash flow error ── */}
      {viewMode === 'calendar' && isActualsError && (
        <div className="p-2.5 px-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-2 text-xs text-amber-700 dark:text-amber-300">
          <span>Could not load past activity details for this month.</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetchActuals()}
            className="h-6 px-2 text-[10px] font-semibold rounded-md border-amber-500/40 text-amber-800 dark:text-amber-200 hover:bg-amber-500/20"
          >
            Retry
          </Button>
        </div>
      )}

      {/* ── Main View (Calendar or Timeline) ── */}
      {loading ? (
        <div className="py-20 text-center text-sm text-muted-foreground bg-card border border-border/60 rounded-2xl p-8">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-primary opacity-60" />
          Loading calendar...
        </div>
      ) : error ? (
        <div className="py-16 text-center rounded-2xl border border-dashed border-border/80 p-8 space-y-3 bg-card">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h3 className="font-semibold text-base text-foreground">Failed to load calendar schedule</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            Something went wrong while fetching recurring projections.
          </p>
          <div className="pt-1 flex justify-center">
            <Button variant="outline" size="sm" onClick={fetchUpcoming}>
              <RefreshCw className="w-3.5 h-3.5 mr-1" />
              Retry
            </Button>
          </div>
        </div>
      ) : viewMode === 'calendar' ? (
        /* Full-Width Month Calendar Grid View */
        <BillCalendarGrid
          bills={filteredBills}
          currentDate={currentDate}
          onCurrentDateChange={setCurrentDate}
          onSelectBill={handleOpenBillDetails}
          actualsByDate={actualsByDate}
          actualsLoading={isActualsLoading}
          flowFilter={flowFilter}
          search={debouncedSearch}
          excludeCategoryIds={hiddenFromTxCategoryIds}
          onSelectTransaction={handleOpenTxDetails}
        />
      ) : (
        /* Chronological Timeline List View */
        <div className="space-y-6">
          {/* Timeline Stream */}
          {filteredBills.length === 0 ? (
            <div className="py-16 text-center rounded-2xl border border-dashed border-border/80 p-8 space-y-3 bg-card">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
                <CalendarClock className="w-6 h-6" />
              </div>
              <h3 className="font-semibold text-base text-foreground">No upcoming bills found</h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                No recurring bills or income match your current filter.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {groupedTimeline.map((group, idx) => (
                <div key={idx} className="space-y-2.5">
                  {/* Group Header */}
                  <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-2">
                      <h3
                        className={cn(
                          'text-xs sm:text-sm font-bold uppercase tracking-wider',
                          group.isAlert ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'
                        )}
                      >
                        {group.title}
                      </h3>
                      {group.subtitle && (
                        <span className="text-xs text-muted-foreground font-normal">
                          ({group.subtitle})
                        </span>
                      )}
                    </div>
                    {group.badge && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                        {group.badge}
                      </span>
                    )}
                  </div>

                  {/* Group Items List */}
                  <div className="divide-y divide-border/40 border border-border/60 rounded-2xl overflow-hidden bg-card shadow-xs">
                    {group.items.map((bill) => {
                      const isIncome = bill.flowType === 'income';
                      const dateObj = new Date(bill.expectedDate + 'T00:00:00');
                      const dayName = isNaN(dateObj.getTime())
                        ? ''
                        : dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

                      return (
                        <div
                          key={bill.id}
                          onClick={() => handleOpenBillDetails(bill)}
                          className={cn(
                            'p-3.5 sm:p-4 flex items-center justify-between gap-3 hover:bg-muted/20 transition-colors cursor-pointer',
                            bill.isOverdue && 'bg-amber-500/[0.03]'
                          )}
                        >
                          {/* Left: Icon & Merchant Info */}
                          <div className="flex items-center gap-3 min-w-0">
                            <div
                              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-xs"
                              style={{
                                backgroundColor: `${bill.categoryColor || '#6366f1'}18`,
                                border: `1px solid ${bill.categoryColor || '#6366f1'}35`,
                              }}
                            >
                              <div
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: bill.categoryColor || '#6366f1' }}
                              />
                            </div>

                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-sm text-foreground truncate">
                                  {bill.displayName}
                                </span>
                                {bill.isEstimate && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                                    ~estimate
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                                <span className="font-medium text-foreground/80">{dayName}</span>
                                {bill.categoryName && <span>•</span>}
                                {bill.categoryName && (
                                  <span className="truncate">{bill.categoryName}</span>
                                )}
                                {bill.accountName && <span>•</span>}
                                {bill.accountName && (
                                  <span className="truncate hidden sm:inline">{bill.accountName}</span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Right: Amount & Frequency Badge */}
                          <div className="text-right shrink-0">
                            <div
                              className={cn(
                                'font-bold font-mono text-sm sm:text-base tracking-tight',
                                isIncome ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground',
                                privacyMode && 'blur-xs select-none'
                              )}
                            >
                              {isIncome ? '+' : '-'}
                              {formatNoCents(bill.amount)}
                            </div>

                            <div className="flex items-center justify-end gap-1.5 mt-0.5">
                              <span className="text-[10px] text-muted-foreground">
                                {formatFrequencyLabel(bill.frequency)}
                              </span>
                              {!bill.isOverdue && bill.daysUntil >= 0 && (
                                <span className="text-[10px] font-medium text-primary bg-primary/10 px-1.5 py-0.2 rounded">
                                  {bill.daysUntil === 0
                                    ? 'Today'
                                    : bill.daysUntil === 1
                                    ? 'Tomorrow'
                                    : `in ${bill.daysUntil}d`}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Connected Recurring Detail Drawer ── */}
      <RecurringDetailDrawer
        item={selectedRecurringItem}
        open={detailDrawerOpen}
        onClose={() => {
          setDetailDrawerOpen(false);
          setSelectedRecurringItem(null);
        }}
        onSuccess={handleRecurringDrawerSuccess}
        categories={categories}
      />

      {/* ── Connected Transaction Detail Drawer ── */}
      {selectedTx && (
        <TransactionDetailDrawer
          transaction={selectedTx}
          open={txDrawerOpen}
          onClose={() => {
            setTxDrawerOpen(false);
            setSelectedTx(null);
          }}
          onSuccess={handleTxDrawerSuccess}
          mode="edit"
        />
      )}
    </div>
  );
}

export default UpcomingBills;
