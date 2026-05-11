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

export function NetIncomeAnalysis() {
  const [allData, setAllData] = useState<MonthlyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch('/api/cash-flow/monthly?months=12');
        if (!res.ok) throw new Error('Failed to fetch data');
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

  const chartData = allData.map((d) => ({
    month: new Date(d.yearMonth + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
    netCashFlow: d.netCashFlow,
  }));

  const bestMonth = allData.reduce<MonthlyData | null>((best, curr) =>
    !best || curr.netCashFlow > best.netCashFlow ? curr : best, null);

  const worstMonth = allData.reduce<MonthlyData | null>((worst, curr) =>
    !worst || curr.netCashFlow < worst.netCashFlow ? curr : worst, null);

  const avgNet = allData.length > 0
    ? allData.reduce((sum, d) => sum + d.netCashFlow, 0) / allData.length
    : 0;

  const ytd = allData
    .filter((d) => {
      const now = new Date();
      const year = now.getFullYear().toString();
      return d.yearMonth.startsWith(year);
    })
    .reduce((sum, d) => sum + d.netCashFlow, 0);

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm">
        <div className="p-5 pb-2">
          <h3 className="text-sm font-semibold text-foreground">Net Income Analysis</h3>
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
        <h3 className="text-sm font-semibold text-foreground mb-3">Net Income Analysis</h3>
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">Net Income Analysis</h3>
        <p className="text-sm text-muted-foreground">No data available yet</p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm">
      <div className="p-5 pb-2">
        <h3 className="text-sm font-semibold text-foreground">Net Income Analysis</h3>
      </div>
      <div className="h-[300px] px-2 pb-2">
        <div className="financial-chart h-full">
          <ResponsiveBar
            data={chartData}
            keys={['netCashFlow']}
            indexBy="month"
            margin={{ top: 10, right: 10, left: 60, bottom: 30 }}
            padding={0.3}
            borderRadius={2}
            colors={({ value }) =>
              value >= 0 ? 'var(--color-chart-1)' : 'var(--color-destructive)'
            }
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
            tooltip={({ indexValue, value }) => (
              <div>
                <strong>{indexValue}</strong><br />
                Net: {formatCurrency(value)}
              </div>
            )}
          />
        </div>
      </div>
      <div className="px-5 py-3 border-t border-border grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">Best Month</p>
          <p className="text-sm font-semibold text-chart-1 financial-value">
            {bestMonth ? formatCurrency(bestMonth.netCashFlow) : '-'}
          </p>
          <p className="text-[10px] text-muted-foreground">{bestMonth?.yearMonth || ''}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">Worst Month</p>
          <p className="text-sm font-semibold text-destructive financial-value">
            {worstMonth ? formatCurrency(worstMonth.netCashFlow) : '-'}
          </p>
          <p className="text-[10px] text-muted-foreground">{worstMonth?.yearMonth || ''}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">Avg Net Income</p>
          <p className="text-sm font-semibold text-foreground financial-value">{formatCurrency(avgNet)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">YTD Net Total</p>
          <p className="text-sm font-semibold text-foreground financial-value">{formatCurrency(ytd)}</p>
        </div>
      </div>
    </div>
  );
}
