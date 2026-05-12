'use client';

import { useState, useEffect, useCallback } from 'react';
import { ResponsiveLine } from '@nivo/line';
import { ResponsiveBar } from '@nivo/bar';
import { useRouter } from 'next/navigation';
import { formatCurrency, formatPercent } from '@/lib/utils/format';
import { nivoTheme } from '@/components/charts/shared-chart-theme';
import { ChartTooltip, TooltipRow, TooltipHeader } from '@/components/charts/chart-tooltip';
import { ChartEmptyState } from '@/components/charts/chart-empty-state';
import { ChartTypeSelector, type ChartType } from '@/components/charts/chart-type-selector';
import { TimeRangeFilter, IncludeExcludedFilter, type TimeRange } from '@/components/charts/chart-filters';

type NetWorthDataPoint = {
  date: string;
  netWorth: number;
  totalAssets: number;
  totalLiabilities: number;
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

export function NetWorthChart() {
  const router = useRouter();
  const [timeframe, setTimeframe] = useState<TimeRange>('1y');
  const [chartType, setChartType] = useState<ChartType>('line');
  const [includeExcluded, setIncludeExcluded] = useState(false);
  const [data, setData] = useState<NetWorthDataPoint[]>([]);
  const [summary, setSummary] = useState<ChartSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const url = new URL('/api/net-worth/chart', window.location.origin);
        url.searchParams.set('timeframe', timeframe);
        url.searchParams.set('includeExcluded', includeExcluded.toString());

        const response = await fetch(url.toString());
        if (!response.ok) throw new Error('Failed to fetch chart data');

        const result: ChartResponse = await response.json();
        setData(result.data);
        setSummary(result.summary);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [timeframe, includeExcluded]);

  const handlePointClick = useCallback(
    (point: NetWorthDataPoint) => {
      const { startDate, endDate } = getDateRange(point);
      router.push(`/transactions?startDate=${startDate}&endDate=${endDate}`);
    },
    [router]
  );

  const nivoData = data.map((point) => ({
    date: new Date(point.date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: '2-digit',
    }),
    netWorth: point.netWorth,
  }));

  const isPositiveChange = summary ? summary.change >= 0 : false;

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

    if (data.length === 0) {
      return <ChartEmptyState variant="nodata" description="Net worth data will appear once you sync your accounts" />;
    }

    if (data.length < 2) {
      return <ChartEmptyState variant="insufficient" />;
    }

    if (chartType === 'bar') {
      return (
        <ResponsiveBar
          data={nivoData}
          keys={['netWorth']}
          indexBy="date"
          margin={{ top: 10, right: 10, left: 60, bottom: 30 }}
          padding={0.3}
          borderRadius={2}
          colors={({ value }) => (value >= 0 ? 'var(--color-chart-1)' : 'var(--color-destructive)')}
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
          }}
          enableGridY={true}
          enableGridX={false}
          theme={nivoTheme}
          onClick={({ data: barData }) => {
            const pt = data.find((d) => {
              const label = new Date(d.date).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', year: '2-digit',
              });
              return label === barData.date;
            });
            if (pt) handlePointClick(pt);
          }}
          tooltip={({ indexValue, value }) => (
            <ChartTooltip>
              <TooltipHeader>{String(indexValue)}</TooltipHeader>
              <TooltipRow label="Net Worth" value={formatCurrency(value)} />
            </ChartTooltip>
          )}
        />
      );
    }

    return (
      <ResponsiveLine
        data={[{
          id: 'Net Worth',
          data: nivoData.map((d) => ({ x: d.date, y: d.netWorth })),
        }]}
        margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
        xScale={{ type: 'point' }}
        yScale={{ type: 'linear', min: 'auto', max: 'auto' }}
        curve="monotoneX"
        enableArea={true}
        areaOpacity={0.15}
        colors={['var(--color-chart-1)']}
        lineWidth={2.5}
        enablePoints={false}
        enableGridX={false}
        axisBottom={{ tickSize: 0, tickPadding: 8 }}
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
        onClick={(raw) => {
          const p = raw as unknown as { data: { xFormatted: string } };
          const pt = data.find((d) => {
            const label = new Date(d.date).toLocaleDateString('en-US', {
              month: 'short', day: 'numeric', year: '2-digit',
            });
            return label === String(p.data.xFormatted);
          });
          if (pt) handlePointClick(pt);
        }}
        tooltip={({ point }) => (
          <ChartTooltip>
            <TooltipHeader>{String(point.data.xFormatted)}</TooltipHeader>
            <TooltipRow label="Net Worth" value={formatCurrency(Number(point.data.y))} />
          </ChartTooltip>
        )}
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
          <IncludeExcludedFilter value={includeExcluded} onChange={setIncludeExcluded} />
        </div>
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
                    {formatCurrency(summary.current + summary.change)}
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
