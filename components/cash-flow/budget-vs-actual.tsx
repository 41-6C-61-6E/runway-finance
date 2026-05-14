'use client';

import { useState, useEffect } from 'react';
import { ResponsiveBar } from '@nivo/bar';
import { useRouter } from 'next/navigation';
import { formatCurrency } from '@/lib/utils/format';
import { nivoTheme } from '@/components/charts/shared-chart-theme';
import { ChartTooltip, TooltipRow, TooltipHeader } from '@/components/charts/chart-tooltip';
import { ChartEmptyState } from '@/components/charts/chart-empty-state';

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
        <div className="h-[300px] flex items-center justify-center text-muted-foreground">
          <div className="w-7 h-7 border-2 border-border border-t-primary rounded-full animate-spin" />
        </div>
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
      {chartData.length > 0 && (
        <div className="px-5 pb-2 flex flex-wrap gap-1 max-w-full">
          {chartData.map((d) => (
            <button
              key={d.categoryId}
              onClick={() => toggleCategory(d.categoryId)}
              className={`text-[10px] px-1.5 py-0.5 rounded-full border transition-all ${
                excludedCategoryIds.has(d.categoryId)
                  ? 'border-border text-muted-foreground/40 line-through opacity-50'
                  : 'border-border/50 text-muted-foreground hover:border-foreground/30'
              }`}
            >
              {d.category}
            </button>
          ))}
        </div>
      )}
      <div className="h-[300px] px-2 pb-2">
        <div className="financial-chart h-full">
          <ResponsiveBar
            data={chartData}
            keys={['spent', 'remaining', 'overage']}
            indexBy="category"
            groupMode="stacked"
            layout="horizontal"
            margin={{ top: 10, right: 60, left: 90, bottom: 40 }}
            padding={0.3}
            borderRadius={4}
            colors={({ id }) => {
              if (id === 'spent') return 'var(--color-primary)';
              if (id === 'remaining') return 'var(--color-muted)';
              return 'var(--color-destructive)';
            }}
            axisLeft={{
              tickSize: 0, tickPadding: 8,
              tickValues: 'start',
            }}
            axisBottom={{
              tickSize: 0, tickPadding: 8,
              format: (v: number) => {
                if (v >= 1000000) return `$${(v / 1000000).toFixed(1)}M`;
                if (v >= 1000) return `$${(v / 1000).toFixed(0)}K`;
                return `$${v}`;
              },
            }}
            enableGridY={false}
            enableGridX={true}
            theme={nivoTheme}
            onClick={({ data: barData }) => handleClick(barData.categoryId)}
            tooltip={({ id, value, indexValue }) => {
              const item = chartData.find((d) => d.category === indexValue);
              return (
                <ChartTooltip>
                  <TooltipHeader>{String(indexValue)}</TooltipHeader>
                  <TooltipRow label="Budgeted" value={formatCurrency(item?.budgeted ?? 0)} />
                  <TooltipRow label="Actual" value={formatCurrency(item?.actual ?? 0)} />
                  <TooltipRow label="Used" value={`${(item?.percentUsed ?? 0).toFixed(0)}%`} />
                  {item && item.overage > 0 && (
                    <div style={{ color: 'var(--color-destructive)', fontSize: 10, marginTop: 2, fontWeight: 600 }}>
                      ⚠ Over budget by {formatCurrency(item.overage)}
                    </div>
                  )}
                </ChartTooltip>
              );
            }}
          />
        </div>
      </div>
    </div>
  );
}
