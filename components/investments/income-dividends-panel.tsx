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
import {
  CircleDollarSign,
  TrendingUp,
  TrendingDown,
  Landmark,
  ArrowDownCircle,
  Info,
  X,
  ChevronDown,
  ExternalLink,
  ArrowRightLeft,
  SlidersHorizontal,
} from 'lucide-react';
import { yearMonthOf, addMonthsClamped } from '@/lib/utils/investment-flows';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import {
  INCOME_TIMEFRAMES,
  useInvestmentIncomeData,
  timeframeLabel,
  type IncomeTimeframeValue,
  type MonthlyFlowDatum,
  type ClassifiedTransaction,
} from '@/lib/hooks/use-investment-income';
import { buildTransactionsDeepLink } from '@/components/investments/recent-activity';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';

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
  const [selectedMonth, setSelectedMonth] = useState<MonthlyFlowDatum | null>(null);
  // CF-5 (a11y/UX parity): close the detail modal on Escape.
  useEffect(() => {
    if (!selectedMonth) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedMonth(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedMonth]);
  // The month's data is tied to the range; switching timeframe can drop the
  // picked month from the response — reset on change.
  useEffect(() => {
    setSelectedMonth(null);
  }, [timeframe]);
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

    // The chart data negates out-flow series for stacking; the detail modal
    // needs the original (positive-magnitude) buckets, so re-resolve the
    // selected month from the raw response.
    const selectedMonthDatum = useMemo(() => {
      if (!selectedMonth) return null;
      return (data?.months ?? []).find((m) => m.month === selectedMonth.month) ?? null;
    }, [selectedMonth, data]);

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

  // The in-progress month is always the last bar in the data (server builds
  // the range through the current month), so no client clock is needed to
  // decide which month is still "open".
  const lastMonth = chartData.length > 0 ? chartData[chartData.length - 1].month : null;

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
              {d.delta === null ? (
                <div className="text-[10px] text-muted-foreground/70 mt-1 leading-snug">
                  No balance snapshot this month — net is recorded flows only
                </div>
              ) : (
                d.lastSnapshotDate && lastMonth === d.month && (
                  <div className="text-[10px] text-muted-foreground/70 mt-1 leading-snug">
                    Month to date · balance as of {formatSafeUTCDate(d.lastSnapshotDate, { month: 'short', day: 'numeric' })}
                  </div>
                )
              )}
            </>
          ) : (
            <div className="text-muted-foreground/70 py-1">No recorded activity this month</div>
          )}
        </ChartTooltip>
      );
    },
    [visibleSeries, lastMonth]
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
  const noCashFlow = data !== undefined && allZeros;
  // CF-8: a month with only trades/reinvests/transfers has no *bucket* activity,
  // but it is not "no activity" — the txns are in the feed and the Activity
  // tab shows them, so hide the card only when the feed is actually empty.
  const hasOnlyNeutralActivity = noCashFlow && (data?.transactions.length ?? 0) > 0;
  const hasActivity = data !== undefined && (noCashFlow ? hasOnlyNeutralActivity : true);
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
              className="-m-[15px] p-[15px] text-muted-foreground/60 hover:text-foreground transition-colors rounded focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <Info className="w-3.5 h-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="start" className="max-w-xs p-3 space-y-2 text-xs text-left leading-relaxed">
            <div className="font-semibold text-foreground">
              Calendar-month capital breakdown · {timeframeLabel(timeframe)}
            </div>
            <p className="text-muted-foreground">
              Each bar shows why your investment balances changed that month. <span className="text-foreground font-medium">Up</span>: income,
              contributions, and market growth. <span className="text-foreground font-medium">Down</span>: withdrawals/fees and market losses.
            </p>
            <p className="text-muted-foreground">
              Growth &amp; losses are derived from balance snapshots: balance change − (contributions − withdrawals + income).
            </p>
            <p className="text-muted-foreground">
              Click any bar for a month-by-month detail. Hover for a quick breakdown.
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
                      className={`px-2.5 py-1 min-h-8 rounded-md text-[11px] font-semibold leading-none transition-all ${
                        timeframe === opt.value
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'text-muted-foreground hover:bg-muted/80 hover:text-foreground'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                {/* CF-16: series toggles used to sit as five always-visible chips
                    that wrapped onto 2–3 rows next to the range picker. They now
                    live in a "Customize" popover, freeing the row (and chart
                    height). At least one series is always kept visible. */}
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      aria-label="Customize which series are shown"
                      className="flex items-center gap-1.5 px-2.5 py-1 min-h-8 rounded-md text-[11px] font-semibold leading-none text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-colors border border-border/50 bg-card"
                    >
                      <SlidersHorizontal className="w-3 h-3" />
                      Customize
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-52 p-1.5 space-y-0.5">
                    <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1">
                      Show on chart
                    </div>
                    {CASHFLOW_SERIES.map((s) => {
                      const active = visibleSeries[s.key];
                      return (
                        <button
                          key={s.key}
                          type="button"
                          role="checkbox"
                          aria-checked={active}
                          onClick={() => toggleSeries(s.key)}
                          title={active ? `Hide ${s.label}` : `Show ${s.label}`}
                          className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-[11px] font-semibold transition-colors hover:bg-muted/60 ${
                            active ? 'text-foreground' : 'text-muted-foreground/50 line-through'
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
                  </PopoverContent>
                </Popover>
              </div>

              {/* Chart */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Period breakdown (monthly bars) · {rangeLabel}
                    {data?.allCapped && <span className="ml-1 normal-case tracking-normal font-medium text-muted-foreground/70">— all time shows the last 60 months</span>}
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
                      // No fixed barSize: Recharts sizes bars from the plot width ÷
                      // category count, so 6 bars are chunky and 60 bars stay
                      // readable instead of all being 16px slabs. BarCategoryGap
                      // keeps the gap proportional as the count grows.
                      barCategoryGap={chartData.length > 24 ? '15%' : '20%'}
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
                          /* CF-5: click opens the month detail report (same
                             `data?.payload` pattern as the flows charts). */
                          onClick={(d: any) => {
                            const p = d?.payload;
                            if (p?.month) setSelectedMonth(p as MonthlyFlowDatum);
                          }}
                          style={{ cursor: 'pointer' }}
                        />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* CF-8: explain the flatline instead of hiding the chart */}
              {hasOnlyNeutralActivity && (
                <div className="text-xs text-muted-foreground bg-muted/30 border border-border/20 rounded-xl p-3 leading-relaxed">
                  No capital entered or left this period — only internal activity (trades, reinvestments, or transfers), which the chart doesn't plot.
                  The{' '}
                  <button onClick={() => onFocusActivity?.('all')} className="text-primary hover:text-primary/80 font-semibold transition-colors">
                    activity list
                  </button>{' '}
                  shows those entries.
                </div>
              )}

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
                    {` (from ${timeframeLabel(timeframe)}`}
                    {`, measured over ${summary.monthsWithSnapshots} months with balance data)`}
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
        {/* CF-5: per-month detail report (client-only; every field is already
            in the shared response). Rendered above the card so it stays
            visible even when the card is collapsed. */}
        {selectedMonthDatum && data && (
          <MonthDetailModal
            monthDatum={selectedMonthDatum}
            transactions={data.transactions}
            hasSnapshots={data.hasSnapshots}
            onClose={() => setSelectedMonth(null)}
          />
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
      title={onFocusActivity ? `Filter the activity list to ${label.toLowerCase()}` : undefined}
      // CF-19: make the click affordance explicit — browsers default buttons to
      // `cursor: default`, so the previous "only a title tooltip" hint barely
      // registered. Hover now also tints the border toward the series color.
      className="group p-2.5 rounded-lg bg-muted/30 border border-border/60 min-w-0 text-left transition-colors hover:bg-muted/60 hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer disabled:cursor-default disabled:hover:bg-muted/30"
    >
      <div className="flex items-center gap-1.5 mb-1 min-w-0">
        <span className="inline-block w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
        <span className="text-micro font-semibold text-muted-foreground group-hover:text-foreground uppercase tracking-wide truncate" title={label}>
          {label}
        </span>
        {onFocusActivity && (
          <span className="ml-auto text-[11px] font-semibold text-muted-foreground/0 group-hover:text-primary transition-colors">
            Filter
          </span>
        )}
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

/* ── CF-5: month detail modal ───────────────────────────────────────────── */


interface MonthBucketSection {
  key: string;
  label: string;
  amount: number;
  color: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Transactions that make up this bucket's magnitude (cash buckets). */
  transactions: ClassifiedTransaction[];
  /** Derived buckets (growth/losses) have no underlying rows — explain why. */
  derived?: string;
}

/**
 * Mirror the server's `bucketCashFlow` for display purposes: group the month's
 * transactions into the same cash buckets the chart uses, so the per-row
 * sums always reconcile with the bucket totals (modulo rounding).
 */
function groupMonthTransactions(
  month: string,
  transactions: ClassifiedTransaction[]
): Record<'income' | 'contributions' | 'withdrawals' | 'reinvested' | 'trades' | 'transfers', ClassifiedTransaction[]> {
  const out = { income: [], contributions: [], withdrawals: [], reinvested: [], trades: [], transfers: [] };
  for (const tx of transactions) {
    if (yearMonthOf(tx.date) !== month) continue;
    const t = tx.type;
    if (t === 'dividend' || t === 'interest') out.income.push(tx);
    else if (t === 'deposit') (tx.amount >= 0 ? out.contributions : out.withdrawals).push(tx);
    else if (t === 'withdrawal' || t === 'fee') out.withdrawals.push(tx);
    else if (t === 'withdrawal_reversal') (tx.amount >= 0 ? out.contributions : out.withdrawals).push(tx);
    else if (t === 'reinvestment') out.reinvested.push(tx);
    else if (t === 'buy' || t === 'sell') out.trades.push(tx);
    else if (t === 'transfer' || t === 'fee_reversal') out.transfers.push(tx);
  }
  return out;
}

export function MonthDetailModal({
  monthDatum,
  transactions,
  hasSnapshots,
  onClose,
}: {
  monthDatum: MonthlyFlowDatum;
  transactions: ClassifiedTransaction[];
  hasSnapshots: boolean;
  onClose: () => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const month = monthDatum.month;
  const groups = useMemo(() => groupMonthTransactions(month, transactions), [month, transactions]);

  // Cash buckets shown with their underlying rows.
  const cashSections: MonthBucketSection[] = [
    { key: 'income', label: 'Investment Income', amount: monthDatum.income, color: 'var(--color-chart-1)', icon: CircleDollarSign, transactions: groups.income },
    { key: 'contributions', label: 'Contributions', amount: monthDatum.contributions, color: 'var(--color-chart-4)', icon: Landmark, transactions: groups.contributions },
    { key: 'withdrawals', label: 'Withdrawals & Fees', amount: monthDatum.withdrawals, color: 'var(--color-chart-5)', icon: ArrowDownCircle, transactions: groups.withdrawals },
  ];

  // Derived market buckets — no transactions exist, so explain the derivation.
  const growthSection: MonthBucketSection = {
    key: 'growth',
    label: 'Market Growth',
    amount: monthDatum.growth,
    color: 'var(--color-primary)',
    icon: TrendingUp,
    transactions: [],
  };
  const lossSection: MonthBucketSection = {
    key: 'losses',
    label: 'Market Losses',
    amount: monthDatum.losses,
    color: 'var(--color-destructive)',
    icon: TrendingDown,
    transactions: [],
  };

  const hasAny =
    cashSections.some((s) => Math.abs(s.amount) > 0) ||
    Math.abs(monthDatum.growth) > 0 ||
    Math.abs(monthDatum.losses) > 0;

  const totalIn = monthDatum.income + monthDatum.contributions;
  const totalOut = monthDatum.withdrawals + monthDatum.losses;

  const [startDay, endExclusive] = [`${month}-01`, `${addMonthsClamped(month, 1)}-01`];

  const toggle = (key: string) => setExpanded((c) => (c === key ? null : key));

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Capital flow for ${formatMonthLong(month)}`}
    >
      <div
        className="bg-background border border-border rounded-xl shadow-2xl w-full max-w-xl max-h-[85vh] overflow-y-auto animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 flex items-center justify-between p-5 border-b border-border bg-background/95 backdrop-blur">
          <div className="flex items-center gap-2">
            <CircleDollarSign className="w-4 h-4 text-primary" />
            <h3 className="text-base font-semibold text-foreground">
              Capital Flow — {formatMonthLong(month)}
              {monthDatum.lastSnapshotDate && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  · balance as of {formatSafeUTCDate(monthDatum.lastSnapshotDate, { month: 'short', day: 'numeric' })}
                </span>
              )}
            </h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-muted-foreground hover:text-foreground bg-muted hover:bg-muted/80 rounded-lg p-1.5 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5 bg-background text-sm">
          {/* Hero: net change for the month */}
          <div className={`rounded-xl p-4 text-center space-y-1 border ${monthDatum.net >= 0 ? 'bg-chart-1/5 border-chart-1/20' : 'bg-destructive/5 border-destructive/20'}`}>
            <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Net change this month</div>
            <div className={`text-3xl font-extrabold font-mono blur-number ${monthDatum.net >= 0 ? 'text-chart-1' : 'text-destructive'}`}>
              {monthDatum.net >= 0 ? '+' : '−'}
              {formatCurrency(Math.abs(monthDatum.net))}
            </div>
            <div className="text-xs text-muted-foreground">
              In: <span className="font-semibold text-foreground blur-number">{formatCurrency(totalIn)}</span>
              {' · '}
              Out: <span className="font-semibold text-foreground blur-number">{formatCurrency(totalOut)}</span>
            </div>
          </div>

          {/* Reconciliation: recorded net vs actual balance delta (CF-4/CF-7) */}
          {monthDatum.delta !== null && (
            <div className="text-xs text-muted-foreground bg-muted/30 border border-border/20 rounded-xl p-3 leading-relaxed">
              Balance moved <span className={`font-semibold blur-number ${monthDatum.delta >= 0 ? 'text-chart-1' : 'text-destructive'}`}>{monthDatum.delta >= 0 ? '+' : '−'}{formatCurrency(Math.abs(monthDatum.delta))}</span>.
              {Math.abs(monthDatum.delta - monthDatum.net) > 0.01 ? (
                <span>
{' '}The ±{formatCurrency(Math.abs(monthDatum.delta - monthDatum.net))} gap between measured and recorded change is absorbed by growth/losses (the snapshot residual).
                </span>
              ) : (
                <span> Recorded flows fully explain the measured change.</span>
              )}
            </div>
          )}

          {!hasAny ? (
            <div className="text-muted-foreground text-center py-6 italic">No recorded capital activity this month.</div>
          ) : (
            <>
              {/* Cash buckets with drill-down */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">Details breakdown</h4>
                  <span className="text-[10px] text-muted-foreground italic">Click a bucket to inspect transactions</span>
                </div>
                <div className="border border-border rounded-xl divide-y divide-border overflow-hidden bg-background">
                  {cashSections.map((s) => {
                    const Icon = s.icon;
                    const listed = s.transactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);
                    const unmatched = Math.abs(s.amount - listed) > 0.01;
                    return (
                      <div key={s.key} onClick={() => toggle(s.key)} className="cursor-pointer hover:bg-muted/5 transition-colors">
                        <div className="flex justify-between p-3">
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color }} />
                            <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="text-muted-foreground font-medium">{s.label}</span>
                          </div>
                          <div className="flex items-center gap-1.5 font-semibold font-mono text-foreground">
                            <span className="blur-number">{formatCurrency(s.amount)}</span>
                            <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${expanded === s.key ? 'rotate-180' : ''}`} />
                          </div>
                        </div>
                        {expanded === s.key && (
                          <div className="bg-muted/10 border-t border-border px-4 py-2 space-y-1.5 text-xs">
                            {s.transactions.length > 0 ? (
                              s.transactions.map((t, i) => (
                                <div key={t.id ?? i} className="flex justify-between gap-4 py-1.5 border-b border-border/10 last:border-0">
                                  <div className="flex flex-col min-w-0">
                                    <span className="font-medium text-foreground truncate">{t.description || t.payee || 'Transaction'}</span>
                                    <span className="text-[10px] text-muted-foreground truncate">
                                      {t.accountName} · {formatSafeUTCDate(t.date, { month: 'short', day: 'numeric', year: 'numeric' })}
                                    </span>
                                  </div>
                                  <span
                                    className={`font-mono font-medium blur-number shrink-0 ${
                                      s.key === 'income' || s.key === 'contributions' ? 'text-chart-1' : 'text-chart-5'
                                    }`}
                                  >
                                    {t.amount >= 0 ? '+' : '−'}
                                    {formatCurrency(Math.abs(t.amount))}
                                  </span>
                                </div>
                              ))
                            ) : (
                              <div className="text-muted-foreground text-center py-3 italic">Nothing in this bucket for the month.</div>
                            )}
                            {unmatched && (
                              <div className="text-[10px] text-amber-500/90 pt-1">
                                {formatCurrency(Math.abs(s.amount - listed))} of this bucket has no matching line item (mis-signed or unclassified rows).
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Derived market buckets */}
                  {[growthSection, lossSection]
                    .filter((s) => Math.abs(s.amount) > 0)
                    .map((s) => {
                      const Icon = s.icon;
                      return (
                        <div key={s.key} onClick={() => toggle(s.key)} className="cursor-pointer hover:bg-muted/5 transition-colors">
                          <div className="flex justify-between p-3">
                            <div className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color }} />
                              <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                              <span className="text-muted-foreground font-medium">{s.label}</span>
                            </div>
                            <div className="flex items-center gap-1.5 font-semibold font-mono text-foreground">
                              <span className={`blur-number ${s.key === 'growth' ? 'text-primary' : 'text-destructive'}`}>
                                {s.key === 'growth' ? '+' : '−'}
                                {formatCurrency(Math.abs(s.amount))}
                              </span>
                              <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${expanded === s.key ? 'rotate-180' : ''}`} />
                            </div>
                          </div>
                          {expanded === s.key && (
                            <div className="bg-muted/10 border-t border-border px-4 py-2 text-xs text-muted-foreground leading-relaxed">
                              {monthDatum.delta === null
                                ? 'This month has no balance snapshots, so market movement cannot be separated from flows — nothing is shown here.'
                                : `Derived, not recorded: the month's measured balance change (${monthDatum.delta >= 0 ? '+' : '−'}${formatCurrency(Math.abs(monthDatum.delta))}) minus the recorded capital flows (${monthDatum.net - monthDatum.growth + monthDatum.losses >= 0 ? '+' : '−'}${formatCurrency(Math.abs(monthDatum.net - monthDatum.growth + monthDatum.losses))}) — the residual is this bucket.`}
                            </div>
                          )}
                        </div>
                      );
                    })}

                  {/* Net total row */}
                  <div className="flex justify-between p-3 bg-primary/[0.03] font-semibold text-foreground border-t border-border">
                    <span>Net change</span>
                    <span className={`font-mono blur-number ${monthDatum.net >= 0 ? 'text-chart-1' : 'text-destructive'}`}>
                      {monthDatum.net >= 0 ? '+' : '−'}
                      {formatCurrency(Math.abs(monthDatum.net))}
                    </span>
                  </div>
                </div>
              </div>

              {/* Non-cash activity (trades, reinvests, transfers) for context */}
              {(groups.trades.length > 0 || groups.reinvested.length > 0 || groups.transfers.length > 0) && (
                <div className="space-y-1.5 text-xs">
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Internal activity (not counted in the buckets)
                  </div>
                  {groups.trades.length > 0 && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <ArrowRightLeft className="w-3 h-3 shrink-0" />
                      <span>
                        {groups.trades.length} trade{groups.trades.length > 1 ? 's' : ''} — internal reallocations, no net cash impact
                      </span>
                    </div>
                  )}
                  {groups.reinvested.length > 0 && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <CircleDollarSign className="w-3 h-3 shrink-0" />
                      <span>
                        <span className="font-semibold text-foreground blur-number">{formatCurrency(groups.reinvested.reduce((s, t) => s + Math.abs(t.amount), 0))}</span> reinvested (excluded from income to avoid double counting)
                      </span>
                    </div>
                  )}
                  {groups.transfers.length > 0 && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <ArrowDownCircle className="w-3 h-3 shrink-0" />
                      <span>{groups.transfers.length} transfer{groups.transfers.length > 1 ? 's' : ''}</span>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Formula + deep link into the raw feed */}
          <div className="text-xs text-muted-foreground bg-muted/30 border border-border/20 rounded-xl p-3 flex items-start gap-2 leading-relaxed">
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground/60" />
            <span>
              <strong>How this is computed:</strong> Net change = contributions − withdrawals + income + growth − losses. Growth &amp; losses are derived from balance{' '}
              {hasSnapshots ? 'snapshots' : 'changes'} (measured balance change minus recorded flows), so anything the classifier missed lands here
              {monthDatum.delta === null && ', though this month has no snapshots so it defaults to zero'}.
            </span>
          </div>

          <a
            href={buildTransactionsDeepLink(startDay, endExclusive)}
            className="flex items-center justify-center gap-1.5 w-full text-xs font-semibold text-primary hover:text-primary/80 bg-primary/5 hover:bg-primary/10 border border-primary/10 rounded-lg py-2 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" /> View every transaction in {formatMonthLong(month)}
          </a>
        </div>
      </div>
    </div>
  );
}
