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
      budgeted: d.budgeted,
      actual: d.actual,
      categoryId: d.categoryId,
    }));

  const expenseItems = budgets
    .filter((d) => d.type === 'expense' && (d.budgeted > 0 || d.actual > 0))
    .map((d) => ({
      category: d.categoryName,
      budgeted: d.budgeted,
      actual: d.actual,
      categoryId: d.categoryId,
    }));

  const allChartData = [
    ...incomeItems.map((d) => ({ ...d, section: 'Income' })),
    ...expenseItems.map((d) => ({ ...d, section: 'Expenses' })),
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
      <div className="p-5 pb-2">
        <h3 className="text-sm font-semibold text-foreground">Budget vs Actual</h3>
      </div>
      <div className="h-[350px] px-2 pb-2">
        <div className="financial-chart h-full">
          <ResponsiveBar
            data={allChartData}
            keys={['budgeted', 'actual']}
            indexBy="category"
            groupMode="grouped"
            margin={{ top: 10, right: 60, left: 80, bottom: 60 }}
            padding={0.2}
            innerPadding={2}
            colors={({ id, data: row }) => {
              const isIncome = (row as unknown as Record<string, string>).section === 'Income';
              if (id === 'budgeted') return isIncome ? 'var(--color-chart-2)' : 'var(--color-muted-foreground)';
              return isIncome ? 'var(--color-chart-1)' : 'var(--color-destructive)';
            }}
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
            onClick={({ data: barData }) => router.push(`/transactions?categoryId=${(barData as unknown as Record<string, string>).categoryId}`)}
            tooltip={({ id, value, indexValue }) => (
              <ChartTooltip>
                <TooltipHeader>{String(indexValue)}</TooltipHeader>
                <TooltipRow
                  label={id === 'budgeted' ? 'Budgeted' : 'Actual'}
                  value={formatCurrency(value as number)}
                />
              </ChartTooltip>
            )}
          />
        </div>
      </div>
      <div className="px-5 py-2.5 border-t border-border flex items-center gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'var(--color-chart-2)' }} />
          Income Budgeted
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'var(--color-chart-1)' }} />
          Income Actual
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'var(--color-muted-foreground)' }} />
          Expense Budgeted
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'var(--color-destructive)' }} />
          Expense Actual
        </div>
      </div>
    </div>
  );
}