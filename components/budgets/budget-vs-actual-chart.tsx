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

  const chartData = budgets
    .filter((d) => d.budgeted > 0 || d.actual > 0)
    .map((d) => ({
      category: d.categoryName,
      budgeted: d.budgeted,
      actual: d.actual,
      categoryId: d.categoryId,
    }));

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
        <ChartEmptyState variant="nodata" description="Add a budget to see the comparison" />
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm">
      <div className="p-5 pb-2">
        <h3 className="text-sm font-semibold text-foreground">Budget vs Actual</h3>
      </div>
      <div className="h-[300px] px-2 pb-2">
        <div className="financial-chart h-full">
          <ResponsiveBar
            data={chartData}
            keys={['budgeted', 'actual']}
            indexBy="category"
            groupMode="grouped"
            margin={{ top: 10, right: 80, left: 80, bottom: 40 }}
            padding={0.2}
            innerPadding={2}
            colors={['var(--color-muted-foreground)', 'var(--color-chart-3)']}
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
    </div>
  );
}
