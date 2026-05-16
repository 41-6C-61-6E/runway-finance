'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { ResponsiveLine } from '@nivo/line';
import { ResponsiveBar } from '@nivo/bar';
import { useRouter } from 'next/navigation';
import { formatCurrency, formatPercent } from '@/lib/utils/format';
import { nivoTheme } from '@/components/charts/shared-chart-theme';
import { ChartTooltip, TooltipRow, TooltipHeader } from '@/components/charts/chart-tooltip';
import { ChartEmptyState } from '@/components/charts/chart-empty-state';
import { ChartTypeSelector, type ChartType } from '@/components/charts/chart-type-selector';
import { TimeRangeFilter, type TimeRange } from '@/components/charts/chart-filters';
import { useSyntheticData } from '@/lib/hooks/use-synthetic-data';

type NetWorthDataPoint = {
  date: string;
  netWorth: number;
  totalAssets: number;
  totalLiabilities: number;
  isSynthetic?: boolean;
};

interface ChartSummary {
  current: number;
  previous: number;
  change: number;
  percentChange: number;
  includedAccounts: number;
  totalAccounts: number;
}

interface ChartResponse {
  data: NetWorthDataPoint[];
  summary: ChartSummary;
}

const typeOptions = [
  { value: 'line' as ChartType, label: 'Line' },
  { value: 'bar' as ChartType, label: 'Bar' },
];

function getDateRange(point: NetWorthDataPoint): { startDate: string; endDate: string } {
  const d = new Date(point.date);
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return {
    startDate: start.toISOString().split('T')[0],
    endDate: end.toISOString().split('T')[0],
  };
}

function toFiniteNumber(value: unknown): number {
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : 0;
}

function toDateKey(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }

  if (typeof value === 'string') {
    const dateOnly = value.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
    if (dateOnly) return dateOnly;
  }

  return null;
}

