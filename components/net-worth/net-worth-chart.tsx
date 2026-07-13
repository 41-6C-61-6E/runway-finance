'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useCardCollapsed } from '@/lib/hooks/use-card-collapsed';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
} from 'recharts';
import { formatCurrency, formatPercent } from '@/lib/utils/format';
import { formatSafeUTCDate } from '@/lib/utils/date';
import { usePrivacyMode } from '@/components/privacy-mode-provider';
import { formatChartYAxisCurrency, formatChartXAxisDate, getChartXTicksUnified, formatChartDateRange } from '@/lib/utils/chart-format';
import {
  computeMovingAverage,
  computeMedianFilter,
} from '@/lib/utils/chart-aggregation';
import {
  computeNetWorthChangeBarData,
} from '@/lib/utils/net-worth-change-bars';
import { ChartTooltip, TooltipRow, TooltipHeader } from '@/components/charts/chart-tooltip';
import { ChartEmptyState } from '@/components/charts/chart-empty-state';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { TimeRangeFilter, type TimeRange } from '@/components/charts/chart-filters';
import { CollapsibleCardHeader } from '@/components/ui/collapsible-card-header';
import { CollapsibleFilterPanel } from '@/components/ui/collapsible-filter-panel';
import { Activity, TrendingUp, BarChart3 } from 'lucide-react';
import { getMonthRange } from '@/lib/utils/date-window';
import { useDateWindow } from '@/lib/hooks/use-date-window';
import { DateWindowNav } from '@/components/charts/date-window-nav';
import { Switch } from '@/components/ui/switch';

