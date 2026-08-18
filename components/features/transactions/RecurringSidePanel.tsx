'use client';

import {
  TrendingDown,
  TrendingUp,
  ShieldCheck,
  Sparkles,
  Pause,
  Wallet,
  Receipt,
  Scale,
  CalendarCheck,
} from 'lucide-react';
import { CollapsibleCardHeader } from '@/components/ui/collapsible-card-header';
import { useCardCollapsed } from '@/lib/hooks/use-card-collapsed';
import { formatCurrency } from '@/lib/utils/format';
import { usePrivacyMode } from '@/components/privacy-mode-provider';
import { cn } from '@/lib/utils';

interface SummaryData {
  monthlyExpenses: number;
  monthlyIncome: number;
  annualExpenses: number;
  annualIncome: number;
  activeCount: number;
  expenseCount?: number;
  incomeCount?: number;
  pausedCount?: number;
  needsReviewCount: number;
  totalCount: number;
}

interface RecurringSidePanelProps {
  summary?: SummaryData;
}

export default function RecurringSidePanel({ summary }: RecurringSidePanelProps) {
  const { privacyMode } = usePrivacyMode();
  const [collapsed, setCollapsed] = useCardCollapsed('recurringSummary', false);

  const monthlyExp = summary?.monthlyExpenses ?? 0;
  const monthlyInc = summary?.monthlyIncome ?? 0;
  const annualExp = summary?.annualExpenses ?? 0;
  const annualInc = summary?.annualIncome ?? 0;
  const activeCount = summary?.activeCount ?? 0;
  const expenseCount = summary?.expenseCount ?? 0;
  const incomeCount = summary?.incomeCount ?? 0;
  const pausedCount = summary?.pausedCount ?? 0;
  const needsReviewCount = summary?.needsReviewCount ?? 0;

  const netMonthly = monthlyInc - monthlyExp;
  const netAnnual = annualInc - annualExp;
  const dailyBurn = monthlyExp > 0 ? monthlyExp / 30 : 0;
  const coverageRatio = monthlyExp > 0 ? (monthlyInc / monthlyExp) * 100 : monthlyInc > 0 ? 100 : 0;

  return (
    <div className="bg-sidebar border border-sidebar-border rounded-2xl shadow-sm overflow-hidden text-sidebar-foreground">
      <CollapsibleCardHeader
        isCollapsed={collapsed}
        onToggle={setCollapsed}
        collapseDirection="horizontal"
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

          {/* ── Section 4: Subscription Status Breakdown ── */}
          <div className="py-4 first:pt-0 last:pb-0 space-y-2.5">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
              Tracking Status
            </span>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-xl bg-card border border-border/50">
                <div className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-emerald-500" />
                  Active
                </div>
                <div className="text-sm font-bold font-mono text-foreground mt-0.5">
                  {activeCount} items
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-card border border-border/50">
                <div className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-amber-500" />
                  Review
                </div>
                <div className="text-sm font-bold font-mono text-foreground mt-0.5">
                  {needsReviewCount} items
                </div>
              </div>
            </div>

            {pausedCount > 0 && (
              <div className="p-2 rounded-xl bg-muted/40 border border-border/40 flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Pause className="w-3 h-3" />
                  Paused subscriptions
                </span>
                <span className="font-mono font-bold text-foreground">{pausedCount}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
