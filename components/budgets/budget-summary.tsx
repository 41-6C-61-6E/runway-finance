'use client';

import { useQuery } from '@tanstack/react-query';
import { useBudgetPeriod } from './budget-period-selector';
import { formatCurrency } from '@/lib/utils/format';
import { useCardCollapsed } from '@/lib/hooks/use-card-collapsed';
import { CollapsibleCardHeader } from '@/components/ui/collapsible-card-header';
import { Card, CardContent } from '@/components/ui/card';
import { Wallet, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BudgetData {
  id: string;
  categoryId: string;
  categoryName: string;
  budgeted: number;
  actual: number;
  remaining: number;
  percentUsed: number;
  type: 'income' | 'expense';
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
        <CardContent className="p-6 space-y-4">
          <div className="h-5 bg-muted rounded w-40 mb-4" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-28 bg-muted/60 rounded-xl" />
            ))}
          </div>
          <div className="h-48 bg-muted/40 rounded-xl" />
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

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden border border-border/60 shadow-sm">
        <CollapsibleCardHeader
          isCollapsed={collapsed}
          onToggle={setCollapsed}
          title={
            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4 text-primary shrink-0" />
              <span>Budget Overview</span>
            </div>
          }
        />
        {!collapsed && (
          <CardContent className="p-4 sm:p-6 space-y-6">
            {/* ── Summary Visual Cards Row ── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Income Meter */}
              {hasIncome && (
                <div className="p-4 rounded-xl bg-muted/30 border border-border/40 space-y-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
                    <span className="flex items-center gap-1.5 text-chart-2 font-semibold uppercase tracking-wider text-[11px]">
                      <TrendingUp className="w-3.5 h-3.5" /> Income Target
                    </span>
                    <span className="font-semibold text-foreground">{incomePercent.toFixed(1)}%</span>
                  </div>

                  <div className="flex items-baseline justify-between">
                    <span className="text-xl font-bold font-mono blur-number text-foreground">
                      {formatCurrency(totalIncomeActual)}
                    </span>
                    <span className="text-xs text-muted-foreground font-mono blur-number">
                      Target: {formatCurrency(totalIncomeBudgeted)}
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-chart-2 transition-all duration-500 rounded-full"
                      style={{ width: `${Math.min(incomePercent, 100)}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Expense Meter */}
              {hasExpenses && (
                <div className="p-4 rounded-xl bg-muted/30 border border-border/40 space-y-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
                    <span className={cn(
                      "flex items-center gap-1.5 font-semibold uppercase tracking-wider text-[11px]",
                      expensePercent > 100 ? "text-chart-5" : expensePercent > 85 ? "text-chart-3" : "text-chart-1"
                    )}>
                      {expensePercent > 100 ? <AlertTriangle className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                      Expense Budget
                    </span>
                    <span className={cn(
                      "font-semibold",
                      expensePercent > 100 ? "text-chart-5" : expensePercent > 85 ? "text-chart-3" : "text-foreground"
                    )}>
                      {expensePercent.toFixed(1)}%
                    </span>
                  </div>

                  <div className="flex items-baseline justify-between">
                    <span className="text-xl font-bold font-mono blur-number text-foreground">
                      {formatCurrency(totalExpenseActual)}
                    </span>
                    <span className="text-xs text-muted-foreground font-mono blur-number">
                      Limit: {formatCurrency(totalExpenseBudgeted)}
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full transition-all duration-500 rounded-full",
                        expensePercent > 100 ? "bg-chart-5" : expensePercent > 85 ? "bg-chart-3" : "bg-chart-1"
                      )}
                      style={{ width: `${Math.min(expensePercent, 100)}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground text-right font-mono blur-number pt-0.5">
                    {expenseRemaining >= 0 ? `${formatCurrency(expenseRemaining)} remaining` : `${formatCurrency(Math.abs(expenseRemaining))} over budget`}
                  </p>
                </div>
              )}

              {/* Net Surplus / Deficit Meter */}
              <div className="p-4 rounded-xl bg-muted/30 border border-border/40 space-y-2 md:col-span-1">
                <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
                  <span className="flex items-center gap-1.5 uppercase tracking-wider text-[11px] text-foreground font-semibold">
                    <CheckCircle2 className={cn("w-3.5 h-3.5", isSurplus ? "text-chart-2" : "text-chart-5")} />
                    Net Position
                  </span>
                  <span className={cn(
                    "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase",
                    isSurplus ? "bg-chart-2/15 text-chart-2" : "bg-chart-5/15 text-chart-5"
                  )}>
                    {isSurplus ? 'Surplus' : 'Deficit'}
                  </span>
                </div>

                <div className="flex items-baseline justify-between pt-1">
                  <span className={cn(
                    "text-xl font-bold font-mono blur-number",
                    isSurplus ? "text-chart-2" : "text-chart-5"
                  )}>
                    {isSurplus ? '+' : ''}{formatCurrency(netActual)}
                  </span>
                </div>

                <p className="text-xs text-muted-foreground pt-2 border-t border-border/30">
                  {isSurplus
                    ? 'Income exceeds total actual spending for this period.'
                    : 'Spending exceeds total actual income earned.'}
                </p>
              </div>
            </div>


          </CardContent>
        )}
      </Card>
    </div>
  );
}
