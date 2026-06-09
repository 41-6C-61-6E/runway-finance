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
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useSyntheticData } from '@/lib/hooks/use-synthetic-data';
import { EstimatePill } from '@/components/ui/estimate-pill';
import { useCardCollapsed } from '@/lib/hooks/use-card-collapsed';
import { CollapsibleCardHeader } from '@/components/ui/collapsible-card-header';
import { CollapsibleFilterPanel } from '@/components/ui/collapsible-filter-panel';
import { TrendingUp } from 'lucide-react';
import { getMonthRange } from '@/lib/utils/date-window';
import { useDateWindow } from '@/lib/hooks/use-date-window';
import { DateWindowNav } from '@/components/charts/date-window-nav';

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
  linkedMortgages: {
    id: string;
    name: string;
    balance: number;
    originalLoanAmount?: number;
    interestRate?: number;
    monthlyPayment?: number;
    termMonths?: number;
    metadata?: Record<string, any>;
  }[];
  metadata?: {
    purchaseDate?: string;
    [key: string]: any;
  };
}

interface RealEstateData {
  properties: PropertyData[];
}

export function EquityOverTimeChart() {
  const [isCollapsed, setIsCollapsed] = useCardCollapsed('equityOverTimeChart');
  const { isEnabled } = useSyntheticData();
  const [data, setData] = useState<RealEstateData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const {
    timeframe, setTimeframe,
    windowEnd, setWindowEnd,
    prevWindow, nextWindow, isNextDisabled,
    windowLabel,
    periodOptions,
    showWindowNav,
    monthRange,
  } = useDateWindow('finance:real-estate:timeframe', 'finance:real-estate:windowEnd', 'all');
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);

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

      // Map from mortgage account ID to its last known balance, starting with the earliest snapshot or original loan amount
      const lastMortgageBalances: Record<string, number> = {};
      for (const m of prop.linkedMortgages) {
        const snaps = sortedMortSnaps.filter((s) => s.accountId === m.id);
        if (snaps.length > 0) {
          lastMortgageBalances[m.id] = Math.abs(snaps[0].value);
        } else {
          lastMortgageBalances[m.id] = (m.originalLoanAmount ?? 0) > 0 ? (m.originalLoanAmount ?? 0) : Math.abs(m.balance);
        }
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

        // Deconstruct individual mortgage balances by key (zero-out prior to loan origination or after loan end)
        const mortgageBalances: Record<string, number | undefined> = {};
        let totalMortgageBalance = 0;
        for (const m of prop.linkedMortgages) {
          const origDate = m.metadata?.purchaseDate || m.metadata?.startDate || '1970-01-01';
          const status = m.metadata?.mortgageStatus as string | undefined;
          const endEventDate = status === 'paid_off' ? m.metadata?.payoffDate : (status === 'refinanced' ? m.metadata?.refinanceDate : undefined);

          if (date < origDate) {
            mortgageBalances[`mortgage_${m.id}`] = undefined;
          } else if (endEventDate && date >= endEventDate) {
            mortgageBalances[`mortgage_${m.id}`] = undefined;
          } else {
            const bal = lastMortgageBalances[m.id] ?? 0;
            if (bal <= 0) {
              mortgageBalances[`mortgage_${m.id}`] = undefined;
            } else {
              mortgageBalances[`mortgage_${m.id}`] = Math.round(bal * 100) / 100;
              totalMortgageBalance += bal;
            }
          }
        }

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
          ...mortgageBalances,
          isSynthetic,
        };
      });

      // Filter by purchaseDate if available
      const purchaseDate = prop.metadata?.purchaseDate;
      const filteredTimeline = timeline.filter((pt) => !purchaseDate || pt.date >= purchaseDate);

      // Ensure at least one data point
      if (filteredTimeline.length === 0) {
        const date = purchaseDate || new Date().toISOString().split('T')[0];
        const totalMort = prop.linkedMortgages.reduce((sum, m) => {
          const origDate = m.metadata?.purchaseDate || m.metadata?.startDate || '1970-01-01';
          const status = m.metadata?.mortgageStatus as string | undefined;
          const endEventDate = status === 'paid_off' ? m.metadata?.payoffDate : (status === 'refinanced' ? m.metadata?.refinanceDate : undefined);
          const isBeforeOrig = date < origDate;
          const isAfterEnd = endEventDate && date >= endEventDate;
          return sum + ((isBeforeOrig || isAfterEnd) ? 0 : Math.abs(m.balance));
        }, 0);
        const mortgageBalances: Record<string, number | undefined> = {};
        for (const m of prop.linkedMortgages) {
          const origDate = m.metadata?.purchaseDate || m.metadata?.startDate || '1970-01-01';
          const status = m.metadata?.mortgageStatus as string | undefined;
          const endEventDate = status === 'paid_off' ? m.metadata?.payoffDate : (status === 'refinanced' ? m.metadata?.refinanceDate : undefined);
          const isBeforeOrig = date < origDate;
          const isAfterEnd = endEventDate && date >= endEventDate;
          const bal = (isBeforeOrig || isAfterEnd) ? 0 : Math.abs(m.balance);
          mortgageBalances[`mortgage_${m.id}`] = bal <= 0 ? undefined : bal;
        }
        filteredTimeline.push({
          date,
          homeValue: prop.value,
          equity: prop.value - totalMort,
          mortgage: totalMort,
          ...mortgageBalances,
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
      const combinedMortgageBalances: Record<string, number | undefined> = {};

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
          // Sum up individual mortgages by key
          for (const key of Object.keys(latestPoint)) {
            if (key.startsWith('mortgage_')) {
              const val = latestPoint[key];
              if (val !== undefined && val !== null) {
                combinedMortgageBalances[key] = ((combinedMortgageBalances[key] as number) || 0) + (val as number);
              }
            }
          }
        }
      }

      // Convert zero balances to undefined to avoid drawing lines along the x-axis
      for (const key of Object.keys(combinedMortgageBalances)) {
        if (combinedMortgageBalances[key] === 0) {
          combinedMortgageBalances[key] = undefined;
        }
      }

      return {
        date,
        homeValue: Math.round(totalHomeValue * 100) / 100,
        equity: Math.round(totalEquity * 100) / 100,
        mortgage: Math.round(totalMortgage * 100) / 100,
        ...combinedMortgageBalances,
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

    if (timeframe === 'all') return synthFiltered;

    const startStr = `${monthRange.start}-01`;
    const [ey, em] = monthRange.end.split('-').map(Number);
    const endStr = `${ey}-${String(em).padStart(2, '0')}-${new Date(ey, em, 0).getDate()}`;

    return synthFiltered.filter((pt) => pt.date >= startStr && pt.date <= endStr);
  }, [selectedPropertyId, propTimelines, combinedTimeline, showSynth, timeframe, monthRange.start, monthRange.end]);

  const xAxisTicks = useMemo(() => {
    return getChartXTicks(activeTimeline, timeframe, 'date');
  }, [activeTimeline, timeframe]);

  // Map mortgage account IDs to their readable names
  const mortgageNamesMap = useMemo(() => {
    const map = new Map<string, string>();
    properties.forEach((prop) => {
      prop.linkedMortgages.forEach((m) => {
        map.set(`mortgage_${m.id}`, m.name);
      });
    });
    return map;
  }, [properties]);

  // Gather all unique mortgage keys present in the filtered timeline
  const activeMortgageKeys = useMemo(() => {
    const keysSet = new Set<string>();
    for (const point of activeTimeline) {
      for (const key of Object.keys(point)) {
        if (key.startsWith('mortgage_') && (point[key] as number) > 0) {
          keysSet.add(key);
        }
      }
    }
    return Array.from(keysSet).sort();
  }, [activeTimeline]);

  // Color palette for individual mortgages
  const mortgageColors = useMemo(() => [
    'var(--color-chart-3)',
    'var(--color-chart-4)',
    'var(--color-chart-5)',
  ], []);

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm">
        <CollapsibleCardHeader
          isCollapsed={isCollapsed}
          onToggle={setIsCollapsed}
          title={
            <h3 className="text-sm sm:text-base font-normal text-foreground flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" /> Equity Over Time
            </h3>
          }
        />
        {!isCollapsed && <LoadingSpinner category="chart" className="h-[300px]" />}
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
            <h3 className="text-sm sm:text-base font-normal text-foreground flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" /> Equity Over Time
            </h3>
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

  if (properties.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm">
        <CollapsibleCardHeader
          isCollapsed={isCollapsed}
          onToggle={setIsCollapsed}
          title={
            <h3 className="text-sm sm:text-base font-normal text-foreground flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" /> Equity Over Time
            </h3>
          }
        />
        {!isCollapsed && (
          <div className="p-5">
            <ChartEmptyState variant="nodata" />
          </div>
        )}
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
        {activeMortgageKeys.map((key, index) => {
          const val = point[key];
          if (val === undefined || val <= 0) return null;
          const color = mortgageColors[index % mortgageColors.length];
          const name = mortgageNamesMap.get(key) || 'Mortgage Balance';
          return (
            <TooltipRow
              key={key}
              label={name}
              value={formatCurrency(val)}
              color={color}
            />
          );
        })}
      </ChartTooltip>
    );
  };

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm">
      <CollapsibleCardHeader
        isCollapsed={isCollapsed}
        onToggle={setIsCollapsed}
        title={
          <div className="flex items-center gap-2">
            <h3 className="text-sm sm:text-base font-normal text-foreground flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" /> Equity Over Time
            </h3>
            {!isCollapsed && hasEstimated && <EstimatePill />}
          </div>
        }
      />

      {!isCollapsed && (
        <>
          <CollapsibleFilterPanel
            isOpen={showFilters}
            onToggle={() => setShowFilters(!showFilters)}
            feedback={
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider">
                  {properties.find(p => p.id === selectedPropertyId)?.name ?? 'ALL PROPERTIES'}
                </span>
                <span className="bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider">
                  {timeframe.toUpperCase()}
                </span>
              </div>
            }
            rightActions={
              showWindowNav && (
                <DateWindowNav
                  prev={prevWindow}
                  next={nextWindow}
                  nextDisabled={isNextDisabled}
                  label={windowLabel}
                  options={periodOptions}
                  currentValue={windowEnd}
                  onSelect={setWindowEnd}
                />
              )
            }
          >
            <div className="flex flex-wrap items-center justify-between gap-4 p-3 bg-muted/20 border border-border/20 rounded-xl">
              {properties.length > 1 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mr-1">Property</span>
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
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mr-1">Timeframe</span>
                <TimeRangeFilter value={timeframe} onChange={setTimeframe} />
              </div>
            </div>
          </CollapsibleFilterPanel>
          <div className="h-[300px] px-2 pb-2">
            <div className="h-full">
              <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 100, height: 100 }}>
                <ComposedChart
                  data={activeTimeline}
                  margin={{ top: 15, right: 10, left: 10, bottom: 5 }}
                >
                  <defs>
                    <linearGradient id="colorHomeValue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-chart-2)" stopOpacity={0.30}/>
                      <stop offset="95%" stopColor="var(--color-chart-2)" stopOpacity={0.05}/>
                    </linearGradient>
                    <linearGradient id="colorEquity" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-chart-1)" stopOpacity={0.45}/>
                      <stop offset="95%" stopColor="var(--color-chart-1)" stopOpacity={0.08}/>
                    </linearGradient>
                    {activeMortgageKeys.map((key, index) => {
                      const color = mortgageColors[index % mortgageColors.length];
                      return (
                        <linearGradient key={key} id={`color_${key}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={color} stopOpacity={0.30}/>
                          <stop offset="95%" stopColor={color} stopOpacity={0.05}/>
                        </linearGradient>
                      );
                    })}
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
                      if (timeframe === '1m') {
                        return formatSafeUTCDate(d, { month: 'short', day: 'numeric' });
                      } else if (timeframe === '5y' || timeframe === 'all') {
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
                  
                  {/* Mortgage Balance Areas */}
                  {activeMortgageKeys.map((key, index) => {
                    const color = mortgageColors[index % mortgageColors.length];
                    const name = mortgageNamesMap.get(key) || 'Mortgage Balance';
                    return (
                      <Area
                        key={key}
                        type="monotone"
                        dataKey={key}
                        name={name}
                        stroke={color}
                        strokeWidth={2}
                        strokeDasharray="5 5"
                        fill={`url(#color_${key})`}
                        dot={false}
                      />
                    );
                  })}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="px-5 pb-4 flex items-center justify-center gap-6 flex-wrap text-xs">
            <div className="flex items-center gap-2">
              <div className="w-3 h-0.5 rounded" style={{ background: 'var(--color-chart-2)' }} />
              <span className="text-muted-foreground">Home Value</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-0.5 rounded" style={{ background: 'var(--color-chart-1)' }} />
              <span className="text-muted-foreground">Equity</span>
            </div>
            {activeMortgageKeys.map((key, index) => {
              const color = mortgageColors[index % mortgageColors.length];
              const name = mortgageNamesMap.get(key) || 'Mortgage Balance';
              return (
                <div key={key} className="flex items-center gap-2">
                  <div className="w-3 h-0.5 rounded" style={{
                    background: color,
                    backgroundImage: `repeating-linear-gradient(90deg, ${color} 0, ${color} 4px, transparent 4px, transparent 6px)`
                  }} />
                  <span className="text-muted-foreground">{name}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
