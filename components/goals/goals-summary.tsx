'use client';

import { useState, useEffect, useMemo } from 'react';
import { formatCurrency, calcGoalProgress } from '@/lib/utils/goals';
import { useShowMath } from '@/lib/hooks/use-show-math';
import { buildGoalsTrace } from '@/lib/services/trace-engine';
import { CalculationTraceOverlay } from '@/components/financial-logic/calculation-trace';
import { useCardCollapsed } from '@/lib/hooks/use-card-collapsed';
import { CollapsibleCardHeader } from '@/components/ui/collapsible-card-header';
import { Target, Coins, PiggyBank, TrendingUp, PieChart } from 'lucide-react';

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
  const { enabled: showMath } = useShowMath();
  const [totalCollapsed, setTotalCollapsed] = useCardCollapsed('goalsTotal');
  const [targetCollapsed, setTargetCollapsed] = useCardCollapsed('goalsTarget');
  const [savedCollapsed, setSavedCollapsed] = useCardCollapsed('goalsSaved');
  const [progressCollapsed, setProgressCollapsed] = useCardCollapsed('goalsProgress');
  const [breakdownCollapsed, setBreakdownCollapsed] = useCardCollapsed('goalsBreakdown');
  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const goalsTrace = useMemo(
    () =>
      data
        ? buildGoalsTrace({
            totalTarget: data.totalTarget,
            totalCurrent: data.totalCurrent,
            overallProgress: data.overallProgress,
          })
        : null,
    [data]
  );

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
        <div className="bg-card border border-border rounded-xl shadow-sm">
          <CollapsibleCardHeader
            isCollapsed={totalCollapsed}
            onToggle={setTotalCollapsed}
            title={
              <h3 className="text-sm sm:text-base font-bold text-foreground flex items-center gap-2">
                <Target className="w-4 h-4 text-primary" /> Total Goals
              </h3>
            }
          />
          {!totalCollapsed && (
            <div className="p-5">
              <p className="text-2xl font-bold text-foreground">{data.totalGoals}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {data.activeGoals} active · {data.completedGoals} done
              </p>
            </div>
          )}
        </div>

        <div className="bg-card border border-border rounded-xl shadow-sm">
          <CollapsibleCardHeader
            isCollapsed={targetCollapsed}
            onToggle={setTargetCollapsed}
            title={
              <h3 className="text-sm sm:text-base font-bold text-foreground flex items-center gap-2">
                <Coins className="w-4 h-4 text-primary" /> Total Target
              </h3>
            }
          />
          {!targetCollapsed && (
            <div className="p-5">
              <p className="text-2xl font-bold text-foreground">{formatCurrency(data.totalTarget)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Across all goals</p>
            </div>
          )}
        </div>

        <div className="bg-card border border-border rounded-xl shadow-sm">
          <CollapsibleCardHeader
            isCollapsed={savedCollapsed}
            onToggle={setSavedCollapsed}
            title={
              <h3 className="text-sm sm:text-base font-bold text-foreground flex items-center gap-2">
                <PiggyBank className="w-4 h-4 text-primary" /> Total Saved
              </h3>
            }
          />
          {!savedCollapsed && (
            <div className="p-5">
              <p className="text-2xl font-bold text-chart-1">{formatCurrency(data.totalCurrent)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {formatCurrency(data.totalTarget - data.totalCurrent)} remaining
              </p>
            </div>
          )}
        </div>

        <div className="bg-card border border-border rounded-xl shadow-sm">
          <CollapsibleCardHeader
            isCollapsed={progressCollapsed}
            onToggle={setProgressCollapsed}
            title={
              <h3 className="text-sm sm:text-base font-bold text-foreground flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" /> Overall Progress
              </h3>
            }
          />
          {!progressCollapsed && (
            <div className="p-5">
              <p className="text-2xl font-bold text-foreground blur-number">{data.overallProgress.toFixed(1)}%</p>
              <div className="w-full bg-muted/30 rounded-full h-1.5 mt-2 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${
                    data.overallProgress >= 75 ? 'bg-chart-1' :
                    data.overallProgress >= 50 ? 'bg-chart-3' :
                    data.overallProgress >= 25 ? 'bg-status-warning' : 'bg-destructive'
                  }`}
                  style={{ width: `${data.overallProgress}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {showMath && goalsTrace && <CalculationTraceOverlay trace={goalsTrace} />}

      {/* Breakdown by Type */}
      {Object.keys(data.byType).length > 1 && (
        <div className="bg-card border border-border rounded-xl shadow-sm">
          <CollapsibleCardHeader
            isCollapsed={breakdownCollapsed}
            onToggle={setBreakdownCollapsed}
            title={
              <h3 className="text-sm sm:text-base font-bold text-foreground flex items-center gap-2">
                <PieChart className="w-4 h-4 text-primary" /> Breakdown by Type
              </h3>
            }
          />
          {!breakdownCollapsed && (
            <div className="p-5">
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
                            data.progress >= 25 ? 'bg-status-warning' : 'bg-destructive'
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
      )}
    </div>
  );
}
