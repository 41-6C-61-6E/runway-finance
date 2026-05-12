'use client';

import { useState, useEffect } from 'react';
import { useBudgetPeriod } from './budget-period-selector';
import { formatCurrency } from '@/lib/utils/format';
import { DollarSign, ShoppingCart, PiggyBank, TrendingDown } from 'lucide-react';

interface BudgetData {
  id: string;
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  budgeted: number;
  actual: number;
  remaining: number;
  percentUsed: number;
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-card border border-border rounded-xl p-4 animate-pulse">
            <div className="h-3 w-16 bg-muted rounded mb-3" />
            <div className="h-6 w-20 bg-muted rounded" />
          </div>
        ))}
      </div>
    );
  }

  const totalBudgeted = budgets.reduce((s, b) => s + b.budgeted, 0);
  const totalActual = budgets.reduce((s, b) => s + b.actual, 0);
  const totalRemaining = budgets.reduce((s, b) => s + b.remaining, 0);
  const overallPercent = totalBudgeted > 0 ? (totalActual / totalBudgeted) * 100 : 0;

  const cards = [
    { label: 'Total Budgeted', value: formatCurrency(totalBudgeted), icon: DollarSign, color: 'text-chart-1' },
    { label: 'Total Spent', value: formatCurrency(totalActual), icon: ShoppingCart, color: 'text-chart-3' },
    { label: 'Remaining', value: formatCurrency(totalRemaining), icon: PiggyBank, color: totalRemaining >= 0 ? 'text-chart-2' : 'text-destructive' },
    { label: 'Budget Used', value: `${overallPercent.toFixed(1)}%`, icon: TrendingDown, color: overallPercent > 100 ? 'text-destructive' : 'text-chart-1' },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div key={card.label} className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <Icon className={`w-4 h-4 ${card.color}`} />
              <span className="text-xs text-muted-foreground">{card.label}</span>
            </div>
            <div className={`font-mono text-lg font-bold text-foreground blur-number`}>{card.value}</div>
          </div>
        );
      })}
    </div>
  );
}
