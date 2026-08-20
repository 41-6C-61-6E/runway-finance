'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatCurrency } from '@/lib/utils/format';
import { TooltipRow, TooltipHeader } from '@/components/charts/chart-tooltip';
import { ChartHoverTooltip } from '@/components/charts/chart-hover-tooltip';
import { Wallet, TrendingUp, Target, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Reference medians (U.S. households), used for age-banded comparisons.
// Values are approximate medians synthesized from frequently cited public
// data (Federal Reserve Z.1 Financial Accounts by age cohort, and commonly
// referenced savings-rate figures). They are directional benchmarks, not a
// precise statistical source — the UI labels them as such.
// ---------------------------------------------------------------------------
interface AgeBandReference {
  minAge: number;
  label: string;
  /** Median savings rate as % of take-home pay */
  savingsRateMedian: number;
  /** Median net worth as a multiple of annual income */
  netWorthToIncomeMedian: number;
}

const AGE_BAND_REFERENCES: AgeBandReference[] = [
  { minAge: 18, label: '18–29', savingsRateMedian: 10, netWorthToIncomeMedian: 0.2 },
  { minAge: 30, label: '30–39', savingsRateMedian: 12, netWorthToIncomeMedian: 1.1 },
  { minAge: 40, label: '40–49', savingsRateMedian: 15, netWorthToIncomeMedian: 2.5 },
  { minAge: 50, label: '50–59', savingsRateMedian: 18, netWorthToIncomeMedian: 4.2 },
  { minAge: 60, label: '60+', savingsRateMedian: 22, netWorthToIncomeMedian: 6.5 },
];

function getAgeBand(age: number): AgeBandReference {
  for (let i = AGE_BAND_REFERENCES.length - 1; i >= 0; i--) {
    const band = AGE_BAND_REFERENCES[i];
    if (age >= band.minAge) return band;
  }
  return AGE_BAND_REFERENCES[0];
}

// ---------------------------------------------------------------------------
// Emergency fund coverage tiers — anchored to the widely recommended
// 3–6 month "emergency fund" range, with 12 months as a strong cushion.
// ---------------------------------------------------------------------------
const EMERGENCY_TIERS = [
  { min: 12, label: 'Excellent', badgeClass: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20', barClass: 'bg-emerald-500' },
  { min: 6, label: 'Strong', badgeClass: 'bg-blue-500/10 text-blue-500 border-blue-500/20', barClass: 'bg-blue-500' },
  { min: 3, label: 'Building', badgeClass: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20', barClass: 'bg-yellow-500' },
  { min: Infinity, label: 'Low', badgeClass: 'bg-rose-500/10 text-rose-500 border-rose-500/20', barClass: 'bg-rose-500' },
];

function getEmergencyTier(months: number) {
  return months >= 12 ? EMERGENCY_TIERS[0] : months >= 6 ? EMERGENCY_TIERS[1] : months >= 3 ? EMERGENCY_TIERS[2] : EMERGENCY_TIERS[3];
}

interface BenchmarksData {
  windowMonths: number;
  liquidCash: number;
  monthlyIncome: number;
  /** Sum of the user's active month budgets for Fixed (essential) categories; null when no such budget exists (hides the coverage block). */
  monthlyEssentialSpend: number | null;
  annualIncome: number;
  savingsRate: number | null;
  netWorth: number;
  netWorthToIncomeRatio: number | null;
  emergencyFundMonths: number | null;
}

interface NetWorthBenchmarksProps {
  /** User's birth year from settings — enables the age-band reference comparison */
  birthYear?: number | null;
}

/**
 * Emergency fund coverage + age-banded reference comparisons.
 * Designed to live inside the net worth side panel's `divide-y` container.
 */
export function NetWorthBenchmarks({ birthYear }: NetWorthBenchmarksProps) {
  const { data } = useQuery<BenchmarksData>({
    queryKey: ['net-worth-benchmarks'],
    queryFn: async () => {
      const res = await fetch('/api/net-worth/benchmarks', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch benchmarks');
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const age = useMemo(() => {
    if (!birthYear || typeof birthYear !== 'number') return null;
    const currentYear = new Date().getFullYear();
    const a = currentYear - birthYear;
    return a >= 0 && a < 120 ? a : null;
  }, [birthYear]);

  const band = age != null ? getAgeBand(age) : null;

  // ── Emergency Fund Coverage ─────────────────────────────────────────────
  const emergencyFund = data && data.emergencyFundMonths != null && data.liquidCash > 0;
  const months = emergencyFund ? (data as BenchmarksData).emergencyFundMonths as number : 0;
  const tier = emergencyFund ? getEmergencyTier(months) : null;
  const displayMonths = Math.min(months, 36);
  const barPct = emergencyFund ? Math.min((displayMonths / 24) * 100, 100) : 0;

  // ── Age band comparison ─────────────────────────────────────────────────
  const savingsRate = data?.savingsRate ?? null;
  const nwRatio = data?.netWorthToIncomeRatio ?? null;
  const savingsDelta = band && savingsRate != null ? savingsRate - band.savingsRateMedian : null;
  const ratioDelta = band && nwRatio != null ? nwRatio - band.netWorthToIncomeMedian : null;
  const showBenchmarks = band != null && (savingsRate != null || nwRatio != null);

  if (!data) return null;

  return (
    <>
      {/* Emergency Fund Coverage */}
      {emergencyFund && tier && (
        <div className="py-4 first:pt-0 last:pb-0">
          <ChartHoverTooltip
            content={
              <>
                <TooltipHeader>Emergency Fund Coverage</TooltipHeader>
                <TooltipRow label="Liquid Cash" value={formatCurrency(data.liquidCash)} color="var(--color-chart-2)" />
                <TooltipRow label="Essential Monthly Spend" value={formatCurrency(data.monthlyEssentialSpend ?? 0)} color="var(--color-chart-4)" />
                <TooltipRow label="Coverage" value={`${months.toFixed(1)} months`} color="var(--color-primary)" />
                <div className="mt-2 border-t border-border/40 pt-1.5 space-y-1">
                  <div className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">Benchmark</div>
                  <div className="text-[10px] text-muted-foreground">Essential = your month's budgets for "Fixed" (essential) categories.</div>
                  <div className="text-[10px] text-muted-foreground">3–6 months is the common financial-planning recommendation.</div>
                </div>
              </>
            }
          >
            <div className="space-y-2 cursor-help">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-foreground flex items-center gap-1">
                  <Wallet className="w-3.5 h-3.5 text-chart-2 shrink-0" />
                  Emergency Fund Coverage
                </span>
                <span className={cn('text-[11px] font-bold px-2 py-0.5 rounded-full border font-mono', tier.badgeClass)}>
                  {tier.label}
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-lg font-extrabold text-foreground font-mono blur-number">
                  {months.toFixed(1)} <span className="text-xs font-semibold text-muted-foreground">months covered</span>
                </span>
                <span className="text-[11px] text-muted-foreground font-mono blur-number">
                  {formatCurrency(data.liquidCash)} liquid
                </span>
              </div>
              <div className="text-[11px] text-muted-foreground">
                You have {months.toFixed(1)} months of essential expenses saved in liquid cash
                <span className="opacity-70"> ({formatCurrency(data.monthlyEssentialSpend ?? 0)}/mo)</span>
              </div>
              <div className="h-2.5 w-full bg-muted/50 rounded-full overflow-hidden">
                <div
                  className={cn('h-full transition-all duration-500 rounded-full', tier.barClass)}
                  style={{ width: `${barPct}%` }}
                />
              </div>
            </div>
          </ChartHoverTooltip>
        </div>
      )}
      {!emergencyFund && data.liquidCash > 0 && (
        <div className="py-4 first:pt-0 last:pb-0">
          <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
            <Wallet className="w-3.5 h-3.5 text-chart-2 shrink-0" />
            Set budgets for Fixed (essential) categories to see Emergency Fund Coverage.
          </div>
        </div>
      )}

      {/* Age-band reference benchmarks */}
      {showBenchmarks && band && (
        <div className="py-4 first:pt-0 last:pb-0 space-y-3">
          <div className="flex items-center justify-between text-xs font-bold">
            <span className="text-foreground flex items-center gap-1">
              <Target className="w-3.5 h-3.5 text-primary shrink-0" />
              Benchmarks (Age {band.label})
            </span>
            <span className="text-muted-foreground font-mono text-[11px]">your age: {age}</span>
          </div>

          {/* Savings rate vs band median */}
          {savingsRate != null && (
            <ChartHoverTooltip
              content={
                <>
                  <TooltipHeader>Savings Rate vs. Reference</TooltipHeader>
                  <TooltipRow label="Your Rate" value={`${savingsRate.toFixed(1)}%`} color={savingsDelta != null && savingsDelta >= 0 ? 'var(--color-chart-1)' : 'var(--color-destructive)'} />
                  <TooltipRow label={`${band.label} Median (ref.)`} value={`${band.savingsRateMedian}%`} color="var(--color-muted-foreground)" />
                  <div className="text-[10px] text-muted-foreground mt-1">Reference medians from commonly cited U.S. household data. Approximate.</div>
                </>
              }
            >
              <div className="flex items-center justify-between cursor-help">
                <span className="text-[11px] text-muted-foreground">Savings Rate</span>
                <span className="flex items-center gap-1.5 font-mono text-[11px]">
                  <span
                    className={cn(
                      'inline-flex items-center gap-0.5 font-bold',
                      savingsDelta != null && savingsDelta >= 0 ? 'text-emerald-500' : 'text-rose-500'
                    )}
                  >
                    {savingsDelta != null && savingsDelta >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                    {savingsRate.toFixed(1)}%
                  </span>
                  <span className="text-muted-foreground/70">vs {band.savingsRateMedian}%</span>
                </span>
              </div>
            </ChartHoverTooltip>
          )}

          {/* Net worth to income vs band median */}
          {nwRatio != null && (
            <ChartHoverTooltip
              content={
                <>
                  <TooltipHeader>Net Worth to Income vs. Reference</TooltipHeader>
                  <TooltipRow label="Your Ratio" value={`${nwRatio.toFixed(1)}× income`} color={ratioDelta != null && ratioDelta >= 0 ? 'var(--color-chart-1)' : 'var(--color-destructive)'} />
                  <TooltipRow label={`${band.label} Median (ref.)`} value={`${band.netWorthToIncomeMedian}× income`} color="var(--color-muted-foreground)" />
                  <div className="text-[10px] text-muted-foreground mt-1">Reference medians from commonly cited U.S. household data. Approximate.</div>
                </>
              }
            >
              <div className="flex items-center justify-between cursor-help">
                <span className="text-[11px] text-muted-foreground">Net Worth to Income</span>
                <span className="flex items-center gap-1.5 font-mono text-[11px]">
                  <span
                    className={cn(
                      'inline-flex items-center gap-0.5 font-bold',
                      ratioDelta != null && ratioDelta >= 0 ? 'text-emerald-500' : 'text-rose-500'
                    )}
                  >
                    {ratioDelta != null && ratioDelta >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                    {nwRatio.toFixed(1)}×
                  </span>
                  <span className="text-muted-foreground/70">vs {band.netWorthToIncomeMedian}×</span>
                </span>
              </div>
            </ChartHoverTooltip>
          )}

          <div className="text-[10px] text-muted-foreground/70 flex items-center gap-1">
            <TrendingUp className="w-3 h-3 shrink-0" />
            Reference medians (U.S. households, approximate — not personalized advice).
          </div>
        </div>
      )}
    </>
  );
}
