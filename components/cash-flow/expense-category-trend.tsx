'use client';

import { useState, useEffect, useMemo } from 'react';
import { usePersistentState } from '@/lib/hooks/use-persistent-state';
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useRouter } from 'next/navigation';
import { formatCurrency } from '@/lib/utils/format';
import { ChartTooltip, TooltipRow, TooltipHeader } from '@/components/charts/chart-tooltip';
import { ChartEmptyState } from '@/components/charts/chart-empty-state';
import { TimeRangeFilter, type TimeRange } from '@/components/charts/chart-filters';

interface CategoryMonthData {
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  amount: number;
}

const TOP_N = 10;
const MONTH_MAP: Record<TimeRange, number> = {
  '1m': 1, '3m': 3, '6m': 6, '1y': 12, '5y': 60, 'ytd': 12, 'all': 24,
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
  const router = useRouter();
  const [allCategoryData, setAllCategoryData] = useState<CategoryMonthData[]>([]);
  const [timeframe, setTimeframe] = usePersistentState<TimeRange>('runway:expense-category-trend:timeframe', '1y');
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
              const json = await res.json();
              return (json as (CategoryMonthData & { isIncome?: boolean })[])
                .filter((c) => !c.isIncome && c.amount > 0)
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

  const barData = useMemo(() => {
    const totals = new Map<string, { name: string; color: string; amount: number }>();
    for (const d of allCategoryData) {
      const existing = totals.get(d.categoryId);
      if (existing) {
        existing.amount += d.amount;
      } else {
        totals.set(d.categoryId, {
          name: d.categoryName,
          color: d.categoryColor,
          amount: d.amount,
        });
      }
    }

    const sorted = Array.from(totals.entries())
      .sort(([, a], [, b]) => b.amount - a.amount);

    if (sorted.length <= 20) {
      return sorted.map(([id, { name, color, amount }]) => ({
        id: name,
        value: amount,
        color,
        categoryId: id,
      }));
    }

    const top19 = sorted.slice(0, 19);
    const rest = sorted.slice(19);
    const restAmount = rest.reduce((sum, [, { amount }]) => sum + amount, 0);
    const restIds = rest.map(([id]) => id).join(',');

    const mappedTop = top19.map(([id, { name, color, amount }]) => ({
      id: name,
      value: amount,
      color,
      categoryId: id,
    }));

    const otherItem = {
      id: 'Other',
      value: restAmount,
      color: '#94a3b8',
      categoryId: restIds,
    };

    return [...mappedTop, otherItem];
  }, [allCategoryData]);

  const totalSpending = barData.reduce((sum, d) => sum + d.value, 0);

  const handleClick = (categoryId: string) => {
    const startDate = months[0] + '-01';
    const endMonth = months[months.length - 1];
    const d = new Date(Number(endMonth.split('-')[0]), Number(endMonth.split('-')[1]), 0);
    const endDate = `${endMonth}-${String(d.getDate()).padStart(2, '0')}`;
    if (categoryId.includes(',')) {
      router.push(`/transactions?categoryIds=${categoryId}&startDate=${startDate}&endDate=${endDate}`);
    } else {
      router.push(`/transactions?categoryId=${categoryId}&startDate=${startDate}&endDate=${endDate}`);
    }
  };

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm">
        <div className="p-5 pb-2">
          <h3 className="text-sm font-semibold text-foreground">Top Expense Categories</h3>
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
        <h3 className="text-sm font-semibold text-foreground mb-3">Top Expense Categories</h3>
        <ChartEmptyState variant="error" error={error} />
      </div>
    );
  }

  if (barData.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">Top Expense Categories</h3>
        <ChartEmptyState variant="nodata" description="Expense data will appear once you sync your accounts" />
      </div>
    );
  }

  const formatTick = (v: number) => {
    if (v >= 1000000) return `$${(v / 1000000).toFixed(1)}M`;
    if (v >= 1000) return `$${(v / 1000).toFixed(0)}K`;
    return `$${v}`;
  };
  const maxLabelLen = Math.min(22, Math.max(...barData.map((d) => d.id.length)));
  const leftMargin = Math.min(200, Math.max(90, maxLabelLen * 7 + 12));

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm">
      <div className="p-5 pb-2 flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-foreground">Top Expense Categories</h3>
      </div>
      <div className="px-5 pb-2">
        <TimeRangeFilter value={timeframe} onChange={setTimeframe} />
      </div>
      <div className="h-[350px] px-2 pb-2">
        <div className="financial-chart h-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              layout="vertical"
              data={barData}
              margin={{ top: 10, right: 20, left: 10, bottom: 10 }}
              onClick={(state: any) => {
                if (state && state.activePayload && state.activePayload.length > 0) {
                  const clickedData = state.activePayload[0].payload;
                  if (clickedData.categoryId) {
                    handleClick(clickedData.categoryId);
                  }
                }
              }}
              className="cursor-pointer"
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} vertical={true} />
              <XAxis
                type="number"
                tickLine={false}
                axisLine={{ stroke: 'var(--color-border)' }}
                tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
                tickFormatter={formatTick}
              />
              <YAxis
                type="category"
                dataKey="id"
                tickLine={false}
                axisLine={false}
                tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
                tickFormatter={(v: string) => v.length > 20 ? v.slice(0, 20) + '\u2026' : v}
                width={leftMargin}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload || !payload.length) return null;
                  const item = payload[0].payload;
                  const pct = totalSpending > 0 ? ((item.value / totalSpending) * 100).toFixed(1) : '0';
                  return (
                    <ChartTooltip>
                      <TooltipHeader>{String(item.id)}</TooltipHeader>
                      <TooltipRow label="Amount" value={formatCurrency(item.value)} />
                      <TooltipRow label="Percent" value={`${pct}%`} />
                    </ChartTooltip>
                  );
                }}
                cursor={{ fill: 'var(--color-border)', opacity: 0.15 }}
              />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {barData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color || 'var(--color-primary)'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
