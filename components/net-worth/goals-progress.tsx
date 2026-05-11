'use client';

import { useState, useEffect } from 'react';
import { formatCurrency } from '@/lib/utils/format';

interface FinancialGoal {
  id: string;
  name: string;
  description: string | null;
  type: string;
  targetAmount: string;
  currentAmount: string;
  targetDate: string | null;
  category: string | null;
  priority: number;
  status: string;
}

function getProgressColor(progress: number): string {
  if (progress >= 75) return 'bg-chart-1';
  if (progress >= 50) return 'bg-chart-3';
  return 'bg-destructive';
}

function getProgressTextColor(progress: number): string {
  if (progress >= 75) return 'text-chart-1';
  if (progress >= 50) return 'text-chart-3';
  return 'text-destructive';
}

export function GoalsProgress() {
  const [goals, setGoals] = useState<FinancialGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchGoals = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch('/api/financial-goals');
        if (!res.ok) throw new Error('Failed to fetch goals');
        const data = await res.json();
        setGoals(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };
    fetchGoals();
  }, []);

  const activeGoals = goals.filter((g) => g.status === 'active');

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-foreground mb-4">Goals Progress</h3>
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-2">
              <div className="h-4 bg-muted rounded w-32"></div>
              <div className="h-2.5 bg-muted rounded w-full"></div>
              <div className="h-3 bg-muted rounded w-48"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-foreground mb-4">Goals Progress</h3>
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  if (activeGoals.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-foreground mb-4">Goals Progress</h3>
        <div className="text-center py-6">
          <p className="font-medium text-foreground mb-0.5">No goals set yet</p>
          <p className="text-xs text-muted-foreground">Set financial goals to track your progress</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-foreground mb-4">Goals Progress</h3>
      <div className="space-y-4">
        {activeGoals.map((goal) => {
          const target = parseFloat(goal.targetAmount);
          const current = parseFloat(goal.currentAmount);
          const progress = target > 0 ? Math.min((current / target) * 100, 100) : 0;

          return (
            <div key={goal.id}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{goal.name}</span>
                  {goal.type && (
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                      {goal.type}
                    </span>
                  )}
                </div>
                <span className={`text-xs font-semibold ${getProgressTextColor(progress)}`}>
                  {progress.toFixed(0)}%
                </span>
              </div>
              <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${getProgressColor(progress)}`}
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-xs text-muted-foreground financial-value">
                  {formatCurrency(current)}
                </span>
                <span className="text-xs text-muted-foreground financial-value">
                  {formatCurrency(target)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
