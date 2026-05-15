'use client';

import { useState, useEffect } from 'react';
import { ResponsiveBar } from '@nivo/bar';
import { useRouter } from 'next/navigation';
import { useBudgetPeriod } from './budget-period-selector';
import { formatCurrency } from '@/lib/utils/format';
import { nivoTheme } from '@/components/charts/shared-chart-theme';
import { ChartTooltip, TooltipRow, TooltipHeader } from '@/components/charts/chart-tooltip';
import { ChartEmptyState } from '@/components/charts/chart-empty-state';

interface BudgetData {
  id: string;
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  budgeted: number;
  actual: number;
  remaining: number;
  percentUsed: number;
  type: 'income' | 'expense';
}

export function BudgetVsActualChart() {
  const router = useRouter();
  const { periodType, periodKey } = useBudgetPeriod();
  const [budgets, setBudgets] = useState<BudgetData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [excludeIncome, setExcludeIncome] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/budgets?periodType=${periodType}&periodKey=${periodKey}`, { credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch');
        return res.json();
      })
      .then((data) => setBudgets(data.budgets ?? []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [periodType, periodKey]);

  const incomeItems = budgets
    .filter((d) => d.type === 'income' && (d.budgeted > 0 || d.actual > 0))
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
      type: 'income',
    }));

  const expenseItems = budgets
    .filter((d) => d.type === 'expense' && (d.budgeted > 0 || d.actual > 0))
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
      type: 'expense',
    }));

  const allChartData = [
    ...(excludeIncome ? [] : incomeItems),
    ...expenseItems,
  ];

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

  if (allChartData.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">Budget vs Actual</h3>
        <ChartEmptyState variant="nodata" description="Add a budget to see the comparison" />
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm">
      <div className="p-5 pb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Budget vs Actual</h3>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={excludeIncome}
            onChange={(e) => setExcludeIncome(e.target.checked)}
            className="rounded border-border text-primary focus:ring-primary"
          />
          <span className="text-xs text-muted-foreground">Exclude Income</span>
        </label>
      </div>
      <div className="h-[350px] px-2 pb-2">
        <div className="financial-chart h-full">
          <ResponsiveBar
            data={allChartData}
            keys={['spent', 'remaining', 'overage']}
            indexBy="category"
            groupMode="stacked"
            layout="horizontal"
            margin={{ top: 10, right: 60, left: 90, bottom: 40 }}
            padding={0.3}
            borderRadius={4}
            enableLabel={false}
            colors={({ id, data }) => {
              const catColor = (data as unknown as Record<string, string>).categoryColor;
              if (id === 'spent') return catColor || 'var(--color-primary)';
              if (id === 'remaining') return catColor ? `${catColor}66` : 'var(--color-primary)';
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
            animate={allChartData.length < 50}
            onClick={({ data: barData }) => router.push(`/transactions?categoryId=${(barData as unknown as Record<string, string>).categoryId}`)}
            tooltip={({ id, value, indexValue }) => {
              const item = allChartData.find((d) => d.category === indexValue);
              return (
                <ChartTooltip>
                  <TooltipHeader>{String(indexValue)}</TooltipHeader>
                  <TooltipRow label="Budgeted" value={formatCurrency(item?.budgeted ?? 0)} />
                  <TooltipRow label="Actual" value={formatCurrency(item?.actual ?? 0)} />
                  <TooltipRow label="Used" value={`${(item?.percentUsed ?? 0).toFixed(0)}%`} />
                  {item && item.overage > 0 && (
                    <div style={{ color: 'var(--color-destructive)', fontSize: 10, marginTop: 2, fontWeight: 600 }}>
                      Over budget by {formatCurrency(item.overage)}
                    </div>
                  )}
                </ChartTooltip>
              );
            }}
          />
        </div>
      </div>
      <div className="px-5 py-2.5 border-t border-border flex items-center gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'var(--color-primary)' }} />
          Spent
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'var(--color-primary)', opacity: 0.4 }} />
          Remaining
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'var(--color-destructive)' }} />
          Over Budget
        </div>
      </div>
    </div>
  );
}