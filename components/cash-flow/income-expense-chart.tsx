'use client';

import { useState, useEffect } from 'react';
import { ResponsiveBar } from '@nivo/bar';
import { formatCurrency } from '@/lib/utils/format';

interface MonthlyData {
  yearMonth: string;
  income: number;
  expenses: number;
  netCashFlow: number;
}

type Timeframe = 3 | 6 | 12;

const timeframeOptions: { label: string; value: Timeframe }[] = [
  { label: '3M', value: 3 },
  { label: '6M', value: 6 },
  { label: '1Y', value: 12 },
];

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

export function IncomeExpenseChart() {
  const [allData, setAllData] = useState<MonthlyData[]>([]);
  const [timeframe, setTimeframe] = useState<Timeframe>(12);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch('/api/cash-flow/monthly?months=12');
        if (!res.ok) throw new Error('Failed to fetch monthly data');
        const json = await res.json();
        setAllData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const data = allData.slice(-timeframe).map((d) => ({
    month: new Date(d.yearMonth + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
    income: d.income,
    expenses: d.expenses,
    net: d.netCashFlow,
  }));

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm">
        <div className="p-5 pb-2">
          <h3 className="text-sm font-semibold text-foreground">Income vs Expenses</h3>
        </div>
        <div className="h-[320px] flex items-center justify-center text-muted-foreground">
          <div className="w-7 h-7 border-2 border-border border-t-primary rounded-full animate-spin"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">Income vs Expenses</h3>
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">Income vs Expenses</h3>
        <p className="text-sm text-muted-foreground">No data available yet</p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm">
      <div className="p-5 pb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Income vs Expenses</h3>
        <div className="flex gap-1.5">
          {timeframeOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setTimeframe(opt.value)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                timeframe === opt.value
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      <div className="h-[320px] px-2 pb-2">
        <div className="financial-chart h-full">
          <ResponsiveBar
            data={data}
            keys={['income', 'expenses']}
            indexBy="month"
            groupMode="grouped"
            margin={{ top: 10, right: 10, left: 60, bottom: 30 }}
            padding={0.2}
            innerPadding={2}
            colors={['var(--color-chart-1)', 'var(--color-destructive)']}
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
            tooltip={({ id, value, indexValue, data: pointData }) => {
              const net = (pointData as unknown as Record<string, number>).net || 0;
              return (
                <div>
                  <strong>{indexValue}</strong><br />
                  <span style={{ color: id === 'income' ? 'var(--color-chart-1)' : 'var(--color-destructive)' }}>
                    {id === 'income' ? 'Income' : 'Expenses'}: {formatCurrency(value)}
                  </span><br />
                  <span>Net: {formatCurrency(net)}</span>
                </div>
              );
            }}
          />
        </div>
      </div>
    </div>
  );
}
