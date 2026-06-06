'use client';

import { useState, useEffect, useMemo } from 'react';
import { useBudgetPeriod } from './budget-period-selector';
import { formatCurrency } from '@/lib/utils/format';
import { useShowMath } from '@/lib/hooks/use-show-math';
import { buildBudgetTrace } from '@/lib/services/trace-engine';
import { CalculationTraceOverlay } from '@/components/financial-logic/calculation-trace';
import { useCardCollapsed } from '@/lib/hooks/use-card-collapsed';
import { CollapsibleCardHeader } from '@/components/ui/collapsible-card-header';
import { Card, CardContent } from '@/components/ui/card';
import { Wallet } from 'lucide-react';
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

function MetricRow({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-xs sm:text-sm text-muted-foreground">{label}</span>
      <span className={cn('text-sm sm:text-base font-semibold font-mono blur-number', valueClass || 'text-foreground')}>
        {value}
      </span>
    </div>
  );
}

export function BudgetSummary() {
  const { periodType, periodKey } = useBudgetPeriod();
  const { enabled: showMath } = useShowMath();
  const [budgets, setBudgets] = useState<BudgetData[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useCardCollapsed('budgetSummary');

  useEffect(() => {
    setLoading(true);
    fetch(`/api/budgets?periodType=${periodType}&periodKey=${periodKey}`, { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => setBudgets(data.budgets ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [periodType, periodKey]);

  if (loading) {
    return (
      <Card className="animate-pulse">
        <CardContent className="p-5">
          <div className="h-4 bg-muted rounded w-36 mb-6" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {[1, 2].map((side) => (
              <div key={side} className="space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex justify-between">
                    <div className="h-3 bg-muted rounded w-14" />
                    <div className="h-3 bg-muted rounded w-20" />
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="border-t border-border/50 mt-4 pt-4 flex justify-between">
            <div className="h-3 bg-muted rounded w-24" />
            <div className="h-3 bg-muted rounded w-28" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const incomeBudgets = budgets.filter((b) => b.type === 'income');
  const expenseBudgets = budgets.filter((b) => b.type === 'expense');

  const totalIncomeBudgeted = incomeBudgets.reduce((s, b) => s + b.budgeted, 0);
  const totalIncomeActual = incomeBudgets.reduce((s, b) => s + b.actual, 0);
  const incomeRemaining = incomeBudgets.reduce((s, b) => s + b.remaining, 0);
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
      <Card>
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
          <CardContent>
            <div
              className={cn(
                'grid divide-y divide-border',
                hasIncome && hasExpenses
                  ? 'grid-cols-1 lg:grid-cols-2 lg:divide-y-0 lg:divide-x'
                  : 'grid-cols-1'
              )}
            >
              {hasIncome && (
                <div className={cn('pb-4 lg:pb-0', hasExpenses && 'lg:pr-6')}>
                  <p className="text-xs font-semibold text-chart-2 uppercase tracking-wider mb-3">Income</p>
                  <div className="space-y-2">
                    <MetricRow label="Budgeted" value={formatCurrency(totalIncomeBudgeted)} />
                    <MetricRow label="Actual" value={formatCurrency(totalIncomeActual)} />
                    <MetricRow
                      label="Variance"
                      value={`${incomeRemaining >= 0 ? '+' : ''}${formatCurrency(incomeRemaining)}`}
                      valueClass={incomeRemaining >= 0 ? 'text-chart-2' : 'text-destructive'}
                    />
                    <MetricRow
                      label="% Achieved"
                      value={`${incomePercent.toFixed(1)}%`}
                      valueClass={incomePercent >= 100 ? 'text-chart-2' : 'text-chart-3'}
                    />
                  </div>
                </div>
              )}

              {hasExpenses && (
                <div className={cn('pt-4 lg:pt-0', hasIncome && 'lg:pl-6')}>
                  <p className="text-xs font-semibold text-destructive uppercase tracking-wider mb-3">Expenses</p>
                  <div className="space-y-2">
                    <MetricRow label="Budgeted" value={formatCurrency(totalExpenseBudgeted)} />
                    <MetricRow label="Actual" value={formatCurrency(totalExpenseActual)} />
                    <MetricRow
                      label="Remaining"
                      value={formatCurrency(expenseRemaining)}
                      valueClass={expenseRemaining >= 0 ? 'text-chart-2' : 'text-destructive'}
                    />
                    <MetricRow
                      label="% Used"
                      value={`${expensePercent.toFixed(1)}%`}
                      valueClass={expensePercent > 100 ? 'text-destructive' : 'text-chart-1'}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Net Position */}
            <div className="border-t border-border mt-4 pt-4 flex items-center justify-between">
              <span className="text-xs sm:text-sm font-medium text-foreground">Net Position</span>
              <span
                className={cn(
                  'text-sm sm:text-base font-bold blur-number',
                  isSurplus ? 'text-chart-2' : 'text-destructive'
                )}
              >
                {isSurplus ? '+' : ''}{formatCurrency(netActual)} {isSurplus ? 'surplus' : 'deficit'}
              </span>
            </div>
          </CardContent>
        )}
      </Card>

      {showMath && (
        <>
          {hasIncome && (
            <CalculationTraceOverlay
              trace={buildBudgetTrace({
                totalBudgeted: totalIncomeBudgeted,
                totalActual: totalIncomeActual,
                remaining: incomeRemaining,
                percentUsed: incomePercent,
                type: 'income',
              })}
            />
          )}
          {hasExpenses && (
            <CalculationTraceOverlay
              trace={buildBudgetTrace({
                totalBudgeted: totalExpenseBudgeted,
                totalActual: totalExpenseActual,
                remaining: expenseRemaining,
                percentUsed: expensePercent,
                type: 'expense',
              })}
            />
          )}
        </>
      )}
    </div>
  );
}
