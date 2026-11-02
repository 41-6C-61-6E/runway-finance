'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { useTheme } from 'next-themes';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import {
  Rocket,
  Plus,
  Calendar,
  TrendingUp,
  DollarSign,
  ShieldAlert,
  Pencil,
  Trash2,
  Calculator,
  CheckCircle2,
  Clock,
  Layers,
  Sparkles,
  Upload,
  X,
  Building2,
} from 'lucide-react';
import {
  formatBalance,
  formatAmount,
  formatCompactCurrency,
  formatPlainPercent,
  formatDate,
} from '@/lib/utils/format';
import {
  buildPortfolioVestingTimeline,
  computeGrantMetrics,
  addMonthsDateStr,
  type EquityGrantType,
  type EquityValuationMode,
  type VestingFrequency,
  type CustomVestingTranche,
} from '@/lib/utils/vesting';
import type { EquityGrantWithMetrics } from '@/lib/services/equity-grants';
import { invalidateAfterAccountChange } from '@/lib/query-invalidation';
import { ActionButton, AddButton } from '@/components/ui/action-button';
import {
  GrantLogoBadge,
  GrantEditSheet,
  formatShareCount,
  getDaysUntil,
} from './equity';
import { AppTabs } from '@/components/ui/app-tabs';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ChartTooltip, TooltipHeader, TooltipRow } from '@/components/charts/chart-tooltip';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

interface EquityGrantsApiResponse {
  grants: EquityGrantWithMetrics[];
  summary: {
    totalVestedValue: number;
    totalVestedValueFmv: number;
    totalVestedValuePreferred: number;
    totalUnvestedValue: number;
    totalPotentialValue: number;
    totalSharesGranted: number;
    totalVestedShares: number;
    totalUnvestedShares: number;
    totalExercisedShares: number;
    totalCashToExerciseVested: number;
    totalIsoAmtBargainElement: number;
    totalEstimatedTaxOnExercise: number;
    nextVestEvent: {
      date: string;
      shares: number;
      grantName: string;
      companyName: string;
    } | null;
  };
}

const GRANT_TYPE_LABELS: Record<EquityGrantType, { short: string; full: string; badgeClass: string }> = {
  iso: {
    short: 'ISO',
    full: 'Incentive Stock Options (ISO)',
    badgeClass: 'bg-chart-1/15 text-chart-1 border-chart-1/30',
  },
  nso: {
    short: 'NSO',
    full: 'Non-Qualified Stock Options (NSO)',
    badgeClass: 'bg-chart-2/15 text-chart-2 border-chart-2/30',
  },
  rsu: {
    short: 'RSU',
    full: 'Restricted Stock Units (RSU)',
    badgeClass: 'bg-chart-3/15 text-chart-3 border-chart-3/30',
  },
  common: {
    short: 'Common / Early Ex.',
    full: 'Direct / Early-Exercised Shares',
    badgeClass: 'bg-chart-4/15 text-chart-4 border-chart-4/30',
  },
};

