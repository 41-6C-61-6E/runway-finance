'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { formatCurrency, formatPercent } from '@/lib/utils/format';
import { ChartEmptyState } from '@/components/charts/chart-empty-state';

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

function MiniSparkline({ value, prev, isIncome }: { value: number; prev: number; isIncome: boolean }) {
  const w = 60;
  const h = 24;
  const max = Math.max(value, prev, 1);
  const x1 = 0;
  const x2 = w;
  const y1 = h - (prev / max) * h;
  const y2 = h - (value / max) * h;
  const isUp = value >= prev;

  let lineColor: string;
  if (isIncome) {
    lineColor = isUp ? 'var(--color-chart-1)' : 'var(--color-destructive)';
  } else {
    lineColor = isUp ? 'var(--color-destructive)' : 'var(--color-chart-1)';
  }

  return (
    <svg width={w} height={h} className="overflow-visible">
      <line
        x1={x1} y1={y1} x2={x2} y2={y2}
        stroke={lineColor}
        strokeWidth={2}
        strokeLinecap="round"
      />
      <circle cx={x1} cy={y1} r={2.5} fill={lineColor} />
      <circle cx={x2} cy={y2} r={2.5} fill={lineColor} />
      <title>{`${formatCurrency(prev)} → ${formatCurrency(value)}`}</title>
    </svg>
  );
}

export function CategorySummaries() {
  const router = useRouter();
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

  const income = allCategories
    .filter((c) => c.isIncome && c.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  const expenses = allCategories
    .filter((c) => !c.isIncome && c.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  const handleCategoryClick = (categoryId: string) => {
    router.push(`/transactions?categoryId=${categoryId}`);
  };

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4">Category Breakdown</h3>
        <div className="animate-pulse space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-10 bg-muted rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">Category Breakdown</h3>
        <ChartEmptyState variant="error" error={error} />
      </div>
    );
  }

  if (income.length === 0 && expenses.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">Category Breakdown</h3>
        <ChartEmptyState variant="nodata" description="No category data for this month" />
      </div>
    );
  }

  function renderCategoryRow(cat: CategoryData, isIncome: boolean) {
    const isUp = cat.change >= 0;
    let changeColor: string;
    if (isIncome) {
      changeColor = isUp ? 'text-chart-1' : 'text-destructive';
    } else {
      changeColor = isUp ? 'text-destructive' : 'text-chart-1';
    }

    return (
      <button
        key={cat.categoryId}
        onClick={() => handleCategoryClick(cat.categoryId)}
        className="flex items-center justify-between py-2.5 px-5 hover:bg-muted/30 transition-colors w-full text-left"
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <span
            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: cat.categoryColor }}
          />
          <span className="text-sm text-foreground truncate">{cat.categoryName}</span>
        </div>
        <div className="flex items-center gap-4 flex-shrink-0">
          <span className="text-sm font-semibold text-foreground financial-value w-24 text-right">
            {formatCurrency(cat.amount)}
          </span>
          <span className={`text-xs font-medium w-20 text-right financial-value ${changeColor}`}>
            {formatCurrency(cat.change)}
          </span>
          <span className={`text-xs font-medium w-14 text-right financial-value ${changeColor}`}>
            {formatPercent(cat.percentChange)}
          </span>
          <div className="w-[60px]">
            <MiniSparkline value={cat.amount} prev={cat.previousAmount} isIncome={isIncome} />
          </div>
        </div>
      </button>
    );
  }

  function renderHeader() {
    return (
      <div className="flex items-center justify-between px-5 py-2 border-b border-border text-xs font-medium text-muted-foreground">
        <span>Category</span>
        <div className="flex items-center gap-4 flex-shrink-0">
          <span className="w-24 text-right">Amount</span>
          <span className="w-20 text-right">Change</span>
          <span className="w-14 text-right">%</span>
          <span className="w-[60px] text-right">Trend</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl">
      <h3 className="text-sm font-semibold text-foreground px-5 pt-5 pb-1">Category Breakdown</h3>
      {income.length > 0 && (
        <>
          <div className="px-5 pt-3 pb-1">
            <span className="text-xs font-medium text-chart-1 uppercase tracking-wider">Income</span>
          </div>
          {renderHeader()}
          <div className="divide-y divide-border">
            {income.map((cat) => renderCategoryRow(cat, true))}
          </div>
        </>
      )}
      {expenses.length > 0 && (
        <>
          <div className="px-5 pt-3 pb-1">
            <span className="text-xs font-medium text-destructive uppercase tracking-wider">Expenses</span>
          </div>
          {renderHeader()}
          <div className="divide-y divide-border">
            {expenses.map((cat) => renderCategoryRow(cat, false))}
          </div>
        </>
      )}
    </div>
  );
}
