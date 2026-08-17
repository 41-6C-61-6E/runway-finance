'use client';

import { useState } from 'react';
import {
  Repeat,
  Sparkles,
  Plus,
  ArrowDownRight,
  ArrowUpRight,
  ShieldCheck,
  HelpCircle,
  TrendingDown,
  Calendar,
  Layers,
  Pause,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
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
  needsReviewCount: number;
  totalCount: number;
}

interface RecurringSidePanelProps {
  summary?: SummaryData;
  onScan: () => Promise<void>;
  onAddManual: () => void;
  scanning?: boolean;
}

export default function RecurringSidePanel({
  summary,
  onScan,
  onAddManual,
  scanning = false,
}: RecurringSidePanelProps) {
  const { privacyMode } = usePrivacyMode();
  const [collapsed, setCollapsed] = useCardCollapsed('recurringSummary', false);

  const monthlyExp = summary?.monthlyExpenses ?? 0;
  const monthlyInc = summary?.monthlyIncome ?? 0;
  const annualExp = summary?.annualExpenses ?? 0;
  const annualInc = summary?.annualIncome ?? 0;
  const activeCount = summary?.activeCount ?? 0;
  const needsReviewCount = summary?.needsReviewCount ?? 0;
  const netMonthly = monthlyInc - monthlyExp;

  return (
    <div className="bg-sidebar border border-sidebar-border rounded-2xl shadow-sm overflow-hidden text-sidebar-foreground">
      <CollapsibleCardHeader
        isCollapsed={collapsed}
        onToggle={setCollapsed}
        collapseDirection="horizontal"
        title={
          <div className="flex items-center gap-2">
            <Repeat className="w-4 h-4 text-primary shrink-0" />
            <span className="font-bold text-foreground">Recurring Overview</span>
          </div>
        }
        className="border-b border-sidebar-border/60 bg-sidebar"
      />

      {!collapsed && (
        <div className="p-4 sm:p-5 divide-y divide-sidebar-border/50">
          {/* Section 1: Recurring Status & Pacing */}
          <div className="py-4 first:pt-0 last:pb-0 space-y-3">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Detection Status
                </span>
                <div className="flex items-center gap-1.5 pt-0.5">
                  <span
                    className={cn(
                      'px-2.5 py-0.5 rounded-full text-[11px] font-bold border flex items-center gap-1.5 font-mono select-none',
                      needsReviewCount > 0
                        ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                        : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                    )}
                  >
                    {needsReviewCount > 0 ? (
                      <>
                        <Sparkles className="w-3 h-3 text-amber-500" />
                        <span>{needsReviewCount} Needs Review</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-3 h-3 text-emerald-500" />
                        <span>All Confirmed</span>
                      </>
                    )}
                  </span>
                </div>
              </div>

              <div className="text-right">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Active Items
                </span>
                <p className="text-lg font-bold font-mono text-foreground">
                  {activeCount}
                </p>
              </div>
            </div>
          </div>

          {/* Section 2: Commitments & Run Rate */}
          <div className="py-4 first:pt-0 last:pb-0 space-y-4">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                Monthly Recurring Outflow
              </span>
              <div
                className={cn(
                  'text-2xl sm:text-3xl font-extrabold font-mono text-foreground tracking-tight',
                  privacyMode && 'blur-sm select-none'
                )}
              >
                {formatCurrency(monthlyExp)}
                <span className="text-xs font-normal text-muted-foreground ml-1">/mo</span>
              </div>
              <p
                className={cn(
                  'text-xs text-muted-foreground font-mono pt-0.5',
                  privacyMode && 'blur-xs select-none'
                )}
              >
                ≈ {formatCurrency(annualExp)} / year
              </p>
            </div>

            {/* Income & Net Balance Breakdown */}
            {monthlyInc > 0 && (
              <div className="p-3 rounded-xl bg-card border border-border/60 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Recurring Income:</span>
                  <span
                    className={cn(
                      'font-bold font-mono text-emerald-600 dark:text-emerald-400',
                      privacyMode && 'blur-xs select-none'
                    )}
                  >
                    +{formatCurrency(monthlyInc)}/mo
                  </span>
                </div>
                <div className="h-px bg-border/40" />
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground font-medium">Net Monthly Flow:</span>
                  <span
                    className={cn(
                      'font-bold font-mono',
                      netMonthly >= 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-rose-600 dark:text-rose-400',
                      privacyMode && 'blur-xs select-none'
                    )}
                  >
                    {netMonthly >= 0 ? '+' : ''}{formatCurrency(netMonthly)}/mo
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Section 3: Actions */}
          <div className="py-4 first:pt-0 last:pb-0 space-y-2.5">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
              Manage Subscriptions
            </span>
            <Button
              onClick={onAddManual}
              variant="outline"
              className="w-full justify-center text-xs h-9 font-medium"
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Add Recurring Item
            </Button>

            <Button
              onClick={onScan}
              disabled={scanning}
              className="w-full justify-center text-xs h-9 font-semibold"
            >
              {scanning ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Scanning History...
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                  Scan Transactions
                </>
              )}
            </Button>
          </div>

          {/* Section 4: Intelligent Insights */}
          <div className="py-4 first:pt-0 last:pb-0 space-y-2 text-xs text-muted-foreground">
            <div className="font-semibold text-foreground flex items-center gap-1.5">
              <HelpCircle className="w-3.5 h-3.5 text-primary" />
              Smart Recurrence Engine
            </div>
            <p className="leading-relaxed">
              We analyze transaction periodicity, variance coefficients, and normalized payee names to detect commitments and price adjustments automatically.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
