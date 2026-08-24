'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { formatCurrency } from '@/lib/utils/format';
import { formatChartYAxisCurrency } from '@/lib/utils/chart-format';
import { formatSafeUTCDate } from '@/lib/utils/date';
import { useCardCollapsed } from '@/lib/hooks/use-card-collapsed';
import { CollapsibleCardHeader } from '@/components/ui/collapsible-card-header';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { ChartTooltip, TooltipHeader, TooltipRow } from '@/components/charts/chart-tooltip';
import { ChartEmptyState } from '@/components/charts/chart-empty-state';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { CircleDollarSign, TrendingUp, TrendingDown, Landmark, ArrowDownCircle, Info } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import {
  INCOME_TIMEFRAMES,
  useInvestmentIncomeData,
  type IncomeTimeframeValue,
  type MonthlyFlowDatum,
  type ClassifiedTransaction,
} from '@/lib/hooks/use-investment-income';

/* ── Series definitions ─────────────────────────────────────────────────── */
/* Colors (CSS-var based, theme-safe):
   income          → chart-1 green ("return the portfolio earned")
   contributions   → chart-4 (distinct from income so "you put in" ≠ "it earned")
   growth          → primary ("market did the work")
   withdrawals     → chart-5 (money you took out / fees — not a failure color)
   losses          → destructive red ("market losses")
*/
export const CASHFLOW_SERIES = [
  { key: 'income', label: 'Investment Income', color: 'var(--color-chart-1)', icon: CircleDollarSign, dir: 'in' as const },
  { key: 'contributions', label: 'Contributions', color: 'var(--color-chart-4)', icon: Landmark, dir: 'in' as const },
  { key: 'growth', label: 'Market Growth', color: 'var(--color-primary)', icon: TrendingUp, dir: 'in' as const },
  { key: 'withdrawals', label: 'Withdrawals & Fees', color: 'var(--color-chart-5)', icon: ArrowDownCircle, dir: 'out' as const },
  { key: 'losses', label: 'Market Losses', color: 'var(--color-destructive)', icon: TrendingDown, dir: 'out' as const },
];

export type CashflowSeriesKey = (typeof CASHFLOW_SERIES)[number]['key'];

function formatMonthLong(ym: string): string {
  return formatSafeUTCDate(ym + '-01', { month: 'long', year: 'numeric' });
}

function formatMonthShort(ym: string): string {
  return formatSafeUTCDate(ym + '-01', { month: 'short' });
}

/* ── Component ──────────────────────────────────────────────────────────── */

interface IncomeDividendsPanelProps {
  /** Controlled timeframe (shared with the Recent Activity list). Omit to manage internally, defaulting to 1Y. */
  value?: IncomeTimeframeValue;
  onValueChange?: (value: IncomeTimeframeValue) => void;
  /** Optional: focus the activity list on a flow group (from summary-tile clicks). */
  onFocusActivity?: (filter: string) => void;
}

