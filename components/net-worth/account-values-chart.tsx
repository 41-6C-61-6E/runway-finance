'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { ResponsiveLine } from '@nivo/line';
import { useRouter } from 'next/navigation';
import { formatCurrency } from '@/lib/utils/format';
import { nivoTheme } from '@/components/charts/shared-chart-theme';
import { ChartTooltip, TooltipRow, TooltipHeader } from '@/components/charts/chart-tooltip';
import { ChartEmptyState } from '@/components/charts/chart-empty-state';
import { TimeRangeFilter, type TimeRange } from '@/components/charts/chart-filters';
import { SyntheticLineLayer } from '@/components/charts/synthetic-line-layer';
import { useSyntheticData } from '@/lib/hooks/use-synthetic-data';

interface ChartPoint {
  date: string;
  netWorth: number;
  totalAssets: number;
  totalLiabilities: number;
  isSynthetic?: boolean;
}

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
  const [timeframe, setTimeframe] = useState<TimeRange>('1y');
  const [includeExcluded, setIncludeExcluded] = useState(true);
  const [data, setData] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSeries, setActiveSeries] = useState<Set<string>>(
    new Set(['Net Worth', 'Total Assets', 'Total Liabilities'])
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

  const allSeries = useMemo(() => {
    if (displayData.length === 0) return [];
    return [
      {
        id: 'Net Worth',
        data: displayData.map((p) => ({ x: p.date, y: p.netWorth, isSynthetic: p.isSynthetic })),
      },
      {
        id: 'Total Assets',
        data: displayData.map((p) => ({ x: p.date, y: p.totalAssets, isSynthetic: p.isSynthetic })),
      },
      {
        id: 'Total Liabilities',
        data: displayData.map((p) => ({ x: p.date, y: p.totalLiabilities, isSynthetic: p.isSynthetic })),
      },
    ];
  }, [displayData]);

  const maxVal = displayData.length > 0
    ? Math.max(...displayData.flatMap((d) => [d.netWorth, d.totalAssets, Math.abs(d.totalLiabilities)]), 1)
    : 1;

  const visibleData = allSeries.filter((s) => activeSeries.has(s.id));

  const hasEstimated = isEnabled('netWorth') && data.some((d) => d.isSynthetic);

  const handleSliceClick = useCallback(
    (point: ChartPoint) => {
      const { startDate, endDate } = getMonthRange(point);
      router.push(`/transactions?startDate=${startDate}&endDate=${endDate}`);
    },
    [router]
  );

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

  return (
    <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">Account Values Over Time</h3>

      </div>
      <div className="mb-3">
        <TimeRangeFilter value={timeframe} onChange={setTimeframe} />
      </div>
      <div className="h-[300px]">
        <ResponsiveLine
          data={visibleData}
          margin={{ top: 10, right: 120, left: 60, bottom: 30 }}
          xScale={{ type: 'time', format: '%Y-%m-%d', useUTC: false, precision: 'day' }}
          yScale={{ type: 'linear', min: 0, max: maxVal * 1.1 }}
          curve="monotoneX"
          colors={['var(--color-primary)', 'var(--color-chart-1)', 'var(--color-destructive)']}
          lineWidth={2}
          enablePoints={false}
          enableGridX={false}
          enableGridY={true}
          axisBottom={{
            tickSize: 0, tickPadding: 8,
            tickValues: displayData.length > 30 ? Math.max(4, Math.floor(displayData.length / 10)) : undefined,
            format: '%b %y',
          }}
          axisLeft={{
            tickSize: 0,
            tickPadding: 8,
            format: (v: number) => {
              if (v >= 1000000) return `$${(v / 1000000).toFixed(1)}M`;
              if (v >= 1000) return `$${(v / 1000).toFixed(0)}K`;
              return `$${v}`;
            },
          }}
          theme={nivoTheme}
          useMesh={true}
          enableSlices="x"
          layers={[
            'grid',
            'axes',
            ...(hasEstimated ? [(props: any) => <SyntheticLineLayer key="synthetic" {...props} />] : []),
            'lines',
            'points',
            'slices',
            'crosshair',
            'legends',
          ] as any}
          sliceTooltip={({ slice }) => (
            <ChartTooltip>
              <TooltipHeader>{String(slice.points[0]?.data.xFormatted)}</TooltipHeader>
              {slice.points.map((point) => (
                <TooltipRow
                  key={point.id}
                  label={String(point.seriesId)}
                  value={formatCurrency(Number(point.data.y))}
                  color={point.color}
                />
              ))}
              {(() => {
                const p = slice.points[0]?.data.x as any;
                const dateStr = p instanceof Date
                  ? `${p.getFullYear()}-${String(p.getMonth() + 1).padStart(2, '0')}-${String(p.getDate()).padStart(2, '0')}`
                  : String(p);
                return data.find((d) => d.date === dateStr);
              })()?.isSynthetic && (
                <div className="text-[10px] text-muted-foreground italic mt-1 border-t border-border pt-1">
                  Some values are estimated
                </div>
              )}
            </ChartTooltip>
          )}
          onClick={(raw) => {
            const p = raw as unknown as { data: { x: Date; xFormatted: string } };
            const d = p.data.x;
            const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            const pt = data.find((pt) => pt.date === dateStr);
            if (pt) handleSliceClick(pt);
          }}
          animate={displayData.length < 100}
          legends={[
            {
              anchor: 'top-right',
              direction: 'column',
              justify: false,
              translateX: 120,
              translateY: 0,
              itemsSpacing: 0,
              itemDirection: 'left-to-right',
              itemWidth: 100,
              itemHeight: 20,
              itemOpacity: 0.75,
              symbolSize: 12,
              symbolShape: 'circle',
              onClick: (datum: { id: string | number }) => {
                setActiveSeries((prev) => {
                  const next = new Set(prev);
                  const id = String(datum.id);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  return next;
                });
              },
              effects: [{ on: 'hover', style: { itemOpacity: 1 } }],
            },
          ]}
        />
      </div>
    </div>
  );
}
