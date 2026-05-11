'use client';

import { useState, useEffect } from 'react';
import { ResponsiveBar } from '@nivo/bar';
import { formatCurrency } from '@/lib/utils/format';

interface BudgetData {
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  budgeted: number;
  actual: number;
  remaining: number;
  percentUsed: number;
}

const theme = {
  background: 'transparent',
  text: { fill: 'var(--color-foreground)', fontSize: 11 },
  axis: {
    domain: { line: { stroke: 'var(--color-border)', strokeWidth: 1 } },
    ticks: { line: { stroke: 'var(--color-border)' }, text: { fill: 'var(--color-muted-foreground)' } },
  },
  grid: { line: { stroke: 'var(--color-border)', strokeDasharray: '3 3' } },
  tooltip: {
    container: {
      background: 'var(--color-card)',
      border: '1px solid var(--color-border)',
      borderRadius: '0.5rem',
      boxShadow: '0 4px 12px var(--color-border)',
      color: 'var(--color-foreground)',
      fontSize: '12px',
    },
  },
  legends: {
    text: { fill: 'var(--color-muted-foreground)', fontSize: 11 },
  },
};

export function BudgetVsActual() {
  const [data, setData] = useState<BudgetData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    .filter((d) => d.budgeted > 0 || d.actual > 0)
    .map((d) => ({
      category: d.categoryName,
      budgeted: d.budgeted,
      actual: d.actual,
      overBudget: d.remaining < 0 ? d.actual : 0,
    }));

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm">
        <div className="p-5 pb-2">
          <h3 className="text-sm font-semibold text-foreground">Budget vs Actual</h3>
        </div>
        <div className="h-[300px] flex items-center justify-center text-muted-foreground">
          <div className="w-7 h-7 border-2 border-border border-t-primary rounded-full animate-spin"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">Budget vs Actual</h3>
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">Budget vs Actual</h3>
        <p className="text-sm text-muted-foreground">No budgets set for this month</p>
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
              tickSize: 0,
              tickPadding: 8,
              format: (v: number) => {
                if (v >= 1000000) return `$${(v / 1000000).toFixed(1)}M`;
                if (v >= 1000) return `$${(v / 1000).toFixed(0)}K`;
                return `$${v}`;
              },
            }}
            axisBottom={{
              tickSize: 0,
              tickPadding: 8,
            }}
            enableGridY={true}
            enableGridX={false}
            theme={theme}
            tooltip={({ id, value, indexValue }) => {
              const overBudget = value > chartData.find((d) => d.category === indexValue)?.budgeted!;
              return (
                <div>
                  <strong>{indexValue}</strong> — {id === 'budgeted' ? 'Budgeted' : 'Actual'}<br />
                  {formatCurrency(value)}
                  {id === 'actual' && overBudget && <span style={{ color: 'var(--color-destructive)' }}> (Over budget)</span>}
                </div>
              );
            }}
          />
        </div>
      </div>
    </div>
  );
}
