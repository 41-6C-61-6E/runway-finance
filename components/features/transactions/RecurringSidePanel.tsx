'use client';

import { useMemo } from 'react';
import {
  TrendingDown,
  TrendingUp,
  Wallet,
  Receipt,
  Scale,
  CalendarCheck,
  CreditCard,
} from 'lucide-react';
import { CollapsibleCardHeader } from '@/components/ui/collapsible-card-header';
import { useCardCollapsed } from '@/lib/hooks/use-card-collapsed';
import { formatCurrency } from '@/lib/utils/format';
import { usePrivacyMode } from '@/components/privacy-mode-provider';
import { cn } from '@/lib/utils';
import type { RecurringItem } from './RecurringCard';

interface SummaryData {
  monthlyExpenses: number;
  monthlyIncome: number;
  annualExpenses: number;
  annualIncome: number;
  monthlySubscriptions?: number;
  annualSubscriptions?: number;
  subscriptionCount?: number;
  monthlyFixed?: number;
  annualFixed?: number;
  fixedCount?: number;
  activeCount: number;
  expenseCount?: number;
  incomeCount?: number;
  pausedCount?: number;
  needsReviewCount: number;
  totalCount: number;
}

interface RecurringSidePanelProps {
  summary?: SummaryData;
  items?: RecurringItem[];
}