export function IncomeDividendsPanel({ value, onValueChange, onFocusActivity }: IncomeDividendsPanelProps = {}) {
  const [isCollapsed, setIsCollapsed] = useCardCollapsed('incomeDividends');
  const [internalTimeframe, setInternalTimeframe] = useState<IncomeTimeframeValue>('1y');
  const timeframe = value ?? internalTimeframe;
  const setTimeframe = onValueChange ?? setInternalTimeframe;
  const [visibleSeries, setVisibleSeries] = useState<Record<CashflowSeriesKey, boolean>>({
    income: true,
    contributions: true,
    growth: true,
    withdrawals: true,
    losses: true,
  });
  const [showReinvested, setShowReinvested] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const { data, isLoading, error } = useInvestmentIncomeData(timeframe);

  // Chart is capped at the most recent 60 months. Out-flows are negated so
  // `stackOffset="sign"` stacks them below the zero line — the upward portion
  // of each bar then equals the net change (growth + income + contributions
  // minus withdrawals & losses).
  const chartData: MonthlyFlowDatum[] = useMemo(
    () =>
      (data?.months ?? []).slice(-60).map((d) => ({
        ...d,
        withdrawals: -d.withdrawals,
        losses: -d.losses,
      })),
    [data]
  );

  const allZeros = chartData.every(
    (d) => d.income === 0 && d.contributions === 0 && d.withdrawals === 0 && d.growth === 0 && d.losses === 0
  );

  const yDomain = useMemo((): [number, number] => {
    let max = 0;
    let min = 0;
    for (const d of chartData) {
      const up =
        (visibleSeries.income ? d.income : 0) +
        (visibleSeries.contributions ? d.contributions : 0) +
        (visibleSeries.growth ? d.growth : 0);
      const down =
        (visibleSeries.withdrawals ? d.withdrawals : 0) +
        (visibleSeries.losses ? d.losses : 0);
      max = Math.max(max, up);
      min = Math.min(min, -down);
    }
    if (max === 0 && min === 0) return [0, 1000];
    const pad = Math.max((max - min) * 0.08, 100);
    return [min - pad, max + pad];
  }, [chartData, visibleSeries]);

  const formatYTick = useCallback((v: number) => formatChartYAxisCurrency(v, yDomain[0], yDomain[1]), [yDomain]);

  const toggleSeries = (key: CashflowSeriesKey) => {
    setVisibleSeries((prev) => {
      const nextCount = Object.values(prev).filter(Boolean).length - (prev[key] ? 1 : 0);
      if (prev[key] && nextCount === 0) return prev; // keep at least one series visible
      return { ...prev, [key]: !prev[key] };
    });
  };

  const CustomTooltip = useCallback(
    ({ active, payload }: any) => {
      if (!active || !payload?.length) return null;
      const d = payload[0]?.payload as MonthlyFlowDatum;
      const rows = CASHFLOW_SERIES.filter((s) => visibleSeries[s.key] && Math.abs(d[s.key]) > 0);
      const totalUp = rows.filter((s) => s.dir === 'in').reduce((sum, s) => sum + (d[s.key] as number), 0);
      // Out-flow series are stored as negative in chartData; use magnitude for the total.
      const totalDown = rows.filter((s) => s.dir === 'out').reduce((sum, s) => sum + Math.abs(d[s.key] as number), 0);
      const net = totalUp - totalDown;
      return (
        <ChartTooltip>
          <TooltipHeader>{formatMonthLong(d.month)}</TooltipHeader>
          {rows.length > 0 ? (
            <>
              {rows.map((s) => (
                <TooltipRow
                  key={s.key}
                  label={s.label}
                  value={`${s.dir === 'in' ? '+' : '-'}${formatCurrency(Math.abs(d[s.key] as number))}`}
                  color={s.color}
                />
              ))}
              <div className="border-t border-border/50 my-1" />
              <TooltipRow
                label="Net change"
                value={`${net >= 0 ? '+' : '-'}${formatCurrency(Math.abs(net))}`}
                className={`blur-number ${net >= 0 ? 'text-chart-1' : 'text-destructive'}`}
              />
            </>
          ) : (
            <div className="text-muted-foreground/70 py-1">No recorded activity this month</div>
          )}
        </ChartTooltip>
      );
    },
    [visibleSeries]
  );

  const rangeLabel = useMemo(() => {
    if (chartData.length === 0) return '';
    const first = chartData[0].month;
    const last = chartData[chartData.length - 1].month;
    const sameYear = first.slice(0, 4) === last.slice(0, 4);
    if (first === last) return formatMonthLong(first);
    if (sameYear) return `${formatMonthShort(first)} – ${formatMonthShort(last)}, ${last.slice(0, 4)}`;
    return `${formatMonthShort(first)} ${first.slice(0, 4)} – ${formatMonthShort(last)} ${last.slice(0, 4)}`;
  }, [chartData]);

  const summary = data?.summary;
  const hasActivity = data !== undefined && !allZeros;
  const noSnapshotsYet = data !== undefined && !data.hasSnapshots;

  const headerEl = (
    <div className="flex items-center gap-2">
      <CircleDollarSign className="w-4 h-4 text-primary shrink-0" />
      <span>Capital Flow</span>
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="How is this breakdown calculated?"
              className="text-muted-foreground/60 hover:text-foreground transition-colors rounded focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <Info className="w-3.5 h-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="start" className="max-w-xs p-3 space-y-2 text-xs text-left leading-relaxed">
            <div className="font-semibold text-foreground">Monthly capital breakdown</div>
            <p className="text-muted-foreground">
              Each bar shows why your investment balances changed that month. <span className="text-foreground font-medium">Up</span>: income,
              contributions, and market growth. <span className="text-foreground font-medium">Down</span>: withdrawals/fees and market losses.
            </p>
            <p className="text-muted-foreground">
              Growth &amp; losses are derived from balance snapshots: balance change − (contributions − withdrawals + income).
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm h-full">
      <CollapsibleCardHeader isCollapsed={isCollapsed} onToggle={setIsCollapsed} title={headerEl} />

      {!isCollapsed && (
        <div className="p-4 sm:p-5">
          {isLoading ? (
            <LoadingSpinner category="chart" className="h-[220px]" />
          ) : error ? (
            <ChartEmptyState variant="error" error={error instanceof Error ? error.message : 'Failed to load income data'} />
          ) : !hasActivity ? (
            <ChartEmptyState
              variant="nodata"
              description={
                noSnapshotsYet
                  ? 'No investment activity found yet. Contributions, income, and market movement will appear here after your first sync.'
                  : 'No recorded activity in this range. Try a longer timeframe.'
              }
            />
          ) : (
            <div className="space-y-4">
              {/* Range picker + interactive legend */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex bg-muted/40 p-0.5 rounded-lg border border-border/50">
                  {INCOME_TIMEFRAMES.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setTimeframe(opt.value)}
                      aria-pressed={timeframe === opt.value}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold leading-none transition-all ${
                        timeframe === opt.value
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'text-muted-foreground hover:bg-muted/80 hover:text-foreground'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {CASHFLOW_SERIES.map((s) => {
                    const active = visibleSeries[s.key];
                    return (
                      <button
                        key={s.key}
                        onClick={() => toggleSeries(s.key)}
                        aria-pressed={active}
                        title={active ? `Hide ${s.label}` : `Show ${s.label}`}
                        className={`flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-semibold transition-all ${
                          active ? 'bg-card border-border text-foreground' : 'bg-transparent border-border/40 text-muted-foreground/50 line-through'
                        }`}
                      >
                        <span
                          className="inline-block w-2 h-2 rounded-full shrink-0"
                          style={{ background: active ? s.color : 'var(--color-muted-foreground)', opacity: active ? 1 : 0.4 }}
                        />
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Chart */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Monthly Breakdown · {rangeLabel}
                  </div>
                  {noSnapshotsYet && (
                    <div className="text-[10px] text-amber-500/90 font-medium">
                      Balance snapshots not synced yet — market growth/losses unavailable
                    </div>
                  )}
                </div>
                <div className="h-[260px] sm:h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={chartData}
                      stackOffset="sign"
                      margin={{ top: 4, right: 4, left: -16, bottom: 0 }}
                      barSize={isMobile ? 10 : 16}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} opacity={0.3} />
                      <XAxis
                        dataKey="month"
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: 'var(--color-muted-foreground)', fontSize: 10 }}
                        tickFormatter={formatMonthShort}
                        interval={chartData.length > 16 ? 'preserveStartEnd' : 0}
                        minTickGap={24}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: 'var(--color-muted-foreground)', fontSize: 10 }}
                        domain={yDomain}
                        tickFormatter={formatYTick}
                      />
                      <ReferenceLine y={0} stroke="var(--color-border)" strokeWidth={1} />
                      <RechartsTooltip
                        content={<CustomTooltip />}
                        cursor={{ fill: 'var(--color-muted-foreground)', opacity: 0.08 }}
                        wrapperStyle={{ pointerEvents: 'none', userSelect: 'none' }}
                        isAnimationActive={false}
                      />
                      {CASHFLOW_SERIES.filter((s) => visibleSeries[s.key]).map((s) => (
                        <Bar
                          key={s.key}
                          dataKey={s.key}
                          stackId="waterfall"
                          name={s.label}
                          fill={s.color}
                          maxBarSize={34}
                          radius={s.dir === 'in' ? [2, 2, 0, 0] : [0, 0, 2, 2]}
                        />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Period summary tiles */}
              {summary && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                  <SummaryTile
                    label="Income"
                    value={summary.income}
                    color="var(--color-chart-1)"
                    kind="income"
                    onFocusActivity={onFocusActivity}
                    focusFilter="income"
                  />
                  <SummaryTile
                    label="Contributions"
                    value={summary.contributions}
                    color="var(--color-chart-4)"
                    kind="in"
                    onFocusActivity={onFocusActivity}
                    focusFilter="contributions"
                  />
                  <SummaryTile label="Market Growth" value={summary.growth} color="var(--color-primary)" kind="in" />
                  <SummaryTile
                    label="Withdrawals & Fees"
                    value={summary.withdrawals}
                    color="var(--color-chart-5)"
                    kind="out"
                    onFocusActivity={onFocusActivity}
                    focusFilter="withdrawals"
                  />
                  <SummaryTile label="Market Losses" value={summary.losses} color="var(--color-destructive)" kind="out" />
                  <SummaryTile
                    label="Net Change"
                    value={summary.net}
                    color={summary.net >= 0 ? 'var(--color-chart-1)' : 'var(--color-destructive)'}
                    kind={summary.net >= 0 ? 'in' : 'out'}
                    valueClass={summary.net >= 0 ? 'text-chart-1' : 'text-destructive'}
                    onFocusActivity={onFocusActivity}
                    focusFilter="all"
                  />
                </div>
              )}

              {/* Contextual notes */}
              <div className="space-y-1.5 pt-1">
                {summary && summary.topIncomeSources.length > 0 && (
                  <div className="text-[10px] text-muted-foreground">
                    Top income sources:{' '}
                    {summary.topIncomeSources.slice(0, 3).map((s, i) => (
                      <span key={s.payee}>
                        {i > 0 && ', '}
                        <span className="font-semibold text-foreground">{s.payee}</span>{' '}
                        <span className="font-mono">{formatCurrency(s.total)}</span>
                      </span>
                    ))}
                  </div>
                )}
                {summary && summary.annualizedIncomePct !== null && (
                  <div className="text-[10px] text-muted-foreground">
                    Investment income ≈{' '}
                    <span className="font-semibold text-foreground">{summary.annualizedIncomePct.toFixed(2)}% annualized</span> of your average
                    investment balance
                    {` (from ${timeframe === 'ytd' ? 'YTD' : timeframe === 'all' ? 'full' : timeframe.toUpperCase()} history`}
                    {summary.monthsWithSnapshots < summary.monthCount
                      ? `, measured over ${summary.monthsWithSnapshots} months with balance data)`
                      : ')'}
                    .
                  </div>
                )}
                {summary && summary.reinvested > 0 && (
                  <div className="text-[10px] text-muted-foreground">
                    <span className="font-semibold text-foreground">{formatCurrency(summary.reinvested)}</span> in dividends were reinvested (shown as
                    Reinvest entries, excluded from income totals to avoid double counting)
                    {data.transactions.length > 0 && (
                      <>
                        .{' '}
                        <button onClick={() => setShowReinvested((v) => !v)} className="text-primary hover:text-primary/80 font-semibold transition-colors">
                          {showReinvested ? 'Hide' : 'Show'} list
                        </button>
                      </>
                    )}
                    {showReinvested && <ReinvestedList transactions={data.transactions} />}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Helpers ────────────────────────────────────────────────────────────── */

function SummaryTile({
  label,
  value,
  color,
  kind,
  valueClass,
  onFocusActivity,
  focusFilter,
}: {
  label: string;
  value: number;
  color: string;
  kind: 'in' | 'out' | 'income';
  valueClass?: string;
  onFocusActivity?: (filter: string) => void;
  focusFilter?: string;
}) {
  const isZero = value === 0;
  const prefix = isZero ? '' : kind === 'out' ? '-' : '+';
  return (
    <button
      type="button"
      disabled={!onFocusActivity}
      onClick={() => onFocusActivity?.(focusFilter ?? 'all')}
      title={onFocusActivity ? `Show ${label.toLowerCase()} in activity` : undefined}
      className="p-2.5 rounded-lg bg-muted/30 border border-border/60 min-w-0 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:hover:bg-muted/30"
    >
      <div className="flex items-center gap-1.5 mb-1 min-w-0">
        <span className="inline-block w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
        <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide truncate" title={label}>
          {label}
        </span>
      </div>
      <div
        className={`text-sm font-bold truncate tabular-nums blur-number ${
          isZero ? 'text-muted-foreground/50' : valueClass ?? (kind === 'out' ? 'text-muted-foreground' : 'text-foreground')
        }`}
        title={`${prefix}${formatCurrency(Math.abs(value))}`}
      >
        {prefix}
        {formatCurrency(Math.abs(value))}
      </div>
    </button>
  );
}

function ReinvestedList({ transactions }: { transactions: ClassifiedTransaction[] }) {
  const reinvested = (transactions ?? []).filter((t) => t.type === 'reinvestment').slice(0, 8);
  return (
    <div className="mt-1.5 ml-0 pl-3 border-l-2 border-chart-1/30 space-y-0.5">
      {reinvested.length > 0 ? (
        reinvested.map((t) => (
          <div key={t.id} className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <span className="text-foreground/80 shrink-0">
              {formatSafeUTCDate(t.date, { month: 'short', day: 'numeric', year: '2-digit' })}
            </span>
            <span className="truncate flex-1" title={`${t.description} ${t.payee ?? ''}`}>
              {t.payee || t.description || 'Reinvestment'}
            </span>
            <span className="font-mono font-semibold text-chart-1 shrink-0">{formatCurrency(Math.abs(t.amount))}</span>
          </div>
        ))
      ) : (
        <div className="text-[10px] text-muted-foreground/60">No reinvestment entries in this range.</div>
      )}
    </div>
  );
}
