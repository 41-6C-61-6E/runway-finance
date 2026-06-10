'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useCardCollapsed } from '@/lib/hooks/use-card-collapsed';
import { CollapsibleCardHeader } from '@/components/ui/collapsible-card-header';
import { CollapsibleFilterPanel } from '@/components/ui/collapsible-filter-panel';
import { TimeRangeFilter, type TimeRange } from '@/components/charts/chart-filters';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { formatCurrency } from '@/lib/utils/format';
import { formatSafeUTCDate, getChartXTicks } from '@/lib/utils/date';
import { ChartTooltip, TooltipRow, TooltipHeader } from '@/components/charts/chart-tooltip';
import { ChartEmptyState } from '@/components/charts/chart-empty-state';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { TrendingUp, Activity, ArrowUpRight, ArrowDownRight } from 'lucide-react';

interface HistoryPoint {
  date: string;
  value: number;
}

interface HistoryResponse {
  data: HistoryPoint[];
  summary: {
    current: number;
    previous: number;
    change: number;
    percentChange: number;
  };
}

export function PerformanceChart() {
  const [isCollapsed, setIsCollapsed] = useCardCollapsed('performanceChart');
  const [timeframe, setTimeframe] = useState<TimeRange>('1y');
  const [chartData, setChartData] = useState<HistoryPoint[]>([]);
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

  const yDomain = useMemo(() => {
    if (chartData.length === 0) return [0, 1000] as [number, number];
    const values = chartData.map((d) => d.value);
    const rawMax = Math.max(...values);
    const rawMin = Math.min(...values);
    const range = rawMax - rawMin;
    const pad = range === 0 ? 1000 : range * 0.08;
    const minPad = Math.max(pad, 1000);
    // Keep lower bound at 0 if min is positive to make chart look better, unless there's a big offset
    const lowerBound = rawMin - minPad < 0 ? 0 : rawMin - minPad;
    return [lowerBound, rawMax + minPad] as [number, number];
  }, [chartData]);

  const gradientOffset = useMemo(() => {
    if (chartData.length === 0) return 1;
    const values = chartData.map((d) => d.value);
    const rawMax = Math.max(...values);
    const rawMin = Math.min(...values);
    if (rawMax <= 0) return 0;
    if (rawMin >= 0) return 1;
    return rawMax / (rawMax - rawMin);
  }, [chartData]);

  const baseValue = useMemo(() => {
    if (gradientOffset === 1) return yDomain[0];
    if (gradientOffset === 0) return yDomain[1];
    return 0;
  }, [gradientOffset, yDomain]);

  const xTicks = useMemo(() => getChartXTicks(chartData, timeframe), [chartData, timeframe]);

  const formatXTick = useCallback((d: string) => {
    if (!d) return '';
    if (timeframe === '1m') {
      return formatSafeUTCDate(d, { month: 'short', day: 'numeric' });
    }
    if (timeframe === '5y' || timeframe === 'all') {
      return formatSafeUTCDate(d, { year: 'numeric' });
    }
    return formatSafeUTCDate(d, { month: 'short', year: '2-digit' });
  }, [timeframe]);

  const formatYTick = useCallback((v: number) => {
    const absV = Math.abs(v);
    const sign = v < 0 ? '-' : '';
    if (absV >= 1000000) return `${sign}$${(absV / 1000000).toFixed(1)}M`;
    if (absV >= 1000) return `${sign}$${(absV / 1000).toFixed(0)}K`;
    if (absV === 0) return '$0';
    return `${sign}$${absV.toFixed(0)}`;
  }, []);

  const CustomTooltip = useCallback(({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null;
    const point = payload[0].payload;
    return (
      <ChartTooltip>
        <TooltipHeader>{formatSafeUTCDate(point.date, { month: 'short', day: 'numeric', year: 'numeric' })}</TooltipHeader>
        <TooltipRow
          label="Portfolio Value"
          value={formatCurrency(point.value)}
          color="var(--color-chart-1)"
        />
      </ChartTooltip>
    );
  }, []);

  const ActiveDot = useCallback((props: any) => {
    const { cx, cy } = props;
    if (!cx || !cy) return null;
    return (
      <circle
        cx={cx}
        cy={cy}
        r={4}
        fill="var(--color-chart-1)"
        stroke="var(--color-chart-1)"
        strokeWidth={1}
      />
    );
  }, []);

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm">
        <CollapsibleCardHeader
          isCollapsed={isCollapsed}
          onToggle={setIsCollapsed}
          title={
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary shrink-0" />
              <span>Portfolio History</span>
            </div>
          }
        />
        {!isCollapsed && <LoadingSpinner category="chart" className="h-[240px] m-5" />}
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm">
        <CollapsibleCardHeader
          isCollapsed={isCollapsed}
          onToggle={setIsCollapsed}
          title={
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary shrink-0" />
              <span>Portfolio History</span>
            </div>
          }
        />
        {!isCollapsed && (
          <div className="p-5">
            <ChartEmptyState variant="error" error={error} />
          </div>
        )}
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm">
        <CollapsibleCardHeader
          isCollapsed={isCollapsed}
          onToggle={setIsCollapsed}
          title={
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary shrink-0" />
              <span>Portfolio History</span>
            </div>
          }
        />
        {!isCollapsed && (
          <div className="p-5">
            <ChartEmptyState variant="nodata" description="Portfolio history trend will appear once you link investment accounts" />
          </div>
        )}
      </div>
    );
  }

  const isChangePositive = summary ? summary.change >= 0 : false;

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm">
      <CollapsibleCardHeader
        isCollapsed={isCollapsed}
        onToggle={setIsCollapsed}
        title={
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary shrink-0" />
            <span>Portfolio History</span>
          </div>
        }
      />
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
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Timeframe</span>
              <TimeRangeFilter value={timeframe} onChange={setTimeframe} />
            </div>
          </CollapsibleFilterPanel>

          <div className="flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-border">
            {/* Chart Area */}
            <div className="flex-1 min-w-0 p-4 sm:p-5">
              <div className="h-[200px] sm:h-[260px] w-full relative">
                <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 100, height: 100 }}>
                  <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="portfolioHistoryGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0} />
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
                      cursor={{ stroke: 'var(--color-chart-1)', strokeWidth: 1, strokeDasharray: '2 2', opacity: 0.5 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke="var(--color-chart-1)"
                      strokeWidth={2}
                      fill="url(#portfolioHistoryGrad)"
                      baseValue={baseValue}
                      dot={false}
                      activeDot={<ActiveDot />}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Performance Stats Panel */}
            {summary && (
              <div className="w-full md:w-64 shrink-0 p-4 sm:p-5 flex flex-col justify-center space-y-4">
                <div>
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Timeframe Change</span>
                  <div className={`flex items-baseline gap-1 font-bold text-2xl ${isChangePositive ? 'text-chart-1' : 'text-destructive'}`}>
                    <span>{isChangePositive ? '+' : ''}</span>
                    <span className="financial-value">{formatCurrency(summary.change)}</span>
                  </div>
                  <div className={`flex items-center gap-0.5 text-xs font-semibold mt-0.5 ${isChangePositive ? 'text-chart-1' : 'text-destructive'}`}>
                    {isChangePositive ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                    <span className="financial-value">{summary.percentChange.toFixed(2)}%</span>
                  </div>
                </div>

                <div className="border-t border-border/60 pt-3.5 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Starting Value:</span>
                    <span className="font-semibold text-foreground financial-value">{formatCurrency(summary.previous)}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Ending Value:</span>
                    <span className="font-semibold text-foreground financial-value">{formatCurrency(summary.current)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
