'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { usePersistentState } from '@/lib/hooks/use-persistent-state';
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
import { TIME_RANGE_PRESETS } from '@/components/charts/chart-filters';

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
  const [timeframe, setTimeframe] = usePersistentState<TimeRange>('runway:income-expense:timeframe', '1y');
  const [chartType, setChartType] = usePersistentState<ChartType>('runway:income-expense:chartType', 'bar');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
  const data = allData.slice(-numMonths).map((d) => ({
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
        <div className="p-5 pb-2">
          <h3 className="text-sm font-semibold text-foreground">Income vs Expenses</h3>
        </div>
        <LoadingSpinner category="chart" className="h-[320px]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">Income vs Expenses</h3>
        <ChartEmptyState variant="error" error={error} />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">Income vs Expenses</h3>
        <ChartEmptyState variant="nodata" description="Income and expense data will appear once you sync your accounts" />
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm">
      <div className="p-5 pb-2 flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-foreground">Income vs Expenses</h3>
        <div className="flex items-center gap-2">
          <ChartTypeSelector value={chartType} options={typeOptions} onChange={setChartType} />
        </div>
      </div>
      <div className="px-5 pb-2">
        <TimeRangeFilter value={timeframe} presets={incomeExpensePresets} onChange={setTimeframe} />
      </div>
      <div className="h-[320px] px-2 pb-2">
        <div className="financial-chart h-full">
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
                    <stop offset="5%" stopColor="var(--color-chart-1)" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="var(--color-chart-1)" stopOpacity={0.03} />
                  </linearGradient>
                  <linearGradient id="expensesGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-destructive)" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="var(--color-destructive)" stopOpacity={0.03} />
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
  );
}
