'use client';

import { useState, useEffect } from 'react';
import { useBudgetPeriod } from './budget-period-selector';
import { formatCurrency } from '@/lib/utils/format';
import { DollarSign, ShoppingCart, PiggyBank, TrendingDown, TrendingUp, BadgeDollarSign } from 'lucide-react';

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
  const [budgets, setBudgets] = useState<BudgetData[]>([]);
  const [loading, setLoading] = useState(true);

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
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-card border border-border rounded-xl p-4 animate-pulse">
              <div className="h-3 w-16 bg-muted rounded mb-3" />
              <div className="h-6 w-20 bg-muted rounded" />
            </div>
          ))}
        </div>
      </div>
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

  return (
    <div className="space-y-4">
      {incomeBudgets.length > 0 && (
        <>
          <p className="text-xs font-semibold text-chart-2 uppercase tracking-wider">Income</p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="w-4 h-4 text-chart-2" />
                <span className="text-xs text-muted-foreground">Budgeted Income</span>
              </div>
              <div className="font-mono text-lg font-bold text-foreground blur-number">{formatCurrency(totalIncomeBudgeted)}</div>
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4 text-chart-2" />
                <span className="text-xs text-muted-foreground">Actual Income</span>
              </div>
              <div className="font-mono text-lg font-bold text-foreground blur-number">{formatCurrency(totalIncomeActual)}</div>
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <BadgeDollarSign className={`w-4 h-4 ${incomeRemaining >= 0 ? 'text-chart-2' : 'text-destructive'}`} />
                <span className="text-xs text-muted-foreground">Variance</span>
              </div>
              <div className={`font-mono text-lg font-bold blur-number ${incomeRemaining >= 0 ? 'text-chart-2' : 'text-destructive'}`}>
                {incomeRemaining >= 0 ? '+' : ''}{formatCurrency(incomeRemaining)}
              </div>
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <TrendingDown className={`w-4 h-4 ${incomePercent >= 100 ? 'text-chart-2' : 'text-chart-3'}`} />
                <span className="text-xs text-muted-foreground">% Achieved</span>
              </div>
              <div className={`font-mono text-lg font-bold blur-number ${incomePercent >= 100 ? 'text-chart-2' : 'text-chart-3'}`}>
                {incomePercent.toFixed(1)}%
              </div>
            </div>
          </div>
        </>
      )}

      {expenseBudgets.length > 0 && (
        <>
          <p className="text-xs font-semibold text-destructive uppercase tracking-wider mt-2">Expenses</p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="w-4 h-4 text-chart-1" />
                <span className="text-xs text-muted-foreground">Budgeted Spending</span>
              </div>
              <div className="font-mono text-lg font-bold text-foreground blur-number">{formatCurrency(totalExpenseBudgeted)}</div>
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <ShoppingCart className="w-4 h-4 text-chart-3" />
                <span className="text-xs text-muted-foreground">Actual Spent</span>
              </div>
              <div className="font-mono text-lg font-bold text-foreground blur-number">{formatCurrency(totalExpenseActual)}</div>
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <PiggyBank className={`w-4 h-4 ${expenseRemaining >= 0 ? 'text-chart-2' : 'text-destructive'}`} />
                <span className="text-xs text-muted-foreground">Remaining</span>
              </div>
              <div className={`font-mono text-lg font-bold blur-number ${expenseRemaining >= 0 ? 'text-chart-2' : 'text-destructive'}`}>
                {formatCurrency(expenseRemaining)}
              </div>
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <TrendingDown className={`w-4 h-4 ${expensePercent > 100 ? 'text-destructive' : 'text-chart-1'}`} />
                <span className="text-xs text-muted-foreground">Budget Used</span>
              </div>
              <div className={`font-mono text-lg font-bold blur-number ${expensePercent > 100 ? 'text-destructive' : 'text-chart-1'}`}>
                {expensePercent.toFixed(1)}%
              </div>
            </div>
          </div>
        </>
      )}

      {budgets.length === 0 && (
        <div className="bg-card border border-border rounded-xl p-6 text-center text-muted-foreground text-sm">
          No budgets set for this period
        </div>
      )}
    </div>
  );
}