export default function RecurringSidePanel({ summary, items }: RecurringSidePanelProps) {
  const { privacyMode } = usePrivacyMode();
  const [collapsed, setCollapsed] = useCardCollapsed('recurringSummary', false);

  const monthlyExp = summary?.monthlyExpenses ?? 0;
  const monthlyInc = summary?.monthlyIncome ?? 0;
  const annualExp = summary?.annualExpenses ?? 0;
  const annualInc = summary?.annualIncome ?? 0;
  const activeCount = summary?.activeCount ?? 0;
  const expenseCount = summary?.expenseCount ?? 0;
  const incomeCount = summary?.incomeCount ?? 0;

  const netMonthly = monthlyInc - monthlyExp;
  const netAnnual = annualInc - annualExp;
  const dailyBurn = monthlyExp > 0 ? monthlyExp / 30 : 0;
  const coverageRatio = monthlyExp > 0 ? (monthlyInc / monthlyExp) * 100 : monthlyInc > 0 ? 100 : 0;

  // Subscription (discretionary) and fixed (non-discretionary) breakdown
  const activeExpenseItems = useMemo(
    () => (items || []).filter((i) => !i.isDismissed && !i.isPaused && i.flowType === 'expense'),
    [items]
  );

  const subscriptionItems = useMemo(
    () => activeExpenseItems.filter((i) => i.isDiscretionary !== false),
    [activeExpenseItems]
  );

  const fixedItems = useMemo(
    () => activeExpenseItems.filter((i) => i.isDiscretionary === false),
    [activeExpenseItems]
  );

  const monthlySub = useMemo(() => {
    if (items) {
      return subscriptionItems.reduce((acc, i) => acc + Math.abs(i.monthlyAmount), 0);
    }
    return Math.abs(summary?.monthlySubscriptions ?? 0);
  }, [items, subscriptionItems, summary]);

  const annualSub = useMemo(() => {
    if (items) {
      return subscriptionItems.reduce((acc, i) => acc + Math.abs(i.annualAmount), 0);
    }
    return Math.abs(summary?.annualSubscriptions ?? 0);
  }, [items, subscriptionItems, summary]);

  const monthlyFixed = useMemo(() => {
    if (items) {
      return fixedItems.reduce((acc, i) => acc + Math.abs(i.monthlyAmount), 0);
    }
    return Math.abs(summary?.monthlyFixed ?? 0);
  }, [items, fixedItems, summary]);

  const annualFixed = useMemo(() => {
    if (items) {
      return fixedItems.reduce((acc, i) => acc + Math.abs(i.annualAmount), 0);
    }
    return Math.abs(summary?.annualFixed ?? 0);
  }, [items, fixedItems, summary]);

  const subCount = items ? subscriptionItems.length : (summary?.subscriptionCount ?? 0);
  const fixedCount = items ? fixedItems.length : (summary?.fixedCount ?? 0);
  const subShare = monthlyExp > 0 ? (monthlySub / monthlyExp) * 100 : 0;

  const topSubscriptions = useMemo(() => {
    return [...subscriptionItems]
      .sort((a, b) => b.monthlyAmount - a.monthlyAmount)
      .slice(0, 4);
  }, [subscriptionItems]);

  return (
    <div className="bg-sidebar border border-sidebar-border rounded-2xl shadow-sm overflow-hidden text-sidebar-foreground">
      <CollapsibleCardHeader
        isCollapsed={collapsed}
        onToggle={setCollapsed}
        collapseDirection="horizontal"
        showMobileToggle={false}
        title={
          <div className="flex items-center gap-2">
            <span className="font-bold text-foreground">Overview</span>
          </div>
        }
        className="border-b border-sidebar-border/60 bg-sidebar"
      />

      {!collapsed && (
        <div className="p-4 sm:p-5 divide-y divide-sidebar-border/50">
          {/* ── Section 1: Net Monthly Cash Baseline ── */}
          <div className="py-4 first:pt-0 last:pb-0 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Scale className="w-3.5 h-3.5 text-primary" />
                Net Monthly Baseline
              </span>
              <span className="text-[10px] text-muted-foreground font-mono">
                {activeCount} active
              </span>
            </div>

            <div
              className={cn(
                'text-2xl sm:text-3xl font-extrabold font-mono tracking-tight',
                netMonthly >= 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-rose-600 dark:text-rose-400',
                privacyMode && 'blur-sm select-none'
              )}
            >
              {netMonthly >= 0 ? '+' : ''}
              {formatCurrency(netMonthly)}
              <span className="text-xs font-normal text-muted-foreground ml-1">/mo</span>
            </div>

            <p
              className={cn(
                'text-xs text-muted-foreground font-mono',
                privacyMode && 'blur-xs select-none'
              )}
            >
              ≈ {netAnnual >= 0 ? '+' : ''}{formatCurrency(netAnnual)} / year net
            </p>
          </div>

          {/* ── Section 2: Recurring Inflows (Income) Characterization ── */}
          <div className="py-4 first:pt-0 last:pb-0 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                Recurring Income
              </span>
              <span className="text-[11px] font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                {incomeCount} {incomeCount === 1 ? 'stream' : 'streams'}
              </span>
            </div>

            <div className="space-y-1">
              <div
                className={cn(
                  'text-xl sm:text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400 tracking-tight',
                  privacyMode && 'blur-xs select-none'
                )}
              >
                +{formatCurrency(monthlyInc)}
                <span className="text-xs font-normal text-muted-foreground ml-1">/mo</span>
              </div>
              <div
                className={cn(
                  'text-xs text-muted-foreground font-mono',
                  privacyMode && 'blur-xs select-none'
                )}
              >
                +{formatCurrency(annualInc)} / year
              </div>
            </div>

            {monthlyExp > 0 && monthlyInc > 0 && (
              <div className="p-2.5 rounded-xl bg-card border border-border/50 text-xs space-y-1">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Expense Coverage</span>
                  <span className="font-mono font-bold text-foreground">
                    {Math.round(coverageRatio)}%
                  </span>
                </div>
                <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-emerald-500 h-full rounded-full transition-all"
                    style={{ width: `${Math.min(100, coverageRatio)}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* ── Section 3: Recurring Outflows (Expenses) Characterization ── */}
          <div className="py-4 first:pt-0 last:pb-0 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <TrendingDown className="w-3.5 h-3.5 text-rose-500" />
                Recurring Expenses
              </span>
              <span className="text-[11px] font-mono font-semibold text-muted-foreground">
                {expenseCount} {expenseCount === 1 ? 'bill' : 'bills'}
              </span>
            </div>

            <div className="space-y-1">
              <div
                className={cn(
                  'text-xl sm:text-2xl font-bold font-mono text-foreground tracking-tight',
                  privacyMode && 'blur-xs select-none'
                )}
              >
                -{formatCurrency(monthlyExp)}
                <span className="text-xs font-normal text-muted-foreground ml-1">/mo</span>
              </div>
              <div
                className={cn(
                  'text-xs text-muted-foreground font-mono',
                  privacyMode && 'blur-xs select-none'
                )}
              >
                -{formatCurrency(annualExp)} / year
              </div>
            </div>

            {monthlyExp > 0 && (
              <div className="p-2.5 rounded-xl bg-card border border-border/50 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Daily Fixed Run Rate</span>
                <span
                  className={cn(
                    'font-mono font-bold text-foreground',
                    privacyMode && 'blur-xs select-none'
                  )}
                >
                  ~{formatCurrency(dailyBurn)}/day
                </span>
              </div>
            )}
          </div>

          {/* ── Section 4: Subscriptions Breakdown & High-Impact Metrics ── */}
          <div className="py-4 first:pt-0 last:pb-0 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5 text-primary" />
                Subscriptions (Discretionary)
              </span>
              <span className="text-[11px] font-mono font-semibold text-primary">
                {subCount} {subCount === 1 ? 'sub' : 'subs'}
              </span>
            </div>

            <div className="space-y-1">
              <div
                className={cn(
                  'text-xl sm:text-2xl font-bold font-mono text-primary tracking-tight',
                  privacyMode && 'blur-xs select-none'
                )}
              >
                -{formatCurrency(monthlySub)}
                <span className="text-xs font-normal text-muted-foreground ml-1">/mo</span>
              </div>
              <div
                className={cn(
                  'text-xs text-muted-foreground font-mono',
                  privacyMode && 'blur-xs select-none'
                )}
              >
                ≈ -{formatCurrency(annualSub)} / year
              </div>
            </div>

            {/* Split Breakdown Bar: Subscriptions vs Fixed Bills */}
            {monthlyExp > 0 && (
              <div className="p-2.5 rounded-xl bg-card border border-border/50 text-xs space-y-1.5">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Discretionary Share</span>
                  <span className="font-mono font-bold text-foreground">
                    {Math.round(subShare)}%
                  </span>
                </div>
                <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden flex">
                  <div
                    className="bg-primary h-full transition-all"
                    style={{ width: `${Math.min(100, Math.max(0, subShare))}%` }}
                    title={`Subscriptions: ${Math.round(subShare)}%`}
                  />
                  <div
                    className="bg-muted-foreground/30 h-full transition-all"
                    style={{ width: `${Math.min(100, Math.max(0, 100 - subShare))}%` }}
                    title={`Fixed Bills: ${Math.round(100 - subShare)}%`}
                  />
                </div>
                <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-0.5">
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                    Subs: {formatCurrency(monthlySub)}/mo
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />
                    Fixed: {formatCurrency(monthlyFixed)}/mo
                  </span>
                </div>
              </div>
            )}

            {/* High-Impact Subscriptions list */}
            {topSubscriptions.length > 0 && (
              <div className="space-y-2 pt-1">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">
                  High-Impact Subscriptions
                </span>
                <div className="space-y-1.5">
                  {topSubscriptions.map((item) => {
                    const pctOfSubs = monthlySub > 0 ? (item.monthlyAmount / monthlySub) * 100 : 0;
                    return (
                      <div
                        key={item.id}
                        className="p-2 rounded-xl bg-muted/40 hover:bg-muted/60 border border-border/40 transition-colors text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: item.categoryColor || '#6366f1' }}
                            />
                            <span className="font-medium text-foreground truncate">
                              {item.displayName}
                            </span>
                          </div>
                          <span
                            className={cn(
                              'font-mono font-bold text-foreground shrink-0 text-right',
                              privacyMode && 'blur-xs select-none'
                            )}
                          >
                            -{formatCurrency(item.monthlyAmount)}
                            <span className="text-[10px] text-muted-foreground font-normal">/mo</span>
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1 bg-border/50 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary/70 rounded-full"
                              style={{ width: `${Math.min(100, Math.max(3, pctOfSubs))}%` }}
                            />
                          </div>
                          <span
                            className={cn(
                              'text-[10px] text-muted-foreground font-mono shrink-0',
                              privacyMode && 'blur-xs select-none'
                            )}
                          >
                            {Math.round(pctOfSubs)}% · {formatCurrency(item.annualAmount)}/yr
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
