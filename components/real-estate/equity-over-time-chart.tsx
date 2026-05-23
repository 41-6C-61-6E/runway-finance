'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
} from 'recharts';
import { formatCurrency } from '@/lib/utils/format';
import { getChartXTicks, formatSafeUTCDate } from '@/lib/utils/date';
import { ChartTooltip, TooltipRow, TooltipHeader } from '@/components/charts/chart-tooltip';
import { ChartEmptyState } from '@/components/charts/chart-empty-state';
import { TimeRangeFilter, type TimeRange } from '@/components/charts/chart-filters';
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
  mortgageSnapshots: (PropertySnapshot & { accountId?: string })[];
  linkedMortgages: { id: string; name: string; balance: number }[];
  metadata?: {
    purchaseDate?: string;
    [key: string]: any;
  };
}

interface RealEstateData {
  properties: PropertyData[];
}

export function EquityOverTimeChart() {
  const { isEnabled } = useSyntheticData();
  const [data, setData] = useState<RealEstateData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = usePersistentState<TimeRange>('runway:real-estate:timeRange', 'all');
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>('all');

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

  const properties = data?.properties ?? [];

  // Compute timelines once data is loaded
  const { propTimelines, combinedTimeline } = useMemo(() => {
    if (properties.length === 0) return { propTimelines: [], combinedTimeline: [] };

    const parsedTimelines = properties.map((prop) => {
      // Group mortgage snapshots by date and accountId to avoid double counting and handle multiple mortgages correctly
      const sortedPropSnaps = [...prop.snapshots].sort((a, b) => a.date.localeCompare(b.date));
      const sortedMortSnaps = [...prop.mortgageSnapshots].sort((a, b) => a.date.localeCompare(b.date));

      const mortgageSnapshotsByDate: Record<string, Record<string, { value: number; isSynthetic: boolean }>> = {};
      for (const snap of sortedMortSnaps) {
        const accId = snap.accountId || 'default';
        if (!mortgageSnapshotsByDate[snap.date]) {
          mortgageSnapshotsByDate[snap.date] = {};
        }
        mortgageSnapshotsByDate[snap.date][accId] = {
          value: Math.abs(snap.value),
          isSynthetic: snap.isSynthetic ?? false,
        };
      }

      // Group property snapshots by date
      const propSnapshotsByDate: Record<string, { value: number; isSynthetic: boolean }> = {};
      for (const snap of sortedPropSnaps) {
        propSnapshotsByDate[snap.date] = {
          value: snap.value,
          isSynthetic: snap.isSynthetic ?? false,
        };
      }

      // All unique dates for this property
      const allDates = Array.from(new Set([
        ...Object.keys(propSnapshotsByDate),
        ...Object.keys(mortgageSnapshotsByDate)
      ])).sort();

      if (allDates.length === 0) {
        allDates.push(new Date().toISOString().split('T')[0]);
      }

      // Chronologically forward-fill values
      let lastPropValue = prop.value;
      if (sortedPropSnaps.length > 0) {
        lastPropValue = sortedPropSnaps[0].value;
      }

      // Map from mortgage account ID to its last known balance
      const lastMortgageBalances: Record<string, number> = {};
      for (const m of prop.linkedMortgages) {
        lastMortgageBalances[m.id] = Math.abs(m.balance);
      }

      const timeline = allDates.map((date) => {
        // Update property value if there's a snapshot
        if (propSnapshotsByDate[date]) {
          lastPropValue = propSnapshotsByDate[date].value;
        }

        // Update mortgage balances if there's a snapshot on this date
        if (mortgageSnapshotsByDate[date]) {
          for (const [accId, snapInfo] of Object.entries(mortgageSnapshotsByDate[date])) {
            lastMortgageBalances[accId] = snapInfo.value;
          }
        }

        // Sum current mortgage balances
        const totalMortgageBalance = Object.values(lastMortgageBalances).reduce((s, b) => s + b, 0);
        const equity = lastPropValue - totalMortgageBalance;

        // Is synthetic if property snapshot or any current mortgage snapshot on this date is synthetic
        const isSyntheticProp = propSnapshotsByDate[date]?.isSynthetic ?? false;
        const isSyntheticMort = mortgageSnapshotsByDate[date]
          ? Object.values(mortgageSnapshotsByDate[date]).some(s => s.isSynthetic)
          : false;
        const isSynthetic = isSyntheticProp || isSyntheticMort;

        return {
          date,
          homeValue: Math.round(lastPropValue * 100) / 100,
          equity: Math.round(equity * 100) / 100,
          mortgage: Math.round(totalMortgageBalance * 100) / 100,
          isSynthetic,
        };
      });

      // Filter by purchaseDate if available
      const purchaseDate = prop.metadata?.purchaseDate;
      const filteredTimeline = timeline.filter((pt) => !purchaseDate || pt.date >= purchaseDate);

      // Ensure at least one data point
      if (filteredTimeline.length === 0) {
        const date = purchaseDate || new Date().toISOString().split('T')[0];
        const totalMort = prop.linkedMortgages.reduce((sum, m) => sum + Math.abs(m.balance), 0);
        filteredTimeline.push({
          date,
          homeValue: prop.value,
          equity: prop.value - totalMort,
          mortgage: totalMort,
          isSynthetic: false,
        });
      }

      return {
        id: prop.id,
        name: prop.name,
        purchaseDate,
        timeline: filteredTimeline,
      };
    });

    // Generate Combined Timeline
    const allCombinedDates = Array.from(new Set(
      parsedTimelines.flatMap((pt) => pt.timeline.map((item) => item.date))
    )).sort();

    if (allCombinedDates.length === 0) {
      allCombinedDates.push(new Date().toISOString().split('T')[0]);
    }

    const combined = allCombinedDates.map((date) => {
      let totalHomeValue = 0;
      let totalEquity = 0;
      let totalMortgage = 0;
      let isSynthetic = false;

      for (const pt of parsedTimelines) {
        // Find latest point <= date
        const matches = pt.timeline.filter((item) => item.date <= date);
        if (matches.length > 0) {
          const latestPoint = matches[matches.length - 1];
          totalHomeValue += latestPoint.homeValue;
          totalEquity += latestPoint.equity;
          totalMortgage += latestPoint.mortgage;
          if (latestPoint.isSynthetic) {
            isSynthetic = true;
          }
        }
      }

      return {
        date,
        homeValue: Math.round(totalHomeValue * 100) / 100,
        equity: Math.round(totalEquity * 100) / 100,
        mortgage: Math.round(totalMortgage * 100) / 100,
        isSynthetic,
      };
    });

    return { propTimelines: parsedTimelines, combinedTimeline: combined };
  }, [properties]);

  const showSynth = isEnabled('realEstate');

  const activeTimeline = useMemo(() => {
    const rawTimeline = selectedPropertyId === 'all'
      ? combinedTimeline
      : (propTimelines.find((p) => p.id === selectedPropertyId)?.timeline ?? []);

    // Filter synthetic data if showSynth is false
    const synthFiltered = rawTimeline.filter((pt) => showSynth || !pt.isSynthetic);

    // Calculate cutoff date string
    let cutoffStr = '1970-01-01';
    if (timeRange !== 'all') {
      const cutoffDate = new Date();
      if (timeRange === '1m') cutoffDate.setMonth(cutoffDate.getMonth() - 1);
      else if (timeRange === '3m') cutoffDate.setMonth(cutoffDate.getMonth() - 3);
      else if (timeRange === '6m') cutoffDate.setMonth(cutoffDate.getMonth() - 6);
      else if (timeRange === '1y') cutoffDate.setFullYear(cutoffDate.getFullYear() - 1);
      else if (timeRange === '5y') cutoffDate.setFullYear(cutoffDate.getFullYear() - 5);
      else if (timeRange === 'ytd') {
        cutoffDate.setMonth(0, 1);
      }
      const y = cutoffDate.getFullYear();
      const m = String(cutoffDate.getMonth() + 1).padStart(2, '0');
      const d = String(cutoffDate.getDate()).padStart(2, '0');
      cutoffStr = `${y}-${m}-${d}`;
    }

    return synthFiltered.filter((pt) => pt.date >= cutoffStr);
  }, [selectedPropertyId, propTimelines, combinedTimeline, showSynth, timeRange]);

  const xAxisTicks = useMemo(() => {
    return getChartXTicks(activeTimeline, timeRange, 'date');
  }, [activeTimeline, timeRange]);

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

  if (properties.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">Equity Over Time</h3>
        <ChartEmptyState variant="nodata" />
      </div>
    );
  }

  const hasEstimated = showSynth && activeTimeline.some((pt) => pt.isSynthetic);
  const maxVal = Math.max(...activeTimeline.map((pt) => pt.homeValue), 1);

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null;
    
    const point = payload[0].payload;
    const dateStr = point.date;

    const formatPointDate = (d: string) => formatSafeUTCDate(d, {
      month: 'short',
      day: 'numeric',
      year: '2-digit',
    });

    const mortgage = point.homeValue - point.equity;

    return (
      <ChartTooltip>
        <TooltipHeader>{formatPointDate(String(dateStr))}</TooltipHeader>
        <TooltipRow
          label="Home Value"
          value={formatCurrency(point.homeValue)}
          color="var(--color-chart-2)"
        />
        <TooltipRow
          label="Equity"
          value={formatCurrency(point.equity)}
          color="var(--color-chart-1)"
        />
        {mortgage > 0 && (
          <TooltipRow
            label="Mortgage Balance"
            value={formatCurrency(mortgage)}
            color="var(--color-muted-foreground)"
          />
        )}
      </ChartTooltip>
    );
  };

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm relative">
      <div className="p-5 pb-2 flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-foreground">Equity Over Time</h3>
        <div className="flex items-center gap-2 flex-wrap">
          {properties.length > 1 && (
            <select
              value={selectedPropertyId}
              onChange={(e) => setSelectedPropertyId(e.target.value)}
              className="bg-card text-foreground hover:bg-muted text-xs font-medium px-3 py-1.5 rounded-lg border border-border focus:ring-1 focus:ring-primary focus:border-primary outline-none cursor-pointer transition-colors"
            >
              <option value="all">All Properties</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
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
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={activeTimeline}
              margin={{ top: 15, right: 10, left: 10, bottom: 5 }}
            >
              <defs>
                <linearGradient id="colorHomeValue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-chart-2)" stopOpacity={0.12}/>
                  <stop offset="95%" stopColor="var(--color-chart-2)" stopOpacity={0.01}/>
                </linearGradient>
                <linearGradient id="colorEquity" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-chart-1)" stopOpacity={0.25}/>
                  <stop offset="95%" stopColor="var(--color-chart-1)" stopOpacity={0.03}/>
                </linearGradient>
                <linearGradient id="colorMortgage" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-chart-3)" stopOpacity={0.15}/>
                  <stop offset="95%" stopColor="var(--color-chart-3)" stopOpacity={0.02}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={{ stroke: 'var(--color-border)' }}
                tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
                ticks={xAxisTicks}
                tickFormatter={(d) => {
                  if (!d) return '';
                  if (timeRange === '1m') {
                    return formatSafeUTCDate(d, { month: 'short', day: 'numeric' });
                  } else if (timeRange === '5y' || timeRange === 'all') {
                    return formatSafeUTCDate(d, { year: 'numeric' });
                  } else {
                    return formatSafeUTCDate(d, { month: 'short', year: '2-digit' });
                  }
                }}
              />
              <YAxis
                tickLine={false}
                axisLine={{ stroke: 'var(--color-border)' }}
                tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
                domain={[0, maxVal * 1.05]}
                tickFormatter={(v: number) => {
                  if (v >= 1000000) return `$${(v / 1000000).toFixed(1)}M`;
                  if (v >= 1000) return `$${(v / 1000).toFixed(0)}K`;
                  if (v === 0) return '$0';
                  return `$${v.toFixed(0)}`;
                }}
              />
              <RechartsTooltip
                content={<CustomTooltip />}
                cursor={{ stroke: 'var(--color-ring)', strokeWidth: 1, strokeDasharray: '2 2' }}
              />
              
              {/* Home Value Area (renders behind) */}
              <Area
                type="monotone"
                dataKey="homeValue"
                name="Home Value"
                stroke="var(--color-chart-2)"
                strokeWidth={2}
                fill="url(#colorHomeValue)"
                dot={false}
              />
              
              {/* Equity Area (renders in front) */}
              <Area
                type="monotone"
                dataKey="equity"
                name="Equity"
                stroke="var(--color-chart-1)"
                strokeWidth={2}
                fill="url(#colorEquity)"
                dot={false}
              />
              
              {/* Mortgage Balance Area */}
              <Area
                type="monotone"
                dataKey="mortgage"
                name="Mortgage Balance"
                stroke="var(--color-chart-3)"
                strokeWidth={2}
                strokeDasharray="5 5"
                fill="url(#colorMortgage)"
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="px-5 pb-4 flex items-center justify-center gap-6 text-xs">
        <div className="flex items-center gap-2">
          <div className="w-3 h-0.5 rounded" style={{ background: 'var(--color-chart-2)' }} />
          <span className="text-muted-foreground">Home Value</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-0.5 rounded" style={{ background: 'var(--color-chart-1)' }} />
          <span className="text-muted-foreground">Equity</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-0.5 rounded" style={{
            background: 'var(--color-chart-3)',
            backgroundImage: 'repeating-linear-gradient(90deg, var(--color-chart-3) 0, var(--color-chart-3) 4px, transparent 4px, transparent 6px)'
          }} />
          <span className="text-muted-foreground">Mortgage Balance</span>
        </div>
      </div>
    </div>
  );
}
