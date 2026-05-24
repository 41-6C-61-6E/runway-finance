'use client';

import { useState, useEffect } from 'react';
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useRouter } from 'next/navigation';
import { useBudgetPeriod } from './budget-period-selector';
import { formatCurrency } from '@/lib/utils/format';
import { ChartTooltip, TooltipRow, TooltipHeader } from '@/components/charts/chart-tooltip';
import { ChartEmptyState } from '@/components/charts/chart-empty-state';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

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
          <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 100, height: 100 }}>
            <BarChart
              layout="vertical"
              data={allChartData}
              margin={{ top: 10, right: 60, left: 10, bottom: 10 }}
              onClick={(state: any) => {
                if (state && state.activePayload && state.activePayload.length > 0) {
                  const clickedData = state.activePayload[0].payload;
                  if (clickedData.categoryId) {
                    router.push(`/transactions?categoryId=${clickedData.categoryId}`);
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
                          Over budget by {formatCurrency(item.overage)}
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
              >
                {allChartData.map((entry, index) => (
                  <Cell key={`cell-spent-${index}`} fill={entry.categoryColor || 'var(--color-primary)'} />
                ))}
              </Bar>
              <Bar
                dataKey="remaining"
                stackId="a"
                radius={[0, 0, 0, 0]}
              >
                {allChartData.map((entry, index) => {
                  const catColor = entry.categoryColor;
                  const fillCol = catColor
                    ? (catColor.startsWith('var(') ? `color-mix(in oklch, ${catColor}, transparent 60%)` : `${catColor}66`)
                    : 'color-mix(in oklch, var(--color-primary), transparent 60%)';
                  return <Cell key={`cell-remaining-${index}`} fill={fillCol} />;
                })}
              </Bar>
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