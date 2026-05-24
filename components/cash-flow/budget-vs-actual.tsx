'use client';

import { useState, useEffect } from 'react';
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useRouter } from 'next/navigation';
import { formatCurrency } from '@/lib/utils/format';
import { ChartTooltip, TooltipRow, TooltipHeader } from '@/components/charts/chart-tooltip';
import { ChartEmptyState } from '@/components/charts/chart-empty-state';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

interface BudgetData {
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  budgeted: number;
  actual: number;
  remaining: number;
  percentUsed: number;
  type?: 'income' | 'expense';
}

export function BudgetVsActual() {
  const router = useRouter();
  const [data, setData] = useState<BudgetData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [excludedCategoryIds, setExcludedCategoryIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch('/api/cash-flow/budgets');
        if (!res.ok) throw new Error('Failed to fetch budget data');
        const json = await res.json();
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const chartData = data
    .filter((d) => !excludedCategoryIds.has(d.categoryId) && (d.budgeted > 0 || d.actual > 0))
    .map((d) => ({
      category: d.categoryName,
      spent: Math.min(d.actual, d.budgeted),
      remaining: Math.max(0, d.budgeted - d.actual),
      overage: Math.max(0, d.actual - d.budgeted),
      budgeted: d.budgeted,
      actual: d.actual,
      percentUsed: d.percentUsed,
      categoryId: d.categoryId,
      categoryColor: d.categoryColor,
      type: d.type ?? 'expense',
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
    router.push(`/transactions?categoryId=${categoryId}`);
  };

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm">
        <div className="p-5 pb-2">
          <h3 className="text-sm font-semibold text-foreground">Budget vs Actual</h3>
        </div>
        <LoadingSpinner category="chart" className="h-[300px]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">Budget vs Actual</h3>
        <ChartEmptyState variant="error" error={error} />
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">Budget vs Actual</h3>
        <ChartEmptyState variant={excludedCategoryIds.size > 0 ? 'empty' : 'nodata'}
          description={excludedCategoryIds.size > 0 ? 'All categories are excluded. Adjust your filters.' : 'No budgets set for this month'} />
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm">
      <div className="p-5 pb-2 flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-foreground">Budget vs Actual</h3>
      </div>
      {/* Category filter chips */}
      {data.length > 0 && (
        <div className="px-5 pb-2 flex flex-wrap gap-1 max-w-full">
          {data.map((d) => (
            <button
              key={d.categoryId}
              onClick={() => toggleCategory(d.categoryId)}
              className={`text-[10px] px-1.5 py-0.5 rounded-full border transition-all ${
                excludedCategoryIds.has(d.categoryId)
                  ? 'border-border text-muted-foreground/40 line-through opacity-50'
                  : 'border-border/50 text-muted-foreground hover:border-foreground/30'
              }`}
            >
              {d.categoryName}
            </button>
          ))}
        </div>
      )}
      <div className="h-[300px] px-2 pb-2">
        <div className="financial-chart h-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              layout="vertical"
              data={chartData}
              margin={{ top: 10, right: 60, left: 10, bottom: 10 }}
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
                tickFormatter={(v: number) => {
                  if (v >= 1000000) return `$${(v / 1000000).toFixed(1)}M`;
                  if (v >= 1000) return `$${(v / 1000).toFixed(0)}K`;
                  return `$${v}`;
                }}
              />
              <YAxis
                type="category"
                dataKey="category"
                tickLine={false}
                axisLine={false}
                tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
                width={90}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload || !payload.length) return null;
                  const item = payload[0].payload;
                  return (
                    <ChartTooltip>
                      <TooltipHeader>{String(item.category)}</TooltipHeader>
                      <TooltipRow label="Budgeted" value={formatCurrency(item.budgeted)} />
                      <TooltipRow label="Actual" value={formatCurrency(item.actual)} />
                      <TooltipRow label="Used" value={`${(item.percentUsed).toFixed(0)}%`} />
                      {item.overage > 0 && (
                        <div style={{ color: 'var(--color-destructive)', fontSize: 10, marginTop: 2, fontWeight: 600 }}>
                          ⚠ Over budget by {formatCurrency(item.overage)}
                        </div>
                      )}
                    </ChartTooltip>
                  );
                }}
                cursor={{ fill: 'var(--color-border)', opacity: 0.15 }}
              />
              <Bar
                dataKey="spent"
                stackId="a"
                radius={[0, 0, 0, 0]}
                fill="var(--color-primary)"
              />
              <Bar
                dataKey="remaining"
                stackId="a"
                radius={[0, 0, 0, 0]}
                fill="var(--color-muted)"
              />
              <Bar
                dataKey="overage"
                stackId="a"
                radius={[0, 4, 4, 0]}
                fill="var(--color-destructive)"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
