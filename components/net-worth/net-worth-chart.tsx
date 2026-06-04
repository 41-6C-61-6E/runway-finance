'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { usePersistentState } from '@/lib/hooks/use-persistent-state';
import { useCardCollapsed } from '@/lib/hooks/use-card-collapsed';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { formatCurrency } from '@/lib/utils/format';
import { formatSafeUTCDate, getChartXTicks } from '@/lib/utils/date';
import {
  computeMovingAverage,
  computeMedianFilter,
  aggregateChartData,
} from '@/lib/utils/chart-aggregation';
import { ChartTooltip, TooltipRow, TooltipHeader } from '@/components/charts/chart-tooltip';
import { ChartEmptyState } from '@/components/charts/chart-empty-state';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { TimeRangeFilter, type TimeRange } from '@/components/charts/chart-filters';
import { CollapsibleCardHeader } from '@/components/ui/collapsible-card-header';
import { CollapsibleFilterPanel } from '@/components/ui/collapsible-filter-panel';
import { Activity, TrendingUp, BarChart3 } from 'lucide-react';

interface ChartPoint {
  date: string;
  netWorth: number;
  totalAssets: number;
  totalLiabilities: number;
  isSynthetic: boolean;
  isImported: boolean;
  [key: string]: string | number | boolean | undefined;
}

interface ChartResponse {
  data: ChartPoint[];
  categories: string[];
  summary: {
    current: number;
    previous: number;
    change: number;
    percentChange: number;
    includedAccounts: number;
    totalAccounts: number;
  };
}

interface BarDataPoint {
  date: string;
  change: number;
  startNetWorth: number;
  endNetWorth: number;
}

type BucketSize = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly';

function getWeekStart(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().split('T')[0];
}

function getBiweeklyStart(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  const startOfYear = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const dayOfYear = Math.floor((d.getTime() - startOfYear.getTime()) / 86400000);
  const periodStartDay = Math.floor(dayOfYear / 14) * 14;
  d.setUTCMonth(0, 1 + periodStartDay);
  return d.toISOString().split('T')[0];
}

function getMonthStart(dateStr: string): string {
  return dateStr.slice(0, 7) + '-01';
}

function getQuarterStart(dateStr: string): string {
  const month = parseInt(dateStr.slice(5, 7), 10);
  const qMonth = (Math.ceil(month / 3) - 1) * 3 + 1;
  return dateStr.slice(0, 4) + '-' + String(qMonth).padStart(2, '0') + '-01';
}

function getYearStart(dateStr: string): string {
  return dateStr.slice(0, 4) + '-01-01';
}

const bucketFns: Record<BucketSize, (dateStr: string) => string> = {
  daily: (d) => d,
  weekly: getWeekStart,
  biweekly: getBiweeklyStart,
  monthly: getMonthStart,
  quarterly: getQuarterStart,
  yearly: getYearStart,
};

function computeBucketSize(days: number): BucketSize {
  if (days <= 50) return 'daily';
  if (days <= 180) return 'weekly';
  if (days <= 400) return 'monthly';
  if (days <= 1000) return 'quarterly';
  return 'yearly';
}

function computeChangeBarData(data: ChartPoint[]): { barData: BarDataPoint[]; bucketSize: BucketSize } {
  if (data.length < 2) return { barData: [], bucketSize: 'daily' };

  const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date));

  const firstDate = new Date(sorted[0].date + 'T00:00:00Z');
  const lastDate = new Date(sorted[sorted.length - 1].date + 'T00:00:00Z');
  const days = Math.round((lastDate.getTime() - firstDate.getTime()) / 86400000);
  const bucketSize = computeBucketSize(days);

  if (bucketSize === 'daily') {
    const barData: BarDataPoint[] = [];
    for (let i = 1; i < sorted.length; i++) {
      barData.push({
        date: sorted[i].date,
        change: sorted[i].netWorth - sorted[i - 1].netWorth,
        startNetWorth: sorted[i - 1].netWorth,
        endNetWorth: sorted[i].netWorth,
      });
    }
    return { barData, bucketSize };
  }

  const getKey = bucketFns[bucketSize];
  const buckets = new Map<string, ChartPoint[]>();
  for (const point of sorted) {
    const key = getKey(point.date);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(point);
  }

  const barData: BarDataPoint[] = [];
  for (const [key, points] of buckets) {
    points.sort((a, b) => a.date.localeCompare(b.date));
    barData.push({
      date: key,
      change: points[points.length - 1].netWorth - points[0].netWorth,
      startNetWorth: points[0].netWorth,
      endNetWorth: points[points.length - 1].netWorth,
    });
  }

  barData.sort((a, b) => a.date.localeCompare(b.date));
  return { barData, bucketSize };
}

