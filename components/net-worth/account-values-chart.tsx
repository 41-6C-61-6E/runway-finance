'use client';

import { useState, useEffect, useMemo } from 'react';
import { ResponsiveLine } from '@nivo/line';
import { formatCurrency } from '@/lib/utils/format';

interface ChartPoint {
  date: string;
  netWorth: number;
  totalAssets: number;
  totalLiabilities: number;
}

const nivoTheme = {
  background: 'transparent',
  text: { fill: 'var(--color-foreground)', fontSize: 11 },
  axis: {
    domain: { line: { stroke: 'var(--color-border)', strokeWidth: 1 } },
    ticks: { line: { stroke: 'var(--color-border)' }, text: { fill: 'var(--color-muted-foreground)' } },
  },
  grid: { line: { stroke: 'var(--color-border)', strokeDasharray: '3 3' } },
  crosshair: { line: { stroke: 'var(--color-ring)', strokeWidth: 1 } },
  tooltip: {
    container: {
      background: 'var(--color-card)',
      border: '1px solid var(--color-border)',
      borderRadius: '0.5rem',
      boxShadow: '0 4px 12px var(--color-border)',
      color: 'var(--color-foreground)',
      fontSize: '12px',
    },
  },
  legends: {
    text: { fill: 'var(--color-muted-foreground)', fontSize: 11 },
  },
};

export function AccountValuesChart() {
  const [data, setData] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSeries, setActiveSeries] = useState<Set<string>>(new Set(['Net Worth', 'Total Assets', 'Total Liabilities']));

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch('/api/net-worth/chart?timeframe=1y&includeExcluded=true');
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
  }, []);

  const allSeries = useMemo(() => {
    if (data.length === 0) return [];
    return [
      {
        id: 'Net Worth',
        data: data.map((p) => ({
          x: new Date(p.date).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
          y: p.netWorth,
        })),
      },
      {
        id: 'Total Assets',
        data: data.map((p) => ({
          x: new Date(p.date).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
          y: p.totalAssets,
        })),
      },
      {
        id: 'Total Liabilities',
        data: data.map((p) => ({
          x: new Date(p.date).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
          y: p.totalLiabilities,
        })),
      },
    ];
  }, [data]);

  const visibleData = allSeries.filter((s) => activeSeries.has(s.id));

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-foreground mb-3">Account Values Over Time</h3>
        <div className="animate-pulse">
          <div className="h-[300px] bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-foreground mb-3">Account Values Over Time</h3>
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-foreground mb-3">Account Values Over Time</h3>
        <div className="h-[300px] flex items-center justify-center text-muted-foreground">
          <div className="text-center">
            <p className="font-medium mb-0.5">No data available yet</p>
            <p className="text-xs text-muted-foreground/70">Historical data will appear once you sync your accounts</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-foreground mb-3">Account Values Over Time</h3>
      <div className="h-[300px]">
        <ResponsiveLine
          data={visibleData}
          margin={{ top: 5, right: 120, left: 5, bottom: 5 }}
          xScale={{ type: 'point' }}
          yScale={{ type: 'linear', min: 'auto', max: 'auto' }}
          curve="monotoneX"
          colors={['var(--color-primary)', 'var(--color-chart-1)', 'var(--color-destructive)']}
          lineWidth={2}
          enablePoints={false}
          enableGridX={false}
          axisBottom={{
            tickSize: 0,
            tickPadding: 8,
          }}
          axisLeft={{
            tickSize: 0,
            tickPadding: 8,
            format: (v) => {
              if (v >= 1000000) return `$${(v / 1000000).toFixed(1)}M`;
              if (v >= 1000) return `$${(v / 1000).toFixed(0)}K`;
              return `$${v}`;
            },
          }}
          theme={nivoTheme}
          useMesh={true}
          enableSlices="x"
          sliceTooltip={({ slice }) => (
            <div>
              <strong>{slice.points[0]?.data.xFormatted}</strong>
              {slice.points.map((point) => (
                <div key={point.id} style={{ color: point.color }}>
                  {point.seriesId}: {formatCurrency(Number(point.data.y))}
                </div>
              ))}
            </div>
          )}
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
              effects: [
                {
                  on: 'hover',
                  style: { itemOpacity: 1 },
                },
              ],
            },
          ]}
        />
      </div>
    </div>
  );
}
