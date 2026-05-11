'use client';

import { useState, useEffect } from 'react';
import { ResponsivePie } from '@nivo/pie';
import { formatCurrency } from '@/lib/utils/format';

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

export function SpendingBreakdown() {
  const [allCategories, setAllCategories] = useState<CategoryData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch('/api/cash-flow/categories');
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
  }, []);

  const expenseCategories = allCategories.filter((c) => !c.isIncome && c.amount > 0);
  const totalSpending = expenseCategories.reduce((sum, c) => sum + c.amount, 0);

  const pieData = expenseCategories.map((c) => ({
    id: c.categoryName,
    label: c.categoryName,
    value: c.amount,
    color: c.categoryColor,
    categoryId: c.categoryId,
  }));

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm">
        <div className="p-5 pb-2">
          <h3 className="text-sm font-semibold text-foreground">Spending Breakdown</h3>
        </div>
        <div className="h-[350px] flex items-center justify-center text-muted-foreground">
          <div className="w-7 h-7 border-2 border-border border-t-primary rounded-full animate-spin"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">Spending Breakdown</h3>
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  if (pieData.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">Spending Breakdown</h3>
        <p className="text-sm text-muted-foreground">No spending data for this month</p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm">
      <div className="p-5 pb-2">
        <h3 className="text-sm font-semibold text-foreground">Spending Breakdown</h3>
      </div>
      <div className="h-[350px]">
        <div className="financial-chart h-full">
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
            theme={theme}
            tooltip={({ datum }) => {
              const pct = totalSpending > 0 ? ((datum.value / totalSpending) * 100).toFixed(1) : '0';
              return (
                <div>
                  <strong>{datum.label}</strong><br />
                  {formatCurrency(datum.value)} ({pct}%)
                </div>
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
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none text-center">
            <div className="text-lg font-bold text-foreground financial-value">{formatCurrency(totalSpending)}</div>
            <div className="text-[10px] text-muted-foreground">Total Spending</div>
          </div>
        </div>
      </div>
    </div>
  );
}
