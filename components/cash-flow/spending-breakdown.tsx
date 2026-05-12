'use client';

import { useState, useEffect } from 'react';
import { ResponsivePie } from '@nivo/pie';
import { ResponsiveBar } from '@nivo/bar';
import { useRouter } from 'next/navigation';
import { formatCurrency } from '@/lib/utils/format';
import { nivoTheme } from '@/components/charts/shared-chart-theme';
import { ChartTooltip, TooltipRow, TooltipHeader } from '@/components/charts/chart-tooltip';
import { ChartEmptyState } from '@/components/charts/chart-empty-state';
import { ChartTypeSelector, type ChartType } from '@/components/charts/chart-type-selector';
import { TimeRangeFilter, IncludeExcludedFilter, type TimeRange } from '@/components/charts/chart-filters';
import { TIME_RANGE_PRESETS } from '@/components/charts/chart-filters';

interface CategoryData {
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  isIncome: boolean;
  amount: number;
  transactionCount: number;
  previousAmount: number;
  change: number;
  percentChange: number;
}

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthForTimeRange(range: TimeRange): string {
  const now = new Date();
  if (range === '1m' || range === '3m' || range === '6m' || range === '1y' || range === 'ytd' || range === 'all') {
    return getCurrentMonth();
  }
  return getCurrentMonth();
}

const typeOptions = [
  { value: 'pie' as ChartType, label: 'Pie' },
  { value: 'bar' as ChartType, label: 'Bar' },
];

