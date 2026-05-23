'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { useRouter } from 'next/navigation';
import { formatCurrency } from '@/lib/utils/format';
import { getChartXTicks, formatSafeUTCDate } from '@/lib/utils/date';
import { ChartTooltip, TooltipRow, TooltipHeader } from '@/components/charts/chart-tooltip';
import { ChartEmptyState } from '@/components/charts/chart-empty-state';
import { TimeRangeFilter, type TimeRange } from '@/components/charts/chart-filters';
import { useSyntheticData } from '@/lib/hooks/use-synthetic-data';
import type { ChartPoint } from '@/lib/types/financial';
import { usePersistentState } from '@/lib/hooks/use-persistent-state';

function getMonthRange(point: ChartPoint): { startDate: string; endDate: string } {
  const d = new Date(point.date);
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return {
    startDate: start.toISOString().split('T')[0],
    endDate: end.toISOString().split('T')[0],
  };
}

export function AccountValuesChart() {
  const router = useRouter();
  const { isEnabled } = useSyntheticData();
  const [timeframe, setTimeframe] = usePersistentState<TimeRange>('runway:account-values:timeframe', '1y');
  const [includeExcluded, setIncludeExcluded] = usePersistentState<boolean>('runway:account-values:includeExcluded', true);
  const [data, setData] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSeries, setActiveSeries] = usePersistentState<Set<string>>(
    'runway:account-values:activeSeries',
    new Set(['Net Worth', 'Total Assets', 'Total Liabilities']),
    {
      serialize: (val) => JSON.stringify(Array.from(val)),
      deserialize: (raw) => new Set(JSON.parse(raw)),
    }
  );

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const url = new URL('/api/net-worth/chart', window.location.origin);
        url.searchParams.set('timeframe', timeframe);
        url.searchParams.set('includeExcluded', includeExcluded.toString());
        const res = await fetch(url.toString());
        if (!res.ok) throw new Error('Failed to fetch chart data');
        const json = await res.json();
        setData(json.data || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [timeframe, includeExcluded]);

  const displayData = useMemo(
    () => (isEnabled('netWorth') ? data : data.filter((d) => !d.isSynthetic)),
    [data, isEnabled]
  );

  const chartData = useMemo(() => {
    return displayData.map((p) => ({
      date: p.date,
      isSynthetic: p.isSynthetic,
      'Net Worth': p.netWorth,
      'Total Assets': p.totalAssets,
      'Total Liabilities': p.totalLiabilities,
      rawPoint: p,
    }));
  }, [displayData]);

  const xAxisTicks = useMemo(() => {
    return getChartXTicks(chartData, timeframe, 'date');
  }, [chartData, timeframe]);

  const formatTooltipDate = useCallback((tickStr: string) => {
    return formatSafeUTCDate(tickStr, { month: 'short', day: 'numeric', year: '2-digit' });
  }, []);

  const maxVal = displayData.length > 0
    ? Math.max(...displayData.flatMap((d) => [d.netWorth, d.totalAssets, Math.abs(d.totalLiabilities)]), 1)
    : 1;

  const handleSliceClick = useCallback(
    (point: ChartPoint) => {
      const { startDate, endDate } = getMonthRange(point);
      router.push(`/transactions?startDate=${startDate}&endDate=${endDate}`);
    },
    [router]
  );

  const formatXAxis = useCallback((tickStr: string) => {
    if (timeframe === '1m') {
      return formatSafeUTCDate(tickStr, { month: 'short', day: 'numeric' });
    } else if (timeframe === '5y' || timeframe === 'all') {
      return formatSafeUTCDate(tickStr, { year: 'numeric' });
    } else {
      return formatSafeUTCDate(tickStr, { month: 'short', year: '2-digit' });
    }
  }, [timeframe]);

  const handleLegendClick = (e: any) => {
    const { dataKey } = e;
    setActiveSeries((prev) => {
      const next = new Set(prev);
      if (next.has(dataKey)) {
        next.delete(dataKey);
      } else {
        next.add(dataKey);
      }
      return next;
    });
  };

  const renderLegendText = (value: string) => {
    const isActive = activeSeries.has(value);
    return (
      <span className={`cursor-pointer select-none transition-opacity ${isActive ? 'text-foreground font-medium' : 'text-muted-foreground/40 line-through'}`}>
        {value}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground">Account Values Over Time</h3>
        </div>
        <div className="h-[300px] flex items-center justify-center text-muted-foreground">
          <div className="w-7 h-7 border-2 border-border border-t-primary rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-foreground mb-3">Account Values Over Time</h3>
        <ChartEmptyState variant="error" error={error} />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-foreground mb-3">Account Values Over Time</h3>
        <div className="h-[300px]">
          <ChartEmptyState variant="nodata" description="Historical data will appear once you sync your accounts" />
        </div>
      </div>
    );
  }

  const xInterval = displayData.length > 30 ? Math.max(4, Math.floor(displayData.length / 10)) : 0;

  return (
    <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">Account Values Over Time</h3>
      </div>
      <div className="mb-3">
        <TimeRangeFilter value={timeframe} onChange={setTimeframe} />
      </div>
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 10, right: 120, left: 10, bottom: 10 }}
            onClick={(e: any) => {
              if (e && e.activePayload && e.activePayload.length > 0) {
                const pt = e.activePayload[0].payload.rawPoint;
                if (pt) handleSliceClick(pt);
              }
            }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} horizontal={true} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={{ stroke: 'var(--color-border)' }}
              tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
              ticks={xAxisTicks}
              tickFormatter={formatXAxis}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
              width={65}
              tickFormatter={(v: number) => {
                if (v >= 1000000) return `$${(v / 1000000).toFixed(1)}M`;
                if (v >= 1000) return `$${(v / 1000).toFixed(0)}K`;
                return `$${v}`;
              }}
              domain={[0, Math.ceil(maxVal * 1.1)]}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload || !payload.length) return null;
                const dateStr = payload[0].payload.date;
                const formattedDate = formatTooltipDate(dateStr);
                const isSynthetic = payload[0].payload.isSynthetic;

                return (
                  <ChartTooltip>
                    <TooltipHeader>{formattedDate}</TooltipHeader>
                    {payload.map((p) => (
                      <TooltipRow
                        key={p.name}
                        label={String(p.name)}
                        value={formatCurrency(Number(p.value))}
                        color={p.color}
                      />
                    ))}
                    {isSynthetic && (
                      <div className="text-[10px] text-muted-foreground italic mt-1 border-t border-border pt-1">
                        (Estimated)
                      </div>
                    )}
                  </ChartTooltip>
                );
              }}
            />
            <Legend
              layout="vertical"
              align="right"
              verticalAlign="top"
              wrapperStyle={{ right: 0, paddingLeft: 10, fontSize: 12 }}
              onClick={handleLegendClick}
              formatter={renderLegendText}
            />
            {activeSeries.has('Net Worth') && (
              <Line
                type="monotone"
                dataKey="Net Worth"
                stroke="var(--color-primary)"
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            )}
            {activeSeries.has('Total Assets') && (
              <Line
                type="monotone"
                dataKey="Total Assets"
                stroke="var(--color-chart-1)"
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            )}
            {activeSeries.has('Total Liabilities') && (
              <Line
                type="monotone"
                dataKey="Total Liabilities"
                stroke="var(--color-destructive)"
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
