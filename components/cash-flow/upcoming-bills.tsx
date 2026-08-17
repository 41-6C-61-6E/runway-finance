'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  CalendarClock,
  AlertCircle,
  CheckCircle2,
  HelpCircle,
  RefreshCw,
  LayoutGrid,
  List,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AppTabs } from '@/components/ui/app-tabs';
import { MobileViewSwitcher } from '@/components/ui/mobile-view-switcher';
import { CollapsibleFilterPanel } from '@/components/ui/collapsible-filter-panel';
import { CollapsibleCardHeader } from '@/components/ui/collapsible-card-header';
import { useCardCollapsed } from '@/lib/hooks/use-card-collapsed';
import { formatCurrency } from '@/lib/utils/format';
import { usePrivacyMode } from '@/components/privacy-mode-provider';
import { cn } from '@/lib/utils';
import type { UpcomingBill } from '@/lib/services/recurring-detection';
import { formatFrequencyLabel } from '@/components/features/transactions/RecurringCard';
import { BillCalendarGrid } from '@/components/cash-flow/bill-calendar-grid';

const CENTS: Intl.NumberFormatOptions = { minimumFractionDigits: 2, maximumFractionDigits: 2 };

const localDateStr = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function UpcomingBills() {
  const { privacyMode } = usePrivacyMode();
  const [collapsed, setCollapsed] = useCardCollapsed('upcomingBillsSummary', false);

  const [bills, setBills] = useState<UpcomingBill[]>([]);
  const [stats, setStats] = useState<{
    dueThisWeek: number;
    dueThisMonth: number;
    paidThisMonth: number;
    totalUpcoming: number;
  }>({
    dueThisWeek: 0,
    dueThisMonth: 0,
    paidThisMonth: 0,
    totalUpcoming: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [viewMode, setViewMode] = useState<'calendar' | 'timeline'>('calendar');
  const [flowFilter, setFlowFilter] = useState<'all' | 'expense' | 'income'>('all');
  const [daysHorizon, setDaysHorizon] = useState<number>(60);
  const [showOptions, setShowOptions] = useState(false);

  const fetchUpcoming = async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(`/api/recurring/upcoming?days=${daysHorizon}&flowType=${flowFilter}`);
      if (res.ok) {
        const data = await res.json();
        setBills(data.bills || []);
        setStats(data.stats || { dueThisWeek: 0, dueThisMonth: 0, paidThisMonth: 0, totalUpcoming: 0 });
      } else {
        setError(true);
      }
    } catch (err) {
      console.error('Failed to fetch upcoming bills:', err);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUpcoming();
  }, [daysHorizon, flowFilter]);

  // Group bills chronologically for Timeline view
  const groupedTimeline = useMemo(() => {
    const todayStr = localDateStr(new Date());

    const tomorrowDate = new Date();
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const tomorrowStr = localDateStr(tomorrowDate);

    const endOfWeekDate = new Date();
    endOfWeekDate.setDate(endOfWeekDate.getDate() + 7);
    const endOfWeekStr = localDateStr(endOfWeekDate);

    const currentMonth = todayStr.slice(0, 7);

    const groups: { title: string; subtitle?: string; badge?: string; isAlert?: boolean; items: UpcomingBill[] }[] = [];

    const overdue = bills.filter((b) => b.isOverdue);
    const todayBills = bills.filter((b) => !b.isOverdue && b.expectedDate === todayStr);
    const tomorrowBills = bills.filter((b) => !b.isOverdue && b.expectedDate === tomorrowStr);
    const thisWeekBills = bills.filter(
      (b) => !b.isOverdue && b.expectedDate > tomorrowStr && b.expectedDate <= endOfWeekStr
    );
    const thisMonthBills = bills.filter(
      (b) => !b.isOverdue && b.expectedDate > endOfWeekStr && b.expectedDate.startsWith(currentMonth)
    );
    const futureBills = bills.filter(
      (b) => !b.isOverdue && b.expectedDate > endOfWeekStr && !b.expectedDate.startsWith(currentMonth)
    );

    if (overdue.length > 0) {
      groups.push({
        title: 'Overdue / Expected Past Date',
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
  }, [bills]);

  // Main Calendar / Timeline content
  const mainContent = (
    <div className="space-y-6">
      {loading ? (
        <div className="py-16 text-center text-sm text-muted-foreground">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-primary opacity-60" />
          Loading bill calendar...
        </div>
      ) : error ? (
        <div className="py-16 text-center rounded-2xl border border-dashed border-border/80 p-8 space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h3 className="font-semibold text-base text-foreground">Failed to load your bill calendar</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            Something went wrong while fetching your recurring bills.
          </p>
          <div className="pt-1 flex justify-center">
            <Button variant="outline" size="sm" onClick={fetchUpcoming}>
              <RefreshCw className="w-3.5 h-3.5" />
              Retry
            </Button>
          </div>
        </div>
      ) : viewMode === 'calendar' ? (
        /* Monthly Calendar Grid View */
        <BillCalendarGrid
          bills={bills}
          flowFilter={flowFilter}
          onFlowFilterChange={setFlowFilter}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onRefresh={fetchUpcoming}
        />
      ) : (
        /* Chronological Timeline List View */
        <div className="space-y-6">
          {/* Timeline Header Bar */}
          <div className="bg-muted hover:bg-muted/85 border border-border rounded-xl transition-all duration-200 overflow-visible">
            <CollapsibleFilterPanel
              isOpen={showOptions}
              onToggle={() => setShowOptions((v) => !v)}
              activeFilterCount={
                (flowFilter !== 'all' ? 1 : 0) + (daysHorizon !== 60 ? 1 : 0)
              }
              feedbackItems={
                flowFilter !== 'all' || daysHorizon !== 60 ? [
                  <div key="chips" className="flex items-center gap-2 flex-wrap">
                    {flowFilter !== 'all' && (
                      <span className="bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider animate-in fade-in duration-150">
                        {flowFilter === 'expense' ? 'Bills' : 'Income'}
                      </span>
                    )}
                    {daysHorizon !== 60 && (
                      <span className="bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider animate-in fade-in duration-150">
                        Next {daysHorizon}d
                      </span>
                    )}
                  </div>,
                ] : undefined
              }
              actions={
                flowFilter !== 'all' || daysHorizon !== 60 ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="h-6 px-2 flex items-center rounded-md bg-primary/10 text-primary border border-primary/20 text-[10px] font-semibold uppercase tracking-wider">
                      Filtered
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setFlowFilter('all');
                        setDaysHorizon(60);
                      }}
                      className="h-6 px-2 flex items-center gap-1 rounded-md bg-background hover:bg-muted border border-border text-muted-foreground hover:text-foreground text-[10px] font-semibold uppercase tracking-wider transition-colors cursor-pointer"
                    >
                      Reset
                    </button>
                  </div>
                ) : undefined
              }
              rightActions={
                <div className="flex items-center bg-muted/60 p-0.5 rounded-lg border border-border/50">
                  <button
                    onClick={() => setViewMode('calendar')}
                    className="p-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1 text-muted-foreground hover:text-foreground"
                    title="Month Grid View"
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    <span className="hidden md:inline">Calendar</span>
                  </button>
                  <button
                    onClick={() => setViewMode('timeline')}
                    className="p-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1 bg-background text-foreground shadow-xs"
                    title="Timeline List View"
                  >
                    <List className="w-3.5 h-3.5" />
                    <span className="hidden md:inline">Timeline</span>
                  </button>
                </div>
              }
              className="border-b-0 bg-transparent px-3 sm:px-4 py-2"
            >
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2 p-3 bg-muted/20 border border-border/20 rounded-xl">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mr-1 select-none">
                    <CalendarClock className="w-3 h-3" />
                    Flow
                  </span>
                  <AppTabs
                    tabs={[
                      { id: 'all', label: 'All Items' },
                      { id: 'expense', label: 'Bills Only' },
                      { id: 'income', label: 'Income Only' },
                    ]}
                    activeTab={flowFilter}
                    onChange={(tab) => setFlowFilter(tab as any)}
                    variant="pills"
                    size="sm"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2 p-3 bg-muted/20 border border-border/20 rounded-xl">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mr-1 select-none">
                    <CalendarClock className="w-3 h-3" />
                    Horizon
                  </span>
                  <select
                    value={daysHorizon}
                    onChange={(e) => setDaysHorizon(Number(e.target.value))}
                    className="px-3 py-1.5 bg-background border border-input rounded-xl text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value={7}>Next 7 days</option>
                    <option value={14}>Next 14 days</option>
                    <option value={30}>Next 30 days</option>
                    <option value={60}>Next 60 days</option>
                    <option value={90}>Next 90 days</option>
                  </select>
                </div>
              </div>
            </CollapsibleFilterPanel>
          </div>

          {/* Timeline List Stream */}
          {bills.length === 0 ? (
            <div className="py-16 text-center rounded-2xl border border-dashed border-border/80 p-8 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
                <CalendarClock className="w-6 h-6" />
              </div>
              <h3 className="font-semibold text-base text-foreground">No upcoming bills in this window</h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                No recurring bills or income projected for the selected timeframe.
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
                          className={cn(
                            'p-3.5 sm:p-4 flex items-center justify-between gap-3 hover:bg-muted/20 transition-colors',
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
                              {formatCurrency(Number.isFinite(bill.amount) ? bill.amount : 0, 'USD', 'en-US', CENTS)}
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
    </div>
  );

  // Standardized Summary Side Panel
  const summaryContent = (
    <div className="bg-sidebar border border-sidebar-border rounded-2xl shadow-sm overflow-hidden text-sidebar-foreground">
      <CollapsibleCardHeader
        isCollapsed={collapsed}
        onToggle={setCollapsed}
        collapseDirection="horizontal"
        title={
          <div className="flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-primary shrink-0" />
            <span className="font-bold text-foreground">Cash Outflow Forecast</span>
          </div>
        }
        className="border-b border-sidebar-border/60 bg-sidebar"
      />

      {!collapsed && (
        <div className="p-4 sm:p-5 divide-y divide-sidebar-border/50">
          {/* Section 1: Due in Next 7 Days */}
          <div className="py-4 first:pt-0 last:pb-0 space-y-1">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
              Due in Next 7 Days
            </span>
            <div
              className={cn(
                'text-2xl sm:text-3xl font-extrabold font-mono text-foreground tracking-tight',
                privacyMode && 'blur-sm select-none'
              )}
            >
              {formatCurrency(stats.dueThisWeek)}
            </div>
          </div>

          {/* Section 2: Month Stats */}
          <div className="py-4 first:pt-0 last:pb-0 space-y-3">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
              Current Month Breakdown
            </span>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="p-3 rounded-xl bg-card border border-border/60 space-y-0.5">
                <span className="text-[11px] text-muted-foreground font-medium">Due This Month</span>
                <div
                  className={cn(
                    'text-base font-bold font-mono text-foreground',
                    privacyMode && 'blur-xs select-none'
                  )}
                >
                  {formatCurrency(stats.dueThisMonth)}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-card border border-border/60 space-y-0.5">
                <span className="text-[11px] text-muted-foreground font-medium">Paid This Month</span>
                <div className="text-base font-bold font-mono text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  {stats.paidThisMonth} bills
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Total in Horizon */}
          <div className="py-4 first:pt-0 last:pb-0 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Total in Horizon ({daysHorizon}d):</span>
              <span
                className={cn(
                  'font-bold font-mono text-foreground',
                  privacyMode && 'blur-xs select-none'
                )}
              >
                {formatCurrency(stats.totalUpcoming)}
              </span>
            </div>
          </div>

          {/* Section 4: Projections vs Cleared explanation */}
          <div className="py-4 first:pt-0 last:pb-0 space-y-2 text-xs text-muted-foreground">
            <div className="font-semibold text-foreground flex items-center gap-1.5">
              <HelpCircle className="w-3.5 h-3.5 text-primary" />
              Projections vs Cleared
            </div>
            <p className="leading-relaxed">
              Projections are computed from your historical cadence. When your bank syncs the actual charge, it automatically clears into &ldquo;Paid This Month&rdquo;.
            </p>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="w-full">
      <MobileViewSwitcher
        main={mainContent}
        summary={summaryContent}
        mainLabel="Calendar"
        summaryLabel="Overview"
        summaryCardId="upcomingBillsSummary"
      />
    </div>
  );
}

export default UpcomingBills;