export function NetWorthChart() {
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [timeframe, setTimeframe] = usePersistentState<TimeRange>('finance:net-worth-chart:timeframe', '1y');
  const [isCollapsed, setIsCollapsed] = useCardCollapsed('netWorthChart');
  const [showFilters, setShowFilters] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`/api/net-worth/chart?timeframe=${timeframe}`, { credentials: 'include' });
        if (!res.ok) throw new Error('Failed to fetch net worth history data');
        const json: ChartResponse = await res.json();
        setChartData(json.data || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [timeframe]);

  const processedData = useMemo(() => {
    if (chartData.length === 0) return [];

    // Helper to get max spike duration in days based on timeframe
    const getMaxSpikeDuration = (range: TimeRange): number => {
      switch (range) {
        case '1m': return 1;
        case '3m': return 1.5;
        case '6m': return 3;
        case '1y': return 4;
        case 'ytd': return 4;
        case '5y': return 7;
        case 'all': return 14;
        default: return 3;
      }
    };

    // Helper to get moving average duration in days based on timeframe for visual smoothing
    const getMaxSmaDuration = (range: TimeRange): number => {
      switch (range) {
        case '1m': return 0;
        case '3m': return 0;
        case '6m': return 4;
        case '1y': return 7;
        case 'ytd': return 7;
        case '5y': return 30;
        case 'all': return 45;
        default: return 7;
      }
    };

    // Calculate average gap in days between consecutive data points
    const first = new Date(chartData[0].date + 'T00:00:00Z').getTime();
    const last = new Date(chartData[chartData.length - 1].date + 'T00:00:00Z').getTime();
    const totalDays = (last - first) / (1000 * 60 * 60 * 24);
    const gap = chartData.length > 1 ? totalDays / (chartData.length - 1) : 1;

    const targetSpikeDays = getMaxSpikeDuration(timeframe);
    
    // A median filter of window size W filters out spikes of duration up to floor(W/2) points.
    // So we need: floor(W/2) * gap >= targetSpikeDays  =>  floor(W/2) >= targetSpikeDays / gap.
    const targetPoints = Math.ceil(targetSpikeDays / (gap || 1));
    const windowSize = 2 * targetPoints + 1;

    // Limit window size to at most 15% of the total dataset size to avoid over-smoothing
    const maxAllowed = Math.floor(chartData.length * 0.15);
    const finalWindow = Math.min(windowSize, maxAllowed % 2 === 0 ? maxAllowed + 1 : maxAllowed);
    const medianWindow = Math.max(1, finalWindow % 2 === 0 ? finalWindow - 1 : finalWindow);

    // Calculate Simple Moving Average window for visual smoothing
    const targetSmaDays = getMaxSmaDuration(timeframe);
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
  }, [chartData, timeframe]);

  const { barData, bucketSize } = useMemo(
    () => computeChangeBarData(processedData),
    [processedData]
  );

  const barYDomain = useMemo(() => {
    if (barData.length === 0) return [-1000, 1000] as [number, number];
    const values = barData.map((d) => d.change);
    const rawMax = Math.max(...values, 0);
    const rawMin = Math.min(...values, 0);
    const range = rawMax - rawMin;
    const pad = range === 0 ? 500 : range * 0.05;
    const minPad = Math.max(pad, 500);
    return [rawMin - minPad, rawMax + minPad] as [number, number];
  }, [barData]);

  const areaYDomain = useMemo(() => {
    if (processedData.length === 0) return [-1000, 1000] as [number, number];
    const values = processedData.map((d) => d.netWorth);
    const rawMax = Math.max(...values);
    const rawMin = Math.min(...values);
    const range = rawMax - rawMin;
    const pad = range === 0 ? 1000 : range * 0.05;
    const minPad = Math.max(pad, 1000);
    return [rawMin - minPad, rawMax + minPad] as [number, number];
  }, [processedData]);

  const areaGradientOffset = useMemo(() => {
    const [yMin, yMax] = areaYDomain;
    if (yMax <= 0) return 0;
    if (yMin >= 0) return 1;
    return yMax / (yMax - yMin);
  }, [areaYDomain]);

  const ActiveDot = useCallback((props: any) => {
    const { cx, cy, payload } = props;
    if (!cx || !cy || !payload) return null;
    const color = payload.netWorth >= 0 ? 'var(--color-chart-1)' : 'var(--color-chart-5)';
    return (
      <circle
        cx={cx}
        cy={cy}
        r={4}
        fill={color}
        stroke={color}
        strokeWidth={1}
      />
    );
  }, []);

  const areaTicks = useMemo(() => getChartXTicks(processedData, timeframe), [processedData, timeframe]);

  const barTicks = useMemo(() => {
    if (barData.length <= 6) return barData.map((d) => d.date);
    const ticks: string[] = [];
    const step = (barData.length - 1) / 5;
    for (let i = 0; i < 6; i++) {
      const idx = Math.round(step * i);
      if (idx < barData.length) ticks.push(barData[idx].date);
    }
    return ticks;
  }, [barData]);

  const formatAreaXTick = useCallback((d: string) => {
    if (!d) return '';
    if (timeframe === '1m') {
      return formatSafeUTCDate(d, { month: 'short', day: 'numeric' });
    }
    if (timeframe === '5y' || timeframe === 'all') {
      return formatSafeUTCDate(d, { year: 'numeric' });
    }
    return formatSafeUTCDate(d, { month: 'short', year: '2-digit' });
  }, [timeframe]);

  const formatBarXTick = useCallback((d: string) => {
    if (!d) return '';
    if (bucketSize === 'daily' || bucketSize === 'weekly' || bucketSize === 'biweekly') {
      return formatSafeUTCDate(d, { month: 'short', day: 'numeric' });
    }
    if (bucketSize === 'monthly') {
      return formatSafeUTCDate(d, { month: 'short', year: '2-digit' });
    }
    if (bucketSize === 'quarterly') {
      const month = parseInt(d.slice(5, 7), 10);
      const q = Math.ceil(month / 3);
      return `Q${q} ${d.slice(2, 4)}`;
    }
    if (bucketSize === 'yearly') {
      return d.slice(0, 4);
    }
    return d;
  }, [bucketSize]);

  const formatYTick = useCallback((v: number) => {
    const absV = Math.abs(v);
    const sign = v < 0 ? '-' : '';
    if (absV >= 1000000) return `${sign}$${(absV / 1000000).toFixed(1)}M`;
    if (absV >= 1000) return `${sign}$${(absV / 1000).toFixed(0)}K`;
    if (absV === 0) return '$0';
    return `${sign}$${absV.toFixed(0)}`;
  }, []);

  const AreaTooltip = useCallback(({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null;
    const point = payload[0].payload;
    return (
      <ChartTooltip>
        <TooltipHeader>{formatSafeUTCDate(point.date, { month: 'short', day: 'numeric', year: 'numeric' })}</TooltipHeader>
        <TooltipRow
          label="Net Worth"
          value={formatCurrency(point.netWorth)}
          color={point.netWorth >= 0 ? 'var(--color-chart-1)' : 'var(--color-chart-5)'}
        />
        <TooltipRow label="Total Assets" value={formatCurrency(point.totalAssets)} color="var(--color-chart-1)" />
        <TooltipRow label="Total Liabilities" value={formatCurrency(point.totalLiabilities)} color="var(--color-destructive)" />
      </ChartTooltip>
    );
  }, []);

  const BarTooltip = useCallback(({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null;
    const point = payload[0].payload;
    return (
      <ChartTooltip>
        <TooltipHeader>{formatSafeUTCDate(point.date, { month: 'short', day: 'numeric', year: 'numeric' })}</TooltipHeader>
        <TooltipRow
          label="Change"
          value={`${point.change >= 0 ? '+' : ''}${formatCurrency(point.change)}`}
          color={point.change >= 0 ? 'var(--color-chart-1)' : 'var(--color-destructive)'}
        />
        <TooltipRow label="Starting Net Worth" value={formatCurrency(point.startNetWorth)} color="var(--color-chart-1)" />
        <TooltipRow label="Ending Net Worth" value={formatCurrency(point.endNetWorth)} color="var(--color-chart-1)" />
      </ChartTooltip>
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
              <span>Net Worth History</span>
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
              <span>Net Worth History</span>
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
              <span>Net Worth History</span>
            </div>
          }
        />
        {!isCollapsed && (
          <div className="p-5">
            <ChartEmptyState variant="nodata" description="Net worth trend data will appear once you connect accounts" />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm">
      <CollapsibleCardHeader
        isCollapsed={isCollapsed}
        onToggle={setIsCollapsed}
        title={
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary shrink-0" />
            <span>Net Worth History</span>
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
          <div className="flex flex-col sm:flex-row divide-y sm:divide-y-0 sm:divide-x divide-border">
            <div className="flex-1 min-w-0 p-2.5 sm:p-5">
              <div className="flex items-center gap-1.5 mb-2">
                <TrendingUp className="w-3.5 h-3.5 text-chart-1" />
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Net Worth</span>
              </div>
              <div className="h-[180px] sm:h-[220px] w-full relative">
                <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 100, height: 100 }}>
                  <AreaChart data={processedData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="netWorthGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.35} />
                        <stop offset={`${areaGradientOffset * 100}%`} stopColor="var(--color-chart-1)" stopOpacity={0.05} />
                        <stop offset={`${areaGradientOffset * 100}%`} stopColor="var(--color-chart-5)" stopOpacity={0.05} />
                        <stop offset="100%" stopColor="var(--color-chart-5)" stopOpacity={0.35} />
                      </linearGradient>
                      <linearGradient id="netWorthStrokeGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset={`${areaGradientOffset * 100}%`} stopColor="var(--color-chart-1)" />
                        <stop offset={`${areaGradientOffset * 100}%`} stopColor="var(--color-chart-5)" />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} opacity={0.3} />
                    <ReferenceLine y={0} stroke="var(--color-border)" strokeWidth={1} strokeDasharray="3 3" opacity={0.5} />
                    <XAxis
                      dataKey="date"
                      tickLine={false}
                      axisLine={{ stroke: 'var(--color-border)' }}
                      tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
                      ticks={areaTicks}
                      tickFormatter={formatAreaXTick}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={{ stroke: 'var(--color-border)' }}
                      tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
                      domain={areaYDomain}
                      tickFormatter={formatYTick}
                    />
                    <RechartsTooltip
                      content={<AreaTooltip />}
                      cursor={{ stroke: 'var(--color-chart-1)', strokeWidth: 1, strokeDasharray: '2 2', opacity: 0.5 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="netWorth"
                      stroke="url(#netWorthStrokeGrad)"
                      strokeWidth={2}
                      fill="url(#netWorthGrad)"
                      dot={false}
                      activeDot={<ActiveDot />}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="flex-1 min-w-0 p-2.5 sm:p-5">
              <div className="flex items-center gap-1.5 mb-2">
                <BarChart3 className="w-3.5 h-3.5 text-chart-1" />
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Change</span>
              </div>
              <div className="h-[180px] sm:h-[220px] w-full relative">
                <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 100, height: 100 }}>
                  <BarChart
                    data={barData}
                    margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                    barCategoryGap="20%"
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} opacity={0.3} />
                    <XAxis
                      dataKey="date"
                      tickLine={false}
                      axisLine={{ stroke: 'var(--color-border)' }}
                      tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
                      ticks={barTicks}
                      tickFormatter={formatBarXTick}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={{ stroke: 'var(--color-border)' }}
                      tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
                      domain={barYDomain}
                      tickFormatter={formatYTick}
                    />
                    <ReferenceLine y={0} stroke="var(--color-border)" strokeWidth={1} />
                    <RechartsTooltip
                      content={<BarTooltip />}
                      cursor={{ fill: 'var(--color-border)', opacity: 0.15 }}
                    />
                    <Bar dataKey="change" maxBarSize={48} radius={[3, 3, 0, 0]}>
                      {barData.map((entry, index) => (
                        <Cell
                          key={index}
                          fill={entry.change >= 0 ? 'var(--color-chart-1)' : 'var(--color-destructive)'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
