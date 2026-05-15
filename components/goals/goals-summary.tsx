'use client';

import { useState, useEffect } from 'react';
import { formatCurrency, calcGoalProgress } from '@/lib/utils/goals';

interface Goal {
  id: string;
  name: string;
  type: string;
  targetAmount: string;
  currentAmount: string;
  status: string;
}

interface SummaryData {
  totalGoals: number;
  activeGoals: number;
  completedGoals: number;
  totalTarget: number;
  totalCurrent: number;
  overallProgress: number;
  byType: Record<string, { count: number; target: number; current: number; progress: number }>;
}

export function GoalsSummary() {
  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSummary = async () => {
      try {
        const res = await fetch('/api/financial-goals', { credentials: 'include' });
        if (!res.ok) throw new Error('Failed to fetch goals');
        const goals: Goal[] = await res.json();

        const byType: Record<string, { count: number; target: number; current: number }> = {};
        let totalTarget = 0;
        let totalCurrent = 0;
        let activeGoals = 0;
        let completedGoals = 0;

        goals.forEach((goal) => {
          const target = parseFloat(goal.targetAmount);
          const current = parseFloat(goal.currentAmount);
          totalTarget += target;
          totalCurrent += current;

          if (goal.status === 'active') activeGoals++;
          if (goal.status === 'completed') completedGoals++;

          if (!byType[goal.type]) {
            byType[goal.type] = { count: 0, target: 0, current: 0 };
          }
          byType[goal.type].count++;
          byType[goal.type].target += target;
          byType[goal.type].current += current;
        });

        const byTypeWithProgress: Record<string, { count: number; target: number; current: number; progress: number }> = {};
        Object.entries(byType).forEach(([type, data]) => {
          byTypeWithProgress[type] = {
            ...data,
            progress: data.target > 0 ? Math.min((data.current / data.target) * 100, 100) : 0,
          };
        });

        setData({
          totalGoals: goals.length,
          activeGoals,
          completedGoals,
          totalTarget,
          totalCurrent,
          overallProgress: totalTarget > 0 ? Math.min((totalCurrent / totalTarget) * 100, 100) : 0,
          byType: byTypeWithProgress,
        });
      } catch {
        setData(null);
      } finally {
        setLoading(false);
      }
    };

    fetchSummary();
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-card border border-border rounded-xl p-5 shadow-sm animate-pulse">
            <div className="h-3 bg-muted rounded w-20 mb-2" />
            <div className="h-7 bg-muted rounded w-28 mb-1" />
            <div className="h-2.5 bg-muted/50 rounded w-full" />
          </div>
        ))}
      </div>
    );
  }

  if (!data || data.totalGoals === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-8 shadow-sm text-center">
        <div className="text-4xl mb-3">🎯</div>
        <p className="text-lg font-semibold text-foreground mb-1">No goals set yet</p>
        <p className="text-sm text-muted-foreground">Create your first financial goal to start tracking your progress.</p>
      </div>
    );
  }

  const typeIcons: Record<string, string> = {
    savings: '💰',
    payoff: '💳',
    investment: '📈',
    other: '🎯',
  };

  return (
    <div className="space-y-5">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Total Goals</p>
          <p className="text-2xl font-bold text-foreground">{data.totalGoals}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {data.activeGoals} active · {data.completedGoals} done
          </p>
        </div>

        <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Total Target</p>
          <p className="text-2xl font-bold text-foreground">{formatCurrency(data.totalTarget)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Across all goals</p>
        </div>

        <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Total Saved</p>
          <p className="text-2xl font-bold text-chart-1">{formatCurrency(data.totalCurrent)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {formatCurrency(data.totalTarget - data.totalCurrent)} remaining
          </p>
        </div>

        <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Overall Progress</p>
          <p className="text-2xl font-bold text-foreground">{data.overallProgress.toFixed(1)}%</p>
          <div className="w-full bg-muted/30 rounded-full h-1.5 mt-2 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${
                data.overallProgress >= 75 ? 'bg-chart-1' :
                data.overallProgress >= 50 ? 'bg-chart-3' :
                data.overallProgress >= 25 ? 'bg-yellow-500' : 'bg-destructive'
              }`}
              style={{ width: `${data.overallProgress}%` }}
            />
          </div>
        </div>
      </div>

      {/* Breakdown by Type */}
      {Object.keys(data.byType).length > 1 && (
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-foreground mb-3">Breakdown by Type</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {Object.entries(data.byType).map(([type, data]) => (
              <div key={type} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                <span className="text-2xl">{typeIcons[type] || '🎯'}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-xs font-medium text-foreground capitalize">{type}</span>
                    <span className="text-xs text-muted-foreground">{data.count}</span>
                  </div>
                  <div className="w-full bg-muted/30 rounded-full h-1.5 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        data.progress >= 75 ? 'bg-chart-1' :
                        data.progress >= 50 ? 'bg-chart-3' :
                        data.progress >= 25 ? 'bg-yellow-500' : 'bg-destructive'
                      }`}
                      style={{ width: `${data.progress}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-0.5">
                    <span className="text-[10px] text-muted-foreground">{formatCurrency(data.current)}</span>
                    <span className="text-[10px] text-muted-foreground">{formatCurrency(data.target)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