export function SpendingBreakdown() {
  const router = useRouter();
  const [allCategories, setAllCategories] = useState<CategoryData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chartType, setChartType] = useState<ChartType>('pie');
  const [timeframe, setTimeframe] = useState<TimeRange>('1m');
  const [includeExcluded, setIncludeExcluded] = useState(false);
  const [excludedCategoryIds, setExcludedCategoryIds] = useState<Set<string>>(new Set());

  const month = getMonthForTimeRange(timeframe);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`/api/cash-flow/categories?month=${month}`);
        if (!res.ok) throw new Error('Failed to fetch categories');
        const json = await res.json();
        setAllCategories(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [month]);

  const expenseCategories = allCategories
    .filter((c) => !c.isIncome && c.amount > 0 && !excludedCategoryIds.has(c.categoryId));
  const totalSpending = expenseCategories.reduce((sum, c) => sum + c.amount, 0);

  const pieData = expenseCategories.map((c) => ({
    id: c.categoryName,
    label: c.categoryName,
    value: c.amount,
    color: c.categoryColor,
    categoryId: c.categoryId,
  }));

  const toggleCategory = (categoryId: string) => {
    setExcludedCategoryIds((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  };

  const handleClick = (categoryId: string) => {
    const now = new Date();
    const monthStr = getCurrentMonth();
    const startDate = monthStr + '-01';
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const endDate = `${monthStr}-${String(lastDay).padStart(2, '0')}`;
    router.push(`/transactions?categoryId=${categoryId}&startDate=${startDate}&endDate=${endDate}`);
  };

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm">
        <div className="p-5 pb-2">
          <h3 className="text-sm font-semibold text-foreground">Spending Breakdown</h3>
        </div>
        <div className="h-[350px] flex items-center justify-center text-muted-foreground">
          <div className="w-7 h-7 border-2 border-border border-t-primary rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">Spending Breakdown</h3>
        <ChartEmptyState variant="error" error={error} />
      </div>
    );
  }

  if (pieData.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">Spending Breakdown</h3>
        <ChartEmptyState variant={excludedCategoryIds.size > 0 ? 'empty' : 'nodata'}
          description={excludedCategoryIds.size > 0 ? 'All categories are excluded. Adjust your filters.' : 'No spending data for this period'} />
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm">
      <div className="p-5 pb-2 flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-foreground">Spending Breakdown</h3>
        <div className="flex items-center gap-2">
          <IncludeExcludedFilter value={includeExcluded} onChange={setIncludeExcluded} />
          <ChartTypeSelector value={chartType} options={typeOptions} onChange={setChartType} />
        </div>
      </div>
      <div className="px-5 pb-2 flex items-center justify-between flex-wrap gap-2">
        <TimeRangeFilter value={timeframe} onChange={setTimeframe} />
        {/* Category multi-select */}
        {expenseCategories.length > 0 && (
          <div className="flex flex-wrap gap-1 max-w-[300px]">
            {expenseCategories.slice(0, 8).map((c) => (
              <button
                key={c.categoryId}
                onClick={() => toggleCategory(c.categoryId)}
                className={`text-[10px] px-1.5 py-0.5 rounded-full border transition-all ${
                  excludedCategoryIds.has(c.categoryId)
                    ? 'border-border text-muted-foreground/40 line-through opacity-50'
                    : 'border-border/50 text-muted-foreground hover:border-foreground/30'
                }`}
                style={{ borderColor: excludedCategoryIds.has(c.categoryId) ? undefined : c.categoryColor + '40' }}
              >
                {c.categoryName}
              </button>
            ))}
            {expenseCategories.length > 8 && (
              <span className="text-[10px] text-muted-foreground/50 self-center">
                +{expenseCategories.length - 8} more
              </span>
            )}
          </div>
        )}
      </div>
      <div className="h-[350px] relative">
        <div className="financial-chart h-full">
          {chartType === 'bar' ? (
            <ResponsiveBar
              data={pieData}
              keys={['value']}
              indexBy="id"
              margin={{ top: 10, right: 10, left: 80, bottom: 50 }}
              padding={0.3}
              borderRadius={2}
              colors={{ datum: 'data.color' }}
              axisLeft={{
                tickSize: 0, tickPadding: 8,
                format: (v: number) => {
                  if (v >= 1000000) return `$${(v / 1000000).toFixed(1)}M`;
                  if (v >= 1000) return `$${(v / 1000).toFixed(0)}K`;
                  return `$${v}`;
                },
              }}
              axisBottom={{
                tickSize: 0, tickPadding: 8,
                renderTick: () => null,
              }}
              enableGridY={true}
              enableGridX={false}
              layout="horizontal"
              theme={nivoTheme}
              onClick={({ data: barData }) => handleClick(barData.categoryId)}
              tooltip={({ indexValue, value, data: barData }) => {
                const pct = totalSpending > 0 ? ((value / totalSpending) * 100).toFixed(1) : '0';
                return (
                  <ChartTooltip>
                    <TooltipHeader>{String(indexValue)}</TooltipHeader>
                    <TooltipRow label="Amount" value={formatCurrency(value)} />
                    <TooltipRow label="Percent" value={`${pct}%`} />
                  </ChartTooltip>
                );
              }}
            />
          ) : (
            <ResponsivePie
              data={pieData}
              margin={{ top: 20, right: 80, bottom: 20, left: 80 }}
              innerRadius={0.6}
              padAngle={1}
              cornerRadius={3}
              colors={{ datum: 'data.color' }}
              borderWidth={1}
              borderColor={{ from: 'color', modifiers: [['darker', 0.2]] }}
              enableArcLinkLabels={false}
              enableArcLabels={false}
              theme={nivoTheme}
              onClick={(datum) => handleClick(datum.data.categoryId)}
              tooltip={({ datum }) => {
                const pct = totalSpending > 0 ? ((datum.value / totalSpending) * 100).toFixed(1) : '0';
                return (
                  <ChartTooltip>
                    <TooltipHeader>{datum.label}</TooltipHeader>
                    <TooltipRow label="Amount" value={formatCurrency(datum.value)} />
                    <TooltipRow label="Percent" value={`${pct}%`} />
                  </ChartTooltip>
                );
              }}
              legends={[
                {
                  anchor: 'bottom',
                  direction: 'row',
                  justify: false,
                  translateY: 56,
                  itemsSpacing: 0,
                  itemWidth: 100,
                  itemHeight: 18,
                  itemDirection: 'left-to-right',
                  itemOpacity: 1,
                  symbolSize: 10,
                  symbolShape: 'circle',
                },
              ]}
            />
          )}
          {chartType === 'pie' && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none text-center">
              <div className="text-lg font-bold text-foreground financial-value">{formatCurrency(totalSpending)}</div>
              <div className="text-[10px] text-muted-foreground">Total Spending</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
