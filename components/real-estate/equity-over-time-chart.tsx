'use client';

import { useState, useEffect } from 'react';
import { ResponsiveLine } from '@nivo/line';
import { formatCurrency } from '@/lib/utils/format';
import { nivoTheme } from '@/components/charts/shared-chart-theme';
import { ChartTooltip, TooltipRow, TooltipHeader } from '@/components/charts/chart-tooltip';
import { ChartEmptyState } from '@/components/charts/chart-empty-state';
import { TimeRangeFilter, type TimeRange } from '@/components/charts/chart-filters';
import { SyntheticLineLayer } from '@/components/charts/synthetic-line-layer';
import { useSyntheticData } from '@/lib/hooks/use-synthetic-data';
import { EstimatePill } from '@/components/ui/estimate-pill';
import { usePersistentState } from '@/lib/hooks/use-persistent-state';

interface PropertySnapshot {
  date: string;
  value: number;
  isSynthetic?: boolean;
}

interface PropertyData {
  id: string;
  name: string;
  value: number;
  snapshots: PropertySnapshot[];
  mortgageSnapshots: PropertySnapshot[];
  linkedMortgages: { id: string; name: string; balance: number }[];
}

interface RealEstateData {
  properties: PropertyData[];
}

export function EquityOverTimeChart() {
  const { isEnabled } = useSyntheticData();
  const [data, setData] = useState<RealEstateData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = usePersistentState<TimeRange>('runway:real-estate:timeRange', '1y');

  useEffect(() => {
    fetch('/api/real-estate?months=600', { credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch');
        return res.json();
      })
      .then((d) => setData(d))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm">
        <div className="p-5 pb-2">
          <h3 className="text-sm font-semibold text-foreground">Equity Over Time</h3>
        </div>
        <div className="h-[300px] flex items-center justify-center text-muted-foreground">
          <div className="w-7 h-7 border-2 border-border border-t-primary rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">Equity Over Time</h3>
        <ChartEmptyState variant="error" error={error} />
      </div>
    );
  }

  const properties = data?.properties ?? [];
  if (properties.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">Equity Over Time</h3>
        <ChartEmptyState variant="nodata" />
      </div>
    );
  }

  // Build equity series per property using mortgage snapshots as canonical timeline
  // Forward-fill property values from nearest prior property snapshot to avoid
  // mixing historical and current data (which caused ~90-day spike artifacts).
  const chartData = properties.map((prop) => {
    const totalMortgage = prop.linkedMortgages.reduce((s, m) => s + Math.abs(m.balance), 0);

    const sortedPropSnaps = [...prop.snapshots].sort((a, b) => a.date.localeCompare(b.date));
    const sortedMortSnaps = [...prop.mortgageSnapshots].sort((a, b) => a.date.localeCompare(b.date));

    const data: Array<{ x: string; y: number; isSynthetic: boolean }> = [];

    if (sortedMortSnaps.length > 0) {
      let propIdx = 0;
      for (const mortSnap of sortedMortSnaps) {
        while (propIdx < sortedPropSnaps.length - 1 && sortedPropSnaps[propIdx + 1].date <= mortSnap.date) {
          propIdx++;
        }
        const propSnap = propIdx < sortedPropSnaps.length && sortedPropSnaps[propIdx].date <= mortSnap.date
          ? sortedPropSnaps[propIdx]
          : null;
        const propValue = propSnap ? propSnap.value : prop.value;
        const equity = propValue - Math.abs(mortSnap.value);
        data.push({
          x: mortSnap.date,
          y: Math.round(equity * 100) / 100,
          isSynthetic: (propSnap?.isSynthetic ?? false) || (mortSnap.isSynthetic ?? false),
        });
      }
    } else if (sortedPropSnaps.length > 0) {
      for (const propSnap of sortedPropSnaps) {
        data.push({
          x: propSnap.date,
          y: propSnap.value - totalMortgage,
          isSynthetic: propSnap.isSynthetic ?? false,
        });
      }
    }

    if (data.length === 0) {
      data.push({ x: new Date().toISOString().split('T')[0], y: prop.value - totalMortgage, isSynthetic: false });
    }

    return { id: prop.name, data };
  });

  const cutoffDate = new Date();
  if (timeRange === '1m') cutoffDate.setMonth(cutoffDate.getMonth() - 1);
  else if (timeRange === '3m') cutoffDate.setMonth(cutoffDate.getMonth() - 3);
  else if (timeRange === '6m') cutoffDate.setMonth(cutoffDate.getMonth() - 6);
  else if (timeRange === '1y') cutoffDate.setFullYear(cutoffDate.getFullYear() - 1);
  else if (timeRange === '5y') cutoffDate.setFullYear(cutoffDate.getFullYear() - 5);

  const showSynth = isEnabled('realEstate');

  const filtered = chartData.map((series) => ({
    ...series,
    data: series.data.filter((d) => (showSynth || !d.isSynthetic) && new Date(d.x) >= cutoffDate),
  })).filter((s) => s.data.length > 0);

  // Check if any snapshot data contains synthetic (estimated) values
  const hasEstimated = showSynth && chartData.some((series) =>
    series.data.some((d) => d.isSynthetic)
  );

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm relative">
      <div className="p-5 pb-2 flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-foreground">Equity Over Time</h3>
        <div className="flex items-center gap-2">
          <TimeRangeFilter value={timeRange} onChange={setTimeRange} />
        </div>
      </div>
      <div className="h-[300px] px-2 pb-2">
        {hasEstimated && (
          <div className="absolute top-2 right-2 z-10">
            <EstimatePill />
          </div>
        )}
        <div className="financial-chart h-full">
          <ResponsiveLine
            data={filtered}
            margin={{ top: 10, right: 20, left: 80, bottom: 30 }}
            xScale={{ type: 'time', format: '%Y-%m-%d', useUTC: false, precision: 'day' }}
            yScale={{ type: 'linear', min: 0, max: Math.max(...filtered.flatMap((s) => s.data.map((d) => d.y)), 1) * 1.1 }}
            curve="monotoneX"
            axisLeft={{
              tickSize: 0, tickPadding: 8,
              format: (v: number) => {
                if (v >= 1000000) return `$${(v / 1000000).toFixed(1)}M`;
                if (v >= 1000) return `$${(v / 1000).toFixed(0)}K`;
                return `$${v}`;
              },
            }}
            axisBottom={{
              tickSize: 0, tickPadding: 8, tickValues: 4,
              format: '%b %y',
            }}
            enableGridY={true}
            enableGridX={false}
            enablePoints={false}
            enableArea={true}
            areaOpacity={0.06}
            colors={['var(--color-chart-3)', 'var(--color-chart-4)', 'var(--color-chart-5)']}
            theme={nivoTheme}
            animate={filtered[0]?.data.length < 100}
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
            tooltip={({ point }) => (
              <ChartTooltip>
                <TooltipHeader>{String(point.data.xFormatted)}</TooltipHeader>
                <TooltipRow label={String(point.seriesId)} value={formatCurrency(point.data.y as number)} />
              </ChartTooltip>
            )}
          />
        </div>
      </div>
    </div>
  );
}