export function NetWorthChart() {
  const router = useRouter();
  const { isEnabled } = useSyntheticData();
  const [timeframe, setTimeframe] = useState<TimeRange>('1y');
  const [chartType, setChartType] = useState<ChartType>('line');
  const [data, setData] = useState<NetWorthDataPoint[]>([]);
  const [summary, setSummary] = useState<ChartSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAssetsLiabilities, setShowAssetsLiabilities] = useState(false);

  const displayData = useMemo(
    () => (isEnabled('netWorth') ? data : data.filter((d) => !d.isSynthetic)),
    [data, isEnabled]
  );

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const url = new URL('/api/net-worth/chart', window.location.origin);
        url.searchParams.set('timeframe', timeframe);

        const response = await fetch(url.toString());
        if (!response.ok) throw new Error('Failed to fetch chart data');

        const result: ChartResponse = await response.json();
        const normalizedData = Array.isArray(result.data)
          ? result.data
              .map((point) => ({
                date: toDateKey(point.date) ?? String(point.date),
                netWorth: toFiniteNumber(point.netWorth),
                totalAssets: toFiniteNumber(point.totalAssets),
                totalLiabilities: toFiniteNumber(point.totalLiabilities),
                isSynthetic: Boolean(point.isSynthetic),
              }))
              .filter((point) => /^\d{4}-\d{2}-\d{2}$/.test(point.date))
          : [];
        setData(normalizedData);
        setSummary(result.summary ? {
          current: toFiniteNumber(result.summary.current),
          previous: toFiniteNumber(result.summary.previous),
          change: toFiniteNumber(result.summary.change),
          percentChange: toFiniteNumber(result.summary.percentChange),
          includedAccounts: toFiniteNumber(result.summary.includedAccounts),
          totalAccounts: toFiniteNumber(result.summary.totalAccounts),
        } : null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [timeframe]);

  const handlePointClick = useCallback(
    (point: NetWorthDataPoint) => {
      const { startDate, endDate } = getDateRange(point);
      router.push(`/transactions?startDate=${startDate}&endDate=${endDate}`);
    },
    [router]
  );

  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: '2-digit',
  });

  const chartData = displayData;
  const isPositiveChange = summary ? summary.change >= 0 : false;

  const lastPoint = data.length > 0 ? data[data.length - 1] : null;

  const nivoData = chartData.length > 0
    ? [{ id: 'Net Worth', data: chartData.map((d) => ({ x: d.date, y: d.netWorth, isSynthetic: d.isSynthetic })) }]
    : [];

  const assetsLiabilitiesSeries = showAssetsLiabilities && chartData.length > 0
    ? [
        { id: 'Total Assets', data: chartData.map((d) => ({ x: d.date, y: d.totalAssets, isSynthetic: d.isSynthetic })) },
        { id: 'Total Liabilities', data: chartData.map((d) => ({ x: d.date, y: d.totalLiabilities, isSynthetic: d.isSynthetic })) },
      ]
    : [];

  const displaySeries = [...nivoData, ...assetsLiabilitiesSeries];

  const maxVal = Math.max(
    ...chartData.flatMap((d) => [d.netWorth, d.totalAssets, d.totalLiabilities]),
    1,
  );

  const SyntheticOverlay = ({ series, xScale, yScale }: any) => {
    const mainSeries = series[0];
    if (!mainSeries || !Array.isArray(mainSeries.data) || mainSeries.data.length < 2) return null;

    const estimatedPoints: Array<{ x: number; y: number }> = [];

    for (const point of mainSeries.data) {
      const data = point?.data;
      if (!data?.isSynthetic) continue;

      const px = point.position?.x ?? xScale?.(data.x);
      const py = point.position?.y ?? yScale?.(data.y);
      if (Number.isFinite(px) && Number.isFinite(py)) {
        estimatedPoints.push({ x: px, y: py });
      }
    }

    if (estimatedPoints.length < 2) return null;

    const line = (pts: Array<{ x: number; y: number }>) =>
      pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');

    return (
      <path
        d={line(estimatedPoints)}
        fill="none"
        stroke="var(--color-chart-1)"
        strokeWidth={2.5}
        strokeDasharray="8 4"
        opacity={0.6}
      />
    );
  };

  const renderChart = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center text-muted-foreground h-72">
          <div className="text-center">
            <div className="w-7 h-7 border-2 border-border border-t-primary rounded-full animate-spin mx-auto mb-2" />
            Loading chart...
          </div>
        </div>
      );
    }

    if (error) {
      return <ChartEmptyState variant="error" error={error} />;
    }

    if (chartData.length === 0) {
      return <ChartEmptyState variant="nodata" description="Net worth data will appear once you sync your accounts" />;
    }

    if (chartData.length < 2) {
      return <ChartEmptyState variant="insufficient" />;
    }

    if (chartType === 'bar') {
      const barData = chartData.map((d) => ({
        date: fmtDate(d.date),
        netWorth: d.netWorth,
        _isSynthetic: d.isSynthetic ? 'true' : 'false',
      }));
      return (
        <ResponsiveBar
          data={barData as any}
          keys={['netWorth']}
          indexBy="date"
          margin={{ top: 10, right: 10, left: 60, bottom: 30 }}
          padding={0.05}
          borderRadius={2}
          colors={({ data: d }: any) => {
            const value = d.netWorth as number;
            const isSynth = d._isSynthetic === 'true';
            if (isSynth) {
              return value >= 0 ? 'var(--color-chart-synthetic)' : 'var(--color-destructive-synthetic)';
            }
            return value >= 0 ? 'var(--color-chart-1)' : 'var(--color-destructive)';
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
          axisBottom={{
            tickSize: 0,
            tickPadding: 8,
            tickValues: chartData.length > 30 ? Math.max(3, Math.min(Math.floor(chartData.length / 6), 15)) : undefined,
          }}
          enableGridY={true}
          enableGridX={false}
          theme={nivoTheme}
          animate={chartData.length < 100}
          onClick={({ data: barData }) => {
            const pt = chartData.find((d) => fmtDate(d.date) === barData.date);
            if (pt) handlePointClick(pt);
          }}
          tooltip={({ indexValue, value, data: d }: any) => (
            <ChartTooltip>
              <TooltipHeader>{String(indexValue)}</TooltipHeader>
              <TooltipRow label="Net Worth" value={formatCurrency(value)} />
              {d?._isSynthetic === 'true' && (
                <div className="text-[10px] text-muted-foreground italic mt-1 border-t border-border pt-1">
                  Estimated value
                </div>
              )}
            </ChartTooltip>
          )}
        />
      );
    }

    return (
      <ResponsiveLine
        data={displaySeries}
        margin={{ top: 10, right: 60, left: 60, bottom: 30 }}
        xScale={{ type: 'time', format: '%Y-%m-%d', useUTC: false, precision: 'day' }}
        yScale={{ type: 'linear', min: 0, max: maxVal * 1.1 }}
        curve="monotoneX"
        colors={['var(--color-chart-1)', 'var(--color-chart-2)', 'var(--color-destructive)']}
        enablePoints={false}
        enableGridX={false}
        enableGridY={true}
        axisBottom={{
          tickSize: 0,
          tickPadding: 8,
          tickValues: chartData.length > 30 ? Math.max(4, Math.floor(chartData.length / 10)) : undefined,
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
        layers={[
          'grid',
          'axes',
          'crosshair',
          'lines',
          SyntheticOverlay,
          'points',
          'slices',
          'mesh',
        ] as any}
        onClick={(raw) => {
          const p = raw as unknown as { data?: { x?: Date | string; xFormatted?: string } };
          const dateStr = toDateKey(p.data?.x);
          if (!dateStr) return;
          const pt = chartData.find((pt) => pt.date === dateStr);
          if (pt) handlePointClick(pt);
        }}
        tooltip={({ point }) => (
          <ChartTooltip>
            <TooltipHeader>{String(point.data.xFormatted)}</TooltipHeader>
            <TooltipRow label={String(point.seriesId)} value={formatCurrency(Number(point.data.y))} />
            {(point.data as any).isSynthetic && (
              <div className="text-[10px] text-muted-foreground italic mt-1 border-t border-border pt-1">
                Estimated value
              </div>
            )}
          </ChartTooltip>
        )}
        animate={chartData.length < 100}
      />
    );
  };

  return (
    <div className="w-full bg-card border border-border rounded-xl shadow-sm">
      {/* Header */}
      <div className="p-5 pb-3">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-sm font-medium text-muted-foreground mb-1">Net Worth</h2>
            <div className="flex items-baseline gap-2">
              <div className="text-3xl font-bold text-foreground blur-number">
                {summary ? formatCurrency(summary.current) : '$0'}
              </div>
            </div>
            {summary && (
              <div className="flex items-center gap-1.5 mt-1.5">
                <span className={`text-sm font-semibold blur-number ${isPositiveChange ? 'text-chart-1' : 'text-destructive'}`}>
                  {isPositiveChange ? '+' : ''}{formatCurrency(summary.change)}
                </span>
                <span className={`text-xs blur-number ${isPositiveChange ? 'text-chart-1' : 'text-destructive'}`}>
                  ({formatPercent(summary.percentChange)})
                </span>
                <span className="text-xs text-muted-foreground">all time</span>
              </div>
            )}
          </div>
          <div className="flex items-start gap-3">
            <ChartTypeSelector value={chartType} options={typeOptions} onChange={setChartType} />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <TimeRangeFilter value={timeframe} onChange={setTimeframe} />
        </div>
        {showAssetsLiabilities !== undefined && (
          <div className="mt-2">
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showAssetsLiabilities}
                onChange={(e) => setShowAssetsLiabilities(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-border accent-primary"
              />
              <span className="text-xs text-muted-foreground">Display Assets &amp; Liabilities</span>
            </label>
          </div>
        )}
      </div>

      {/* Chart */}
      <div className="h-72 px-2 pb-2">
        <div className="financial-chart h-full">
          {renderChart()}
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-5">
            {summary && (
              <>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Total Assets</p>
                  <p className="text-sm font-semibold text-foreground blur-number">
                    {lastPoint ? formatCurrency(lastPoint.totalAssets) : '$0'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Avg Change</p>
                  <p className="text-sm font-semibold text-foreground blur-number">
                    {formatCurrency(data.length > 0 ? summary.change / data.length : 0)}
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
