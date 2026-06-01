'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { usePersistentState } from '@/lib/hooks/use-persistent-state';
import { useCardCollapsed } from '@/lib/hooks/use-card-collapsed';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from 'recharts';
import { formatCurrency } from '@/lib/utils/format';
import { formatSafeUTCDate, getChartXTicks } from '@/lib/utils/date';
import { ChartTooltip, TooltipRow, TooltipHeader } from '@/components/charts/chart-tooltip';
import { ChartEmptyState } from '@/components/charts/chart-empty-state';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { TimeRangeFilter, type TimeRange } from '@/components/charts/chart-filters';
import { CollapsibleCardHeader } from '@/components/ui/collapsible-card-header';
import { CollapsibleFilterPanel } from '@/components/ui/collapsible-filter-panel';
import { Activity } from 'lucide-react';

interface ChartPoint {
  date: string;
  netWorth: number;
  totalAssets: number;
  totalLiabilities: number;
  isSynthetic: boolean;
  isImported: boolean;
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

export function NetWorthChart() {
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [timeframe, setTimeframe] = usePersistentState<TimeRange>('runway:net-worth-chart:timeframe', '1y');
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

  const { minVal, maxVal } = useMemo(() => {
    if (chartData.length === 0) {
      return { minVal: 0, maxVal: 1000 };
    }
    const netWorthValues = chartData.map((d) => d.netWorth);
    const rawMax = Math.max(...netWorthValues, 1000);
    const rawMin = Math.min(...netWorthValues, 0);

    const range = rawMax - rawMin;
    const padding = range === 0 ? 100 : range * 0.05;
    const minValue = rawMin - padding;
    const maxValue = rawMax + padding;

    return { minVal: minValue, maxVal: maxValue };
  }, [chartData]);

  const xAxisTicks = useMemo(() => {
    return getChartXTicks(chartData, timeframe);
  }, [chartData, timeframe]);

  const formatXTick = useCallback((d: string) => {
    if (!d) return '';
    if (timeframe === '1m') {
      return formatSafeUTCDate(d, { month: 'short', day: 'numeric' });
    } else if (timeframe === '5y' || timeframe === 'all') {
      return formatSafeUTCDate(d, { year: 'numeric' });
    } else {
      return formatSafeUTCDate(d, { month: 'short', year: '2-digit' });
    }
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
          label="Net Worth"
          value={formatCurrency(point.netWorth)}
          color="var(--color-primary)"
        />
        <TooltipRow
          label="Total Assets"
          value={formatCurrency(point.totalAssets)}
          color="var(--color-chart-1)"
        />
        <TooltipRow
          label="Total Liabilities"
          value={formatCurrency(point.totalLiabilities)}
          color="var(--color-destructive)"
        />
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
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mr-1">Timeframe</span>
              <TimeRangeFilter value={timeframe} onChange={setTimeframe} />
            </div>
          </CollapsibleFilterPanel>
          <div className="p-2.5 sm:p-5 space-y-4">
            <div className="h-[240px] w-full relative">
            <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 100, height: 100 }}>
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="netWorthGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} opacity={0.3} />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={{ stroke: 'var(--color-border)' }}
                  tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
                  ticks={xAxisTicks}
                  tickFormatter={formatXTick}
                />
                <YAxis
                  tickLine={false}
                  axisLine={{ stroke: 'var(--color-border)' }}
                  tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
                  domain={[minVal, maxVal]}
                  tickFormatter={formatYTick}
                />
                <RechartsTooltip
                  content={<CustomTooltip />}
                  cursor={{ stroke: 'var(--color-primary)', strokeWidth: 1, strokeDasharray: '2 2', opacity: 0.5 }}
                />
                <Area
                  type="monotone"
                  dataKey="netWorth"
                  stroke="var(--color-primary)"
                  strokeWidth={2}
                  fill="url(#netWorthGrad)"
                  dot={false}
                  activeDot={{ r: 4, stroke: 'var(--color-primary)', strokeWidth: 1 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          </div>
        </>
      )}
    </div>
  );
}
