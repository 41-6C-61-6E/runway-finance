'use client';

import { useState, useEffect } from 'react';
import { BarChart, Bar, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useRouter } from 'next/navigation';
import { formatCurrency } from '@/lib/utils/format';
import { ChartTooltip, TooltipRow, TooltipHeader } from '@/components/charts/chart-tooltip';
import { ChartEmptyState } from '@/components/charts/chart-empty-state';
import { ChartTypeSelector, type ChartType } from '@/components/charts/chart-type-selector';
import { TimeRangeFilter, type TimeRange } from '@/components/charts/chart-filters';
import { usePersistentState } from '@/lib/hooks/use-persistent-state';

interface MonthlyData {
  yearMonth: string;
  income: number;
  expenses: number;
  netCashFlow: number;
}

const MONTH_MAP: Record<TimeRange, number> = {
  '1m': 1, '3m': 3, '6m': 6, '1y': 12, '5y': 60, 'ytd': 12, 'all': 120,
};

const typeOptions = [
  { value: 'bar' as ChartType, label: 'Bar' },
  { value: 'line' as ChartType, label: 'Line' },
];

export function NetIncomeAnalysis() {
  const router = useRouter();
  const [allData, setAllData] = useState<MonthlyData[]>([]);
  const [timeframe, setTimeframe] = usePersistentState<TimeRange>('runway:net-income-analysis:timeframe', '1y');
  const [chartType, setChartType] = usePersistentState<ChartType>('runway:net-income-analysis:chartType', 'bar');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch('/api/cash-flow/monthly?months=120');
        if (!res.ok) throw new Error('Failed to fetch data');
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
  const sliced = allData.slice(-numMonths);
  const chartData = sliced.map((d) => ({
    month: new Date(d.yearMonth + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
    netCashFlow: d.netCashFlow,
    yearMonth: d.yearMonth,
  }));

  const bestMonth = sliced.reduce<MonthlyData | null>((best, curr) =>
    !best || curr.netCashFlow > best.netCashFlow ? curr : best, null);
  const worstMonth = sliced.reduce<MonthlyData | null>((worst, curr) =>
    !worst || curr.netCashFlow < worst.netCashFlow ? curr : worst, null);
  const avgNet = sliced.length > 0
    ? sliced.reduce((sum, d) => sum + d.netCashFlow, 0) / sliced.length : 0;
  const ytd = sliced
    .filter((d) => d.yearMonth.startsWith(String(new Date().getFullYear())))
    .reduce((sum, d) => sum + d.netCashFlow, 0);

  const handleClick = (yearMonth: string) => {
    const startDate = yearMonth + '-01';
    const d = new Date(yearMonth + '-01');
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const endDate = `${yearMonth}-${String(lastDay).padStart(2, '0')}`;
    router.push(`/transactions?startDate=${startDate}&endDate=${endDate}`);
  };

  const formatTick = (v: number) => {
    if (v >= 1000000) return `$${(v / 1000000).toFixed(1)}M`;
    if (v >= 1000) return `$${(v / 1000).toFixed(0)}K`;
    return `$${v}`;
  };

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm">
        <div className="p-5 pb-2">
          <h3 className="text-sm font-semibold text-foreground">Net Income Analysis</h3>
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
        <h3 className="text-sm font-semibold text-foreground mb-3">Net Income Analysis</h3>
        <ChartEmptyState variant="error" error={error} />
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">Net Income Analysis</h3>
        <ChartEmptyState variant="nodata" description="Net income data will appear once you sync your accounts" />
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm">
      <div className="p-5 pb-2 flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-foreground">Net Income Analysis</h3>
        <div className="flex items-center gap-2">
          <ChartTypeSelector value={chartType} options={typeOptions} onChange={setChartType} />
        </div>
      </div>
      <div className="px-5 pb-2">
        <TimeRangeFilter value={timeframe} onChange={setTimeframe} />
      </div>
      <div className="h-[300px] px-2 pb-2">
        <div className="financial-chart h-full">
          <ResponsiveContainer width="100%" height="100%">
            {chartType === 'line' ? (
              <LineChart
                data={chartData}
                margin={{ top: 10, right: 10, left: 10, bottom: 10 }}
                onClick={(state: any) => {
                  if (state && state.activePayload && state.activePayload.length > 0) {
                    const clickedData = state.activePayload[0].payload;
                    if (clickedData.yearMonth) {
                      handleClick(clickedData.yearMonth);
                    }
                  }
                }}
                className="cursor-pointer"
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} horizontal={true} />
                <XAxis
                  dataKey="month"
                  tickLine={false}
                  axisLine={{ stroke: 'var(--color-border)' }}
                  tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
                  width={60}
                  tickFormatter={formatTick}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload || !payload.length) return null;
                    const item = payload[0].payload;
                    return (
                      <ChartTooltip>
                        <TooltipHeader>{String(item.month)}</TooltipHeader>
                        <TooltipRow label="Net" value={formatCurrency(item.netCashFlow)} />
                      </ChartTooltip>
                    );
                  }}
                  cursor={{ fill: 'var(--color-border)', opacity: 0.15 }}
                />
                <Line
                  type="monotone"
                  dataKey="netCashFlow"
                  stroke="var(--color-chart-1)"
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              </LineChart>
            ) : (
              <BarChart
                data={chartData}
                margin={{ top: 10, right: 10, left: 10, bottom: 10 }}
                onClick={(state: any) => {
                  if (state && state.activePayload && state.activePayload.length > 0) {
                    const clickedData = state.activePayload[0].payload;
                    if (clickedData.yearMonth) {
                      handleClick(clickedData.yearMonth);
                    }
                  }
                }}
                className="cursor-pointer"
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} horizontal={true} />
                <XAxis
                  dataKey="month"
                  tickLine={false}
                  axisLine={{ stroke: 'var(--color-border)' }}
                  tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
                  width={60}
                  tickFormatter={formatTick}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload || !payload.length) return null;
                    const item = payload[0].payload;
                    return (
                      <ChartTooltip>
                        <TooltipHeader>{String(item.month)}</TooltipHeader>
                        <TooltipRow label="Net" value={formatCurrency(item.netCashFlow)} />
                      </ChartTooltip>
                    );
                  }}
                  cursor={{ fill: 'var(--color-border)', opacity: 0.15 }}
                />
                <Bar dataKey="netCashFlow" radius={[2, 2, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.netCashFlow >= 0 ? 'var(--color-chart-1)' : 'var(--color-destructive)'}
                    />
                  ))}
                </Bar>
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>
      <div className="px-5 py-3 border-t border-border grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">Best Month</p>
          <p className="text-sm font-semibold text-chart-1 financial-value">
            {bestMonth ? formatCurrency(bestMonth.netCashFlow) : '-'}
          </p>
          <p className="text-[10px] text-muted-foreground">{bestMonth?.yearMonth || ''}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">Worst Month</p>
          <p className="text-sm font-semibold text-destructive financial-value">
            {worstMonth ? formatCurrency(worstMonth.netCashFlow) : '-'}
          </p>
          <p className="text-[10px] text-muted-foreground">{worstMonth?.yearMonth || ''}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">Avg Net Income</p>
          <p className="text-sm font-semibold text-foreground financial-value">{formatCurrency(avgNet)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">YTD Net Total</p>
          <p className="text-sm font-semibold text-foreground financial-value">{formatCurrency(ytd)}</p>
        </div>
      </div>
    </div>
  );
}
