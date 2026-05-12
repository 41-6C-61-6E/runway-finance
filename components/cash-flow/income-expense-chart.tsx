'use client';

import { useState, useEffect } from 'react';
import { ResponsiveBar } from '@nivo/bar';
import { ResponsiveLine } from '@nivo/line';
import { useRouter } from 'next/navigation';
import { formatCurrency } from '@/lib/utils/format';
import { nivoTheme } from '@/components/charts/shared-chart-theme';
import { ChartTooltip, TooltipRow, TooltipHeader } from '@/components/charts/chart-tooltip';
import { ChartEmptyState } from '@/components/charts/chart-empty-state';
import { ChartTypeSelector, type ChartType } from '@/components/charts/chart-type-selector';
import { TimeRangeFilter, IncludeExcludedFilter, type TimeRange } from '@/components/charts/chart-filters';
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
  { value: 'line' as ChartType, label: 'Line' },
];

export function IncomeExpenseChart() {
  const router = useRouter();
  const [allData, setAllData] = useState<MonthlyData[]>([]);
  const [timeframe, setTimeframe] = useState<TimeRange>('1y');
  const [chartType, setChartType] = useState<ChartType>('bar');
  const [includeExcluded, setIncludeExcluded] = useState(false);
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
    month: new Date(d.yearMonth + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
    income: d.income,
    expenses: d.expenses,
    net: d.netCashFlow,
    yearMonth: d.yearMonth,
  }));

  const handleClick = (yearMonth: string) => {
    const startDate = yearMonth + '-01';
    const d = new Date(yearMonth + '-01');
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const endDate = `${yearMonth}-${String(lastDay).padStart(2, '0')}`;
    router.push(`/transactions?startDate=${startDate}&endDate=${endDate}`);
  };

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm">
        <div className="p-5 pb-2">
          <h3 className="text-sm font-semibold text-foreground">Income vs Expenses</h3>
        </div>
        <div className="h-[320px] flex items-center justify-center text-muted-foreground">
          <div className="w-7 h-7 border-2 border-border border-t-primary rounded-full animate-spin" />
        </div>
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
          <IncludeExcludedFilter value={includeExcluded} onChange={setIncludeExcluded} />
          <ChartTypeSelector value={chartType} options={typeOptions} onChange={setChartType} />
        </div>
      </div>
      <div className="px-5 pb-2">
        <TimeRangeFilter value={timeframe} presets={incomeExpensePresets} onChange={setTimeframe} />
      </div>
      <div className="h-[320px] px-2 pb-2">
        <div className="financial-chart h-full">
          {chartType === 'line' ? (
            <ResponsiveLine
              data={[
                { id: 'Income', data: data.map((d) => ({ x: d.month, y: d.income })) },
                { id: 'Expenses', data: data.map((d) => ({ x: d.month, y: d.expenses })) },
              ]}
              margin={{ top: 10, right: 10, left: 60, bottom: 30 }}
              xScale={{ type: 'point' }}
              yScale={{ type: 'linear', min: 'auto', max: 'auto' }}
              curve="monotoneX"
              colors={['var(--color-chart-1)', 'var(--color-destructive)']}
              lineWidth={2}
              enablePoints={false}
              enableGridX={false}
              axisLeft={{
                tickSize: 0, tickPadding: 8,
                format: (v: number) => {
                  if (v >= 1000000) return `$${(v / 1000000).toFixed(1)}M`;
                  if (v >= 1000) return `$${(v / 1000).toFixed(0)}K`;
                  return `$${v}`;
                },
              }}
              axisBottom={{ tickSize: 0, tickPadding: 8 }}
              theme={nivoTheme}
              useMesh={true}
              onClick={(raw) => {
                const p = raw as unknown as { data: { xFormatted: string } };
                const matched = data.find((d) => d.month === String(p.data.xFormatted));
                if (matched) handleClick(matched.yearMonth);
              }}
              tooltip={({ point }) => (
                <ChartTooltip>
                  <TooltipHeader>{String(point.data.xFormatted)}</TooltipHeader>
                  <TooltipRow
                    label={String(point.seriesId)}
                    value={formatCurrency(Number(point.data.y))}
                    color={point.color}
                  />
                </ChartTooltip>
              )}
            />
          ) : (
            <ResponsiveBar
              data={data}
              keys={['income', 'expenses']}
              indexBy="month"
              groupMode="grouped"
              margin={{ top: 10, right: 10, left: 60, bottom: 30 }}
              padding={0.2}
              innerPadding={2}
              colors={['var(--color-chart-1)', 'var(--color-destructive)']}
              borderColor={{ from: 'color', modifiers: [['darker', 1.6]] }}
              axisLeft={{
                tickSize: 0, tickPadding: 8,
                format: (v: number) => {
                  if (v >= 1000000) return `$${(v / 1000000).toFixed(1)}M`;
                  if (v >= 1000) return `$${(v / 1000).toFixed(0)}K`;
                  return `$${v}`;
                },
              }}
              axisBottom={{ tickSize: 0, tickPadding: 8 }}
              enableGridY={true}
              enableGridX={false}
              theme={nivoTheme}
              onClick={({ data: barData }) => {
                const matched = data.find((d) => d.month === barData.month);
                if (matched) handleClick(matched.yearMonth);
              }}
              tooltip={({ id, value, indexValue, data: pointData }) => {
                const net = (pointData as unknown as Record<string, number>).net || 0;
                return (
                  <ChartTooltip>
                    <TooltipHeader>{String(indexValue)}</TooltipHeader>
                    <TooltipRow
                      label={id === 'income' ? 'Income' : 'Expenses'}
                      value={formatCurrency(value)}
                      color={id === 'income' ? 'var(--color-chart-1)' : 'var(--color-destructive)'}
                    />
                    <TooltipRow label="Net" value={formatCurrency(net)} />
                  </ChartTooltip>
                );
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