export function EquityOptionsPanel() {
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery<EquityGrantsApiResponse>({
    queryKey: ['equity-grants'],
    queryFn: async () => {
      const res = await fetch('/api/investments/equity-grants', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load equity grants');
      return res.json();
    },
  });

  const grants = data?.grants ?? [];
  const summary = data?.summary;

  // Chart controls
  const [chartMetric, setChartMetric] = useState<'value' | 'shares'>('value');

  // Drawer state for Create / Edit
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingGrant, setEditingGrant] = useState<EquityGrantWithMetrics | null>(null);
  const [deletingGrant, setDeletingGrant] = useState<EquityGrantWithMetrics | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const todayStr = new Date().toISOString().split('T')[0];

  const openCreateDrawer = () => {
    setEditingGrant(null);
    setSheetOpen(true);
  };

  const openEditDrawer = (g: EquityGrantWithMetrics) => {
    setEditingGrant(g);
    setSheetOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!deletingGrant) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/investments/equity-grants/${deletingGrant.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to delete grant');
      setDeletingGrant(null);
      invalidateAfterAccountChange(queryClient);
    } catch {
      // keep dialog open or close
      setDeletingGrant(null);
    } finally {
      setDeleting(false);
    }
  };

  // Timeline series across all grants
  const timelineData = useMemo(() => {
    if (grants.length === 0) return [];
    return buildPortfolioVestingTimeline(grants, todayStr);
  }, [grants, todayStr]);

  // Exercise & Tax Breakdown Calculations (at current active valuation)
  const baseSharePrice = useMemo(() => {
    if (grants.length === 0) return 0;
    return grants[0].metrics.effectiveSharePrice;
  }, [grants]);

  const exerciseBreakdown = useMemo(() => {
    if (grants.length === 0) {
      return {
        vestedGrossValue: 0,
        totalGrossValue: 0,
        cashToExerciseAll: 0,
        cashToExerciseVested: 0,
        exercisedCostBasis: 0,
        isoAmtBargainElement: 0,
        estimatedTaxOnVestedExercise: 0,
        estimatedExitTax: 0,
        netTotalPayout: 0,
      };
    }

    let vestedIntrinsic = 0;
    let totalPotential = 0;
    let cashToExerciseVested = 0;
    let cashToExerciseAll = 0;
    let exercisedCostBasis = 0;
    let isoAmtBargainElement = 0;
    let estimatedTaxOnVestedExercise = 0;
    let estimatedExitTax = 0;

    for (const g of grants) {
      const m = computeGrantMetrics(g, todayStr);
      vestedIntrinsic += m.vestedIntrinsicValue;
      totalPotential += m.totalPotentialValue;
      cashToExerciseVested += m.cashToExerciseVested;
      cashToExerciseAll += m.cashToExerciseAll;
      exercisedCostBasis += m.exercisedCostBasis;
      isoAmtBargainElement += m.isoAmtBargainElement;
      estimatedTaxOnVestedExercise += m.estimatedTaxOnVestedExercise;

      const taxRate = g.grantType === 'nso' || g.grantType === 'rsu' ? 0.32 : 0.238;
      estimatedExitTax += m.totalPotentialValue * taxRate;
    }

    return {
      vestedGrossValue: vestedIntrinsic,
      totalGrossValue: totalPotential,
      cashToExerciseVested,
      cashToExerciseAll,
      exercisedCostBasis,
      isoAmtBargainElement,
      estimatedTaxOnVestedExercise,
      estimatedExitTax: Math.round(estimatedExitTax * 100) / 100,
      netTotalPayout: Math.max(0, totalPotential - estimatedExitTax),
    };
  }, [grants, todayStr]);

  if (isLoading) {
    return <LoadingSpinner category="default" className="min-h-[320px]" />;
  }

  if (error) {
    return (
      <div className="p-6 border border-destructive/20 bg-destructive/10 rounded-xl text-center space-y-2">
        <p className="text-xs font-semibold text-destructive">Failed to load equity grants</p>
      </div>
    );
  }

  const totalVestedPct =
    summary && summary.totalSharesGranted > 0
      ? (summary.totalVestedShares / summary.totalSharesGranted) * 100
      : 0;

  return (
    <div className="space-y-5 sm:space-y-6">
      {grants.length === 0 ? (
        /* Empty / Onboarding State for Private Equity & Stock Options */
        <div className="bg-card border border-border rounded-2xl p-6 sm:p-10 text-center max-w-2xl mx-auto space-y-5 shadow-xs">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
            <Rocket className="w-7 h-7" />
          </div>
          <div className="space-y-2">
            <h3 className="text-base sm:text-lg font-bold text-foreground">
              Track Your Company Stock Options & Private Equity
            </h3>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed max-w-lg mx-auto">
              Add your option grants (ISOs, NSOs, RSUs, or early-exercised shares) to automatically track your vesting schedule, cliff dates, 409A vs. preferred valuation, exercise costs, and exit scenarios.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-left border-y border-border/60 py-4">
            <div className="space-y-1 p-1">
              <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-chart-1 shrink-0" />
                <span>Automated Vesting</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Daily cliff & monthly/quarterly tranche calculations with historical net worth snapshots.
              </p>
            </div>
            <div className="space-y-1 p-1">
              <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-chart-2 shrink-0" />
                <span>409A & Preferred</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Track conservative 409A FMV alongside preferred round prices and custom exit multipliers.
              </p>
            </div>
            <div className="space-y-1 p-1">
              <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Calculator className="w-3.5 h-3.5 text-chart-3 shrink-0" />
                <span>Exercise & AMT Math</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                See exact cash required to exercise vested options and estimated ISO AMT bargain element.
              </p>
            </div>
          </div>
          <div>
            <ActionButton variant="primary" size="lg" icon={Plus} onClick={openCreateDrawer}>
              Add Option Grant
            </ActionButton>
          </div>
        </div>
      ) : (
        <>
          {/* ── Top Summary Scorecard ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
            {/* Card 1: Vested Intrinsic Value */}
            <div className="bg-card border border-border rounded-xl p-4 shadow-xs space-y-1.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                <span>Vested Intrinsic Value</span>
                <TrendingUp className="w-4 h-4 text-chart-1 shrink-0" />
              </div>
              <div className="text-2xl font-extrabold font-mono text-foreground blur-number">
                {formatBalance(summary?.totalVestedValue ?? 0)}
              </div>
              <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-border/40">
                <span>409A: {formatBalance(summary?.totalVestedValueFmv ?? 0)}</span>
                {summary && summary.totalVestedValuePreferred !== summary.totalVestedValueFmv && (
                  <span className="text-chart-2 font-medium">
                    Pref: {formatBalance(summary.totalVestedValuePreferred)}
                  </span>
                )}
              </div>
            </div>

            {/* Card 2: Unvested & Total Potential */}
            <div className="bg-card border border-border rounded-xl p-4 shadow-xs space-y-1.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                <span>Unvested (&ldquo;On the Table&rdquo;)</span>
                <Sparkles className="w-4 h-4 text-chart-2 shrink-0" />
              </div>
              <div className="text-2xl font-extrabold font-mono text-foreground blur-number">
                {formatBalance(summary?.totalUnvestedValue ?? 0)}
              </div>
              <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-border/40">
                <span>Total Potential Value:</span>
                <span className="font-mono font-semibold text-foreground blur-number">
                  {formatBalance(summary?.totalPotentialValue ?? 0)}
                </span>
              </div>
            </div>

            {/* Card 3: Vesting Progress & Next Tranche */}
            <div className="bg-card border border-border rounded-xl p-4 shadow-xs space-y-1.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                <span>Vested Shares ({formatPlainPercent(totalVestedPct)})</span>
                <Calendar className="w-4 h-4 text-chart-3 shrink-0" />
              </div>
              <div className="text-2xl font-extrabold font-mono text-foreground blur-number">
                {formatShareCount(summary?.totalVestedShares ?? 0)}{' '}
                <span className="text-xs font-normal text-muted-foreground">
                  / {formatShareCount(summary?.totalSharesGranted ?? 0)}
                </span>
              </div>
              <div className="w-full bg-muted/40 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-chart-1 h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, totalVestedPct)}%` }}
                />
              </div>
              <div className="text-[11px] text-muted-foreground truncate pt-0.5">
                {summary?.nextVestEvent ? (
                  <span>
                    Next:{' '}
                    <strong className="text-foreground font-mono">
                      +{formatShareCount(summary.nextVestEvent.shares)}
                    </strong>{' '}
                    on {formatDate(summary.nextVestEvent.date)} (
                    {getDaysUntil(summary.nextVestEvent.date)}d)
                  </span>
                ) : (
                  <span className="text-chart-1 font-medium">All active grants fully vested</span>
                )}
              </div>
            </div>

            {/* Card 4: Exercise Cost & AMT Exposure */}
            <div className="bg-card border border-border rounded-xl p-4 shadow-xs space-y-1.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                <span>Cost to Exercise Vested</span>
                <DollarSign className="w-4 h-4 text-chart-4 shrink-0" />
              </div>
              <div className="text-2xl font-extrabold font-mono text-foreground blur-number">
                {formatBalance(summary?.totalCashToExerciseVested ?? 0)}
              </div>
              <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-border/40">
                <span>ISO AMT Spread:</span>
                <span className="font-mono font-semibold text-foreground blur-number">
                  {formatBalance(summary?.totalIsoAmtBargainElement ?? 0)}
                </span>
              </div>
            </div>
          </div>

          {/* ── Vesting Schedule Chart & Scenario Calculator ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 sm:gap-6 items-stretch">
            {/* Vesting Schedule Timeline (2 columns on desktop) */}
            <div className="lg:col-span-2 bg-card border border-border rounded-xl p-4 sm:p-5 shadow-xs flex flex-col">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4 border-b border-border/60 pb-3">
                <div>
                  <h3 className="text-sm sm:text-base font-semibold text-foreground flex items-center gap-2">
                    <Layers className="w-4 h-4 text-primary" />
                    <span>Vesting Schedule & Value Trajectory</span>
                  </h3>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Historical and projected cumulative vesting across all option grants
                  </p>
                </div>
                <AppTabs
                  tabs={[
                    { id: 'value', label: 'Intrinsic Value ($)' },
                    { id: 'shares', label: 'Shares (#)' },
                  ]}
                  activeTab={chartMetric}
                  onChange={(id) => setChartMetric(id as 'value' | 'shares')}
                  variant="pills"
                  size="sm"
                />
              </div>

              <div className="flex-1 min-h-[260px] w-full">
                <ResponsiveContainer
                  width="100%"
                  height={260}
                  minWidth={0}
                  minHeight={0}
                  initialDimension={{ width: 400, height: 260 }}
                >
                  <AreaChart data={timelineData} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="equityVestedGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-chart-1)" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="var(--color-chart-1)" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="equityUnvestedGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-chart-2)" stopOpacity={0.22} />
                        <stop offset="95%" stopColor="var(--color-chart-2)" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.4} />
                    <XAxis
                      dataKey="monthLabel"
                      tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }}
                      tickLine={false}
                      axisLine={false}
                      minTickGap={28}
                    />
                    <YAxis
                      tickFormatter={(val) =>
                        chartMetric === 'value' ? formatCompactCurrency(val) : formatShareCount(val)
                      }
                      tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }}
                      tickLine={false}
                      axisLine={false}
                      width={60}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload || !payload.length) return null;
                        const pt = payload[0].payload;
                        return (
                          <ChartTooltip>
                            <TooltipHeader>
                              {pt.monthLabel} {pt.isPastOrToday ? '(Vested to Date)' : '(Projected)'}
                            </TooltipHeader>
                            {chartMetric === 'value' ? (
                              <>
                                <TooltipRow
                                  label="Vested Value"
                                  value={formatBalance(pt.vestedValueEffective)}
                                  color="var(--color-chart-1)"
                                />
                                <TooltipRow
                                  label="Unvested Value"
                                  value={formatBalance(pt.unvestedValueEffective)}
                                  color="var(--color-chart-2)"
                                />
                                <TooltipRow
                                  label="Total Potential"
                                  value={formatBalance(pt.totalPotentialValue)}
                                />
                              </>
                            ) : (
                              <>
                                <TooltipRow
                                  label="Vested Shares"
                                  value={formatShareCount(pt.vestedShares)}
                                  color="var(--color-chart-1)"
                                />
                                <TooltipRow
                                  label="Unvested Shares"
                                  value={formatShareCount(pt.unvestedShares)}
                                  color="var(--color-chart-2)"
                                />
                              </>
                            )}
                          </ChartTooltip>
                        );
                      }}
                    />
                    <ReferenceLine
                      x={timelineData.find((p) => p.date === todayStr)?.monthLabel}
                      stroke="var(--color-primary)"
                      strokeDasharray="4 4"
                      label={{
                        value: 'Today',
                        position: 'insideTopLeft',
                        fill: 'var(--color-primary)',
                        fontSize: 11,
                      }}
                    />
                    <Area
                      type="stepAfter"
                      dataKey={chartMetric === 'value' ? 'vestedValueEffective' : 'vestedShares'}
                      stackId="1"
                      stroke="var(--color-chart-1)"
                      strokeWidth={2}
                      fill="url(#equityVestedGrad)"
                      name="Vested"
                    />
                    <Area
                      type="stepAfter"
                      dataKey={chartMetric === 'value' ? 'unvestedValueEffective' : 'unvestedShares'}
                      stackId="1"
                      stroke="var(--color-chart-2)"
                      strokeWidth={1.5}
                      strokeDasharray="4 3"
                      fill="url(#equityUnvestedGrad)"
                      name="Unvested"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Estimated Exercise Cost & Tax Breakdown */}
            <div className="bg-card border border-border rounded-xl p-4 sm:p-5 shadow-xs flex flex-col justify-between space-y-4">
              <div className="border-b border-border/60 pb-3">
                <h3 className="text-sm sm:text-base font-semibold text-foreground flex items-center gap-2">
                  <Calculator className="w-4 h-4 text-chart-2" />
                  <span>Estimated Exercise Cost &amp; Tax</span>
                </h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Cash required to exercise and estimated tax impact at current share valuation
                </p>
              </div>

              <div className="bg-muted/30 border border-border/60 rounded-xl p-3.5 space-y-2.5 text-xs flex-1 flex flex-col justify-between">
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between border-b border-border/50 pb-2">
                    <span className="text-muted-foreground font-medium">Active Share Price</span>
                    <span className="font-mono font-bold text-foreground">
                      {formatAmount(baseSharePrice)} / sh
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Cash to Exercise (Vested)</span>
                    <span className="font-mono font-semibold text-foreground blur-number">
                      {formatBalance(exerciseBreakdown.cashToExerciseVested)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>Total Exercise Cost (All Shares)</span>
                    <span className="font-mono blur-number">
                      {formatBalance(exerciseBreakdown.cashToExerciseAll)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>ISO AMT Bargain Element (Vested)</span>
                    <span className="font-mono blur-number">
                      {formatBalance(exerciseBreakdown.isoAmtBargainElement)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>Est. Tax on Vested Exercise</span>
                    <span className="font-mono text-destructive blur-number">
                      {formatBalance(exerciseBreakdown.estimatedTaxOnVestedExercise)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-border/50">
                    <span className="text-muted-foreground">Vested Intrinsic Value</span>
                    <span className="font-mono font-semibold text-chart-1 blur-number">
                      {formatBalance(exerciseBreakdown.vestedGrossValue)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Total Fully-Vested Spread</span>
                    <span className="font-mono font-semibold text-foreground blur-number">
                      {formatBalance(exerciseBreakdown.totalGrossValue)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>Est. Full Exit Tax (~23.8%–32%)</span>
                    <span className="font-mono text-destructive blur-number">
                      -{formatBalance(exerciseBreakdown.estimatedExitTax)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2.5 border-t border-border/60 text-sm">
                  <span className="font-bold text-foreground">Est. Net Value (Fully Vested)</span>
                  <span className="font-mono font-extrabold text-chart-1 blur-number">
                    {formatBalance(exerciseBreakdown.netTotalPayout)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Grants Portfolio Table ── */}
          <div className="bg-card border border-border rounded-xl shadow-xs p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
              <div>
                <h3 className="text-sm sm:text-base font-semibold text-foreground">
                  Option Grants & Equity Holdings
                </h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Manage individual option grants, strike prices, 409A / preferred valuations, and exercise records.
                </p>
              </div>
              <AddButton variant="primary" onClick={openCreateDrawer}>
                Add Grant
              </AddButton>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border/60 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <th className="py-2.5 pr-3">Grant / Company</th>
                    <th className="py-2.5 px-3">Type</th>
                    <th className="py-2.5 px-3">Vesting Progress</th>
                    <th className="py-2.5 px-3 text-right">Strike</th>
                    <th className="py-2.5 px-3 text-right">Share Price</th>
                    <th className="py-2.5 px-3 text-right">Exercise Cost</th>
                    <th className="py-2.5 px-3 text-right">Vested Value</th>
                    <th className="py-2.5 px-3 text-right">Total Potential</th>
                    <th className="py-2.5 pl-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {grants.map((g) => {
                    const m = g.metrics;
                    const typeInfo = GRANT_TYPE_LABELS[g.grantType] ?? GRANT_TYPE_LABELS.iso;
                    return (
                      <tr
                        key={g.id}
                        className="hover:bg-muted/30 transition-colors group"
                      >
                        <td className="py-3 pr-3">
                          <div className="flex items-center gap-2.5">
                            <GrantLogoBadge
                              companyName={g.companyName}
                              logoUrl={g.logoUrl}
                              size="sm"
                            />
                            <div className="min-w-0">
                              <div className="font-semibold text-foreground flex items-center gap-1.5 flex-wrap">
                                <span className="truncate">{g.grantName}</span>
                                {g.filed83b && (
                                  <span className="text-micro px-1.5 py-0.5 rounded bg-chart-4/15 text-chart-4 font-mono">
                                    83(b)
                                  </span>
                                )}
                                {g.isExcludedFromNetWorth && (
                                  <span className="text-micro px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                                    Excl. NW
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-muted-foreground flex items-center gap-2 mt-0.5">
                                <span className="truncate">{g.companyName}</span>
                                <span>•</span>
                                <span>Granted {formatDate(g.grantDate)}</span>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border ${typeInfo.badgeClass}`}
                          >
                            {typeInfo.short}
                          </span>
                        </td>
                        <td className="py-3 px-3 min-w-[160px]">
                          <div className="flex items-center justify-between text-[11px] mb-1">
                            <span className="font-mono font-medium text-foreground">
                              {formatShareCount(m.vestedShares)} / {formatShareCount(m.totalShares)}
                            </span>
                            <span className="font-mono text-muted-foreground">
                              {formatPlainPercent(m.vestedPct)}
                            </span>
                          </div>
                          <div className="w-full bg-muted/40 h-1.5 rounded-full overflow-hidden">
                            <div
                              className="bg-chart-1 h-full rounded-full"
                              style={{ width: `${Math.min(100, m.vestedPct)}%` }}
                            />
                          </div>
                          {m.exercisedShares > 0 && (
                            <div className="text-micro text-muted-foreground mt-0.5">
                              Exercised: {formatShareCount(m.exercisedShares)} sh
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-foreground">
                          {g.grantType === 'rsu' ? '—' : formatAmount(m.strikePrice)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums">
                          <div className="font-semibold text-foreground">
                            {formatAmount(m.effectiveSharePrice)}
                          </div>
                          <div className="text-micro text-muted-foreground">
                            {g.valuationMode === 'preferred' ? 'Preferred' : '409A FMV'}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-muted-foreground blur-number">
                          {formatBalance(m.cashToExerciseVested)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums font-bold text-chart-1 blur-number">
                          {formatBalance(m.vestedIntrinsicValue)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums font-semibold text-foreground blur-number">
                          {formatBalance(m.totalPotentialValue)}
                        </td>
                        <td className="py-3 pl-3 text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openEditDrawer(g)}
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                              title="Edit grant"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeletingGrant(g)}
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                              title="Delete grant"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <GrantEditSheet
        sheetOpen={sheetOpen}
        setSheetOpen={setSheetOpen}
        editingGrant={editingGrant}
        allGrants={grants}
        onSuccess={refetch}
      />

      {/* ── Delete Confirmation Dialog ── */}
      <AlertDialog
        open={Boolean(deletingGrant)}
        onOpenChange={(open) => !open && setDeletingGrant(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Equity Grant?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{' '}
              <strong>{deletingGrant?.grantName}</strong> ({deletingGrant?.companyName})? This will remove the grant and recalculate your equity account balance and historical snapshots.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <ActionButton
              variant="primary"
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleConfirmDelete}
              disabled={deleting}
            >
              {deleting ? 'Deleting...' : 'Delete Grant'}
            </ActionButton>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

