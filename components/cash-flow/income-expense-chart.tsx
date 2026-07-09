'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useCardCollapsed } from '@/lib/hooks/use-card-collapsed';
import { usePrivacyMode } from '@/components/privacy-mode-provider';
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
import { formatChartYAxisCurrency, formatChartXAxisDate, getChartXTicksUnified } from '@/lib/utils/chart-format';
import { ChartTooltip, TooltipRow, TooltipHeader } from '@/components/charts/chart-tooltip';
import { ChartEmptyState } from '@/components/charts/chart-empty-state';
import { ChartTypeSelector, type ChartType } from '@/components/charts/chart-type-selector';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { TimeRangeFilter, type TimeRange } from '@/components/charts/chart-filters';
import { CollapsibleCardHeader } from '@/components/ui/collapsible-card-header';
import { TIME_RANGE_PRESETS } from '@/components/charts/chart-filters';
import { ArrowRightLeft, TrendingUp, Info } from 'lucide-react';
import { CollapsibleFilterPanel } from '@/components/ui/collapsible-filter-panel';
import { useDateWindow } from '@/lib/hooks/use-date-window';
import { DateWindowNav } from '@/components/charts/date-window-nav';

interface MonthlyData {
  yearMonth: string;
  income: number;
  expenses: number;
  netCashFlow: number;
}

interface SavingsRatePoint {
  yearMonth: string;
  income: number;
  expenses: number;
  netCashFlow: number;
  savingsRate: number;
  savings: {
    retirement: number;
    hsa: number;
    brokerage: number;
    savingsAccount: number;
    cash: number;
  };
}

const MONTH_MAP: Record<TimeRange, number> = {
  '1d': 1, '7d': 1, '30d': 1, '365d': 12,
  '1m': 1, '3m': 3, '6m': 6, '1y': 12, '5y': 60, 'ytd': 12, 'all': 120,
};

const incomeExpensePresets = TIME_RANGE_PRESETS.filter((p) => ['1m', '3m', '6m', '1y', 'ytd', 'all', '30d', '365d', '5y'].includes(p.value));

const typeOptions = [
  { value: 'bar' as ChartType, label: 'Bar' },
  { value: 'line' as ChartType, label: 'Area' },
];

