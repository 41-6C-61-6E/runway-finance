'use client';

import { useState, useEffect, useMemo } from 'react';
import { formatCurrency } from '@/lib/utils/format';
import { isAssetAccount, isLiabilityAccount } from '@/lib/utils/account-scope';
import { useCardCollapsed } from '@/lib/hooks/use-card-collapsed';
import { EstimatePill } from '@/components/ui/estimate-pill';
import { CollapsibleCardHeader } from '@/components/ui/collapsible-card-header';
import type { AccountData, ChartPoint } from '@/lib/types/financial';
import { computeMovingAverage, computeMedianFilter } from '@/lib/utils/chart-aggregation';
import { TooltipRow, TooltipHeader } from '@/components/charts/chart-tooltip';
import { ChartHoverTooltip } from '@/components/charts/chart-hover-tooltip';
import {
  DollarSign,
  ShieldCheck,
  Percent,
  ArrowUpRight,
  ArrowDownRight,
  Info,
  HelpCircle,
  Droplets,
  Flag,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface ChartResponse {
  data: ChartPoint[];
  summary: {
    current: number;
    previous: number;
    change: number;
    percentChange: number;
  };
}

interface InvestmentHistoryPoint {
  date: string;
  value: number;
}

interface InvestmentHistoryResponse {
  data: InvestmentHistoryPoint[];
  summary: {
    current: number;
    previous: number;
    change: number;
    percentChange: number;
  };
};


const LIQUID_TYPES = new Set([
  'checking', 'savings', 'hsachecking', 'investment', 'brokerage',
  'otherinvestment', 'otherInvestment', 'crypto', 'metals',
]);

const MILESTONE_TIERS = [
  0, 10_000, 25_000, 50_000, 75_000, 100_000, 150_000, 200_000, 250_000,
  500_000, 750_000, 1_000_000, 1_500_000, 2_000_000, 2_500_000, 5_000_000, 10_000_000,
];

function formatMilestone(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

function getNextMilestone(netWorth: number) {
  if (netWorth < 0) {
    return { previous: netWorth, next: 0, label: '$0', previousLabel: formatMilestone(0) };
  }
  for (let i = 0; i < MILESTONE_TIERS.length; i++) {
    if (netWorth < MILESTONE_TIERS[i]) {
      return {
        previous: i > 0 ? MILESTONE_TIERS[i - 1] : 0,
        next: MILESTONE_TIERS[i],
        label: formatMilestone(MILESTONE_TIERS[i]),
        previousLabel: formatMilestone(i > 0 ? MILESTONE_TIERS[i - 1] : 0),
      };
    }
  }
  // Beyond all tiers — round up to next $10M
  const nextTen = Math.ceil(netWorth / 10_000_000) * 10_000_000;
  const target = nextTen === netWorth ? nextTen + 10_000_000 : nextTen;
  return {
    previous: MILESTONE_TIERS[MILESTONE_TIERS.length - 1],
    next: target,
    label: formatMilestone(target),
    previousLabel: formatMilestone(MILESTONE_TIERS[MILESTONE_TIERS.length - 1]),
  };
}

const RATING_THRESHOLDS = [
  { max: 0.35, label: 'Excellent', colorVar: 'var(--status-positive)', badgeClass: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20', barClass: 'bg-chart-1' },
  { max: 0.45, label: 'Good', colorVar: 'var(--chart-2)', badgeClass: 'bg-blue-500/10 text-blue-500 border-blue-500/20', barClass: 'bg-blue-500' },
  { max: 0.55, label: 'Fair', colorVar: 'var(--status-warning)', badgeClass: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20', barClass: 'bg-yellow-500' },
  { max: 0.75, label: 'Poor', colorVar: 'var(--chart-3)', badgeClass: 'bg-orange-500/10 text-orange-500 border-orange-500/20', barClass: 'bg-orange-500' },
  { max: Infinity, label: 'Critical', colorVar: 'var(--destructive)', badgeClass: 'bg-rose-500/10 text-rose-500 border-rose-500/20', barClass: 'bg-destructive' },
];

function getDebtRatioRating(rawRatio: number) {
  for (const t of RATING_THRESHOLDS) {
    if (rawRatio < t.max) return t;
  }
  return RATING_THRESHOLDS[RATING_THRESHOLDS.length - 1];
}

export function NetWorthSidePanel() {
  const [accounts, setAccounts] = useState<AccountData[]>([]);
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [investmentData, setInvestmentData] = useState<InvestmentHistoryPoint[]>([]);
  const [investmentSummary, setInvestmentSummary] = useState<InvestmentHistoryResponse['summary'] | null>(null);
  const [hasEstimated, setHasEstimated] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isCollapsed, setIsCollapsed] = useCardCollapsed('netWorthSidePanel');

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const [accountsRes, chartRes, investRes] = await Promise.all([
          fetch('/api/accounts'),
          fetch('/api/net-worth/chart?timeframe=1y'),
          fetch('/api/investments/history?timeframe=1y'),
        ]);
        if (!accountsRes.ok || !chartRes.ok) throw new Error('Failed to fetch net worth data');
        const [accountsData, chartResponse]: [AccountData[], ChartResponse] = await Promise.all([
          accountsRes.json(),
          chartRes.json(),
        ]);
        setAccounts(accountsData);
        setChartData(chartResponse.data || []);
        setHasEstimated((chartResponse.data ?? []).some((d: ChartPoint) => d.isSynthetic));
        if (investRes.ok) {
          const investResponse: InvestmentHistoryResponse = await investRes.json();
          setInvestmentData(investResponse.data || []);
          setInvestmentSummary(investResponse.summary || null);
        }

      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const totals = useMemo(() => {
    let totalAssets = 0;
    let totalLiabilities = 0;

    for (const acc of accounts) {
      const balance = typeof acc.balance === 'string' ? parseFloat(acc.balance) : acc.balance;
      if (isAssetAccount(acc.type)) {
        totalAssets += balance;
      } else if (isLiabilityAccount(acc.type)) {
        totalLiabilities += Math.abs(balance);
      }
    }

    return {
      totalAssets,
      totalLiabilities,
      netWorth: totalAssets - totalLiabilities,
    };
  }, [accounts]);

  const processedData = useMemo(() => {
    if (chartData.length === 0) return [];
    const targetSpikeDays = 4;
    const targetSmaDays = 7;
    const first = new Date(chartData[0].date + 'T00:00:00Z').getTime();
    const last = new Date(chartData[chartData.length - 1].date + 'T00:00:00Z').getTime();
    const totalDays = (last - first) / (1000 * 60 * 60 * 24);
    const gap = chartData.length > 1 ? totalDays / (chartData.length - 1) : 1;
    const targetPoints = Math.ceil(targetSpikeDays / (gap || 1));
    const windowSize = 2 * targetPoints + 1;
    const maxAllowed = Math.floor(chartData.length * 0.15);
    const finalWindow = Math.min(windowSize, maxAllowed % 2 === 0 ? maxAllowed + 1 : maxAllowed);
    const medianWindow = Math.max(1, finalWindow % 2 === 0 ? finalWindow - 1 : finalWindow);
    const smaTargetPoints = Math.round(targetSmaDays / (gap || 1));
    const maxSmaAllowed = Math.floor(chartData.length * 0.15);
    const finalSmaWindow = Math.min(smaTargetPoints, maxSmaAllowed);
    const smaWindow = Math.max(1, finalSmaWindow);

    const fields: (keyof ChartPoint & string)[] = ['netWorth', 'totalAssets', 'totalLiabilities'];
    const medianFiltered = computeMedianFilter(chartData, fields, medianWindow);
    if (smaWindow > 1) {
      return computeMovingAverage(medianFiltered, fields, smaWindow);
    }
    return medianFiltered;
  }, [chartData]);

  const deltas = useMemo(() => {
    if (processedData.length < 2) return { assets: 0, liabilities: 0, netWorth: 0, pctAssets: 0, pctLiabilities: 0, pctNetWorth: 0 };
    const cur = processedData[processedData.length - 1];
    const prev = processedData[0];
    const dAssets = cur.totalAssets - prev.totalAssets;
    const dLiabilities = cur.totalLiabilities - prev.totalLiabilities;
    const dNetWorth = cur.netWorth - prev.netWorth;
    return {
      assets: dAssets,
      liabilities: dLiabilities,
      netWorth: dNetWorth,
      pctAssets: prev.totalAssets !== 0 ? (dAssets / prev.totalAssets) * 100 : 0,
      pctLiabilities: prev.totalLiabilities !== 0 ? (dLiabilities / prev.totalLiabilities) * 100 : 0,
      pctNetWorth: prev.netWorth !== 0 ? (dNetWorth / prev.netWorth) * 100 : 0,
    };
  }, [processedData]);

  // Debt-to-Asset Ratio & Rating calculation matching old DebtToAssetRatio card
  const { rawRatio, debtPct, rating } = useMemo(() => {
    const raw = totals.totalAssets > 0 ? totals.totalLiabilities / totals.totalAssets : 0;
    return {
      rawRatio: raw,
      debtPct: raw * 100,
      rating: getDebtRatioRating(raw),
    };
  }, [totals.totalAssets, totals.totalLiabilities]);

  // Asset proportion calculation
  const assetRatio = useMemo(() => {
    const sum = totals.totalAssets + totals.totalLiabilities;
    if (sum === 0) return { assetPct: 100, liabilityPct: 0 };
    return {
      assetPct: (totals.totalAssets / sum) * 100,
      liabilityPct: (totals.totalLiabilities / sum) * 100,
    };
  }, [totals.totalAssets, totals.totalLiabilities]);

  // Liquid vs Illiquid calculation
  const liquidity = useMemo(() => {
    let liquid = 0;
    let illiquid = 0;
    for (const acc of accounts) {
      if (!isAssetAccount(acc.type)) continue;
      const balance = typeof acc.balance === 'string' ? parseFloat(acc.balance) : acc.balance;
      if (LIQUID_TYPES.has(acc.type)) {
        liquid += balance;
      } else {
        illiquid += balance;
      }
    }
    const total = liquid + illiquid;
    return {
      liquid,
      illiquid,
      total,
      liquidPct: total > 0 ? (liquid / total) * 100 : 0,
      illiquidPct: total > 0 ? (illiquid / total) * 100 : 0,
    };
  }, [accounts]);


  // Net Worth Milestone
  const milestone = useMemo(() => {
    const nw = totals.netWorth;
    const ms = getNextMilestone(nw);
    const range = ms.next - ms.previous;
    const progress = range > 0 ? Math.max(0, Math.min(((nw - ms.previous) / range) * 100, 100)) : 0;
    const remaining = ms.next - nw;
    return { ...ms, progress, remaining, netWorth: nw };
  }, [totals.netWorth]);

  if (loading) {
    return (
      <Card className="shadow-sm border border-sidebar-border bg-sidebar rounded-2xl animate-pulse">
        <CardContent className="p-5 space-y-4">
          <div className="h-5 bg-muted/60 rounded w-40" />
          <div className="h-16 bg-card rounded-xl" />
          <div className="h-32 bg-card rounded-xl" />
          <div className="h-24 bg-card rounded-xl" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="shadow-sm border border-sidebar-border bg-sidebar rounded-2xl">
        <CardContent className="p-5 text-sm text-destructive">
          Failed to load Net Worth summary: {error}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="bg-sidebar border border-sidebar-border rounded-2xl shadow-sm overflow-hidden text-sidebar-foreground">
      <CollapsibleCardHeader
        isCollapsed={isCollapsed}
        onToggle={setIsCollapsed}
        collapseDirection="horizontal"
        title={
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-primary shrink-0" />
            <span className="font-bold text-foreground">Overview</span>
          </div>
        }
        actions={hasEstimated ? <EstimatePill /> : null}
        className="border-b border-sidebar-border/60 bg-sidebar"
      />
      {!isCollapsed && (
        <div className="p-4 sm:p-5 space-y-4 divide-y divide-sidebar-border/50">
          {/* Section 1: Hero Net Worth */}
          <ChartHoverTooltip
            content={
              <>
                <TooltipHeader>Total Net Worth Calculation</TooltipHeader>
                <TooltipRow label="Total Assets" value={formatCurrency(totals.totalAssets)} color="var(--color-chart-1)" />
                <TooltipRow label="Total Liabilities" value={formatCurrency(totals.totalLiabilities)} color="var(--color-destructive)" />
                <div className="mt-2 border-t border-border/40 pt-1.5">
                  <TooltipRow
                    label="1-Year Growth"
                    value={`${deltas.netWorth >= 0 ? '+' : ''}${formatCurrency(deltas.netWorth)} (${deltas.pctNetWorth.toFixed(1)}%)`}
                    color={deltas.netWorth >= 0 ? 'var(--color-chart-1)' : 'var(--color-chart-5)'}
                  />
                </div>
              </>
            }
          >
            <div className="space-y-2 cursor-help pb-1">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                Total Net Worth
                <Info className="w-3 h-3 text-muted-foreground/50 hover:text-muted-foreground transition-colors shrink-0" />
              </span>
              <div className="flex flex-col">
                <span className="text-2xl sm:text-3xl font-extrabold text-foreground font-mono blur-number">
                  {formatCurrency(totals.netWorth)}
                </span>
                <div className="flex items-center gap-1.5 mt-1">
                  <div
                    className={cn(
                      'inline-flex items-center gap-0.5 text-[11px] font-bold px-2.5 py-0.5 rounded-full border font-mono',
                      deltas.netWorth >= 0
                        ? 'bg-chart-1/10 text-chart-1 border-chart-1/20'
                        : 'bg-destructive/10 text-destructive border-destructive/20'
                    )}
                  >
                    {deltas.netWorth >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                    <span className="blur-number">{formatCurrency(Math.abs(deltas.netWorth))}</span>
                    <span className="opacity-80">({deltas.pctNetWorth >= 0 ? '+' : ''}{deltas.pctNetWorth.toFixed(1)}%)</span>
                  </div>
                  <span className="text-[11px] text-muted-foreground">past 1 year</span>
                </div>
              </div>
            </div>
          </ChartHoverTooltip>

          {/* Section 2: Assets vs Liabilities */}
          <div className="pt-4">
            <ChartHoverTooltip
              content={
                <>
                  <TooltipHeader>Assets vs. Liabilities</TooltipHeader>
                  <TooltipRow label="Total Assets" value={`${formatCurrency(totals.totalAssets)} (${assetRatio.assetPct.toFixed(1)}%)`} color="var(--color-chart-1)" />
                  <TooltipRow label="Total Liabilities" value={`${formatCurrency(totals.totalLiabilities)} (${assetRatio.liabilityPct.toFixed(1)}%)`} color="var(--color-destructive)" />
                  <div className="mt-2 border-t border-border/40 pt-1.5">
                    <TooltipRow label="Net Worth" value={formatCurrency(totals.netWorth)} color="var(--color-chart-1)" />
                  </div>
                </>
              }
            >
              <div className="space-y-2 cursor-help">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="text-foreground flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-chart-1 shrink-0" />
                    Assets vs. Liabilities
                    <HelpCircle className="w-3 h-3 text-muted-foreground/50 hover:text-muted-foreground transition-colors shrink-0" />
                  </span>
                  <span className="text-muted-foreground font-mono text-[11px]">
                    {assetRatio.assetPct.toFixed(1)}% / {assetRatio.liabilityPct.toFixed(1)}%
                  </span>
                </div>
                <div className="h-2.5 w-full bg-muted/50 rounded-full overflow-hidden flex">
                  <div
                    className="h-full bg-chart-1 transition-all duration-500 rounded-l-full"
                    style={{ width: `${assetRatio.assetPct}%` }}
                  />
                  <div
                    className="h-full bg-destructive transition-all duration-500 rounded-r-full"
                    style={{ width: `${assetRatio.liabilityPct}%` }}
                  />
                </div>
              </div>
            </ChartHoverTooltip>
          </div>

          {/* Section 3: Debt to Asset Ratio Rating Card */}
          <div className="pt-4">
            <ChartHoverTooltip
              content={
                <>
                  <TooltipHeader>Debt-to-Asset Ratio</TooltipHeader>
                  <TooltipRow label="Liabilities" value={formatCurrency(totals.totalLiabilities)} color="var(--color-destructive)" />
                  <TooltipRow label="Assets" value={formatCurrency(totals.totalAssets)} color="var(--color-chart-1)" />
                  <TooltipRow label="Ratio" value={`${debtPct.toFixed(1)}%`} color="var(--color-primary)" />
                  <div className="mt-2 border-t border-border/40 pt-1.5 space-y-1">
                    <div className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">Benchmark</div>
                    <div className="flex justify-between gap-4 text-[10px] font-mono"><span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" />Excellent: &lt;35%</span><span>Healthy</span></div>
                    <div className="flex justify-between gap-4 text-[10px] font-mono"><span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500" />Good: 35% - 45%</span><span>Moderate</span></div>
                    <div className="flex justify-between gap-4 text-[10px] font-mono"><span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-yellow-500" />Fair: 45% - 55%</span><span>Elevated</span></div>
                    <div className="flex justify-between gap-4 text-[10px] font-mono"><span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-orange-500" />Poor: 55% - 75%</span><span>High Risk</span></div>
                    <div className="flex justify-between gap-4 text-[10px] font-mono"><span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-rose-500" />Critical: &gt;75%</span><span>Very High</span></div>
                  </div>
                </>
              }
            >
              <div className="space-y-2 cursor-help">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="text-foreground flex items-center gap-1">
                    <Percent className="w-3.5 h-3.5 text-primary shrink-0" />
                    Debt-to-Asset Ratio
                    <Info className="w-3 h-3 text-muted-foreground/50 hover:text-muted-foreground transition-colors shrink-0" />
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-base font-extrabold text-foreground font-mono blur-number">
                      {debtPct.toFixed(0)}%
                    </span>
                    <span className={cn('text-[11px] font-bold px-2 py-0.5 rounded-full border font-mono', rating.badgeClass)}>
                      {rating.label}
                    </span>
                  </div>
                </div>
                <div className="h-2.5 w-full bg-muted/50 rounded-full overflow-hidden">
                  <div
                    className={cn('h-full transition-all duration-500 rounded-full', rating.barClass)}
                    style={{ width: `${Math.min(debtPct, 100)}%` }}
                  />
                </div>
              </div>
            </ChartHoverTooltip>
          </div>

          {/* Section 4: Liquid vs Illiquid Assets */}
          {liquidity.total > 0 && (
            <div className="pt-4">
              <ChartHoverTooltip
                content={
                  <>
                    <TooltipHeader>Liquid vs. Illiquid Assets</TooltipHeader>
                    <TooltipRow label="Liquid" value={`${formatCurrency(liquidity.liquid)} (${liquidity.liquidPct.toFixed(1)}%)`} color="var(--color-chart-2)" />
                    <TooltipRow label="Illiquid" value={`${formatCurrency(liquidity.illiquid)} (${liquidity.illiquidPct.toFixed(1)}%)`} color="var(--color-chart-4)" />
                    <div className="mt-2 border-t border-border/40 pt-1.5 space-y-1">
                      <div className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">Classification</div>
                      <div className="text-[10px] text-muted-foreground">Liquid: Checking, savings, brokerage, crypto, metals</div>
                      <div className="text-[10px] text-muted-foreground">Illiquid: Retirement, real estate, vehicles, HSA, 529</div>
                    </div>
                  </>
                }
              >
                <div className="space-y-2 cursor-help">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-foreground flex items-center gap-1">
                      <Droplets className="w-3.5 h-3.5 text-chart-2 shrink-0" />
                      Liquid vs. Illiquid
                      <HelpCircle className="w-3 h-3 text-muted-foreground/50 hover:text-muted-foreground transition-colors shrink-0" />
                    </span>
                    <span className="text-muted-foreground font-mono text-[11px]">
                      {liquidity.liquidPct.toFixed(1)}% / {liquidity.illiquidPct.toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-2.5 w-full bg-muted/50 rounded-full overflow-hidden flex">
                    <div
                      className="h-full bg-chart-2 transition-all duration-500 rounded-l-full"
                      style={{ width: `${liquidity.liquidPct}%` }}
                    />
                    <div
                      className="h-full bg-chart-4 transition-all duration-500 rounded-r-full"
                      style={{ width: `${liquidity.illiquidPct}%` }}
                    />
                  </div>
                </div>
              </ChartHoverTooltip>
            </div>
          )}

          {/* Section 5: Net Worth Milestone Tracker */}
          <div className="pt-4">
            <ChartHoverTooltip
              content={
                <>
                  <TooltipHeader>Net Worth Milestone</TooltipHeader>
                  <TooltipRow label="Current Net Worth" value={formatCurrency(milestone.netWorth)} color="var(--color-chart-1)" />
                  <TooltipRow label="Previous Milestone" value={milestone.previousLabel} color="var(--color-muted-foreground)" />
                  <TooltipRow label="Next Milestone" value={milestone.label} color="var(--color-primary)" />
                  <div className="mt-2 border-t border-border/40 pt-1.5">
                    <TooltipRow label="Remaining" value={formatCurrency(milestone.remaining)} color="var(--color-chart-5)" />
                    <TooltipRow label="Progress" value={`${milestone.progress.toFixed(1)}%`} color="var(--color-primary)" />
                  </div>
                </>
              }
            >
              <div className="space-y-2 cursor-help">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="text-foreground flex items-center gap-1">
                    <Flag className="w-3.5 h-3.5 text-primary shrink-0" />
                    Next Milestone
                    <Info className="w-3 h-3 text-muted-foreground/50 hover:text-muted-foreground transition-colors shrink-0" />
                  </span>
                  <span className="text-muted-foreground font-mono text-[11px] blur-number">
                    {formatCurrency(milestone.remaining)} to go
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-xl font-bold text-foreground font-mono">
                    {milestone.label}
                  </span>
                  <span className="inline-flex items-center gap-0.5 text-[11px] font-bold px-2 py-0.5 rounded-full border font-mono bg-primary/10 text-primary border-primary/20">
                    {milestone.progress.toFixed(0)}%
                  </span>
                </div>
                <div className="h-2.5 w-full bg-muted/50 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-500 rounded-full"
                    style={{ width: `${milestone.progress}%` }}
                  />
                </div>
              </div>
            </ChartHoverTooltip>
          </div>
        </div>
      )}
    </div>
  );
}
