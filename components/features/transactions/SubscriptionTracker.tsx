'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, Repeat, TrendingDown, TrendingUp, Landmark, ArrowUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AppTabs } from '@/components/ui/app-tabs';
import { formatFrequencyLabel } from './RecurringCard';
import type { RecurringItem } from './RecurringCard';
import { formatCurrency } from '@/lib/utils/format';
import { usePrivacyMode } from '@/components/privacy-mode-provider';
import { cn } from '@/lib/utils';

interface SubscriptionTrackerProps {
  items: RecurringItem[];
  loading?: boolean;
}

type SortKey = 'amount' | 'name' | 'nextDate';

interface Totals {
  monthly: number;
  annual: number;
  count: number;
}

const BLUR_CLASS = 'blur-xs select-none';

export function SubscriptionTracker({ items, loading = false }: SubscriptionTrackerProps) {
  const { privacyMode } = usePrivacyMode();
  const [flowTab, setFlowTab] = useState<'spend' | 'income'>('spend');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('amount');

  const allExpenseItems = useMemo(
    () => items.filter((i) => !i.isDismissed && i.flowType === 'expense'),
    [items]
  );
  const allIncomeItems = useMemo(
    () => items.filter((i) => !i.isDismissed && i.flowType === 'income'),
    [items]
  );

  const totals = useMemo<Totals>(() => {
    const list = flowTab === 'spend' ? allExpenseItems : allIncomeItems;
    let monthly = 0;
    let annual = 0;
    for (const i of list) {
      if (i.isPaused) continue;
      monthly += i.monthlyAmount;
      annual += i.annualAmount;
    }
    return { monthly, annual, count: list.length };
  }, [flowTab, allExpenseItems, allIncomeItems]);

  const displayed = useMemo(() => {
    let list = flowTab === 'spend' ? allExpenseItems : allIncomeItems;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (i) =>
          i.displayName.toLowerCase().includes(q) ||
          i.merchantName.toLowerCase().includes(q) ||
          (i.categoryName && i.categoryName.toLowerCase().includes(q)) ||
          (i.accountName && i.accountName.toLowerCase().includes(q))
      );
    }
    const sorted = [...list];
    if (sortBy === 'name') {
      sorted.sort((a, b) => a.displayName.localeCompare(b.displayName));
    } else if (sortBy === 'nextDate') {
      sorted.sort((a, b) => {
        if (!a.nextExpectedDate) return 1;
        if (!b.nextExpectedDate) return -1;
        return a.nextExpectedDate.localeCompare(b.nextExpectedDate);
      });
    } else {
      sorted.sort((a, b) => b.monthlyAmount - a.monthlyAmount);
    }
    return sorted;
  }, [allExpenseItems, allIncomeItems, flowTab, searchQuery, sortBy]);

  const topSubscriptions = useMemo<RecurringItem[]>(() => {
    return [...displayed]
      .filter((i) => !i.isPaused)
      .sort((a, b) => b.monthlyAmount - a.monthlyAmount)
      .slice(0, 5);
  }, [displayed]);

  const fmtMonth = useCallback((iso: string | null) => {
    if (!iso) return '—';
    const d = new Date(`${iso}T00:00:00`);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }, []);

  const isSpent = flowTab === 'spend';
  const accentText = isSpent ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400';

  return (
    <div className="space-y-5">
      {/* ── Totals Hero ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Monthly Total (primary) */}
        <div className="sm:col-span-2 bg-gradient-to-br from-primary/[0.08] to-transparent border border-border rounded-2xl p-4 sm:p-5">
          <div className="flex items-center justify-between mb-1">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {isSpent ? (
                <>
                  <TrendingDown className="w-3.5 h-3.5 text-rose-500" />
                  Total Monthly Spend
                </>
              ) : (
                <>
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                  Total Monthly Income
                </>
              )}
            </span>
            <span className="text-[10px] text-muted-foreground font-mono">
              {totals.count} active
            </span>
          </div>
          <div
            className={cn(
              'text-3xl sm:text-4xl font-extrabold font-mono tracking-tight',
              accentText,
              privacyMode && BLUR_CLASS
            )}
          >
            {isSpent ? '-' : '+'}
            {formatCurrency(totals.monthly)}
            <span className="text-sm font-normal text-muted-foreground ml-1">/mo</span>
          </div>
          <p className={cn('text-xs text-muted-foreground font-mono mt-1', privacyMode && BLUR_CLASS)}>
            ≈ {isSpent ? '-' : '+'}
            {formatCurrency(totals.annual)} / year
          </p>
        </div>

        {/* Annual Total */}
        <div className="bg-card border border-border rounded-2xl p-4 flex flex-col justify-center">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
            <Repeat className="w-3.5 h-3.5 text-primary" />
            Annual Total
          </span>
          <div
            className={cn(
              'text-xl sm:text-2xl font-bold font-mono tracking-tight',
              accentText,
              privacyMode && BLUR_CLASS
            )}
          >
            {isSpent ? '-' : '+'}
            {formatCurrency(totals.annual)}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            across {totals.count} recurring {isSpent ? 'bills' : 'streams'}
          </p>
        </div>
      </div>

      {/* ── Top Subscriptions (largest, at a glance) ── */}
      {topSubscriptions.length > 0 && (
        <div className="bg-muted hover:bg-muted/85 border border-border rounded-xl p-3">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-2">
            Largest {isSpent ? 'bills' : 'income'}
          </span>
          <div className="space-y-1.5">
            {topSubscriptions.map((item) => {
              const pct = totals.monthly > 0 ? (item.monthlyAmount / totals.monthly) * 100 : 0;
              return (
                <div key={item.id} className="flex items-center gap-2 text-xs">
                  <span className="w-32 sm:w-40 truncate font-medium text-foreground shrink-0">
                    {item.displayName}
                  </span>
                  <div className="flex-1 h-1.5 rounded-full bg-border/60 overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full',
                        isSpent ? 'bg-rose-500/70' : 'bg-emerald-500/70'
                      )}
                      style={{ width: `${Math.min(100, Math.max(2, pct))}%` }}
                    />
                  </div>
                  <span
                    className={cn(
                      'font-mono font-semibold shrink-0 w-24 sm:w-28 text-right',
                      privacyMode && BLUR_CLASS
                    )}
                  >
                    {formatCurrency(item.monthlyAmount)}
                    <span className="text-muted-foreground font-normal">/mo</span>
                  </span>
                  <span className="text-[10px] text-muted-foreground shrink-0 w-9 text-right">
                    {pct.toFixed(0)}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Controls: Flow Tabs + Search + Sort ── */}
      <div className="flex flex-wrap items-center gap-2">
        <AppTabs
          tabs={[
            { id: 'spend', label: `Expenses (${allExpenseItems.length})` },
            { id: 'income', label: `Income (${allIncomeItems.length})` },
          ]}
          activeTab={flowTab}
          onChange={(t) => setFlowTab(t as 'spend' | 'income')}
          variant="pills"
          size="sm"
        />
        <div className="relative flex-1 min-w-[160px] max-w-xs ml-auto">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search subscriptions..."
            className="h-8 w-full pl-8 pr-3 bg-background border border-border rounded-lg text-xs sm:text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <ArrowUpDown className="w-3.5 h-3.5 text-muted-foreground" />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortKey)}
            className="px-2.5 py-1.5 bg-background border border-input rounded-xl text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="amount">Highest Amount</option>
            <option value="nextDate">Next Due Date</option>
            <option value="name">Merchant Name</option>
          </select>
        </div>
      </div>

      {/* ── Per-Subscription List ── */}
      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          Loading subscriptions...
        </div>
      ) : displayed.length === 0 ? (
        <div className="py-12 text-center rounded-2xl border border-dashed border-border/80 p-8 space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
            <Repeat className="w-6 h-6" />
          </div>
          <h3 className="font-semibold text-base text-foreground">
            No {isSpent ? 'recurring expenses' : 'recurring income'} found
          </h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            {searchQuery
              ? 'Nothing matches your search.'
              : 'Add subscriptions manually or manage them in the Manage subscriptions view.'}
          </p>
          <Link
            href="/transactions?tab=recurring"
            className="inline-flex items-center gap-1.5"
          >
            <Button variant="outline" size="sm">
              <Repeat className="w-3.5 h-3.5 mr-1" />
              Manage subscriptions
            </Button>
          </Link>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-2xl divide-y divide-border/40 overflow-hidden shadow-xs">
          {/* List header (desktop) */}
          <div className="hidden md:grid grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,1fr)_110px_90px] gap-3 px-4 py-2 bg-muted/30 border-b border-border/50 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            <span>Subscription</span>
            <span>Account</span>
            <span>Frequency</span>
            <span>Next Due</span>
            <span className="text-right">Monthly</span>
          </div>
          {displayed.map((item) => {
            const nextOverdue = Boolean(item.isOverdue && item.nextExpectedDate);
            return (
              <div
                key={item.id}
                className={cn(
                  'grid grid-cols-1 md:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,1fr)_110px_90px] gap-1 md:gap-3 px-4 py-3 items-center transition-colors hover:bg-muted/25',
                  item.isPaused && 'opacity-60'
                )}
              >
                {/* Name */}
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: item.categoryColor || '#6366f1' }}
                  />
                  <span className="font-semibold text-sm text-foreground truncate">
                    {item.displayName}
                  </span>
                  {item.categoryName && (
                    <span className="hidden lg:inline text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
                      {item.categoryName}
                    </span>
                  )}
                  {item.isPaused && (
                    <span className="text-[9px] font-bold bg-muted text-muted-foreground border border-border/50 rounded px-1.5 py-0.5 uppercase tracking-wider shrink-0">
                      Paused
                    </span>
                  )}
                </div>

                {/* Account */}
                <div className="flex items-center gap-1.5 min-w-0 md:pl-2">
                  <Landmark className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="text-xs text-foreground/80 truncate">
                    {item.accountName || 'Any account'}
                  </span>
                </div>

                {/* Frequency */}
                <div className="text-xs text-muted-foreground md:pl-2">
                  {formatFrequencyLabel(item.frequency)}
                </div>

                {/* Next Due */}
                <div
                  className={cn(
                    'text-xs md:pl-2',
                    nextOverdue ? 'text-rose-600 dark:text-rose-400 font-semibold' : 'text-muted-foreground'
                  )}
                >
                  {nextOverdue ? 'Overdue' : ''}
                  <span className={nextOverdue ? '' : ''}>{fmtMonth(item.nextExpectedDate)}</span>
                </div>

                {/* Amount */}
                <div
                  className={cn(
                    'text-right font-mono font-semibold text-sm',
                    accentText,
                    privacyMode && BLUR_CLASS
                  )}
                >
                  {isSpent ? '-' : '+'}
                  {formatCurrency(item.monthlyAmount)}
                  <span className="text-[10px] font-normal text-muted-foreground"> /mo</span>
                  <div
                    className={cn(
                      'text-[10px] font-normal text-muted-foreground',
                      privacyMode && BLUR_CLASS
                    )}
                  >
                    {isSpent ? '-' : '+'}
                    {formatCurrency(item.annualAmount)} /yr
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
