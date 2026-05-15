'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { formatCurrency, formatPercent } from '@/lib/utils/format';
import { ChartEmptyState } from '@/components/charts/chart-empty-state';
import { TimeRangeFilter, type TimeRange } from '@/components/charts/chart-filters';
import { useChartVisibility } from '@/lib/hooks/use-chart-visibility';

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

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthForTimeRange(range: TimeRange): string {
  const now = new Date();
  if (range === '1m' || range === '3m' || range === '6m' || range === '1y' || range === 'ytd' || range === 'all') {
    return getCurrentMonth();
  }
  return getCurrentMonth();
}

export function CategorySummaries() {
  const router = useRouter();
  const { isVisible } = useChartVisibility();
  const [allCategories, setAllCategories] = useState<CategoryData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<TimeRange>('1m');

  const month = getMonthForTimeRange(timeframe);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`/api/cash-flow/categories?month=${month}`);
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
  }, [month]);

  const income = useMemo(() =>
    allCategories
      .filter((c) => c.isIncome && c.amount > 0)
      .sort((a, b) => b.amount - a.amount),
    [allCategories]
  );

  const expenses = useMemo(() =>
    allCategories
      .filter((c) => !c.isIncome && c.amount > 0)
      .sort((a, b) => b.amount - a.amount),
    [allCategories]
  );

  const handleCategoryClick = (categoryId: string) => {
    router.push(`/transactions?categoryId=${categoryId}`);
  };

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm p-5">
        <div className="p-5 pb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Category Breakdown</h3>
          <TimeRangeFilter value={timeframe} onChange={setTimeframe} />
        </div>
        <div className="h-[350px] flex items-center justify-center text-muted-foreground">
          <div className="w-7 h-7 border-2 border-border border-t-primary rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm p-5">
        <div className="p-5 pb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Category Breakdown</h3>
          <TimeRangeFilter value={timeframe} onChange={setTimeframe} />
        </div>
        <ChartEmptyState variant="error" error={error} />
      </div>
    );
  }

  if (income.length === 0 && expenses.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm p-5">
        <div className="p-5 pb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Category Breakdown</h3>
          <TimeRangeFilter value={timeframe} onChange={setTimeframe} />
        </div>
        <ChartEmptyState variant="nodata" description="No category data for this period" />
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

  function renderSectionHeader(label: string, colorClass: string) {
    return (
      <div className="px-5 pt-3 pb-1">
        <span className={`text-xs font-medium ${colorClass} uppercase tracking-wider`}>{label}</span>
      </div>
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

  function renderSection(categories: CategoryData[], isIncome: boolean) {
    if (categories.length === 0) return null;
    const colorClass = isIncome ? 'text-chart-1' : 'text-destructive';
    const sectionKey = isIncome ? 'categoryIncome' : 'categoryExpenses';
    const sectionVisible = isVisible(sectionKey);

    return (
      <div className="relative">
        <div className="px-5 pt-3 pb-1">
          <span className={`text-xs font-medium ${colorClass} uppercase tracking-wider`}>
            {isIncome ? 'Income' : 'Expenses'}
          </span>
        </div>
        {renderHeader()}
        <div className="divide-y divide-border">
          {categories.map((cat) => renderCategoryRow(cat, isIncome))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm">
      <div className="p-5 pb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Category Breakdown</h3>
        <TimeRangeFilter value={timeframe} onChange={setTimeframe} />
      </div>
      {income.length > 0 && renderSection(income, true)}
      {expenses.length > 0 && renderSection(expenses, false)}
    </div>
  );
}
