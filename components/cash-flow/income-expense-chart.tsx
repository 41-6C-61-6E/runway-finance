'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useCardCollapsed } from '@/lib/hooks/use-card-collapsed';
import {
  ComposedChart,
  Bar,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ReferenceLine,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { useRouter } from 'next/navigation';
import { formatCurrency } from '@/lib/utils/format';
import { formatSafeUTCDate } from '@/lib/utils/date';
import { ChartTooltip, TooltipRow, TooltipHeader } from '@/components/charts/chart-tooltip';
import { ChartEmptyState } from '@/components/charts/chart-empty-state';
import { ChartTypeSelector, type ChartType } from '@/components/charts/chart-type-selector';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { TimeRangeFilter, type TimeRange } from '@/components/charts/chart-filters';
import { CollapsibleCardHeader } from '@/components/ui/collapsible-card-header';
import { TIME_RANGE_PRESETS } from '@/components/charts/chart-filters';
import { ArrowRightLeft } from 'lucide-react';
import { CollapsibleFilterPanel } from '@/components/ui/collapsible-filter-panel';
import { useDateWindow } from '@/lib/hooks/use-date-window';
import { DateWindowNav } from '@/components/charts/date-window-nav';

interface MonthlyData {
  yearMonth: string;
  income: number;
  expenses: number;
  netCashFlow: number;
}

const MONTH_MAP: Record<TimeRange, number> = {
  '1m': 1, '3m': 3, '6m': 6, '1y': 12, '5y': 60, 'ytd': 12, 'all': 120,
};

const incomeExpensePresets = TIME_RANGE_PRESETS.filter((p) => ['1m', '3m', '6m', '1y', 'ytd', 'all'].includes(p.value));

const typeOptions = [
  { value: 'bar' as ChartType, label: 'Bar' },
  { value: 'line' as ChartType, label: 'Area' },
];

export function IncomeExpenseChart() {
  const router = useRouter();
  const [allData, setAllData] = useState<MonthlyData[]>([]);
  const {
    timeframe, setTimeframe,
    windowEnd, setWindowEnd,
    prevWindow, nextWindow, isNextDisabled,
    windowLabel,
    periodOptions,
    showWindowNav,
  } = useDateWindow('finance:income-expense:timeframe', 'finance:income-expense:windowEnd', '1y');
  const [chartType, setChartType] = useState<ChartType>('bar');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCollapsed, setIsCollapsed] = useCardCollapsed('incomeExpenseChart');
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch('/api/cash-flow/monthly?months=120');
        if (!res.ok) throw new Error('Failed to fetch monthly data');
        const json = await res.json();
        setAllData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const numMonths = MONTH_MAP[timeframe] || 12;
  const effectiveEndIdx = useMemo(() => {
    if (timeframe === 'all') return allData.length;
    const idx = allData.findIndex((d) => d.yearMonth > windowEnd);
    return idx === -1 ? allData.length : idx;
  }, [allData, windowEnd, timeframe]);
  const startIdx = Math.max(0, effectiveEndIdx - numMonths);
  const windowedData = timeframe === 'all' ? allData : allData.slice(startIdx, effectiveEndIdx);
  const data = windowedData.map((d) => ({
    month: formatSafeUTCDate(d.yearMonth + '-01', { month: 'short', year: '2-digit' }),
    income: d.income,
    expenses: d.expenses,
    net: d.netCashFlow,
    yearMonth: d.yearMonth,
  }));

  const chartData = useMemo(() => data.map((d) => ({
    ...d,
    expenses: -Math.abs(d.expenses),
  })), [data]);

  const allValues = chartData.flatMap((d) => [d.income, d.expenses, d.net]);
  const minVal = Math.min(...allValues, 0);
  const maxVal = Math.max(...allValues, 1);

  const handleClick = (yearMonth: string) => {
    const startDate = yearMonth + '-01';
    const d = new Date(yearMonth + '-01');
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const endDate = `${yearMonth}-${String(lastDay).padStart(2, '0')}`;
    router.push(`/transactions?startDate=${startDate}&endDate=${endDate}`);
  };

  const formatTick = (v: number) => {
    const absV = Math.abs(v);
    if (absV >= 1000000) return `$${(absV / 1000000).toFixed(1)}M`;
    if (absV >= 1000) return `$${(absV / 1000).toFixed(0)}K`;
    return `$${absV}`;
  };

  const CustomTooltip = useCallback(({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;
    const point = payload[0]?.payload;
    if (!point) return null;
    return (
      <ChartTooltip>
        <TooltipHeader>{label}</TooltipHeader>
        <TooltipRow label="Income" value={formatCurrency(point.income)} color="var(--color-chart-1)" />
        <TooltipRow label="Expenses" value={formatCurrency(Math.abs(point.expenses))} color="var(--color-destructive)" />
        <TooltipRow label="Net Income" value={formatCurrency(point.net)} color="var(--color-primary)" />
      </ChartTooltip>
    );
  }, []);

  const sharedAxes = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
      <XAxis
        dataKey="month"
        tickLine={false}
        axisLine={{ stroke: 'var(--color-border)' }}
        tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
        interval={data.length > 30 ? Math.floor(data.length / 6) : 0}
      />
      <YAxis
        tickLine={false}
        axisLine={{ stroke: 'var(--color-border)' }}
        tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
        domain={[minVal * 1.15, maxVal * 1.15]}
        tickFormatter={formatTick}
      />
      <ReferenceLine y={0} stroke="var(--color-border)" strokeWidth={1} />
      <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: 'var(--color-border)', opacity: 0.15 }} />
      <Legend
        verticalAlign="bottom"
        iconType="circle"
        iconSize={10}
        wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
        formatter={(value: string) => (
          <span style={{ color: 'var(--color-foreground)' }}>{value}</span>
        )}
      />
    </>
  );

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm">
        <CollapsibleCardHeader
          isCollapsed={isCollapsed}
          onToggle={setIsCollapsed}
          title={
            <div className="flex items-center gap-2">
              <ArrowRightLeft className="w-4 h-4 text-primary shrink-0" />
              <span>Income vs Expenses</span>
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
              <ArrowRightLeft className="w-4 h-4 text-primary shrink-0" />
              <span>Income vs Expenses</span>
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

  if (data.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm">
        <CollapsibleCardHeader
          isCollapsed={isCollapsed}
          onToggle={setIsCollapsed}
          title={
            <div className="flex items-center gap-2">
              <ArrowRightLeft className="w-4 h-4 text-primary shrink-0" />
              <span>Income vs Expenses</span>
            </div>
          }
        />
        {!isCollapsed && (
          <div className="p-5">
            <ChartEmptyState variant="nodata" description="Income and expense data will appear once you sync your accounts" />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm">
      <CollapsibleCardHeader
        isCollapsed={isCollapsed}
        onToggle={setIsCollapsed}
        title={
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="w-4 h-4 text-primary shrink-0" />
            <span>Income vs Expenses</span>
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
                  {timeframe.toUpperCase()}
                </span>
                <span className="bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider">
                  {chartType.toUpperCase()}
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
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mr-1">Timeframe</span>
                <TimeRangeFilter value={timeframe} presets={incomeExpensePresets} onChange={setTimeframe} />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mr-1">Style</span>
                <ChartTypeSelector value={chartType} options={typeOptions} onChange={setChartType} />
              </div>
            </div>
          </CollapsibleFilterPanel>
          <div className="h-[320px]">
            <div className="financial-chart h-full w-full overflow-x-auto overflow-y-hidden">
              <div className="min-w-max h-full px-2 pb-2">
            <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 100, height: 100 }}>
              {chartType === 'bar' ? (
              <ComposedChart data={chartData} stackOffset="sign" margin={{ top: 15, right: 20, left: 10, bottom: 5 }}>
                {sharedAxes}
                <Bar
                  dataKey="income"
                  name="Income"
                  fill="var(--color-chart-1)"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={24}
                  stackId="a"
                  onClick={(data: any) => handleClick(data?.payload?.yearMonth)}
                />
                <Bar
                  dataKey="expenses"
                  name="Expenses"
                  fill="var(--color-destructive)"
                  radius={[0, 0, 4, 4]}
                  maxBarSize={24}
                  stackId="a"
                  onClick={(data: any) => handleClick(data?.payload?.yearMonth)}
                />
                <Line
                  type="monotone"
                  dataKey="net"
                  name="Net Income"
                  stroke="var(--color-primary)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </ComposedChart>
            ) : (
              <ComposedChart data={chartData} margin={{ top: 15, right: 20, left: 10, bottom: 5 }}>
                <defs>
                  <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-chart-1)" stopOpacity={0.45} />
                    <stop offset="95%" stopColor="var(--color-chart-1)" stopOpacity={0.08} />
                  </linearGradient>
                  <linearGradient id="expensesGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-destructive)" stopOpacity={0.45} />
                    <stop offset="95%" stopColor="var(--color-destructive)" stopOpacity={0.08} />
                  </linearGradient>
                </defs>
                {sharedAxes}
                <Area
                  type="monotone"
                  dataKey="income"
                  name="Income"
                  fill="url(#incomeGrad)"
                  stroke="var(--color-chart-1)"
                  strokeWidth={2}
                  activeDot={{ r: 4 }}
                />
                <Area
                  type="monotone"
                  dataKey="expenses"
                  name="Expenses"
                  fill="url(#expensesGrad)"
                  stroke="var(--color-destructive)"
                  strokeWidth={2}
                  activeDot={{ r: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey="net"
                  name="Net Income"
                  stroke="var(--color-primary)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </ComposedChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>
      </div>
        </>
      )}
    </div>
  );
}
