'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useCardCollapsed } from '@/lib/hooks/use-card-collapsed';
import {
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
  Line,
  ComposedChart,
} from 'recharts';
import { formatCurrency } from '@/lib/utils/format';
import { formatSafeUTCDate } from '@/lib/utils/date';
import { ChartTooltip, TooltipRow, TooltipHeader } from '@/components/charts/chart-tooltip';
import { ChartEmptyState } from '@/components/charts/chart-empty-state';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { TimeRangeFilter } from '@/components/charts/chart-filters';
import { CollapsibleCardHeader } from '@/components/ui/collapsible-card-header';
import { CollapsibleFilterPanel } from '@/components/ui/collapsible-filter-panel';
import { useDateWindow } from '@/lib/hooks/use-date-window';
import { DateWindowNav } from '@/components/charts/date-window-nav';
import { Landmark, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { getMonthRange } from '@/lib/utils/date-window';

interface HistoryPoint {
  date: string;
  cashOnHand: number;
  creditCardDebt: number;
  netPosition: number;
}

interface AccountInfo {
  id: string;
  name: string;
  balance: number;
}

interface ResponseData {
  current: {
    cashOnHand: number;
    creditCardDebt: number;
    netPosition: number;
    coverageRatio: number;
  };
  history: HistoryPoint[];
  accounts: {
    cash: AccountInfo[];
    credit: AccountInfo[];
  };
}

function formatRatio(ratio: number): string {
  if (!Number.isFinite(ratio)) return '∞';
  return `${ratio.toFixed(1)}x`;
}

function StatBox({ label, value, change, changePercent, color, icon, className }: {
  label: string;
  value: string;
  change: number | null;
  changePercent: number | null;
  color?: string;
  icon?: React.ReactNode;
  className?: string;
}) {
  const isPositive = change !== null && change >= 0;
  const isNegative = change !== null && change < 0;
  const hasChange = change !== null;

  return (
    <div className={`flex flex-col gap-0.5 min-w-0 ${className ?? ''}`}>
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider truncate">
          {label}
        </span>
      </div>
      <div className="text-xl sm:text-2xl font-bold tabular-nums truncate blur-number" style={color ? { color } : undefined}>
        {value}
      </div>
      {hasChange && (
        <div className="flex items-center gap-1 text-[11px]">
          {isPositive && <TrendingUp className="w-3 h-3 text-chart-1" />}
          {isNegative && <TrendingDown className="w-3 h-3 text-destructive" />}
          {change === 0 && <Minus className="w-3 h-3 text-muted-foreground" />}
          <span className={isPositive ? 'text-chart-1' : isNegative ? 'text-destructive' : 'text-muted-foreground'}>
            {isPositive ? '+' : ''}{formatCurrency(change)} ({isPositive ? '+' : ''}{changePercent?.toFixed(1)}%)
          </span>
        </div>
      )}
    </div>
  );
}

export function CashVsCreditCard() {
  const [responseData, setResponseData] = useState<ResponseData | null>(null);
  const {
    timeframe, setTimeframe,
    windowEnd, setWindowEnd,
    prevWindow, nextWindow, isNextDisabled,
    windowLabel,
    periodOptions,
    showWindowNav,
    monthRange,
  } = useDateWindow('finance:cash-vs-credit:timeframe', 'finance:cash-vs-credit:windowEnd', '1y');
  const [isCollapsed, setIsCollapsed] = useCardCollapsed('cashVsCredit');
  const [showFilters, setShowFilters] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [includeSavings, setIncludeSavings] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('finance:cash-vs-credit:include-savings');
      return saved !== 'false';
    }
    return true;
  });

  const [showNetPosition, setShowNetPosition] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('finance:cash-vs-credit:show-net-position');
      return saved !== 'false';
    }
    return true;
  });

  useEffect(() => {
    localStorage.setItem('finance:cash-vs-credit:include-savings', String(includeSavings));
  }, [includeSavings]);

  useEffect(() => {
    localStorage.setItem('finance:cash-vs-credit:show-net-position', String(showNetPosition));
  }, [showNetPosition]);

  const queryParams = useMemo(() => {
    const range = getMonthRange(timeframe, windowEnd);
    const base = timeframe === 'all' ? 'timeframe=all' : `startMonth=${range.start}&endMonth=${range.end}`;
    return `${base}&includeSavings=${includeSavings}`;
  }, [timeframe, windowEnd, includeSavings]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`/api/cash-flow/cash-vs-credit?${queryParams}`, { credentials: 'include' });
        if (!res.ok) throw new Error('Failed to fetch cash vs credit data');
        const json: ResponseData = await res.json();
        setResponseData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [queryParams]);

  const chartData = useMemo(() => {
    if (!responseData?.history) return [];
    return responseData.history.map((d) => ({
      date: d.date,
      cashOnHand: d.cashOnHand,
      creditCardDebt: -d.creditCardDebt,
      creditDisplay: d.creditCardDebt,
      netPosition: d.netPosition,
    }));
  }, [responseData]);

  const current = responseData?.current;

  const prevValues = useMemo(() => {
    if (!responseData?.history || responseData.history.length < 2) return null;
    const first = responseData.history[0];
    return { cashOnHand: first.cashOnHand, creditCardDebt: first.creditCardDebt, netPosition: first.netPosition };
  }, [responseData]);

  const cashChange = useMemo(() => {
    if (!current || !prevValues) return null;
    return current.cashOnHand - prevValues.cashOnHand;
  }, [current, prevValues]);

  const cashChangePercent = useMemo(() => {
    if (cashChange === null || !prevValues || prevValues.cashOnHand === 0) return null;
    return (cashChange / Math.abs(prevValues.cashOnHand)) * 100;
  }, [cashChange, prevValues]);

  const creditChange = useMemo(() => {
    if (!current || !prevValues) return null;
    return current.creditCardDebt - prevValues.creditCardDebt;
  }, [current, prevValues]);

  const creditChangePercent = useMemo(() => {
    if (creditChange === null || !prevValues || prevValues.creditCardDebt === 0) return null;
    return (creditChange / Math.abs(prevValues.creditCardDebt)) * 100;
  }, [creditChange, prevValues]);

  const netChange = useMemo(() => {
    if (!current || !prevValues) return null;
    return current.netPosition - prevValues.netPosition;
  }, [current, prevValues]);

  const netChangePercent = useMemo(() => {
    if (netChange === null || !prevValues || prevValues.netPosition === 0) return null;
    return (netChange / Math.abs(prevValues.netPosition)) * 100;
  }, [netChange, prevValues]);

  const allValues = useMemo(() => {
    return chartData.flatMap((d) => {
      const vals = [d.cashOnHand, d.creditCardDebt];
      if (showNetPosition) vals.push(d.netPosition);
      return vals;
    });
  }, [chartData, showNetPosition]);
  const minVal = Math.min(...allValues, 0);
  const maxVal = Math.max(...allValues, 1);
  const yDomain: [number, number] = [minVal * 1.15, maxVal * 1.15];

  const formatTick = useCallback((v: number) => {
    const absV = Math.abs(v);
    if (absV >= 1000000) return `$${(absV / 1000000).toFixed(1)}M`;
    if (absV >= 1000) return `$${(absV / 1000).toFixed(0)}K`;
    return `$${absV}`;
  }, []);

  const formatXTick = useCallback((d: string) => {
    if (!d) return '';
    if (timeframe === '1m') {
      return formatSafeUTCDate(d, { month: 'short', day: 'numeric' });
    }
    if (timeframe === '5y' || timeframe === 'all') {
      return formatSafeUTCDate(d, { year: 'numeric' });
    }
    return formatSafeUTCDate(d, { month: 'short', year: '2-digit' });
  }, [timeframe]);

  const xTicks = useMemo(() => {
    if (chartData.length <= 6) return chartData.map((d) => d.date);
    const ticks: string[] = [];
    const step = (chartData.length - 1) / 5;
    for (let i = 0; i < 6; i++) {
      const idx = Math.round(step * i);
      if (idx < chartData.length) ticks.push(chartData[idx].date);
    }
    return ticks;
  }, [chartData]);

  const CustomTooltip = useCallback(({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;
    const point = payload[0]?.payload;
    if (!point) return null;
    return (
      <ChartTooltip>
        <TooltipHeader>
          {formatSafeUTCDate(point.date, { month: 'short', day: 'numeric', year: 'numeric' })}
        </TooltipHeader>
        <TooltipRow label="Cash on Hand" value={formatCurrency(point.cashOnHand)} color="var(--color-chart-1)" />
        <TooltipRow label="Credit Card Debt" value={formatCurrency(point.creditDisplay)} color="var(--color-destructive)" />
        {showNetPosition && (
          <TooltipRow label="Net Position" value={formatCurrency(point.netPosition)} color="var(--color-primary)" />
        )}
      </ChartTooltip>
    );
  }, [showNetPosition]);

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm">
        <CollapsibleCardHeader
          isCollapsed={isCollapsed}
          onToggle={setIsCollapsed}
          title={
            <div className="flex items-center gap-2">
              <Landmark className="w-4 h-4 text-primary shrink-0" />
              <span>Cash vs Credit</span>
            </div>
          }
        />
        {!isCollapsed && <LoadingSpinner category="chart" className="h-[320px] m-5" />}
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
              <Landmark className="w-4 h-4 text-primary shrink-0" />
              <span>Cash vs Credit</span>
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

  const hasNoData = !responseData || (responseData.accounts.cash.length === 0 && responseData.accounts.credit.length === 0);

  if (hasNoData) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm">
        <CollapsibleCardHeader
          isCollapsed={isCollapsed}
          onToggle={setIsCollapsed}
          title={
            <div className="flex items-center gap-2">
              <Landmark className="w-4 h-4 text-primary shrink-0" />
              <span>Cash vs Credit</span>
            </div>
          }
        />
        {!isCollapsed && (
          <div className="p-5">
            <ChartEmptyState variant="nodata" description="Connect checking, savings, or credit card accounts to see your cash vs credit overview" />
          </div>
        )}
      </div>
    );
  }

  const hasNoHistory = !chartData || chartData.length === 0;

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm">
      <CollapsibleCardHeader
        isCollapsed={isCollapsed}
        onToggle={setIsCollapsed}
        title={
          <div className="flex items-center gap-2">
            <Landmark className="w-4 h-4 text-primary shrink-0" />
            <span>Cash vs Credit</span>
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
            <div className="flex flex-wrap items-center gap-4 sm:gap-6">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Timeframe</span>
                <TimeRangeFilter value={timeframe} onChange={setTimeframe} />
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="include-savings"
                  checked={includeSavings}
                  onCheckedChange={setIncludeSavings}
                />
                <label htmlFor="include-savings" className="text-xs font-medium text-foreground cursor-pointer select-none">
                  Include Savings
                </label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="show-net-position"
                  checked={showNetPosition}
                  onCheckedChange={setShowNetPosition}
                />
                <label htmlFor="show-net-position" className="text-xs font-medium text-foreground cursor-pointer select-none">
                  Net Position
                </label>
              </div>
            </div>
          </CollapsibleFilterPanel>

          <div className="px-5 pt-2 pb-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 mb-6 border-b border-border/40 pb-6">
              <StatBox
                label="Cash on Hand"
                value={formatCurrency(current?.cashOnHand ?? 0)}
                change={cashChange}
                changePercent={cashChangePercent}
                className="pr-4 pb-4 border-r border-b border-border/40 sm:pr-6 sm:pb-0 sm:border-b-0"
              />
              <StatBox
                label="Credit Card Debt"
                value={formatCurrency(current?.creditCardDebt ?? 0)}
                change={creditChange !== null ? -creditChange : null}
                changePercent={creditChangePercent !== null ? -creditChangePercent : null}
                className="pl-4 pb-4 border-b border-border/40 sm:px-6 sm:pb-0 sm:border-b-0 sm:border-r sm:border-border/40"
              />
              <StatBox
                label="Net Position"
                value={formatCurrency(current?.netPosition ?? 0)}
                change={netChange}
                changePercent={netChangePercent}
                className="pr-4 pt-4 border-r border-border/40 sm:px-6 sm:pt-0 sm:border-r sm:border-border/40"
              />
              <div className="pl-4 pt-4 sm:pl-6 sm:pt-0 flex flex-col gap-0.5 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider truncate">
                    Coverage Ratio
                  </span>
                </div>
                <div className="text-xl sm:text-2xl font-bold tabular-nums blur-number" style={{ color: 'var(--color-primary)' }}>
                  {current && current.coverageRatio > 0
                    ? (Number.isFinite(current.coverageRatio) ? formatRatio(current.coverageRatio) : '∞')
                    : '0x'}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {current && current.creditCardDebt === 0
                    ? 'No credit card debt'
                    : 'Cash ÷ Credit'}
                </div>
              </div>
            </div>

            {hasNoHistory ? (
              <ChartEmptyState variant="nodata" description="Historical data will appear once account snapshots are available for the selected period" />
            ) : (
              <div className="h-[260px]">
                <div className="h-full w-full overflow-x-auto overflow-y-hidden">
                  <div className="min-w-max h-full px-2 pb-2">
                    <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 100, height: 100 }}>
                      <ComposedChart data={chartData} margin={{ top: 15, right: 20, left: 10, bottom: 5 }}>
                        <defs>
                          <linearGradient id="cashGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="var(--color-chart-1)" stopOpacity={0.45} />
                            <stop offset="95%" stopColor="var(--color-chart-1)" stopOpacity={0.08} />
                          </linearGradient>
                          <linearGradient id="creditGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="var(--color-destructive)" stopOpacity={0.35} />
                            <stop offset="95%" stopColor="var(--color-destructive)" stopOpacity={0.05} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} opacity={0.3} />
                        <XAxis
                          dataKey="date"
                          tickLine={false}
                          axisLine={{ stroke: 'var(--color-border)' }}
                          tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
                          ticks={xTicks}
                          tickFormatter={formatXTick}
                        />
                        <YAxis
                          tickLine={false}
                          axisLine={{ stroke: 'var(--color-border)' }}
                          tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
                          domain={yDomain}
                          tickFormatter={formatTick}
                        />
                        <ReferenceLine y={0} stroke="var(--color-border)" strokeWidth={1} strokeDasharray="3 3" opacity={0.5} />
                        <RechartsTooltip
                          content={<CustomTooltip />}
                          cursor={{ stroke: 'var(--color-chart-1)', strokeWidth: 1, strokeDasharray: '2 2', opacity: 0.3 }}
                        />
                        <Legend
                          verticalAlign="bottom"
                          iconType="circle"
                          iconSize={10}
                          wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                          formatter={(value: string) => (
                            <span style={{ color: 'var(--color-foreground)' }}>{value}</span>
                          )}
                        />
                        <Area
                          type="monotone"
                          dataKey="cashOnHand"
                          name="Cash on Hand"
                          fill="url(#cashGrad)"
                          stroke="var(--color-chart-1)"
                          strokeWidth={2}
                          activeDot={{ r: 4 }}
                        />
                        <Area
                          type="monotone"
                          dataKey="creditCardDebt"
                          name="Credit Card Debt"
                          fill="url(#creditGrad)"
                          stroke="var(--color-destructive)"
                          strokeWidth={2}
                          activeDot={{ r: 4 }}
                        />
                        {showNetPosition && (
                          <Line
                            type="monotone"
                            dataKey="netPosition"
                            name="Net Position"
                            stroke="var(--color-primary)"
                            strokeWidth={2}
                            dot={false}
                            activeDot={{ r: 4 }}
                          />
                        )}
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
