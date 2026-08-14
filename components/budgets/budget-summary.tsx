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

function getPeriodConfig(periodType: string) {
  if (periodType === 'quarterly') {
    return {
      noun: 'quarter',
      title: 'Quarter',
      adjective: 'quarterly',
      endNoun: 'quarter-end',
      multiplier: 3,
    };
  }
  if (periodType === 'yearly') {
    return {
      noun: 'year',
      title: 'Year',
      adjective: 'yearly',
      endNoun: 'year-end',
      multiplier: 12,
    };
  }
  return {
    noun: 'month',
    title: 'Month',
    adjective: 'monthly',
    endNoun: 'month-end',
    multiplier: 1,
  };
}

function getPeriodPacingInfo(periodType: string, periodKey: string) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const currentDay = now.getDate();

  let daysElapsed = 1;
  let totalDays = 30;
  let isPast = false;
  let isFuture = false;

  if (periodType === 'monthly') {
    const parts = periodKey.split('-').map(Number);
    const y = parts[0] || currentYear;
    const m = parts[1] || currentMonth;
    totalDays = new Date(y, m, 0).getDate();
    if (y < currentYear || (y === currentYear && m < currentMonth)) {
      daysElapsed = totalDays;
      isPast = true;
    } else if (y === currentYear && m === currentMonth) {
      daysElapsed = Math.min(Math.max(currentDay, 1), totalDays);
    } else {
      daysElapsed = 0;
      isFuture = true;
    }
  } else if (periodType === 'quarterly') {
    const parts = periodKey.split('-Q').map(Number);
    const y = parts[0] || currentYear;
    const q = parts[1] || 1;
    const startMonth = (q - 1) * 3 + 1;
    const endMonth = q * 3;
    const startDate = new Date(y, startMonth - 1, 1, 0, 0, 0, 0);
    const endDate = new Date(y, endMonth, 0, 23, 59, 59, 999);

    // Exact days in the 3 months of the quarter
    const m1Days = new Date(y, startMonth, 0).getDate();
    const m2Days = new Date(y, startMonth + 1, 0).getDate();
    const m3Days = new Date(y, startMonth + 2, 0).getDate();
    totalDays = m1Days + m2Days + m3Days;

    if (now < startDate) {
      daysElapsed = 0;
      isFuture = true;
    } else if (now > endDate) {
      daysElapsed = totalDays;
      isPast = true;
    } else {
      const todayStart = new Date(currentYear, now.getMonth(), currentDay);
      daysElapsed = Math.round((todayStart.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      daysElapsed = Math.min(Math.max(daysElapsed, 1), totalDays);
    }
  } else {
    // yearly
    const y = Number(periodKey) || currentYear;
    const isLeapYear = (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0);
    totalDays = isLeapYear ? 366 : 365;
    const startDate = new Date(y, 0, 1, 0, 0, 0, 0);
    const endDate = new Date(y, 11, 31, 23, 59, 59, 999);

    if (now < startDate) {
      daysElapsed = 0;
      isFuture = true;
    } else if (now > endDate) {
      daysElapsed = totalDays;
      isPast = true;
    } else {
      const todayStart = new Date(currentYear, now.getMonth(), currentDay);
      daysElapsed = Math.round((todayStart.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      daysElapsed = Math.min(Math.max(daysElapsed, 1), totalDays);
    }
  }

  const timePercent = totalDays > 0 ? (daysElapsed / totalDays) * 100 : 0;
  return { daysElapsed, totalDays, timePercent, isPast, isFuture };
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

  // Period Config & Pacing
  const periodConfig = getPeriodConfig(periodType);
  const pacingInfo = getPeriodPacingInfo(periodType, periodKey);
  const { daysElapsed, totalDays, timePercent, isPast, isFuture } = pacingInfo;

  // Fixed vs Variable expense splitting for smart pacing
  const fixedExpenseBudgets = expenseBudgets.filter((b) => b.isDiscretionary === false);
  const variableExpenseBudgets = expenseBudgets.filter((b) => b.isDiscretionary !== false);

  const fixedBudgeted = fixedExpenseBudgets.reduce((s, b) => s + b.budgeted, 0);
  const fixedActual = fixedExpenseBudgets.reduce((s, b) => s + b.actual, 0);

  const variableBudgeted = variableExpenseBudgets.reduce((s, b) => s + b.budgeted, 0);
  const variableActual = variableExpenseBudgets.reduce((s, b) => s + b.actual, 0);

  // Variable daily rate & period projection
  const variableDailyRate = daysElapsed > 0 ? variableActual / daysElapsed : 0;
  const projectedVariableTotal = daysElapsed === totalDays
    ? variableActual
    : isFuture
      ? variableBudgeted
      : variableDailyRate * totalDays;

  // Fixed expenses (Rent, Mortgage, Utilities, Insurance, Subscriptions) are committed amounts
  const fixedEffectiveProjection = Math.max(fixedActual, fixedBudgeted);
  const projectedExpenseTotal = fixedEffectiveProjection + projectedVariableTotal;

  const totalExpenseCushion = Math.max(0, totalExpenseBudgeted - totalExpenseActual);
  const projectedSurplusOrDeficit = totalExpenseBudgeted - projectedExpenseTotal;

  // Period-scaled thresholds
  const overBudgetThreshold = 500 * periodConfig.multiplier;
  const toleranceBuffer = 25 * periodConfig.multiplier;

  // Categories over budget
  const allOverBudgets = expenseBudgets.filter((b) => b.remaining < -0.01);
  const significantOverBudgets = expenseBudgets.filter(
    (b) => b.remaining < -0.01 && (b.percentUsed > 200 || Math.abs(b.remaining) > overBudgetThreshold)
  );
  const minorOverBudgets = expenseBudgets.filter(
    (b) => b.remaining < -0.01 && !significantOverBudgets.includes(b)
  );

  const finishLabel = isPast ? 'Final finish' : `Projected ${periodConfig.endNoun} finish`;
  const finishTotal = isPast ? totalExpenseActual : projectedExpenseTotal;
  const surplusOrDeficit = isPast ? (totalExpenseBudgeted - totalExpenseActual) : projectedSurplusOrDeficit;

  const onTrackDescription = minorOverBudgets.length > 0 && totalExpenseCushion > 0
    ? `${minorOverBudgets.length} minor category overrun${minorOverBudgets.length === 1 ? ' is' : 's are'} absorbed by remaining budget cushion. ${finishLabel}: ${formatCurrency(finishTotal)} (${surplusOrDeficit >= 0 ? `+${formatCurrency(surplusOrDeficit)} surplus` : `${formatCurrency(Math.abs(surplusOrDeficit))} deficit`}).`
    : isFuture
      ? `Overall budget is planned and on track for upcoming ${periodConfig.noun}.`
      : `Overall budget is healthy. ${finishLabel}: ${formatCurrency(finishTotal)} (${surplusOrDeficit >= 0 ? `+${formatCurrency(surplusOrDeficit)} surplus` : `${formatCurrency(Math.abs(surplusOrDeficit))} deficit`}).`;

  let healthStatus = {
    label: 'On Track',
    badgeClass: 'bg-constructive/10 text-constructive border-constructive/20',
    icon: ShieldCheck,
    description: onTrackDescription,
  };

  // Rule 1: Critical Overrun (Red)
  if (totalExpenseActual > totalExpenseBudgeted || significantOverBudgets.length > 0) {
    healthStatus = {
      label: 'Critical Overrun',
      badgeClass: 'bg-destructive/10 text-destructive border-destructive/20',
      icon: AlertTriangle,
      description: totalExpenseActual > totalExpenseBudgeted
        ? `Total actual spending (${formatCurrency(totalExpenseActual)}) has exceeded total expense budget (${formatCurrency(totalExpenseBudgeted)}).`
        : `${significantOverBudgets.length} expense ${significantOverBudgets.length === 1 ? 'category is' : 'categories are'} >200% of budget or >${formatCurrency(overBudgetThreshold)} over budget.`,
    };
  }
  // Rule 2: Over Target (Orange)
  else if (!isPast && !isFuture && projectedExpenseTotal > totalExpenseBudgeted + toleranceBuffer) {
    healthStatus = {
      label: 'Over Target',
      badgeClass: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
      icon: TrendingUp,
      description: `Based on daily variable spending pace (${formatCurrency(variableDailyRate)}/day), projected ${periodConfig.endNoun} total (${formatCurrency(projectedExpenseTotal)}) exceeds overall budget target.`,
    };
  }
  // Rule 3: Watch Pacing (Amber)
  else if (!isPast && !isFuture && daysElapsed < totalDays && (variableBudgeted > 0 ? (variableActual / variableBudgeted) * 100 > timePercent + 15 : false)) {
    healthStatus = {
      label: 'Watch Pacing',
      badgeClass: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
      icon: AlertTriangle,
      description: `Discretionary spending is pacing ahead of schedule (${((variableActual / (variableBudgeted || 1)) * 100).toFixed(0)}% spent vs ${timePercent.toFixed(0)}% of ${periodConfig.noun}).`,
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
  } else if (healthStatus.label === 'Over Target') {
    alertText = `Projected to exceed budget by end of ${periodConfig.noun}`;
    alertHref = `/budgets`;
    alertClass = 'text-orange-500 bg-orange-500/10 border-orange-500/20 hover:bg-orange-500/15';
  } else if (healthStatus.label === 'Watch Pacing') {
    alertText = `Discretionary spending is pacing fast`;
    alertHref = `/budgets`;
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
  const discretionaryExpenseBudgets = variableExpenseBudgets;
  const discretionaryBudgeted = variableBudgeted;
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
        <div className="p-4 sm:p-5 divide-y divide-sidebar-border/50">
          {/* Section 1: Header Status & Net Position */}
          <div className="py-4 first:pt-0 last:pb-0 flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</span>
              <div className="flex items-center gap-1.5 pt-0.5">
                <TooltipProvider delayDuration={100}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" className="focus:outline-none select-none text-left">
                        <span className={cn('px-2.5 py-0.5 rounded-full text-[11px] font-bold border flex items-center gap-1 cursor-help transition-all hover:opacity-90 font-mono', healthStatus.badgeClass)}>
                          <healthStatus.icon className="w-3 h-3" />
                          {healthStatus.label}
                        </span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" align="start" className="w-72 sm:w-84 p-3.5 bg-popover/95 backdrop-blur border border-border shadow-xl rounded-xl space-y-2.5 text-xs">
                      <div className="flex items-center justify-between border-b border-border pb-1.5">
                        <span className="font-bold text-foreground flex items-center gap-1.5">
                          <healthStatus.icon className={cn("w-3.5 h-3.5", healthStatus.badgeClass.split(' ')[1])} />
                          Budget Status Analysis
                        </span>
                        <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded border font-mono", healthStatus.badgeClass)}>
                          {healthStatus.label}
                        </span>
                      </div>

                      <p className="text-muted-foreground text-[11px] leading-relaxed">
                        {healthStatus.description}
                      </p>

                      {/* Smart Forecast Card */}
                      <div className="bg-muted/40 p-2 rounded-lg border border-border/50 space-y-1 text-[11px]">
                        <div className="flex justify-between items-center text-muted-foreground">
                          <span>{periodConfig.title} Pacing:</span>
                          <span className="font-medium text-foreground">
                            {isFuture
                              ? `Upcoming (0 of ${totalDays} days)`
                              : `Day ${daysElapsed} of ${totalDays} (${timePercent.toFixed(0)}% elapsed)`}
                          </span>
                        </div>
                        <div className="flex justify-between items-center text-muted-foreground">
                          <span>Fixed Expenses (Essential):</span>
                          <span className="font-mono text-foreground">{formatCurrency(fixedActual)} paid</span>
                        </div>
                        <div className="flex justify-between items-center text-muted-foreground">
                          <span>Variable Pace:</span>
                          <span className="font-mono text-foreground">{formatCurrency(variableDailyRate)}/day</span>
                        </div>
                        <div className="flex justify-between items-center pt-1 border-t border-border/40 font-semibold">
                          <span className="text-foreground">{isPast ? 'Final Result:' : `Projected ${periodConfig.title} Finish:`}</span>
                          <span className={cn("font-mono", surplusOrDeficit >= 0 ? "text-constructive" : "text-destructive")}>
                            {formatCurrency(finishTotal)} ({surplusOrDeficit >= 0 ? `+${formatCurrency(surplusOrDeficit)}` : `-${formatCurrency(Math.abs(surplusOrDeficit))}`})
                          </span>
                        </div>
                      </div>

                      <div className="flex justify-between items-center text-[11px] font-mono pt-0.5">
                        <span className="text-muted-foreground">Remaining Budget Cushion:</span>
                        <span className="font-bold text-constructive">{formatCurrency(totalExpenseCushion)}</span>
                      </div>

                      {minorOverBudgets.length > 0 && (
                        <div className="pt-1 space-y-1 text-[11px]">
                          <span className="font-semibold text-amber-500 block">Absorbed Minor Overruns:</span>
                          <div className="max-h-20 overflow-y-auto space-y-1 pl-2 border-l-2 border-amber-500/40">
                            {minorOverBudgets.map((b) => (
                              <div key={b.id} className="flex justify-between text-[10px]">
                                <span className="truncate max-w-[170px] text-foreground font-medium">{b.categoryName}</span>
                                <span className="font-mono text-amber-500 font-semibold">+{formatCurrency(Math.abs(b.remaining))}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {significantOverBudgets.length > 0 && (
                        <div className="pt-1 space-y-1 text-[11px]">
                          <span className="font-semibold text-destructive block">Major Overruns (&gt;200% or &gt;{formatCurrency(overBudgetThreshold)}):</span>
                          <div className="max-h-20 overflow-y-auto space-y-1 pl-2 border-l-2 border-destructive/40">
                            {significantOverBudgets.map((b) => (
                              <div key={b.id} className="flex justify-between text-[10px]">
                                <span className="truncate max-w-[170px] text-foreground font-medium">{b.categoryName}</span>
                                <span className="font-mono text-destructive font-semibold">+{formatCurrency(Math.abs(b.remaining))}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>
            <div className="text-right">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Net Position</span>
              <p className={cn('text-lg font-bold font-mono blur-number', isSurplus ? 'text-constructive' : 'text-destructive')}>
                {isSurplus ? '+' : ''}{formatCurrency(netActual)}
              </p>
            </div>
          </div>

          {/* Section 2: Donut Chart & Progress Section */}
          <div className="py-4 first:pt-0 last:pb-0 space-y-4">
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
                    <span className="text-2xl font-extrabold font-mono text-foreground leading-none blur-number">
                      {expensePercent.toFixed(0)}%
                    </span>
                    <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mt-1">used</span>
                  </div>
                </div>
              </div>
            )}

            {/* Expense & Income Progress Bars */}
            <div className="space-y-3">
              {hasExpenses && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span className="flex items-center gap-1 text-foreground font-semibold">
                      <TrendingDown className="w-3.5 h-3.5 text-primary shrink-0" />
                      Expenses
                    </span>
                    <span className="font-mono text-xs text-foreground">
                      <span className="blur-number font-bold">{formatCurrency(totalExpenseActual)}</span> / <span className="text-muted-foreground blur-number">{formatCurrency(totalExpenseBudgeted)}</span>
                    </span>
                  </div>
                  <div className="w-full h-2 bg-muted/50 rounded-full overflow-hidden">
                    <div
                      className={cn(
                        'h-full transition-all duration-500 rounded-full',
                        expensePercent > 100 ? 'bg-destructive' : expensePercent > 85 ? 'bg-amber-500' : 'bg-primary'
                      )}
                      style={{ width: `${Math.min(expensePercent, 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-end">
                    <span className={cn('text-[11px] font-mono blur-number font-medium', expenseRemaining < 0 ? 'text-destructive' : 'text-muted-foreground')}>
                      {expenseRemaining >= 0 ? `${formatCurrency(expenseRemaining)} remaining` : `${formatCurrency(Math.abs(expenseRemaining))} over limit`}
                    </span>
                  </div>
                </div>
              )}

              {hasIncome && (
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span className="flex items-center gap-1 text-foreground font-semibold">
                      <TrendingUp className="w-3.5 h-3.5 text-chart-1 shrink-0" />
                      Income Target
                    </span>
                    <span className="font-mono text-xs text-foreground">
                      <span className="blur-number font-bold">{formatCurrency(totalIncomeActual)}</span> / <span className="text-muted-foreground blur-number">{formatCurrency(totalIncomeBudgeted)}</span>
                    </span>
                  </div>
                  <div className="w-full h-2 bg-muted/50 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-chart-1 transition-all duration-500 rounded-full"
                      style={{ width: `${Math.min(incomePercent, 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Section 3: Fixed vs Discretionary Allocation */}
          {hasExpenses && totalExpBud > 0 && (
            <div className="py-4 first:pt-0 last:pb-0">
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
                      <Layers className="w-3.5 h-3.5 text-chart-1 shrink-0" />
                      Fixed vs. Discretionary
                      <HelpCircle className="w-3 h-3 text-muted-foreground/50 hover:text-muted-foreground transition-colors shrink-0" />
                    </span>
                    <span className="text-muted-foreground font-mono text-[11px]">
                      {fixedPct.toFixed(0)}% / {discretionaryPct.toFixed(0)}%
                    </span>
                  </div>
                  <div className="h-2.5 w-full bg-muted/50 rounded-full overflow-hidden flex">
                    <div
                      className="h-full bg-chart-1 transition-all duration-500 rounded-l-full"
                      style={{ width: `${fixedPct}%` }}
                    />
                    <div
                      className="h-full bg-chart-4 transition-all duration-500 rounded-r-full"
                      style={{ width: `${discretionaryPct}%` }}
                    />
                  </div>
                </div>
              </ChartHoverTooltip>
            </div>
          )}

          {/* Section 4: Category Risk / Variance Distribution */}
          {hasExpenses && totalCatCount > 0 && (
            <div className="py-4 first:pt-0 last:pb-0">
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
                      <BarChart3 className="w-3.5 h-3.5 text-primary shrink-0" />
                      Budget Compliance
                      <HelpCircle className="w-3 h-3 text-muted-foreground/50 hover:text-muted-foreground transition-colors shrink-0" />
                    </span>
                    <span className="text-muted-foreground font-mono text-[11px]">
                      {totalCatCount} categories
                    </span>
                  </div>
                  <div className="h-2.5 w-full bg-muted/50 rounded-full overflow-hidden flex">
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
                  <div className="flex justify-between text-[11px] font-mono font-medium text-muted-foreground">
                    <span className="text-emerald-500 font-semibold">{underBudgetCount} On Track</span>
                    {nearLimitCount > 0 && <span className="text-amber-500 font-semibold">{nearLimitCount} Near</span>}
                    {overBudgetCount > 0 && <span className="text-destructive font-semibold">{overBudgetCount} Over</span>}
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
