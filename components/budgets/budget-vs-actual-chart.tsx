'use client';

import { useState, useEffect } from 'react';
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useRouter } from 'next/navigation';
import { useBudgetPeriod } from './budget-period-selector';
import { useCardCollapsed } from '@/lib/hooks/use-card-collapsed';
import { formatCurrency } from '@/lib/utils/format';
import { ChartTooltip, TooltipRow, TooltipHeader } from '@/components/charts/chart-tooltip';
import { ChartEmptyState } from '@/components/charts/chart-empty-state';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { CollapsibleCardHeader } from '@/components/ui/collapsible-card-header';
import { CollapsibleFilterPanel } from '@/components/ui/collapsible-filter-panel';
import { Scale } from 'lucide-react';

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
  const [isMobile, setIsMobile] = useState(false);
  const [isCollapsed, setIsCollapsed] = useCardCollapsed('budgetVsActualChart');
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

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
        <CollapsibleCardHeader
          isCollapsed={isCollapsed}
          onToggle={setIsCollapsed}
          title="Budget vs Actual"
        />
        {!isCollapsed && <LoadingSpinner category="chart" className="h-[300px] m-5" />}
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm">
        <CollapsibleCardHeader
          isCollapsed={isCollapsed}
          onToggle={setIsCollapsed}
          title="Budget vs Actual"
        />
        {!isCollapsed && (
          <div className="p-3 sm:p-5">
            <ChartEmptyState variant="error" error={error} />
          </div>
        )}
      </div>
    );
  }

  if (allChartData.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm">
        <CollapsibleCardHeader
          isCollapsed={isCollapsed}
          onToggle={setIsCollapsed}
          title="Budget vs Actual"
        />
        {!isCollapsed && (
          <div className="p-3 sm:p-5">
            <ChartEmptyState variant="nodata" description="Add a budget to see the comparison" />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm">
      <CollapsibleCardHeader
        isCollapsed={isCollapsed}
        onToggle={setIsCollapsed}
        title={
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Scale className="w-4 h-4 text-primary" /> Budget vs Actual
          </h3>
        }
      />
      {!isCollapsed && (
        <>
          <CollapsibleFilterPanel
            isOpen={showFilters}
            onToggle={() => setShowFilters(!showFilters)}
            feedback={
              <span className="bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider">
                {excludeIncome ? 'EXCLUDING INCOME' : 'INCLUDING INCOME'}
              </span>
            }
          >
            <div className="flex flex-wrap items-center gap-4 p-3 bg-muted/20 border border-border/20 rounded-xl">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={excludeIncome}
                  onChange={(e) => setExcludeIncome(e.target.checked)}
                  className="rounded border-border bg-background text-primary focus:ring-ring cursor-pointer"
                />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Exclude Income Categories</span>
              </label>
            </div>
          </CollapsibleFilterPanel>
          <div className="h-[350px] pt-2">
            <div className="financial-chart h-full w-full overflow-x-auto overflow-y-hidden">
              <div className="min-w-max h-full px-2 pb-2">
            <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 100, height: 100 }}>
              <BarChart
              layout="vertical"
              data={allChartData}
              margin={isMobile ? { top: 10, right: 15, left: 10, bottom: 10 } : { top: 10, right: 60, left: 10, bottom: 10 }}
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
                width={isMobile ? 65 : 90}
                tickFormatter={(v: string) => isMobile && v.length > 10 ? `${v.slice(0, 10)}...` : v}
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
        </>
      )}
    </div>
  );
}