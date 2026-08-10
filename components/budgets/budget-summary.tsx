'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useBudgetPeriod } from './budget-period-selector';
import { formatCurrency } from '@/lib/utils/format';
import { useCardCollapsed } from '@/lib/hooks/use-card-collapsed';
import { CollapsibleCardHeader } from '@/components/ui/collapsible-card-header';
import { Card, CardContent } from '@/components/ui/card';
import { Wallet, TrendingUp, TrendingDown, AlertTriangle, ShieldCheck, Sparkles, ChevronRight, Layers, BarChart3, HelpCircle, Target } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { ChartHoverTooltip } from '@/components/charts/chart-hover-tooltip';
import { TooltipRow, TooltipHeader } from '@/components/charts/chart-tooltip';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';

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
      <Card className="animate-pulse bg-sidebar border border-sidebar-border rounded-2xl">
        <CardContent className="p-5 space-y-4">
          <div className="h-5 bg-muted/60 rounded w-36 mb-2" />
          <div className="h-32 bg-card rounded-xl" />
          <div className="h-20 bg-card rounded-xl" />
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

  // Categories over budget
  const allOverBudgets = expenseBudgets.filter((b) => b.remaining < -0.01);
  // Significant over-budget categories: >25% over budget OR over by > $100
  const significantOverBudgets = expenseBudgets.filter(
    (b) => b.remaining < -0.01 && (b.percentUsed > 125 || Math.abs(b.remaining) > 100)
  );
  // Minor over-budget categories (under 25% AND under $100)
  const minorOverBudgets = expenseBudgets.filter(
    (b) => b.remaining < -0.01 && !significantOverBudgets.includes(b)
  );

  // Categories right at budget target (98% to 105% used or minor overrun)
  const atBudgetCategoryItems = expenseBudgets.filter(
    (b) => minorOverBudgets.includes(b) || (b.percentUsed >= 98 && b.percentUsed <= 105)
  );

  // Categories near budget (85% to 98% used)
  const nearBudgetCategoryItems = expenseBudgets.filter(
    (b) => b.isDiscretionary !== false && b.percentUsed >= 85 && b.percentUsed < 98
  );

  const totalExpenseOver = totalExpenseBudgeted > 0 && (
    totalExpenseActual > totalExpenseBudgeted * 1.25 || totalExpenseActual > totalExpenseBudgeted + 100
  );
  const totalExpenseAtBudget = totalExpenseBudgeted > 0 && expensePercent >= 98 && expensePercent <= 105;
  const totalExpenseNearBudget = totalExpenseBudgeted > 0 && expensePercent >= 85 && expensePercent < 98;

  let healthStatus = {
    label: 'On Track',
    badgeClass: 'bg-constructive/10 text-constructive border-constructive/20',
    icon: ShieldCheck,
    description: 'Overall spending and categories are performing well within budget limits.',
  };

  if (totalExpenseOver || significantOverBudgets.length > 0) {
    healthStatus = {
      label: 'Attention Needed',
      badgeClass: 'bg-destructive/10 text-destructive border-destructive/20',
      icon: AlertTriangle,
      description: totalExpenseOver
        ? `Total spending (${formatCurrency(totalExpenseActual)}) exceeds budget by >25% or >$100.`
        : `${significantOverBudgets.length} expense ${significantOverBudgets.length === 1 ? 'category is' : 'categories are'} >25% or >$100 over budget.`,
    };
  } else if (totalExpenseAtBudget || atBudgetCategoryItems.length > 0) {
    const reasonText = minorOverBudgets.length > 0
      ? `${minorOverBudgets.length} category with a minor overrun (within 25% / $100 buffer).`
      : `${atBudgetCategoryItems.length} category is right at budget target (98%–105%).`;
    healthStatus = {
      label: 'At Budget',
      badgeClass: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
      icon: Target,
      description: reasonText,
    };
  } else if (totalExpenseNearBudget || nearBudgetCategoryItems.length > 0) {
    healthStatus = {
      label: 'Near Budget',
      badgeClass: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
      icon: AlertTriangle,
      description: `${nearBudgetCategoryItems.length} discretionary ${nearBudgetCategoryItems.length === 1 ? 'category is' : 'categories are'} approaching budget (85%–98%).`,
    };
  }

  let alertHref: string | null = null;
  let alertText: string | null = null;
  let alertClass = '';

  if (significantOverBudgets.length === 1) {
    alertText = `1 category over budget (${significantOverBudgets[0].categoryName})`;
    alertHref = `/transactions?categoryId=${significantOverBudgets[0].categoryId}`;
    alertClass = 'text-destructive bg-destructive/10 border-destructive/20 hover:bg-destructive/15';
  } else if (significantOverBudgets.length > 1) {
    alertText = `${significantOverBudgets.length} categories over budget`;
    alertHref = `/transactions?categoryIds=${significantOverBudgets.map((b) => b.categoryId).join(',')}`;
    alertClass = 'text-destructive bg-destructive/10 border-destructive/20 hover:bg-destructive/15';
  } else if (atBudgetCategoryItems.length > 0) {
    alertText = `${atBudgetCategoryItems.length} ${atBudgetCategoryItems.length === 1 ? 'category' : 'categories'} at budget target`;
    alertHref = `/transactions?categoryIds=${atBudgetCategoryItems.map((b) => b.categoryId).join(',')}`;
    alertClass = 'text-blue-500 bg-blue-500/10 border-blue-500/20 hover:bg-blue-500/15';
  } else if (nearBudgetCategoryItems.length > 0) {
    alertText = `${nearBudgetCategoryItems.length} ${nearBudgetCategoryItems.length === 1 ? 'category' : 'categories'} near budget`;
    alertHref = `/transactions?categoryIds=${nearBudgetCategoryItems.map((b) => b.categoryId).join(',')}`;
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
    <div className="bg-sidebar border border-sidebar-border rounded-2xl shadow-sm overflow-hidden text-sidebar-foreground">
      <CollapsibleCardHeader
        isCollapsed={collapsed}
        onToggle={setCollapsed}
        collapseDirection="horizontal"
        title={
          <div className="flex items-center gap-2">
            <Wallet className="w-4 h-4 text-primary shrink-0" />
            <span className="font-bold text-foreground">Overview</span>
          </div>
        }
        className="border-b border-sidebar-border/60 bg-sidebar"
      />
      {!collapsed && (
        <div className="p-4 sm:p-5 space-y-4 divide-y divide-sidebar-border/50">
          {/* Section 1: Header Status & Net Position */}
          <div className="flex items-center justify-between pb-3">
            <div className="space-y-0.5">
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Status</span>
              <div className="flex items-center gap-1.5 pt-0.5">
                <TooltipProvider delayDuration={100}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" className="focus:outline-none select-none text-left">
                        <span className={cn('px-2.5 py-0.5 rounded-full text-[11px] font-semibold border flex items-center gap-1 cursor-help transition-all hover:opacity-90', healthStatus.badgeClass)}>
                          <healthStatus.icon className="w-3 h-3" />
                          {healthStatus.label}
                        </span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" align="start" className="w-72 sm:w-80 p-3 bg-popover/95 backdrop-blur border border-border shadow-xl rounded-xl space-y-2 text-xs">
                      <div className="flex items-center justify-between border-b border-border pb-1.5">
                        <span className="font-bold text-foreground flex items-center gap-1.5">
                          <healthStatus.icon className={cn("w-3.5 h-3.5", healthStatus.badgeClass.split(' ')[1])} />
                          Budget Status Criteria
                        </span>
                        <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded border", healthStatus.badgeClass)}>
                          {healthStatus.label}
                        </span>
                      </div>

                      <p className="text-muted-foreground text-[11px]">
                        {healthStatus.description}
                      </p>

                      <div className="space-y-1.5 pt-1.5 border-t border-border/50 text-[11px]">
                        <div className="flex justify-between font-mono">
                          <span className="text-muted-foreground">Total Expense Budget:</span>
                          <span className="font-semibold text-foreground">{formatCurrency(totalExpenseBudgeted)}</span>
                        </div>
                        <div className="flex justify-between font-mono">
                          <span className="text-muted-foreground">Total Actual Spent:</span>
                          <span className={cn("font-semibold", totalExpenseActual > totalExpenseBudgeted ? "text-destructive" : "text-foreground")}>
                            {formatCurrency(totalExpenseActual)} ({expensePercent.toFixed(0)}%)
                          </span>
                        </div>

                        {significantOverBudgets.length > 0 && (
                          <div className="pt-1 space-y-1">
                            <span className="font-semibold text-destructive block">Major Overruns (&gt;25% or &gt;$100):</span>
                            <div className="max-h-24 overflow-y-auto space-y-1 pl-2 border-l-2 border-destructive/40">
                              {significantOverBudgets.map((b) => (
                                <div key={b.id} className="flex justify-between text-[10px]">
                                  <span className="truncate max-w-[170px] text-foreground font-medium">{b.categoryName}</span>
                                  <span className="font-mono text-destructive font-semibold">+{formatCurrency(Math.abs(b.remaining))}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {atBudgetCategoryItems.length > 0 && (
                          <div className="pt-1 space-y-1">
                            <span className="font-semibold text-blue-500 block">At Budget (98%-105%):</span>
                            <div className="max-h-24 overflow-y-auto space-y-1 pl-2 border-l-2 border-blue-500/40">
                              {atBudgetCategoryItems.map((b) => (
                                <div key={b.id} className="flex justify-between text-[10px]">
                                  <span className="truncate max-w-[170px] text-foreground font-medium">{b.categoryName}</span>
                                  <span className="font-mono text-blue-500 font-semibold">{b.remaining < 0 ? `+${formatCurrency(Math.abs(b.remaining))}` : `${b.percentUsed.toFixed(0)}%`}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {nearBudgetCategoryItems.length > 0 && (
                          <div className="pt-1 space-y-1">
                            <span className="font-semibold text-amber-500 block">Near Budget (85%-98%):</span>
                            <div className="max-h-24 overflow-y-auto space-y-1 pl-2 border-l-2 border-amber-500/40">
                              {nearBudgetCategoryItems.map((b) => (
                                <div key={b.id} className="flex justify-between text-[10px]">
                                  <span className="truncate max-w-[170px] text-foreground font-medium">{b.categoryName}</span>
                                  <span className="font-mono text-amber-500 font-semibold">{b.percentUsed.toFixed(0)}% used</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {allOverBudgets.length === 0 && nearBudgetCategoryItems.length === 0 && atBudgetCategoryItems.length === 0 && (
                          <div className="text-[10px] text-constructive font-medium italic pt-0.5">
                            ✓ All categories are performing comfortably within budget limits.
                          </div>
                        )}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>
            <div className="text-right">
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Net Position</span>
              <p className={cn('text-base font-bold font-mono blur-number', isSurplus ? 'text-constructive' : 'text-destructive')}>
                {isSurplus ? '+' : ''}{formatCurrency(netActual)}
              </p>
            </div>
          </div>

          {/* Section 2: Donut Chart & Progress Section */}
          <div className="pt-4 space-y-4">
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
            <div className="space-y-3">
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
          </div>

          {/* Section 3: Fixed vs Discretionary Allocation */}
          {hasExpenses && totalExpBud > 0 && (
            <div className="pt-4">
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
                <div className="space-y-2 cursor-help">
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
            </div>
          )}

          {/* Section 4: Category Risk / Variance Distribution */}
          {hasExpenses && totalCatCount > 0 && (
            <div className="pt-4">
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
                <div className="space-y-2 cursor-help">
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
            </div>
          )}
        </div>
      )}
    </div>
  );
}