interface ChartPoint {
  date: string;
  netWorth: number;
  totalAssets: number;
  totalLiabilities: number;
  isSynthetic: boolean;
  isImported: boolean;
  [key: string]: string | number | boolean | undefined;
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
  const router = useRouter();
  const { privacyMode } = usePrivacyMode();
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const {
    timeframe, setTimeframe,
    windowEnd, setWindowEnd,
    prevWindow, nextWindow, isNextDisabled,
    windowLabel,
    periodOptions,
    showWindowNav,
    dateRange,
  } = useDateWindow('finance:net-worth-chart:timeframe', 'finance:net-worth-chart:windowEnd', '1y');
  const [isCollapsed, setIsCollapsed] = useCardCollapsed('netWorthChart');
  const [showFilters, setShowFilters] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [showPercent, setShowPercent] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('finance:net-worth-chart:show-percent');
    if (saved !== null) {
      setShowPercent(saved === 'true');
    }
  }, []);

  const handlePercentChange = (checked: boolean) => {
    setShowPercent(checked);
    localStorage.setItem('finance:net-worth-chart:show-percent', String(checked));
  };

  const handleNavigateToFlows = useCallback(() => {
    router.push(`/flows?timeframe=${timeframe}`);
  }, [timeframe, router]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const startDate = dateRange.start;
        const endDate = dateRange.end;
        const res = await fetch(`/api/net-worth/chart?timeframe=${timeframe}&startDate=${startDate}&endDate=${endDate}`, { credentials: 'include' });
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
  }, [timeframe, dateRange.start, dateRange.end]);

  const processedData = useMemo(() => {
    if (chartData.length === 0) return [];

    // Helper to get max spike duration in days based on timeframe
    const getMaxSpikeDuration = (range: TimeRange): number => {
      switch (range) {
        case '1m': return 1;
        case '3m': return 1.5;
        case '6m': return 3;
        case '1y': return 4;
        case 'ytd': return 4;
        case '5y': return 7;
        case 'all': return 14;
        default: return 3;
      }
    };

    // Helper to get moving average duration in days based on timeframe for visual smoothing
    const getMaxSmaDuration = (range: TimeRange): number => {
      switch (range) {
        case '1m': return 0;
        case '3m': return 0;
        case '6m': return 4;
        case '1y': return 7;
        case 'ytd': return 7;
        case '5y': return 30;
        case 'all': return 45;
        default: return 7;
      }
    };

    // Calculate average gap in days between consecutive data points
    const first = new Date(chartData[0].date + 'T00:00:00Z').getTime();
    const last = new Date(chartData[chartData.length - 1].date + 'T00:00:00Z').getTime();
    const totalDays = (last - first) / (1000 * 60 * 60 * 24);
    const gap = chartData.length > 1 ? totalDays / (chartData.length - 1) : 1;

    const targetSpikeDays = getMaxSpikeDuration(timeframe);
    
    // A median filter of window size W filters out spikes of duration up to floor(W/2) points.
    // So we need: floor(W/2) * gap >= targetSpikeDays  =>  floor(W/2) >= targetSpikeDays / gap.
    const targetPoints = Math.ceil(targetSpikeDays / (gap || 1));
    const windowSize = 2 * targetPoints + 1;

    // Limit window size to at most 15% of the total dataset size to avoid over-smoothing
    const maxAllowed = Math.floor(chartData.length * 0.15);
    const finalWindow = Math.min(windowSize, maxAllowed % 2 === 0 ? maxAllowed + 1 : maxAllowed);
    const medianWindow = Math.max(1, finalWindow % 2 === 0 ? finalWindow - 1 : finalWindow);

    // Calculate Simple Moving Average window for visual smoothing
    const targetSmaDays = getMaxSmaDuration(timeframe);
    const smaTargetPoints = Math.round(targetSmaDays / (gap || 1));
    const maxSmaAllowed = Math.floor(chartData.length * 0.15);
    const finalSmaWindow = Math.min(smaTargetPoints, maxSmaAllowed);
    const smaWindow = Math.max(1, finalSmaWindow);

    const fields: (keyof ChartPoint & string)[] = ['netWorth', 'totalAssets', 'totalLiabilities'];
    const medianFiltered = computeMedianFilter(chartData, fields, medianWindow);

    if (smaWindow > 1) {
      return computeMovingAverage(medianFiltered, fields, smaWindow);
    }
    return medianFiltered;
  }, [chartData, timeframe]);

  const srSummary = useMemo(() => {
    if (processedData.length === 0) return '';
    const latestPoint = processedData[processedData.length - 1];
    const firstPoint = processedData[0];
    const diff = latestPoint.netWorth - firstPoint.netWorth;
    const direction = diff >= 0 ? 'increased' : 'decreased';
    return `Net Worth is currently ${formatCurrency(latestPoint.netWorth)} as of ${formatSafeUTCDate(latestPoint.date, { month: 'long', day: 'numeric', year: 'numeric' })}. Over the selected timeframe, it has ${direction} by ${formatCurrency(Math.abs(diff))}.`;
  }, [processedData]);

  const { barData, bucketSize } = useMemo(
    () => computeNetWorthChangeBarData(chartData),
    [chartData]
  );

  const barDataWithPercent = useMemo(() => {
    return barData.map((d) => {
      const percentChange = d.startNetWorth !== 0
        ? (d.change / Math.abs(d.startNetWorth)) * 100
        : 0;
      return {
        ...d,
        percentChange,
      };
    });
  }, [barData]);

  const barYDomain = useMemo(() => {
    if (barDataWithPercent.length === 0) return [-1000, 1000] as [number, number];
    const values = barDataWithPercent.map((d) => showPercent ? d.percentChange : d.change);
    const rawMax = Math.max(...values, 0);
    const rawMin = Math.min(...values, 0);
    const range = rawMax - rawMin;
    if (showPercent) {
      const pad = range === 0 ? 5 : range * 0.05;
      const minPad = Math.max(pad, 2);
      return [rawMin - minPad, rawMax + minPad] as [number, number];
    } else {
      const pad = range === 0 ? 500 : range * 0.05;
      const minPad = Math.max(pad, 500);
      return [rawMin - minPad, rawMax + minPad] as [number, number];
    }
  }, [barDataWithPercent, showPercent]);

  const areaYDomain = useMemo(() => {
    if (processedData.length === 0) return [-1000, 1000] as [number, number];
    const values = processedData.map((d) => d.netWorth);
    const rawMax = Math.max(...values);
    const rawMin = Math.min(...values);
    const range = rawMax - rawMin;
    const pad = range === 0 ? 1000 : range * 0.05;
    const minPad = Math.max(pad, 1000);
    return [rawMin - minPad, rawMax + minPad] as [number, number];
  }, [processedData]);

  const areaGradientOffset = useMemo(() => {
    const values = processedData.map((d) => d.netWorth);
    const rawMax = Math.max(...values);
    const rawMin = Math.min(...values);
    if (rawMax <= 0) return 0;
    if (rawMin >= 0) return 1;
    return rawMax / (rawMax - rawMin);
  }, [processedData]);

  const baseValue = useMemo(() => {
    if (areaGradientOffset === 1) return areaYDomain[0];
    if (areaGradientOffset === 0) return areaYDomain[1];
    return 0;
  }, [areaGradientOffset, areaYDomain]);

  const ActiveDot = useCallback((props: any) => {
    const { cx, cy, payload } = props;
    if (!cx || !cy || !payload) return null;
    const color = payload.netWorth >= 0 ? 'var(--color-chart-1)' : 'var(--color-chart-5)';
    return (
      <circle
        cx={cx}
        cy={cy}
        r={5}
        fill={color}
        stroke="var(--color-background)"
        strokeWidth={2}
        onClick={handleNavigateToFlows}
        style={{ cursor: 'pointer' }}
      />
    );
  }, [handleNavigateToFlows]);

  const areaTicks = useMemo(() => getChartXTicksUnified(processedData, timeframe, isMobile), [processedData, timeframe, isMobile]);

  const barTicks = useMemo(() => getChartXTicksUnified(barDataWithPercent, timeframe, isMobile), [barDataWithPercent, timeframe, isMobile]);



  const formatAreaXTick = useCallback((d: string) => {
    return formatChartXAxisDate(d, timeframe, { isMonthly: timeframe !== '1m' });
  }, [timeframe]);

  const formatBarXTick = useCallback((d: string) => {
    const isMonthly = bucketSize === 'monthly' || bucketSize === 'quarterly' || bucketSize === 'yearly';
    return formatChartXAxisDate(d, timeframe, { isMonthly: isMonthly || timeframe !== '1m' });
  }, [bucketSize, timeframe]);

  const formatAreaYTick = useCallback((v: number) => {
    return formatChartYAxisCurrency(v, areaYDomain[0], areaYDomain[1]);
  }, [areaYDomain]);

  const formatBarYTick = useCallback((v: number) => {
    if (showPercent) {
      return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
    }
    return formatChartYAxisCurrency(v, barYDomain[0], barYDomain[1]);
  }, [barYDomain, showPercent]);

  const AreaTooltip = useCallback(({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null;
    const point = payload[0].payload;
    return (
      <ChartTooltip>
        <TooltipHeader>{formatSafeUTCDate(point.date, { month: 'short', day: 'numeric', year: 'numeric' })}</TooltipHeader>
        <TooltipRow
          label="Net Worth"
          value={formatCurrency(point.netWorth)}
          color={point.netWorth >= 0 ? 'var(--color-chart-1)' : 'var(--color-chart-5)'}
        />
        <TooltipRow label="Total Assets" value={formatCurrency(point.totalAssets)} color="var(--color-chart-1)" />
        <TooltipRow label="Total Liabilities" value={formatCurrency(point.totalLiabilities)} color="var(--color-destructive)" />
      </ChartTooltip>
    );
  }, []);

  const BarTooltip = useCallback(({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null;
    const point = payload[0].payload;

    let dateHeader = '';
    if (point.startDate && point.endDate && point.startDate !== point.endDate) {
      const startFormatted = formatSafeUTCDate(point.startDate, { month: 'short', day: 'numeric', year: 'numeric' });
      const endFormatted = formatSafeUTCDate(point.endDate, { month: 'short', day: 'numeric', year: 'numeric' });
      dateHeader = `${startFormatted} – ${endFormatted}`;
    } else {
      dateHeader = formatSafeUTCDate(point.date || point.startDate, { month: 'short', day: 'numeric', year: 'numeric' });
    }

    return (
      <ChartTooltip>
        <TooltipHeader>{dateHeader}</TooltipHeader>
        {showPercent ? (
          <>
            <TooltipRow
              label="Change (%)"
              value={formatPercent(point.percentChange)}
              color={point.percentChange >= 0 ? 'var(--color-chart-1)' : 'var(--color-chart-5)'}
            />
            <TooltipRow
              label="Change"
              value={`${point.change >= 0 ? '+' : ''}${formatCurrency(point.change)}`}
              color={point.change >= 0 ? 'var(--color-chart-1)' : 'var(--color-chart-5)'}
            />
          </>
        ) : (
          <TooltipRow
            label="Change"
            value={`${point.change >= 0 ? '+' : ''}${formatCurrency(point.change)}`}
            color={point.change >= 0 ? 'var(--color-chart-1)' : 'var(--color-chart-5)'}
          />
        )}
        <TooltipRow label="Starting Net Worth" value={formatCurrency(point.startNetWorth)} color="var(--color-chart-1)" />
        <TooltipRow label="Ending Net Worth" value={formatCurrency(point.endNetWorth)} color="var(--color-chart-1)" />
      </ChartTooltip>
    );
  }, [showPercent]);

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
      {!privacyMode && (
        <div className="sr-only" aria-live="polite">
          {srSummary}
        </div>
      )}
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
            <div className="flex items-center">
              <TimeRangeFilter value={timeframe} onChange={setTimeframe} />
            </div>
          </CollapsibleFilterPanel>
          <div className="flex flex-col sm:flex-row divide-y sm:divide-y-0 sm:divide-x divide-border">
            <div className="flex-1 min-w-0 p-2.5 sm:p-5">
              <div className="flex items-center gap-1.5 mb-2">
                <TrendingUp className="w-3.5 h-3.5 text-chart-1" />
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Net Worth</span>
              </div>
              <div className="h-[180px] sm:h-[220px] w-full relative touch-pan-y">
                <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 100, height: 100 }}>
                  <AreaChart role="img" aria-label="Net Worth Over Time Area Chart" data={processedData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="netWorthGrad" x1="0" y1="0" x2="0" y2="1">
                        {areaGradientOffset === 1 ? (
                          <>
                            <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.35} />
                            <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0} />
                          </>
                        ) : areaGradientOffset === 0 ? (
                          <>
                            <stop offset="0%" stopColor="var(--color-chart-5)" stopOpacity={0} />
                            <stop offset="100%" stopColor="var(--color-chart-5)" stopOpacity={0.35} />
                          </>
                        ) : (
                          <>
                            <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.35} />
                            <stop offset={`${areaGradientOffset * 100}%`} stopColor="var(--color-chart-1)" stopOpacity={0} />
                            <stop offset={`${areaGradientOffset * 100}%`} stopColor="var(--color-chart-5)" stopOpacity={0} />
                            <stop offset="100%" stopColor="var(--color-chart-5)" stopOpacity={0.35} />
                          </>
                        )}
                      </linearGradient>
                      <linearGradient id="netWorthStrokeGrad" x1="0" y1="0" x2="0" y2="1">
                        {areaGradientOffset === 1 ? (
                          <stop offset="0%" stopColor="var(--color-chart-1)" />
                        ) : areaGradientOffset === 0 ? (
                          <stop offset="0%" stopColor="var(--color-chart-5)" />
                        ) : (
                          <>
                            <stop offset={`${areaGradientOffset * 100}%`} stopColor="var(--color-chart-1)" />
                            <stop offset={`${areaGradientOffset * 100}%`} stopColor="var(--color-chart-5)" />
                          </>
                        )}
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} opacity={0.3} />
                    <ReferenceLine y={0} stroke="var(--color-border)" strokeWidth={1} strokeDasharray="3 3" opacity={0.5} />
                    <XAxis
                      dataKey="date"
                      tickLine={false}
                      axisLine={{ stroke: 'var(--color-border)' }}
                      tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
                      ticks={areaTicks}
                      tickFormatter={formatAreaXTick}
                      minTickGap={30}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={{ stroke: 'var(--color-border)' }}
                      tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
                      domain={areaYDomain}
                      tickFormatter={formatAreaYTick}
                    />
                    <RechartsTooltip
                      content={<AreaTooltip />}
                      cursor={{ stroke: 'var(--color-chart-1)', strokeWidth: 1, strokeDasharray: '2 2', opacity: 0.5 }}
                    />
                    <ReferenceArea
                      y1={0}
                      y2={areaYDomain[0]}
                      fill="var(--color-chart-5)"
                      fillOpacity={0.04}
                    />
                    <Area
                      type="monotone"
                      dataKey="netWorth"
                      stroke="url(#netWorthStrokeGrad)"
                      strokeWidth={2}
                      fill="url(#netWorthGrad)"
                      baseValue={baseValue}
                      dot={false}
                      activeDot={<ActiveDot />}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="flex-1 min-w-0 p-2.5 sm:p-5">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <BarChart3 className="w-3.5 h-3.5 text-chart-1" />
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Change</span>
                </div>
                <div className="flex items-center gap-2">
                  <label htmlFor="show-percent-change" className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer select-none">
                    Show %
                  </label>
                  <Switch
                    id="show-percent-change"
                    checked={showPercent}
                    onCheckedChange={handlePercentChange}
                  />
                </div>
              </div>
              <div className="h-[180px] sm:h-[220px] w-full relative touch-pan-y">
                <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 100, height: 100 }}>
                  <BarChart
                    role="img"
                    aria-label="Net Worth Change Bar Chart"
                    data={barDataWithPercent}
                    margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                    barCategoryGap="20%"
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} opacity={0.3} />
                    <XAxis
                      dataKey="date"
                      tickLine={false}
                      axisLine={{ stroke: 'var(--color-border)' }}
                      tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
                      ticks={barTicks}
                      tickFormatter={formatBarXTick}
                      minTickGap={30}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={{ stroke: 'var(--color-border)' }}
                      tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
                      domain={barYDomain}
                      tickFormatter={formatBarYTick}
                    />
                    <ReferenceLine y={0} stroke="var(--color-border)" strokeWidth={1} />
                    <RechartsTooltip
                      content={<BarTooltip />}
                      cursor={{ fill: 'var(--color-border)', opacity: 0.15 }}
                    />
                    <Bar dataKey={showPercent ? "percentChange" : "change"} maxBarSize={48} radius={[3, 3, 0, 0]}>
                      {barDataWithPercent.map((entry, index) => (
                        <Cell
                          key={index}
                          fill={(showPercent ? entry.percentChange : entry.change) >= 0 ? 'var(--color-chart-1)' : 'var(--color-chart-5)'}
                          onClick={handleNavigateToFlows}
                          style={{ cursor: 'pointer' }}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
