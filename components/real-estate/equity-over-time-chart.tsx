'use client';

import { useState, useEffect } from 'react';
import { ResponsiveLine } from '@nivo/line';
import { formatCurrency } from '@/lib/utils/format';
import { nivoTheme } from '@/components/charts/shared-chart-theme';
import { ChartTooltip, TooltipRow, TooltipHeader } from '@/components/charts/chart-tooltip';
import { ChartEmptyState } from '@/components/charts/chart-empty-state';
import { TimeRangeFilter, type TimeRange } from '@/components/charts/chart-filters';

interface PropertySnapshot {
  date: string;
  value: number;
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
  const [data, setData] = useState<RealEstateData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>('1y');

  useEffect(() => {
    fetch('/api/real-estate', { credentials: 'include' })
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

  const dateMap = new Map<string, Map<string, number>>();
  for (const prop of properties) {
    const totalMortgage = prop.linkedMortgages.reduce((s, m) => s + Math.abs(m.balance), 0);
    const propertySnaps = new Map(prop.snapshots.map((s) => [s.date, s.value]));
    const mortgageSnaps = new Map(prop.mortgageSnapshots.map((s) => [s.date, s.value]));
    const allDates = new Set([...prop.snapshots.map((s) => s.date), ...prop.mortgageSnapshots.map((s) => s.date)]);

    if (allDates.size === 0) {
      if (!dateMap.has('today')) dateMap.set('today', new Map());
      dateMap.get('today')!.set(prop.id, prop.value - totalMortgage);
      continue;
    }

    for (const date of allDates) {
      if (!dateMap.has(date)) dateMap.set(date, new Map());
      const val = propertySnaps.get(date) ?? prop.value;
      const mort = mortgageSnaps.get(date) ?? totalMortgage;
      const equity = val - Math.abs(mort);
      dateMap.get(date)!.set(prop.id, equity);
    }
  }

  const chartData = properties.map((prop) => {
    const data = Array.from(dateMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, props]) => ({
        x: date,
        y: props.get(prop.id) ?? 0,
      }));

    const totalMortgage = prop.linkedMortgages.reduce((s, m) => s + Math.abs(m.balance), 0);
    if (data.length === 0) {
      data.push({ x: new Date().toISOString().split('T')[0], y: prop.value - totalMortgage });
    }

    return {
      id: prop.name,
      data,
    };
  });

  const cutoffDate = new Date();
  if (timeRange === '1m') cutoffDate.setMonth(cutoffDate.getMonth() - 1);
  else if (timeRange === '3m') cutoffDate.setMonth(cutoffDate.getMonth() - 3);
  else if (timeRange === '6m') cutoffDate.setMonth(cutoffDate.getMonth() - 6);
  else if (timeRange === '1y') cutoffDate.setFullYear(cutoffDate.getFullYear() - 1);
  else if (timeRange === '5y') cutoffDate.setFullYear(cutoffDate.getFullYear() - 5);

  const filtered = chartData.map((series) => ({
    ...series,
    data: series.data.filter((d) => new Date(d.x) >= cutoffDate),
  })).filter((s) => s.data.length > 0);

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm">
      <div className="p-5 pb-2 flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-foreground">Equity Over Time</h3>
        <TimeRangeFilter value={timeRange} onChange={setTimeRange} />
      </div>
      <div className="h-[300px] px-2 pb-2">
        <div className="financial-chart h-full">
          <ResponsiveLine
            data={filtered}
            margin={{ top: 10, right: 20, left: 80, bottom: 30 }}
            xScale={{ type: 'point' }}
            yScale={{ type: 'linear', min: 'auto', max: 'auto' }}
            curve="monotoneX"
            axisLeft={{
              tickSize: 0, tickPadding: 8,
              format: (v: number) => {
                if (v >= 1000000) return `$${(v / 1000000).toFixed(1)}M`;
                if (v >= 1000) return `$${(v / 1000).toFixed(0)}K`;
                return `$${v}`;
              },
            }}
            axisBottom={{ tickSize: 0, tickPadding: 8, tickValues: 4 }}
            enableGridY={true}
            enableGridX={false}
            enablePoints={false}
            enableArea={true}
            areaOpacity={0.06}
            colors={['var(--color-chart-3)', 'var(--color-chart-4)', 'var(--color-chart-5)']}
            theme={nivoTheme}
            tooltip={({ point }) => (
              <ChartTooltip>
                <TooltipHeader>{String(point.data.x)}</TooltipHeader>
                <TooltipRow label={String(point.seriesId)} value={formatCurrency(point.data.y as number)} />
              </ChartTooltip>
            )}
          />
        </div>
      </div>
    </div>
  );
}
