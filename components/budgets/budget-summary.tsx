'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useBudgetPeriod } from './budget-period-selector';
import { formatCurrency } from '@/lib/utils/format';
import { useCardCollapsed } from '@/lib/hooks/use-card-collapsed';
import { CollapsibleCardHeader } from '@/components/ui/collapsible-card-header';
import { Card, CardContent } from '@/components/ui/card';
import { Wallet, TrendingUp, TrendingDown, AlertTriangle, ShieldCheck, Sparkles, ChevronRight, Layers, BarChart3, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { ChartHoverTooltip } from '@/components/charts/chart-hover-tooltip';
import { TooltipRow, TooltipHeader } from '@/components/charts/chart-tooltip';

interface BudgetData {
  id: string;
  categoryId: string;
  categoryName: string;
  budgeted: number;
  actual: number;
  remaining: number;
  percentUsed: number;
  type: 'income' | 'expense';
  isDiscretionary?: boolean;
}

export function BudgetSummary() {
  const { periodType, periodKey } = useBudgetPeriod();
  const [collapsed, setCollapsed] = useCardCollapsed('budgetSummary');

  const { data, isLoading: loading } = useQuery({
    queryKey: ['budgets', periodType, periodKey],
    queryFn: async () => {
      const res = await fetch(`/api/budgets?periodType=${periodType}&periodKey=${periodKey}&includeCategories=true`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load budgets');
      return await res.json();
    },
  });

  const budgets = (data?.budgets ?? []) as BudgetData[];

  if (loading) {
    return (
      <Card className="animate-pulse">
        <CardContent className="p-5 space-y-4">
          <div className="h-5 bg-muted rounded w-36 mb-2" />
          <div className="h-32 bg-muted/60 rounded-xl" />
          <div className="h-20 bg-muted/40 rounded-xl" />
        </CardContent>
      </Card>
    );
  }

  const incomeBudgets = budgets.filter((b) => b.type === 'income');
  const expenseBudgets = budgets.filter((b) => b.type === 'expense');

  const totalIncomeBudgeted = incomeBudgets.reduce((s, b) => s + b.budgeted, 0);
  const totalIncomeActual = incomeBudgets.reduce((s, b) => s + b.actual, 0);
  const incomePercent = totalIncomeBudgeted > 0 ? (totalIncomeActual / totalIncomeBudgeted) * 100 : 0;

  const totalExpenseBudgeted = expenseBudgets.reduce((s, b) => s + b.budgeted, 0);
  const totalExpenseActual = expenseBudgets.reduce((s, b) => s + b.actual, 0);
  const expenseRemaining = expenseBudgets.reduce((s, b) => s + b.remaining, 0);
  const expensePercent = totalExpenseBudgeted > 0 ? (totalExpenseActual / totalExpenseBudgeted) * 100 : 0;

  const hasIncome = incomeBudgets.length > 0;
  const hasExpenses = expenseBudgets.length > 0;

  if (!hasIncome && !hasExpenses) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground text-sm">
          No budgets set for this period
        </CardContent>
      </Card>
    );
  }

  const netActual = totalIncomeActual - totalExpenseActual;
  const isSurplus = netActual >= 0;

  const overBudgetBudgets = expenseBudgets.filter((b) => b.remaining < 0);
  // Discretionary categories near limit (85% to 100% used). Fixed essential expenses paid on schedule (e.g. Mortgage) are On Track as long as remaining >= 0.
  const nearLimitBudgets = expenseBudgets.filter(
    (b) => b.isDiscretionary !== false && b.percentUsed > 85 && b.percentUsed <= 100 && b.remaining >= 0
  );
  const topExpense = expenseBudgets.slice().sort((a, b) => b.actual - a.actual)[0];

  let healthStatus = {
    label: 'On Track',
    badgeClass: 'bg-constructive/10 text-constructive border-constructive/20',
    icon: ShieldCheck,
  };
  if (totalExpenseActual > totalExpenseBudgeted || overBudgetBudgets.length > 0) {
    healthStatus = {
      label: 'Attention Needed',
      badgeClass: 'bg-destructive/10 text-destructive border-destructive/20',
      icon: AlertTriangle,
    };
  } else if (nearLimitBudgets.length > 0) {
    healthStatus = {
      label: 'Near Limit',
      badgeClass: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
      icon: AlertTriangle,
    };
  }

  let alertHref: string | null = null;
  let alertText: string | null = null;
  let alertClass = '';

  if (overBudgetBudgets.length === 1) {
    alertText = `1 category over budget (${overBudgetBudgets[0].categoryName})`;
    alertHref = `/transactions?categoryId=${overBudgetBudgets[0].categoryId}`;
    alertClass = 'text-destructive bg-destructive/10 border-destructive/20 hover:bg-destructive/15';
  } else if (overBudgetBudgets.length > 1) {
    alertText = `${overBudgetBudgets.length} categories over budget`;
    alertHref = `/transactions?categoryIds=${overBudgetBudgets.map((b) => b.categoryId).join(',')}`;
    alertClass = 'text-destructive bg-destructive/10 border-destructive/20 hover:bg-destructive/15';
  } else if (nearLimitBudgets.length > 0) {
    alertText = `${nearLimitBudgets.length} ${nearLimitBudgets.length === 1 ? 'category' : 'categories'} near budget limit`;
    alertHref = `/transactions?categoryIds=${nearLimitBudgets.map((b) => b.categoryId).join(',')}`;
    alertClass = 'text-amber-500 bg-amber-500/10 border-amber-500/20 hover:bg-amber-500/15';
  }

  const spentAmount = Math.max(0, totalExpenseActual);
  const remainingAmount = Math.max(0, totalExpenseBudgeted - totalExpenseActual);
  const chartData = (spentAmount === 0 && remainingAmount === 0)
    ? [{ name: 'Empty', value: 1, color: 'var(--muted)' }]
    : [
        { name: 'Spent', value: spentAmount, color: expensePercent > 100 ? 'var(--destructive)' : 'var(--primary)' },
        { name: 'Remaining', value: remainingAmount, color: 'var(--muted)' },
      ];

  // Fixed vs Discretionary calculation (Metric 1.2)
  const fixedExpenseBudgets = expenseBudgets.filter((b) => b.isDiscretionary === false);
  const discretionaryExpenseBudgets = expenseBudgets.filter((b) => b.isDiscretionary !== false);
  const fixedBudgeted = fixedExpenseBudgets.reduce((s, b) => s + b.budgeted, 0);
  const discretionaryBudgeted = discretionaryExpenseBudgets.reduce((s, b) => s + b.budgeted, 0);
  const totalExpBud = fixedBudgeted + discretionaryBudgeted;
  const fixedPct = totalExpBud > 0 ? (fixedBudgeted / totalExpBud) * 100 : 0;
  const discretionaryPct = totalExpBud > 0 ? (discretionaryBudgeted / totalExpBud) * 100 : 0;

  // Category Risk / Variance Distribution (Metric 1.3)
  const totalCatCount = expenseBudgets.length;
  const underBudgetCount = expenseBudgets.filter((b) => b.percentUsed <= 85).length;
  const nearLimitCount = expenseBudgets.filter((b) => b.percentUsed > 85 && b.percentUsed <= 100).length;
  const overBudgetCount = expenseBudgets.filter((b) => b.percentUsed > 100).length;

  const underPct = totalCatCount > 0 ? (underBudgetCount / totalCatCount) * 100 : 0;
  const nearPct = totalCatCount > 0 ? (nearLimitCount / totalCatCount) * 100 : 0;
  const overPct = totalCatCount > 0 ? (overBudgetCount / totalCatCount) * 100 : 0;

  return (
    <Card className="@container overflow-hidden border border-border/70 shadow-sm bg-card">
      <CollapsibleCardHeader
        isCollapsed={collapsed}
        onToggle={setCollapsed}
        title={
          <div className="flex items-center gap-2">
            <Wallet className="w-4 h-4 text-primary shrink-0" />
            <span className="font-semibold text-sm">Budget Overview</span>
          </div>
        }
      />
      {!collapsed && (
        <CardContent className="p-4 sm:p-5 space-y-4">
          {/* Header Status & Net Position Row */}
          <div className="flex items-center justify-between pb-3 border-b border-border/40">
            <div className="space-y-0.5">
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Status</span>
              <div className="flex items-center gap-1.5 pt-0.5">
                <span className={cn('px-2 py-0.5 rounded-full text-[11px] font-semibold border flex items-center gap-1', healthStatus.badgeClass)}>
                  <healthStatus.icon className="w-3 h-3" />
                  {healthStatus.label}
                </span>
              </div>
            </div>
            <div className="text-right">
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Net Position</span>
              <p className={cn('text-base font-bold font-mono blur-number', isSurplus ? 'text-constructive' : 'text-destructive')}>
                {isSurplus ? '+' : ''}{formatCurrency(netActual)}
              </p>
            </div>
          </div>

          {/* Donut Chart & Percent Ring Section */}
          {hasExpenses && (
            <div className="flex items-center justify-center relative py-1">
              <div className="w-36 h-36 relative flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={chartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={44}
                      outerRadius={58}
                      startAngle={90}
                      endAngle={-270}
                      dataKey="value"
                      strokeWidth={0}
                    >
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                  <span className="text-xl font-bold font-mono text-foreground leading-none">
                    {expensePercent.toFixed(0)}%
                  </span>
                  <span className="text-[10px] text-muted-foreground font-medium mt-0.5">used</span>
                </div>
              </div>
            </div>
          )}

          {/* Expense & Income Progress Bars */}
          <div className="space-y-3 pt-1">
            {hasExpenses && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-medium">
                  <span className="flex items-center gap-1 text-foreground/90 font-semibold text-[11px]">
                    <TrendingDown className="w-3.5 h-3.5 text-primary" />
                    Expenses
                  </span>
                  <span className="font-mono text-xs text-foreground">
                    <span className="blur-number">{formatCurrency(totalExpenseActual)}</span> / <span className="text-muted-foreground blur-number">{formatCurrency(totalExpenseBudgeted)}</span>
                  </span>
                </div>
                <div className="w-full h-2 bg-muted/80 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      'h-full transition-all duration-500 rounded-full',
                      expensePercent > 100 ? 'bg-destructive' : expensePercent > 85 ? 'bg-amber-500' : 'bg-primary'
                    )}
                    style={{ width: `${Math.min(expensePercent, 100)}%` }}
                  />
                </div>
                <p className={cn('text-[11px] text-right font-mono blur-number', expenseRemaining < 0 ? 'text-destructive font-medium' : 'text-muted-foreground')}>
                  {expenseRemaining >= 0 ? `${formatCurrency(expenseRemaining)} remaining` : `${formatCurrency(Math.abs(expenseRemaining))} over limit`}
                </p>
              </div>
            )}

            {hasIncome && (
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between text-xs font-medium">
                  <span className="flex items-center gap-1 text-primary font-semibold text-[11px]">
                    <TrendingUp className="w-3.5 h-3.5 text-primary" />
                    Income Target
                  </span>
                  <span className="font-mono text-xs text-foreground">
                    <span className="blur-number">{formatCurrency(totalIncomeActual)}</span> / <span className="text-muted-foreground blur-number">{formatCurrency(totalIncomeBudgeted)}</span>
                  </span>
                </div>
                <div className="w-full h-2 bg-muted/80 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-500 rounded-full"
                    style={{ width: `${Math.min(incomePercent, 100)}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Metric 1.2: Fixed vs Discretionary Allocation Card */}
          {hasExpenses && totalExpBud > 0 && (
            <ChartHoverTooltip
              content={
                <>
                  <TooltipHeader>Fixed vs. Discretionary Expenses</TooltipHeader>
                  <TooltipRow label="Fixed (Essential)" value={`${formatCurrency(fixedBudgeted)} (${fixedPct.toFixed(1)}%)`} color="var(--color-chart-1)" />
                  <TooltipRow label="Discretionary" value={`${formatCurrency(discretionaryBudgeted)} (${discretionaryPct.toFixed(1)}%)`} color="var(--color-chart-4)" />
                  <div className="mt-2 border-t border-border/40 pt-1.5 space-y-1 text-[10px] text-muted-foreground">
                    <div>Fixed: Rent, Utilities, Insurance, Debt</div>
                    <div>Discretionary: Dining, Entertainment, Shopping</div>
                  </div>
                </>
              }
            >
              <div className="space-y-2 cursor-help p-3 rounded-xl bg-muted/20 border border-border/50 hover:bg-muted/30 transition-colors">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="text-foreground flex items-center gap-1">
                    <Layers className="w-3.5 h-3.5 text-chart-1" />
                    Fixed vs. Discretionary
                    <HelpCircle className="w-3 h-3 text-muted-foreground/60" />
                  </span>
                  <span className="text-muted-foreground font-mono text-[11px]">
                    {fixedPct.toFixed(0)}% / {discretionaryPct.toFixed(0)}%
                  </span>
                </div>
                <div className="h-2.5 w-full bg-muted/60 rounded-full overflow-hidden flex">
                  <div
                    className="h-full bg-chart-1 transition-all duration-500 rounded-l-full"
                    style={{ width: `${fixedPct}%` }}
                  />
                  <div
                    className="h-full bg-chart-4 transition-all duration-500 rounded-r-full"
                    style={{ width: `${discretionaryPct}%` }}
                  />
                </div>
                <div className="flex justify-between text-[11px] font-mono font-semibold text-muted-foreground">
                  <span>Fixed: {fixedPct.toFixed(0)}%</span>
                  <span>Discretionary: {discretionaryPct.toFixed(0)}%</span>
                </div>
              </div>
            </ChartHoverTooltip>
          )}

          {/* Metric 1.3: Category Risk / Variance Distribution Card */}
          {hasExpenses && totalCatCount > 0 && (
            <ChartHoverTooltip
              content={
                <>
                  <TooltipHeader>Category Budget Risk Breakdown</TooltipHeader>
                  <TooltipRow label="On Track (<=85%)" value={`${underBudgetCount} categories (${underPct.toFixed(0)}%)`} color="var(--color-chart-1)" />
                  <TooltipRow label="Near Limit (85-100%)" value={`${nearLimitCount} categories (${nearPct.toFixed(0)}%)`} color="var(--color-status-warning)" />
                  <TooltipRow label="Over Budget (>100%)" value={`${overBudgetCount} categories (${overPct.toFixed(0)}%)`} color="var(--color-destructive)" />
                </>
              }
            >
              <div className="space-y-2 cursor-help p-3 rounded-xl bg-muted/20 border border-border/50 hover:bg-muted/30 transition-colors">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="text-foreground flex items-center gap-1">
                    <BarChart3 className="w-3.5 h-3.5 text-primary" />
                    Budget Compliance
                    <HelpCircle className="w-3 h-3 text-muted-foreground/60" />
                  </span>
                  <span className="text-muted-foreground font-mono text-[11px]">
                    {totalCatCount} categories
                  </span>
                </div>
                <div className="h-2.5 w-full bg-muted/60 rounded-full overflow-hidden flex">
                  {underPct > 0 && (
                    <div
                      className="h-full bg-emerald-500 transition-all duration-500"
                      style={{ width: `${underPct}%` }}
                    />
                  )}
                  {nearPct > 0 && (
                    <div
                      className="h-full bg-amber-500 transition-all duration-500"
                      style={{ width: `${nearPct}%` }}
                    />
                  )}
                  {overPct > 0 && (
                    <div
                      className="h-full bg-destructive transition-all duration-500"
                      style={{ width: `${overPct}%` }}
                    />
                  )}
                </div>
                <div className="flex justify-between text-[10px] font-mono font-semibold text-muted-foreground">
                  <span className="text-emerald-500">{underBudgetCount} On Track</span>
                  {nearLimitCount > 0 && <span className="text-amber-500">{nearLimitCount} Near</span>}
                  {overBudgetCount > 0 && <span className="text-destructive">{overBudgetCount} Over</span>}
                </div>
              </div>
            </ChartHoverTooltip>
          )}
        </CardContent>
      )}
    </Card>
  );
}
