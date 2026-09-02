'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useCardCollapsed } from '@/lib/hooks/use-card-collapsed';
import { CollapsibleCardHeader } from '@/components/ui/collapsible-card-header';
import { CollapsibleFilterPanel } from '@/components/ui/collapsible-filter-panel';
import type { TimeRange } from '@/components/charts/chart-filters';
import { ChartTimeframeBar } from '@/components/charts/chart-timeframe-bar';
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { formatCurrency, formatPercent } from '@/lib/utils/format';
import { usePrivacyMode } from '@/components/privacy-mode-provider';
import { formatSafeUTCDate } from '@/lib/utils/date';
import { formatChartYAxisCurrency, formatChartXAxisDate, getChartXTicksUnified, formatChartDateRange } from '@/lib/utils/chart-format';
import { computeMovingAverage, computeMedianFilter } from '@/lib/utils/chart-aggregation';
import { ChartTooltip, TooltipRow, TooltipHeader } from '@/components/charts/chart-tooltip';
import { ChartEmptyState } from '@/components/charts/chart-empty-state';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Activity, ArrowUpRight, ArrowDownRight, DollarSign, Percent, Info } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';

interface HistoryPoint {
  date: string;
  value: number;
  twr?: number; // Time-weighted return %
  benchmark?: number; // SPY % normalized
  portfolioPct?: number; // portfolio % normalized from start
}

interface HistoryResponse {
  data: { date: string; value: number; twr?: number }[];
  summary: {
    current: number;
    previous: number;
    change: number;
    percentChange: number;
    twrPct?: number;
  };
}

interface BenchmarkPoint {
  date: string;
  close: number;
}

type DisplayMode = 'dollar' | 'percent' | 'twr';

async function fetchBenchmark(timeframe: TimeRange): Promise<BenchmarkPoint[]> {
  try {
    const rangeMap: Record<string, string> = {
      '1d': '1d', '7d': '5d', '30d': '1mo', '365d': '1y',
      '1m': '1mo', '3m': '3mo', '6m': '6mo', '1y': '1y',
      '3y': '3y', '5y': '5y', 'ytd': 'ytd', 'all': '10y',
      '1d_discrete': '1d',
      '7d_discrete': '5d',
    };
    const range = rangeMap[timeframe] || '1y';
    const url = `/api/investments/quotes/benchmark?ticker=SPY&range=${range}`;
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) return [];
    const json = await res.json();
    return json.points ?? [];
  } catch {
    return [];
  }
}

