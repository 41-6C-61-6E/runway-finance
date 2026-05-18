'use client';

import { useState, useEffect, useMemo } from 'react';
import { ResponsiveLine } from '@nivo/line';
import { formatCurrency } from '@/lib/utils/format';
import { nivoTheme } from '@/components/charts/shared-chart-theme';
import { ChartTooltip, TooltipRow, TooltipHeader } from '@/components/charts/chart-tooltip';
import { ChartEmptyState } from '@/components/charts/chart-empty-state';
import { TimeRangeFilter, type TimeRange } from '@/components/charts/chart-filters';

interface CategoryMonthData {
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  amount: number;
}

const TOP_N = 5;
const MONTH_MAP: Record<TimeRange, number> = {
  '1m': 6, '3m': 6, '6m': 6, '1y': 12, '5y': 60, 'ytd': 12, 'all': 24,
};

function getMonthsInRange(count: number): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return months;
}

export function ExpenseCategoryTrend() {
  const [allCategoryData, setAllCategoryData] = useState<CategoryMonthData[]>([]);
  const [timeframe, setTimeframe] = useState<TimeRange>('1y');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const numMonths = MONTH_MAP[timeframe] || 12;
  const months = useMemo(() => getMonthsInRange(numMonths), [numMonths]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const results = await Promise.all(
          months.map(async (month) => {
            try {
              const res = await fetch(`/api/cash-flow/categories?month=${month}`);
              if (!res.ok) return [];
              const json: CategoryMonthData[] = await res.json();
              return json
                .filter((c: CategoryMonthData & { isIncome?: boolean }) => !c.isIncome && c.amount > 0)
                .map((c) => ({ ...c, yearMonth: month }));
            } catch {
              return [];
            }
          }),
        );

        const allMonths = results.flat() as (CategoryMonthData & { yearMonth: string })[];
        setAllCategoryData(allMonths);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [months]);

  const { topCategories, series } = useMemo(() => {
    const totals = new Map<string, number>();
    const colors = new Map<string, string>();
    const perMonth = new Map<string, Map<string, number>>();

    for (const d of allCategoryData) {
      const key = d.categoryId;
      totals.set(key, (totals.get(key) || 0) + d.amount);
      colors.set(key, d.categoryColor);

      if (!perMonth.has(key)) perMonth.set(key, new Map());
      const monthMap = perMonth.get(key)!;
      monthMap.set((d as CategoryMonthData & { yearMonth: string }).yearMonth, d.amount);
    }

    const sortedCategories = Array.from(totals.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, TOP_N)
      .map(([id]) => id);

    const topColors = sortedCategories.map((id) => colors.get(id) || 'var(--color-chart-1)');

    const lineSeries = sortedCategories.map((id) => {
      const name = allCategoryData.find((d) => d.categoryId === id)?.categoryName || 'Unknown';
      const monthMap = perMonth.get(id) || new Map();
      return {
        id: name,
        data: months.map((m) => ({
          x: m,
          y: monthMap.get(m) || 0,
        })),
      };
    });

    const topCatInfo = sortedCategories.map((id) => ({
      id,
      name: allCategoryData.find((d) => d.categoryId === id)?.categoryName || 'Unknown',
    }));

    return { topCategories: topCatInfo, series: lineSeries, colors: topColors };
  }, [allCategoryData, months]);

  const maxVal = series.length > 0
    ? Math.max(...series.flatMap((s) => s.data.map((d) => d.y)), 1)
    : 1;

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm">
        <div className="p-5 pb-2">
          <h3 className="text-sm font-semibold text-foreground">Top Expense Categories</h3>
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
        <h3 className="text-sm font-semibold text-foreground mb-3">Top Expense Categories</h3>
        <ChartEmptyState variant="error" error={error} />
      </div>
    );
  }

  if (series.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">Top Expense Categories</h3>
        <ChartEmptyState variant="nodata" description="Expense data will appear once you sync your accounts" />
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm">
      <div className="p-5 pb-2 flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-foreground">Top Expense Categories</h3>
      </div>
      <div className="px-5 pb-2">
        <TimeRangeFilter value={timeframe} onChange={setTimeframe} />
      </div>
      <div className="h-[300px] px-2 pb-2">
        <div className="financial-chart h-full">
          <ResponsiveLine
            data={series}
            margin={{ top: 10, right: 10, left: 60, bottom: 30 }}
            xScale={{ type: 'point' }}
            yScale={{ type: 'linear', min: 0, max: maxVal * 1.2 }}
            curve="monotoneX"
            lineWidth={2}
            enablePoints={false}
            enableGridX={false}
            enableGridY={true}
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
              tickValues: months.length > 12 ? Math.max(4, Math.floor(months.length / 4)) : undefined,
              format: (v: string) => {
                const d = new Date(v + '-01');
                return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
              },
            }}
            theme={nivoTheme}
            useMesh={true}
            enableSlices="x"
            animate={months.length < 60}
            sliceTooltip={({ slice }) => (
              <ChartTooltip>
                <TooltipHeader>
                  {new Date(String(slice.points[0]?.data.xFormatted) + '-01')
                    .toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </TooltipHeader>
                {slice.points.map((point) => (
                  <TooltipRow
                    key={point.id}
                    label={String(point.seriesId)}
                    value={formatCurrency(Number(point.data.y))}
                    color={point.color}
                  />
                ))}
              </ChartTooltip>
            )}
          />
        </div>
      </div>
      <div className="px-5 py-3 border-t border-border">
        <div className="flex flex-wrap gap-2">
          {topCategories.map((cat, i) => (
            <span
              key={cat.id}
              className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full"
              style={{
                backgroundColor: (series[i]?.data[0]?.y !== undefined ? 'var(--color-chart-1)' : 'var(--color-muted)') + '15',
                borderColor: 'var(--color-border)',
                border: '1px solid',
              }}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: 'var(--color-chart-1)' }}
              />
              {cat.name}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
