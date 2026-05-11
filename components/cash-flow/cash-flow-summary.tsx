'use client';

import { useState, useEffect } from 'react';
import { formatCurrency, formatPercent } from '@/lib/utils/format';

interface SummaryData {
  totalIncome: number;
  totalExpenses: number;
  netIncome: number;
  savingsRate: number;
  currentMonth: string;
  previousMonth: string;
  change: {
    income: number;
    expenses: number;
    netIncome: number;
  };
}

function StatCard({
  label,
  value,
  change,
  valueColor,
  isInverse,
}: {
  label: string;
  value: string;
  change: number;
  valueColor: string;
  isInverse?: boolean;
}) {
  const isGood = isInverse ? change <= 0 : change >= 0;
  return (
    <div className="bg-card border border-border rounded-xl shadow-sm p-5">
      <p className="text-xs font-medium text-muted-foreground mb-1">{label}</p>
      <div className={`text-2xl font-bold financial-value ${valueColor}`}>{value}</div>
      <div className={`flex items-center gap-1 mt-1.5 text-xs font-medium ${isGood ? 'text-chart-1' : 'text-destructive'}`}>
        <span>{change >= 0 ? '↑' : '↓'}</span>
        <span className="financial-value">{formatPercent(change)}</span>
        <span className="text-muted-foreground">vs last month</span>
      </div>
    </div>
  );
}

export function CashFlowSummary() {
  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch('/api/cash-flow/summary');
        if (!res.ok) throw new Error('Failed to fetch summary');
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

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-card border border-border rounded-xl p-5 shadow-sm animate-pulse">
            <div className="h-3 bg-muted rounded w-20 mb-3"></div>
            <div className="h-7 bg-muted rounded w-28 mb-2"></div>
            <div className="h-3 bg-muted rounded w-24"></div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
      <StatCard
        label="Total Income"
        value={formatCurrency(data.totalIncome)}
        change={data.change.income}
        valueColor="text-chart-1"
      />
      <StatCard
        label="Total Expenses"
        value={formatCurrency(data.totalExpenses)}
        change={data.change.expenses}
        valueColor="text-destructive"
        isInverse
      />
      <StatCard
        label="Net Income"
        value={formatCurrency(data.netIncome)}
        change={data.change.netIncome}
        valueColor="text-primary"
      />
      <StatCard
        label="Savings Rate"
        value={data.savingsRate.toFixed(1) + '%'}
        change={data.change.netIncome}
        valueColor="text-chart-3"
      />
    </div>
  );
}