export function PerformanceChart() {
  const { privacyMode } = usePrivacyMode();
  const [isCollapsed, setIsCollapsed] = useCardCollapsed('performanceChart');
  const [timeframe, setTimeframe] = useState<TimeRange>('1y');
  const [displayMode, setDisplayMode] = useState<DisplayMode>('dollar');
  const [showBenchmark, setShowBenchmark] = useState(false);
  const [chartData, setChartData] = useState<{ date: string; value: number; twr?: number }[]>([]);
  const [benchmarkData, setBenchmarkData] = useState<BenchmarkPoint[]>([]);
  const [summary, setSummary] = useState<HistoryResponse['summary'] | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`/api/investments/history?timeframe=${timeframe}`, {
          credentials: 'include',
        });
        if (!res.ok) throw new Error('Failed to fetch historical performance data');
        const json: HistoryResponse = await res.json();
        setChartData(json.data || []);
        setSummary(json.summary || null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [timeframe]);

  useEffect(() => {
    if (showBenchmark) {
      fetchBenchmark(timeframe).then(setBenchmarkData);
    }
  }, [showBenchmark, timeframe]);

  const smoothedChartData = useMemo(() => {
    if (chartData.length === 0) return [];

    const getMaxSpikeDuration = (range: TimeRange): number => {
      switch (range) {
        case '1m': return 1;
        case '3m': return 1.5;
        case '6m': return 3;
        case '1y': return 4;
        case '3y': return 5;
        case 'ytd': return 4;
        case '5y': return 7;
        case 'all': return 14;
        default: return 3;
      }
    };

    const getMaxSmaDuration = (range: TimeRange): number => {
      switch (range) {
        case '1m': return 0;
        case '3m': return 0;
        case '6m': return 4;
        case '1y': return 7;
        case '3y': return 14;
        case 'ytd': return 7;
        case '5y': return 30;
        case 'all': return 45;
        default: return 7;
      }
    };

    const first = new Date(chartData[0].date + 'T00:00:00Z').getTime();
    const last = new Date(chartData[chartData.length - 1].date + 'T00:00:00Z').getTime();
    const totalDays = (last - first) / (1000 * 60 * 60 * 24);
    const gap = chartData.length > 1 ? totalDays / (chartData.length - 1) : 1;

    const targetSpikeDays = getMaxSpikeDuration(timeframe);
    const targetPoints = Math.ceil(targetSpikeDays / (gap || 1));
    const windowSize = 2 * targetPoints + 1;

    const maxAllowed = Math.floor(chartData.length * 0.15);
    const finalWindow = Math.min(windowSize, maxAllowed % 2 === 0 ? maxAllowed + 1 : maxAllowed);
    const medianWindow = Math.max(1, finalWindow % 2 === 0 ? finalWindow - 1 : finalWindow);

    const targetSmaDays = getMaxSmaDuration(timeframe);
    const smaTargetPoints = Math.round(targetSmaDays / (gap || 1));
    const maxSmaAllowed = Math.floor(chartData.length * 0.15);
    const finalSmaWindow = Math.min(smaTargetPoints, maxSmaAllowed);
    const smaWindow = Math.max(1, finalSmaWindow);

    const fields: ('value' | 'twr')[] = ['value'];
    if (chartData.some(d => d.twr !== undefined)) {
      fields.push('twr');
    }
    const medianFiltered = computeMedianFilter(chartData as any, fields, medianWindow);

    if (smaWindow > 1) {
      return computeMovingAverage(medianFiltered, fields, smaWindow);
    }
    return medianFiltered;
  }, [chartData, timeframe]);

  // Build merged chart data with optional % normalization and benchmark
  const mergedData = useMemo((): HistoryPoint[] => {
    if (smoothedChartData.length === 0) return [];

    const baseValue = smoothedChartData[0]?.value ?? 0;

    // Build a date-indexed map for benchmark
    const benchMap = new Map<string, number>();
    if (benchmarkData.length > 0) {
      const benchBase = benchmarkData[0]?.close ?? 0;
      for (const b of benchmarkData) {
        benchMap.set(b.date, benchBase > 0 ? ((b.close - benchBase) / benchBase) * 100 : 0);
      }
    }

    return smoothedChartData.map((d: any) => {
      const portfolioPct = baseValue > 0 ? ((d.value - baseValue) / baseValue) * 100 : 0;
      const benchmarkPct = benchMap.get(d.date);
      // In dollar mode, map benchmark to equivalent indexed dollar value: baseValue * (1 + benchmarkPct / 100)
      const benchmarkVal = benchmarkPct !== undefined ? baseValue * (1 + benchmarkPct / 100) : undefined;
      const benchmark = displayMode === 'dollar' ? benchmarkVal : benchmarkPct;

      return {
        date: d.date,
        value: d.value,
        twr: d.twr ?? 0,
        portfolioPct,
        ...(benchmark !== undefined ? { benchmark, benchmarkPct } : {}),
      } as HistoryPoint & { benchmarkPct?: number };
    });
  }, [smoothedChartData, benchmarkData, displayMode]);

  const yDomain = useMemo((): [number, number] => {
    if (mergedData.length === 0) return [0, 1000];

    if (displayMode === 'twr') {
      const twrs = mergedData.map((d) => d.twr ?? 0);
      const benchPcts = showBenchmark ? mergedData.map((d: any) => d.benchmarkPct ?? 0) : [];
      const all = [...twrs, ...benchPcts];
      const rawMin = Math.min(...all);
      const rawMax = Math.max(...all);
      const pad = Math.max(Math.abs(rawMax - rawMin) * 0.1, 2);
      return [rawMin - pad, rawMax + pad];
    }

    if (displayMode === 'percent') {
      const pcts = mergedData.map((d) => d.portfolioPct ?? 0);
      const benchPcts = showBenchmark ? mergedData.map((d: any) => d.benchmarkPct ?? 0) : [];
      const all = [...pcts, ...benchPcts];
      const rawMin = Math.min(...all);
      const rawMax = Math.max(...all);
      const pad = Math.max(Math.abs(rawMax - rawMin) * 0.1, 2);
      return [rawMin - pad, rawMax + pad];
    }

    const values = mergedData.map((d) => d.value);
    const benchVals = showBenchmark ? mergedData.map((d) => d.benchmark ?? d.value) : [];
    const all = [...values, ...benchVals];
    const rawMax = Math.max(...all);
    const rawMin = Math.min(...all);
    const range = rawMax - rawMin;
    const pad = range === 0 ? 1000 : Math.max(range * 0.08, 1000);
    const lowerBound = rawMin - pad < 0 ? 0 : rawMin - pad;
    return [lowerBound, rawMax + pad];
  }, [mergedData, displayMode, showBenchmark]);

  const xTicks = useMemo(() => getChartXTicksUnified(mergedData, timeframe, isMobile, 'date'), [mergedData, timeframe, isMobile]);

  const formatXTick = useCallback((d: string) => {
    return formatChartXAxisDate(d, timeframe, { isMonthly: timeframe !== '1m' });
  }, [timeframe]);

  const formatYTick = useCallback((v: number) => {
    if (displayMode === 'percent' || displayMode === 'twr') return formatPercent(v, 1);
    return formatChartYAxisCurrency(v, yDomain[0], yDomain[1]);
  }, [displayMode, yDomain]);

  const CustomTooltip = useCallback(({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const point = payload[0]?.payload as HistoryPoint & { benchmarkPct?: number };
    const getPortfolioVal = () => {
      if (displayMode === 'twr') {
        return `${(point.twr ?? 0) >= 0 ? '+' : ''}${(point.twr ?? 0).toFixed(2)}% (TWR)`;
      }
      if (displayMode === 'percent') {
        return `${(point.portfolioPct ?? 0) >= 0 ? '+' : ''}${(point.portfolioPct ?? 0).toFixed(2)}%`;
      }
      return formatCurrency(point.value);
    };

    return (
      <ChartTooltip>
        <TooltipHeader>{formatSafeUTCDate(point.date, { month: 'short', day: 'numeric', year: 'numeric' })}</TooltipHeader>
        <TooltipRow
          label={displayMode === 'twr' ? 'Portfolio TWR' : 'Portfolio'}
          value={getPortfolioVal()}
          color="var(--color-chart-1)"
        />
        {showBenchmark && point.benchmarkPct !== undefined && (
          <TooltipRow
            label="SPY (Benchmark)"
            value={displayMode === 'percent' || displayMode === 'twr'
              ? `${point.benchmarkPct >= 0 ? '+' : ''}${point.benchmarkPct.toFixed(2)}%`
              : `${formatCurrency(point.benchmark!)} (${point.benchmarkPct >= 0 ? '+' : ''}${point.benchmarkPct.toFixed(2)}%)`}
            color="var(--color-chart-3)"
          />
        )}
      </ChartTooltip>
    );
  }, [displayMode, showBenchmark]);

  const isChangePositive = summary ? summary.change >= 0 : false;

  const headerEl = (
    <div className="flex items-center gap-2">
      <Activity className="w-4 h-4 text-primary shrink-0" />
      <span>Portfolio History</span>
    </div>
  );

  const srSummary = useMemo(() => {
    if (!summary) return '';
    const isChangePositive = summary.change >= 0;
    const direction = isChangePositive ? 'increased' : 'decreased';
    return `Portfolio value is currently ${formatCurrency(summary.current)} as of latest. Over the selected ${timeframe} timeframe, it has ${direction} by ${formatCurrency(Math.abs(summary.change))} (${summary.percentChange.toFixed(2)}%), starting from ${formatCurrency(summary.previous)}.`;
  }, [summary, timeframe]);

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm">
        <CollapsibleCardHeader isCollapsed={isCollapsed} onToggle={setIsCollapsed} title={headerEl} />
        {!isCollapsed && <LoadingSpinner category="chart" className="h-[240px] m-5" />}
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm">
        <CollapsibleCardHeader isCollapsed={isCollapsed} onToggle={setIsCollapsed} title={headerEl} />
        {!isCollapsed && <div className="p-5"><ChartEmptyState variant="error" error={error} /></div>}
      </div>
    );
  }

  if (mergedData.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm">
        <CollapsibleCardHeader isCollapsed={isCollapsed} onToggle={setIsCollapsed} title={headerEl} />
        {!isCollapsed && (
          <div className="p-5">
            <ChartEmptyState variant="nodata" description="Portfolio history will appear once you link investment accounts" />
          </div>
        )}
      </div>
    );
  }

  const portfolioKey = displayMode === 'twr' ? 'twr' : (displayMode === 'percent' ? 'portfolioPct' : 'value');
  const portfolioColor = 'var(--color-chart-1)';
  const benchmarkColor = 'var(--color-chart-3)';

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
      {!privacyMode && (
        <div className="sr-only" aria-live="polite">
          {srSummary}
        </div>
      )}
      <CollapsibleCardHeader isCollapsed={isCollapsed} onToggle={setIsCollapsed} title={headerEl} />
      {!isCollapsed && (
        <>
          <CollapsibleFilterPanel
            isOpen={showFilters}
            onToggle={() => setShowFilters(!showFilters)}
          >
            <div className="flex flex-wrap items-center gap-4">

              {/* Display mode */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Mode</span>
                <div className="flex bg-muted/65 border border-border rounded-lg p-0.5">
                  {([
                    { value: 'dollar' as DisplayMode, icon: DollarSign, label: '$' },
                    { value: 'percent' as DisplayMode, icon: Percent, label: '%' },
                    { value: 'twr' as DisplayMode, icon: Percent, label: 'TWR' },
                  ]).map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setDisplayMode(opt.value)}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                        displayMode === opt.value
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <opt.icon className="w-3 h-3" />
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Benchmark toggle */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Benchmark</span>
                <button
                  onClick={() => setShowBenchmark(!showBenchmark)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all border ${
                    showBenchmark
                      ? 'bg-chart-3/20 text-chart-3 border-chart-3/30'
                      : 'bg-muted text-muted-foreground border-border hover:text-foreground'
                  }`}
                >
                  SPY
                </button>
              </div>
            </div>
          </CollapsibleFilterPanel>
          <ChartTimeframeBar value={timeframe} onChange={setTimeframe} />

          <div className="flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-border">
            {/* Chart Area */}
            <div className="flex-1 min-w-0 p-3 sm:p-5">
              <div className="h-[190px] sm:h-[280px] w-full relative">
                <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 100, height: 100 }}>
                  <AreaChart role="img" aria-label="Portfolio History Area Chart" data={mergedData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="portfolioHistoryGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={portfolioColor} stopOpacity={0.3} />
                        <stop offset="100%" stopColor={portfolioColor} stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="benchmarkGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={benchmarkColor} stopOpacity={0.12} />
                        <stop offset="100%" stopColor={benchmarkColor} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} opacity={0.3} />
                    <XAxis
                      dataKey="date"
                      tickLine={false}
                      axisLine={{ stroke: 'var(--color-border)' }}
                      tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
                      ticks={xTicks}
                      tickFormatter={formatXTick}
                      minTickGap={30}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={{ stroke: 'var(--color-border)' }}
                      tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
                      domain={yDomain}
                      tickFormatter={formatYTick}
                    />
                    <RechartsTooltip
                      content={<CustomTooltip />}
                      cursor={{ stroke: portfolioColor, strokeWidth: 1, strokeDasharray: '2 2', opacity: 0.5 }}
                      wrapperStyle={{ pointerEvents: 'none' }}
                    />
                    {/* Portfolio area */}
                    <Area
                      type="monotone"
                      dataKey={portfolioKey}
                      stroke={portfolioColor}
                      strokeWidth={2}
                      fill="url(#portfolioHistoryGrad)"
                      dot={false}
                      activeDot={{ r: 4, fill: portfolioColor, stroke: portfolioColor, strokeWidth: 1 }}
                    />
                    {/* Benchmark overlay (% only makes sense) */}
                    {showBenchmark && (
                      <Area
                        type="monotone"
                        dataKey="benchmark"
                        stroke={benchmarkColor}
                        strokeWidth={1.5}
                        strokeDasharray="4 2"
                        fill="url(#benchmarkGrad)"
                        dot={false}
                        activeDot={{ r: 3, fill: benchmarkColor, stroke: benchmarkColor }}
                      />
                    )}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              {showBenchmark && (
                <div className="flex items-center gap-4 mt-2 text-[10px] text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-0.5 rounded" style={{ background: portfolioColor }} />
                    <span>Your Portfolio</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-0.5 rounded border-t border-dashed" style={{ borderColor: benchmarkColor }} />
                    <span>SPY (S&P 500)</span>
                  </div>
                </div>
              )}
            </div>

            {/* Stats Panel */}
            {summary && (
              <div className="w-full md:w-60 shrink-0 p-3 sm:p-5 flex flex-col justify-center space-y-4">
                <div>
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
                    {timeframe === '1d_discrete' ? '1D' : (timeframe === '7d_discrete' ? '7D' : timeframe.toUpperCase())} Change
                  </span>
                  <div className={`flex items-baseline gap-1 font-bold text-2xl ${isChangePositive ? 'text-chart-1' : 'text-destructive'}`}>
                    <span>{isChangePositive ? '+' : ''}</span>
                    <span className="financial-value blur-number">{formatCurrency(summary.change)}</span>
                  </div>
                  <div className={`flex items-center gap-0.5 text-xs font-semibold mt-0.5 ${isChangePositive ? 'text-chart-1' : 'text-destructive'}`}>
                    {isChangePositive
                      ? <ArrowUpRight className="w-3.5 h-3.5" />
                      : <ArrowDownRight className="w-3.5 h-3.5" />
                    }
                    <span className="financial-value blur-number">{summary.percentChange.toFixed(2)}%</span>
                  </div>
                </div>

                <div className="border-t border-border/60 pt-3.5 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Starting Value:</span>
                    <span className="font-semibold text-foreground financial-value blur-number">{formatCurrency(summary.previous)}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Ending Value:</span>
                    <span className="font-semibold text-foreground financial-value blur-number">{formatCurrency(summary.current)}</span>
                  </div>
                  {summary.twrPct !== undefined && (
                    <div className="flex items-center justify-between text-xs">
                      <TooltipProvider delayDuration={150}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="flex items-center gap-1 text-muted-foreground hover:text-foreground cursor-help transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded"
                              aria-label="Portfolio Time-Weighted Return explanation and calculation"
                            >
                              <span className="underline decoration-dotted underline-offset-2">Portfolio TWR:</span>
                              <Info className="w-3.5 h-3.5 text-muted-foreground/70 shrink-0" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="left" align="center" className="max-w-xs sm:max-w-sm p-3.5 space-y-2 text-xs">
                            <div className="flex items-center justify-between border-b border-border/50 pb-1.5 font-semibold text-foreground">
                              <span>Time-Weighted Return (TWR)</span>
                              <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary font-bold">
                                Metric Guide
                              </span>
                            </div>
                            <div className="space-y-1.5 text-muted-foreground leading-relaxed">
                              <p>
                                <strong className="text-foreground">What it is:</strong> Measures true portfolio performance over time by removing the distorting impact of cash deposits, transfers, and withdrawals.
                              </p>
                              <p>
                                <strong className="text-foreground">Calculation:</strong> Evaluates daily sub-period returns between cash flows:
                              </p>
                              <div className="bg-muted/60 border border-border/50 rounded p-1.5 font-mono text-[11px] text-foreground text-center">
                                r<sub>t</sub> = (Ending Val - Net Cash Flow) / Beginning Val - 1
                              </div>
                              <p className="text-[11px]">
                                Daily factors are compounded across the timeframe: <span className="font-mono text-foreground">∏(1 + r<sub>t</sub>) - 1</span>.
                              </p>
                              <p>
                                <strong className="text-foreground">What the number means:</strong>
                              </p>
                              <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
                                <li>
                                  <span className="text-chart-1 font-medium">Positive (+%)</span> indicates net investment growth from market performance.
                                </li>
                                <li>
                                  <span className="text-destructive font-medium">Negative (-%)</span> indicates net investment losses.
                                </li>
                                <li>
                                  Deposits won&apos;t artificially inflate your return, and withdrawals won&apos;t penalize it—providing an accurate comparison against benchmarks like SPY.
                                </li>
                              </ul>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <span className={`font-semibold financial-value blur-number ${summary.twrPct >= 0 ? 'text-chart-1' : 'text-destructive'}`}>
                        {summary.twrPct >= 0 ? '+' : ''}{summary.twrPct.toFixed(2)}%
                      </span>
                    </div>
                  )}
                  {displayMode === 'twr' && (
                    <div className="flex items-center justify-between text-xs pt-1 border-t border-border/40">
                      <span className="text-muted-foreground">Mode:</span>
                      <span className="font-semibold text-primary">Time-Weighted Return</span>
                    </div>
                  )}
                  {displayMode === 'percent' && (
                    <div className="flex items-center justify-between text-xs pt-1 border-t border-border/40">
                      <span className="text-muted-foreground">Mode:</span>
                      <span className="font-semibold text-primary">% Normalized</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