export function IncomeExpenseChart() {
  const router = useRouter();
  const { privacyMode } = usePrivacyMode();
  const [selectedSavingsPoint, setSelectedSavingsPoint] = useState<any | null>(null);

  // Query 1: Monthly cash flow
  const { data: allData = [], isLoading: cashFlowLoading, error: cashFlowError } = useQuery<MonthlyData[]>({
    queryKey: ['cash-flow-monthly'],
    queryFn: async () => {
      const res = await fetch('/api/cash-flow/monthly?months=120');
      if (!res.ok) throw new Error('Failed to fetch monthly cash flow data');
      return res.json();
    },
  });

  // Query 2: Savings rate
  const { data: savingsData = [], isLoading: savingsLoading, error: savingsError } = useQuery<SavingsRatePoint[]>({
    queryKey: ['savings-rate-monthly'],
    queryFn: async () => {
      const res = await fetch('/api/cash-flow/savings-rate?months=120');
      if (!res.ok) throw new Error('Failed to fetch monthly savings rate data');
      return res.json();
    },
  });

  const loading = cashFlowLoading || savingsLoading;
  const queryError = cashFlowError || savingsError;
  const error = queryError ? (queryError instanceof Error ? queryError.message : String(queryError)) : null;

  const {
    timeframe, setTimeframe,
    windowEnd, setWindowEnd,
    prevWindow, nextWindow, isNextDisabled,
    windowLabel,
    periodOptions,
    showWindowNav,
  } = useDateWindow('finance:income-expense:timeframe', 'finance:income-expense:windowEnd', '1y');
  const [chartType, setChartType] = useState<ChartType>('bar');
  const [isCollapsed, setIsCollapsed] = useCardCollapsed('incomeExpenseChart');
  const [showFilters, setShowFilters] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const numMonths = MONTH_MAP[timeframe] || 12;

  // Windowed Data: Income vs Expenses
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

  // Windowed Data: Savings Rate
  const effectiveSavingsEndIdx = useMemo(() => {
    if (timeframe === 'all') return savingsData.length;
    const idx = savingsData.findIndex((d) => d.yearMonth > windowEnd);
    return idx === -1 ? savingsData.length : idx;
  }, [savingsData, windowEnd, timeframe]);
  const savingsStartIdx = Math.max(0, effectiveSavingsEndIdx - numMonths);
  const windowedSavingsData = timeframe === 'all' ? savingsData : savingsData.slice(savingsStartIdx, effectiveSavingsEndIdx);

  const savingsChartData = useMemo(() => {
    return windowedSavingsData.map((d) => ({
      month: formatSafeUTCDate(d.yearMonth + '-01', { month: 'short', year: '2-digit' }),
      yearMonth: d.yearMonth,
      income: d.income,
      expenses: d.expenses,
      netCashFlow: d.netCashFlow,
      retirement: d.savings.retirement,
      hsa: d.savings.hsa,
      brokerage: d.savings.brokerage,
      savingsAccount: d.savings.savingsAccount,
      cash: d.savings.cash,
      savingsRate: d.savingsRate * 100,
    }));
  }, [windowedSavingsData]);

  const avgSavingsRate = useMemo(() => {
    if (savingsChartData.length === 0) return 0;
    const total = savingsChartData.reduce((sum, d) => sum + d.savingsRate, 0);
    return total / savingsChartData.length;
  }, [savingsChartData]);

  const xAxisTicks = useMemo(() => {
    return getChartXTicksUnified(data, timeframe, isMobile, 'yearMonth');
  }, [data, timeframe, isMobile]);

  // Accessibility screen reader summary
  const srSummary = useMemo(() => {
    if (chartData.length === 0) return '';
    const lastPoint = chartData[chartData.length - 1];
    const totalIncome = chartData.reduce((sum, d) => sum + d.income, 0);
    const totalExpenses = chartData.reduce((sum, d) => sum + Math.abs(d.expenses), 0);
    const formattedLastPointMonth = formatChartXAxisDate(lastPoint.yearMonth + '-01', timeframe, { isMonthly: true });
    return `Income versus expenses chart. Over the selected period, total income was ${formatCurrency(totalIncome)} and total expenses were ${formatCurrency(totalExpenses)}. In the most recent month (${formattedLastPointMonth}), income was ${formatCurrency(lastPoint.income)} and expenses were ${formatCurrency(Math.abs(lastPoint.expenses))}.`;
  }, [chartData, timeframe]);

  // Left Y-Axis domains (Income vs Expenses)
  const allValues = chartData.flatMap((d) => [d.income, d.expenses, d.net]);
  const minVal = Math.min(...allValues, 0);
  const maxVal = Math.max(...allValues, 1);

  // Right Y-Axis domains (Savings Rate Stacked Amounts)
  const savingsValues = savingsChartData.flatMap((d) => {
    const posSum = (d.retirement > 0 ? d.retirement : 0) +
                   (d.hsa > 0 ? d.hsa : 0) +
                   (d.brokerage > 0 ? d.brokerage : 0) +
                   (d.savingsAccount > 0 ? d.savingsAccount : 0) +
                   (d.cash > 0 ? d.cash : 0);
    const negSum = (d.retirement < 0 ? d.retirement : 0) +
                   (d.hsa < 0 ? d.hsa : 0) +
                   (d.brokerage < 0 ? d.brokerage : 0) +
                   (d.savingsAccount < 0 ? d.savingsAccount : 0) +
                   (d.cash < 0 ? d.cash : 0);
    return [posSum, negSum];
  });
  const minSavingsVal = Math.min(...savingsValues, 0);
  const maxSavingsVal = Math.max(...savingsValues, 100);

  const handleClick = (yearMonth: string) => {
    const startDate = yearMonth + '-01';
    const d = new Date(yearMonth + '-01');
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const endDate = `${yearMonth}-${String(lastDay).padStart(2, '0')}`;
    router.push(`/transactions?startDate=${startDate}&endDate=${endDate}`);
  };

  const formatXTick = useCallback((d: string) => {
    return formatChartXAxisDate(d + '-01', timeframe, { isMonthly: true });
  }, [timeframe]);

  const formatYTick = useCallback((v: number) => {
    return formatChartYAxisCurrency(v, minVal * 1.15, maxVal * 1.15);
  }, [minVal, maxVal]);

  const formatSavingsYTick = useCallback((v: number) => {
    return formatChartYAxisCurrency(v, minSavingsVal * 1.15, maxSavingsVal * 1.15);
  }, [minSavingsVal, maxSavingsVal]);

  // Tooltips
  const CustomTooltip = useCallback(({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null;
    const point = payload[0]?.payload;
    if (!point) return null;
    const headerDate = formatChartXAxisDate(point.yearMonth + '-01', timeframe, { isMonthly: true });
    return (
      <ChartTooltip>
        <TooltipHeader>{headerDate}</TooltipHeader>
        <TooltipRow label="Income" value={formatCurrency(point.income)} color="var(--color-chart-1)" />
        <TooltipRow label="Expenses" value={formatCurrency(Math.abs(point.expenses))} color="var(--color-destructive)" />
        <TooltipRow label="Net Income" value={formatCurrency(point.net)} color="var(--color-primary)" />
      </ChartTooltip>
    );
  }, [timeframe]);

  const SavingsTooltip = useCallback(({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null;
    const point = payload[0]?.payload;
    if (!point) return null;
    const headerDate = formatChartXAxisDate(point.yearMonth + '-01', timeframe, { isMonthly: true });

    const totalSavings = point.retirement + point.hsa + point.brokerage + point.savingsAccount + point.cash;

    return (
      <ChartTooltip>
        <TooltipHeader>{headerDate}</TooltipHeader>
        <TooltipRow label="Retirement" value={formatCurrency(point.retirement)} color="var(--color-chart-1)" />
        <TooltipRow label="HSA" value={formatCurrency(point.hsa)} color="var(--color-chart-2)" />
        <TooltipRow label="Brokerage" value={formatCurrency(point.brokerage)} color="var(--color-chart-3)" />
        <TooltipRow label="Savings Account" value={formatCurrency(point.savingsAccount)} color="var(--color-chart-4)" />
        <TooltipRow label="Leftover Cash" value={formatCurrency(point.cash)} color="var(--color-chart-5)" />
        <div className="border-t border-border my-1 pt-1 font-semibold text-foreground flex justify-between gap-8 text-xs">
          <span>Total Savings:</span>
          <span>{formatCurrency(totalSavings)}</span>
        </div>
        <div className="font-semibold text-primary flex justify-between gap-8 text-xs">
          <span>Savings Rate:</span>
          <span>{point.savingsRate.toFixed(1)}%</span>
        </div>
      </ChartTooltip>
    );
  }, [timeframe]);

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm">
        <CollapsibleCardHeader
          isCollapsed={isCollapsed}
          onToggle={setIsCollapsed}
          title={
            <div className="flex items-center gap-2">
              <ArrowRightLeft className="w-4 h-4 text-primary shrink-0" />
              <span>Net Income & Savings Rate</span>
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
              <span>Net Income & Savings Rate</span>
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
              <span>Net Income & Savings Rate</span>
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
            <ArrowRightLeft className="w-4 h-4 text-primary shrink-0" />
            <span>Net Income & Savings Rate</span>
          </div>
        }
      />
      {!isCollapsed && (
        <>
          <CollapsibleFilterPanel
            isOpen={showFilters}
            onToggle={() => setShowFilters(!showFilters)}
            feedbackItems={[
              <span key="timeframe" className="bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider">
                {timeframe.toUpperCase()}
              </span>,
              <span key="chartType" className="bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider">
                {chartType.toUpperCase()}
              </span>,
            ]}
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
              <div className="flex items-center">
                <TimeRangeFilter value={timeframe} presets={incomeExpensePresets} onChange={setTimeframe} />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mr-1">Style</span>
                <ChartTypeSelector value={chartType} options={typeOptions} onChange={setChartType} />
              </div>
            </div>
          </CollapsibleFilterPanel>

          <div className="flex flex-col sm:flex-row divide-y sm:divide-y-0 sm:divide-x divide-border">
            {/* ── Left Column: Income vs Expenses ── */}
            <div className="flex-1 min-w-0 p-2.5 sm:p-5">
              <div className="flex items-center gap-1.5 mb-3">
                <ArrowRightLeft className="w-3.5 h-3.5 text-primary shrink-0" />
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Income vs Expenses</span>
              </div>
              <div className="h-[260px] sm:h-[300px] w-full relative touch-pan-y">
                <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 100, height: 100 }}>
                  {chartType === 'bar' ? (
                    <ComposedChart role="img" aria-label="Income vs Expenses Composed Chart" data={chartData} stackOffset="sign" margin={{ top: 15, right: 10, left: -10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} opacity={0.3} />
                      <XAxis
                        dataKey="yearMonth"
                        tickLine={false}
                        axisLine={{ stroke: 'var(--color-border)' }}
                        tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
                        ticks={xAxisTicks}
                        tickFormatter={formatXTick}
                        minTickGap={30}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={{ stroke: 'var(--color-border)' }}
                        tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
                        domain={[minVal * 1.15, maxVal * 1.15]}
                        tickFormatter={formatYTick}
                      />
                      <ReferenceLine y={0} stroke="var(--color-border)" strokeWidth={1} />
                      <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: 'var(--color-border)', opacity: 0.15 }} />
                      <Bar
                        dataKey="income"
                        name="Income"
                        fill="var(--color-chart-1)"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={24}
                        stackId="a"
                        onClick={(data: any) => handleClick(data?.payload?.yearMonth)}
                        style={{ cursor: 'pointer' }}
                      />
                      <Bar
                        dataKey="expenses"
                        name="Expenses"
                        fill="var(--color-destructive)"
                        radius={[0, 0, 4, 4]}
                        maxBarSize={24}
                        stackId="a"
                        onClick={(data: any) => handleClick(data?.payload?.yearMonth)}
                        style={{ cursor: 'pointer' }}
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
                      <Legend
                        verticalAlign="bottom"
                        iconType="circle"
                        iconSize={10}
                        wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                        formatter={(value: string) => (
                          <span style={{ color: 'var(--color-foreground)' }}>{value}</span>
                        )}
                      />
                    </ComposedChart>
                  ) : (
                    <ComposedChart role="img" aria-label="Income vs Expenses Composed Chart" data={chartData} margin={{ top: 15, right: 10, left: -10, bottom: 5 }}>
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
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} opacity={0.3} />
                      <XAxis
                        dataKey="yearMonth"
                        tickLine={false}
                        axisLine={{ stroke: 'var(--color-border)' }}
                        tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
                        ticks={xAxisTicks}
                        tickFormatter={formatXTick}
                        minTickGap={30}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={{ stroke: 'var(--color-border)' }}
                        tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
                        domain={[minVal * 1.15, maxVal * 1.15]}
                        tickFormatter={formatYTick}
                      />
                      <ReferenceLine y={0} stroke="var(--color-border)" strokeWidth={1} />
                      <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: 'var(--color-border)', opacity: 0.15 }} />
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
                      <Legend
                        verticalAlign="bottom"
                        iconType="circle"
                        iconSize={10}
                        wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                        formatter={(value: string) => (
                          <span style={{ color: 'var(--color-foreground)' }}>{value}</span>
                        )}
                      />
                    </ComposedChart>
                  )}
                </ResponsiveContainer>
              </div>
            </div>

            {/* ── Right Column: Savings Rate (Stacked Bar + Avg Line) ── */}
            <div className="flex-1 min-w-0 p-2.5 sm:p-5">
              <div className="flex items-center gap-1.5 mb-3">
                <TrendingUp className="w-3.5 h-3.5 text-primary shrink-0" />
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Savings Rate</span>
              </div>
              <div className="h-[260px] sm:h-[300px] w-full relative touch-pan-y">
                <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 100, height: 100 }}>
                  <ComposedChart role="img" aria-label="Savings Rate Composed Chart" data={savingsChartData} margin={{ top: 15, right: 10, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} opacity={0.3} />
                    <XAxis
                      dataKey="yearMonth"
                      tickLine={false}
                      axisLine={{ stroke: 'var(--color-border)' }}
                      tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
                      ticks={xAxisTicks}
                      tickFormatter={formatXTick}
                      minTickGap={30}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={{ stroke: 'var(--color-border)' }}
                      tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
                      domain={[minSavingsVal * 1.15, maxSavingsVal * 1.15]}
                      tickFormatter={formatSavingsYTick}
                    />
                    <ReferenceLine y={0} stroke="var(--color-border)" strokeWidth={1} />
                    <RechartsTooltip content={<SavingsTooltip />} cursor={{ fill: 'var(--color-border)', opacity: 0.15 }} />
                    
                    {/* Stacked bars for savings breakdown */}
                    <Bar dataKey="retirement" name="Retirement" stackId="savings" fill="var(--color-chart-1)" maxBarSize={24} onClick={(data: any) => setSelectedSavingsPoint(data?.payload)} style={{ cursor: 'pointer' }} />
                    <Bar dataKey="hsa" name="HSA" stackId="savings" fill="var(--color-chart-2)" maxBarSize={24} onClick={(data: any) => setSelectedSavingsPoint(data?.payload)} style={{ cursor: 'pointer' }} />
                    <Bar dataKey="brokerage" name="Brokerage" stackId="savings" fill="var(--color-chart-3)" maxBarSize={24} onClick={(data: any) => setSelectedSavingsPoint(data?.payload)} style={{ cursor: 'pointer' }} />
                    <Bar dataKey="savingsAccount" name="Savings" stackId="savings" fill="var(--color-chart-4)" maxBarSize={24} onClick={(data: any) => setSelectedSavingsPoint(data?.payload)} style={{ cursor: 'pointer' }} />
                    <Bar dataKey="cash" name="Cash" stackId="savings" fill="var(--color-chart-5)" maxBarSize={24} onClick={(data: any) => setSelectedSavingsPoint(data?.payload)} style={{ cursor: 'pointer' }} />
                    
                    {/* Average Savings Rate horizontal line with label */}
                    <ReferenceLine y={avgSavingsRate} stroke="var(--color-primary)" strokeWidth={2} strokeDasharray="6 3" />
                    <Legend
                      verticalAlign="bottom"
                      iconType="circle"
                      iconSize={10}
                      wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                      formatter={(value: string) => (
                        <span style={{ color: 'var(--color-foreground)' }}>{value}</span>
                      )}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
                {/* On-chart savings rate label overlay */}
                <div className="absolute top-0 right-3 sm:right-5 mt-1 bg-primary/10 border border-primary/20 rounded-lg px-2.5 py-1 text-xs font-bold text-primary shadow-sm">
                  Avg. Savings Rate: {avgSavingsRate.toFixed(1)}%
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Savings Breakdown Popup Modal ── */}
      {selectedSavingsPoint && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setSelectedSavingsPoint(null)}
        >
          <div
            className="bg-background border border-border rounded-xl shadow-2xl w-full max-w-xl max-h-[85vh] overflow-y-auto animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-border bg-muted/20">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                <h3 className="text-base font-semibold text-foreground">
                  Savings Analysis — {formatChartXAxisDate(selectedSavingsPoint.yearMonth + '-01', timeframe, { isMonthly: true })}
                </h3>
              </div>
              <button
                onClick={() => setSelectedSavingsPoint(null)}
                className="text-xs text-muted-foreground hover:text-foreground bg-muted hover:bg-muted/80 rounded-lg px-2.5 py-1 transition-colors"
              >
                Close
              </button>
            </div>

            {/* Content */}
            <div className="p-5 space-y-5 bg-background text-sm">
              {/* Summary Hero Box */}
              <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 text-center space-y-1">
                <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Savings Rate</div>
                <div className="text-3xl font-extrabold text-primary font-mono blur-number">
                  {selectedSavingsPoint.savingsRate.toFixed(1)}%
                </div>
                <div className="text-xs text-muted-foreground">
                  Total Saved: <span className="font-semibold text-foreground blur-number">{formatCurrency(selectedSavingsPoint.retirement + selectedSavingsPoint.hsa + selectedSavingsPoint.brokerage + selectedSavingsPoint.savingsAccount + selectedSavingsPoint.cash)}</span>
                  {' '}of Gross Income: <span className="font-semibold text-foreground blur-number">{formatCurrency(selectedSavingsPoint.income)}</span>
                </div>
              </div>

              {/* Cash Flow Inputs & Outputs */}
              <div className="space-y-2">
                <h4 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">Income & Cash Flow</h4>
                <div className="border border-border rounded-xl divide-y divide-border overflow-hidden bg-muted/5">
                  <div className="flex justify-between p-3">
                    <span className="text-muted-foreground">Gross Income (A)</span>
                    <span className="font-semibold font-mono text-foreground blur-number">{formatCurrency(selectedSavingsPoint.income)}</span>
                  </div>
                  <div className="flex justify-between p-3">
                    <span className="text-muted-foreground">Expenses & Taxes (B)</span>
                    <span className="font-semibold font-mono text-foreground blur-number">{formatCurrency(selectedSavingsPoint.expenses)}</span>
                  </div>
                  <div className="flex justify-between p-3 bg-muted/20">
                    <span className="text-muted-foreground font-medium">Net Cash Flow (A − B)</span>
                    <span className="font-semibold font-mono text-foreground blur-number">{formatCurrency(selectedSavingsPoint.netCashFlow)}</span>
                  </div>
                </div>
              </div>

              {/* Savings Contributions Breakdown */}
              <div className="space-y-2">
                <h4 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">Savings breakdown</h4>
                <div className="border border-border rounded-xl divide-y divide-border overflow-hidden">
                  <div className="flex justify-between p-3 hover:bg-muted/5 transition-colors">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-chart-1" style={{ backgroundColor: 'var(--color-chart-1)' }} />
                      <span className="text-muted-foreground">Retirement Contributions</span>
                    </div>
                    <span className="font-semibold font-mono text-foreground blur-number">{formatCurrency(selectedSavingsPoint.retirement)}</span>
                  </div>
                  <div className="flex justify-between p-3 hover:bg-muted/5 transition-colors">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-chart-2" style={{ backgroundColor: 'var(--color-chart-2)' }} />
                      <span className="text-muted-foreground">HSA / FSA Contributions</span>
                    </div>
                    <span className="font-semibold font-mono text-foreground blur-number">{formatCurrency(selectedSavingsPoint.hsa)}</span>
                  </div>
                  <div className="flex justify-between p-3 hover:bg-muted/5 transition-colors">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-chart-3" style={{ backgroundColor: 'var(--color-chart-3)' }} />
                      <span className="text-muted-foreground">Brokerage / Investments</span>
                    </div>
                    <span className="font-semibold font-mono text-foreground blur-number">{formatCurrency(selectedSavingsPoint.brokerage)}</span>
                  </div>
                  <div className="flex justify-between p-3 hover:bg-muted/5 transition-colors">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-chart-4" style={{ backgroundColor: 'var(--color-chart-4)' }} />
                      <span className="text-muted-foreground">Savings Inflows</span>
                    </div>
                    <span className="font-semibold font-mono text-foreground blur-number">{formatCurrency(selectedSavingsPoint.savingsAccount)}</span>
                  </div>
                  <div className="flex justify-between p-3 hover:bg-muted/5 transition-colors">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-chart-5" style={{ backgroundColor: 'var(--color-chart-5)' }} />
                      <span className="text-muted-foreground">Cash (Leftover checking surplus)</span>
                    </div>
                    <span className="font-semibold font-mono text-foreground blur-number">{formatCurrency(selectedSavingsPoint.cash)}</span>
                  </div>
                  <div className="flex justify-between p-3 bg-primary/[0.03] font-semibold text-foreground border-t border-border">
                    <span>Total Savings (C)</span>
                    <span className="font-mono blur-number">{formatCurrency(selectedSavingsPoint.retirement + selectedSavingsPoint.hsa + selectedSavingsPoint.brokerage + selectedSavingsPoint.savingsAccount + selectedSavingsPoint.cash)}</span>
                  </div>
                </div>
              </div>

              {/* Informative Note */}
              <div className="text-xs text-muted-foreground bg-muted/30 border border-border/20 rounded-xl p-3 flex items-start gap-2 leading-relaxed">
                <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground/60" />
                <span>
                  <strong>Calculation Formula:</strong> Pre-tax retirement and HSA contributions are isolated from paycheck deductions. Transfers into savings and brokerage accounts are tracked as savings inflows. Leftover cash represents any remaining net income left in your primary bank accounts.
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
