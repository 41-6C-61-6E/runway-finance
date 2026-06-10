'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useCardCollapsed } from '@/lib/hooks/use-card-collapsed';
import { CollapsibleCardHeader } from '@/components/ui/collapsible-card-header';
import { CollapsibleFilterPanel } from '@/components/ui/collapsible-filter-panel';
import { TimeRangeFilter, type TimeRange } from '@/components/charts/chart-filters';
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
import { formatCurrency } from '@/lib/utils/format';
import { formatSafeUTCDate, getChartXTicks } from '@/lib/utils/date';
import { ChartTooltip, TooltipRow, TooltipHeader } from '@/components/charts/chart-tooltip';
import { ChartEmptyState } from '@/components/charts/chart-empty-state';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Activity, ArrowUpRight, ArrowDownRight, DollarSign, Percent } from 'lucide-react';

interface HistoryPoint {
  date: string;
  value: number;
  benchmark?: number; // SPY % normalized
  portfolioPct?: number; // portfolio % normalized from start
}

interface HistoryResponse {
  data: { date: string; value: number }[];
  summary: {
    current: number;
    previous: number;
    change: number;
    percentChange: number;
  };
}

interface BenchmarkPoint {
  date: string;
  close: number;
}

type DisplayMode = 'dollar' | 'percent';

async function fetchBenchmark(timeframe: TimeRange): Promise<BenchmarkPoint[]> {
  try {
    const rangeMap: Record<TimeRange, string> = {
      '1m': '1mo', '3m': '3mo', '6m': '6mo', '1y': '1y',
      '5y': '5y', 'ytd': 'ytd', 'all': '10y',
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
  const [isCollapsed, setIsCollapsed] = useCardCollapsed('performanceChart');
  const [timeframe, setTimeframe] = useState<TimeRange>('1y');
  const [displayMode, setDisplayMode] = useState<DisplayMode>('dollar');
  const [showBenchmark, setShowBenchmark] = useState(false);
  const [chartData, setChartData] = useState<{ date: string; value: number }[]>([]);
  const [benchmarkData, setBenchmarkData] = useState<BenchmarkPoint[]>([]);
  const [summary, setSummary] = useState<HistoryResponse['summary'] | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  // Build merged chart data with optional % normalization and benchmark
  const mergedData = useMemo((): HistoryPoint[] => {
    if (chartData.length === 0) return [];

    const baseValue = chartData[0]?.value ?? 0;

    // Build a date-indexed map for benchmark
    const benchMap = new Map<string, number>();
    if (benchmarkData.length > 0) {
      const benchBase = benchmarkData[0]?.close ?? 0;
      for (const b of benchmarkData) {
        benchMap.set(b.date, benchBase > 0 ? ((b.close - benchBase) / benchBase) * 100 : 0);
      }
    }

    return chartData.map((d) => {
      const portfolioPct = baseValue > 0 ? ((d.value - baseValue) / baseValue) * 100 : 0;
      const benchmark = benchMap.get(d.date);
      return {
        date: d.date,
        value: d.value,
        portfolioPct,
        ...(benchmark !== undefined ? { benchmark } : {}),
      };
    });
  }, [chartData, benchmarkData]);

  const yDomain = useMemo((): [number, number] => {
    if (mergedData.length === 0) return [0, 1000];

    if (displayMode === 'percent') {
      const pcts = mergedData.map((d) => d.portfolioPct ?? 0);
      const benchPcts = showBenchmark ? mergedData.map((d) => d.benchmark ?? 0) : [];
      const all = [...pcts, ...benchPcts];
      const rawMin = Math.min(...all);
      const rawMax = Math.max(...all);
      const pad = Math.max(Math.abs(rawMax - rawMin) * 0.1, 2);
      return [rawMin - pad, rawMax + pad];
    }

    const values = mergedData.map((d) => d.value);
    const rawMax = Math.max(...values);
    const rawMin = Math.min(...values);
    const range = rawMax - rawMin;
    const pad = range === 0 ? 1000 : Math.max(range * 0.08, 1000);
    const lowerBound = rawMin - pad < 0 ? 0 : rawMin - pad;
    return [lowerBound, rawMax + pad];
  }, [mergedData, displayMode, showBenchmark]);

  const xTicks = useMemo(() => getChartXTicks(mergedData, timeframe), [mergedData, timeframe]);

  const formatXTick = useCallback((d: string) => {
    if (!d) return '';
    if (timeframe === '1m') return formatSafeUTCDate(d, { month: 'short', day: 'numeric' });
    if (timeframe === '5y' || timeframe === 'all') return formatSafeUTCDate(d, { year: 'numeric' });
    return formatSafeUTCDate(d, { month: 'short', year: '2-digit' });
  }, [timeframe]);

  const formatYTick = useCallback((v: number) => {
    if (displayMode === 'percent') return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
    const absV = Math.abs(v);
    const sign = v < 0 ? '-' : '';
    if (absV >= 1_000_000) return `${sign}$${(absV / 1_000_000).toFixed(1)}M`;
    if (absV >= 1_000) return `${sign}$${(absV / 1_000).toFixed(0)}K`;
    if (absV === 0) return '$0';
    return `${sign}$${absV.toFixed(0)}`;
  }, [displayMode]);

  const CustomTooltip = useCallback(({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const point = payload[0]?.payload as HistoryPoint;
    return (
      <ChartTooltip>
        <TooltipHeader>{formatSafeUTCDate(point.date, { month: 'short', day: 'numeric', year: 'numeric' })}</TooltipHeader>
        <TooltipRow
          label="Portfolio"
          value={displayMode === 'percent'
            ? `${(point.portfolioPct ?? 0) >= 0 ? '+' : ''}${(point.portfolioPct ?? 0).toFixed(2)}%`
            : formatCurrency(point.value)}
          color="var(--color-chart-1)"
        />
        {showBenchmark && point.benchmark !== undefined && (
          <TooltipRow
            label="SPY (Benchmark)"
            value={`${point.benchmark >= 0 ? '+' : ''}${point.benchmark.toFixed(2)}%`}
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

  const portfolioKey = displayMode === 'percent' ? 'portfolioPct' : 'value';
  const portfolioColor = 'var(--color-chart-1)';
  const benchmarkColor = 'var(--color-chart-3)';

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm">
      <CollapsibleCardHeader isCollapsed={isCollapsed} onToggle={setIsCollapsed} title={headerEl} />
      {!isCollapsed && (
        <>
          <CollapsibleFilterPanel
            isOpen={showFilters}
            onToggle={() => setShowFilters(!showFilters)}
            feedback={
              <span className="bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider">
                {timeframe.toUpperCase()}
              </span>
            }
          >
            <div className="flex flex-wrap items-center gap-4">
              {/* Timeframe */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Timeframe</span>
                <TimeRangeFilter value={timeframe} onChange={setTimeframe} />
              </div>

              {/* Display mode */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Mode</span>
                <div className="flex bg-muted/65 border border-border rounded-lg p-0.5">
                  {([
                    { value: 'dollar' as DisplayMode, icon: DollarSign, label: '$' },
                    { value: 'percent' as DisplayMode, icon: Percent, label: '%' },
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

          <div className="flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-border">
            {/* Chart Area */}
            <div className="flex-1 min-w-0 p-4 sm:p-5">
              <div className="h-[200px] sm:h-[280px] w-full relative">
                <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 100, height: 100 }}>
                  <AreaChart data={mergedData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
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
              <div className="w-full md:w-60 shrink-0 p-4 sm:p-5 flex flex-col justify-center space-y-4">
                <div>
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
                    {timeframe.toUpperCase()} Change
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
