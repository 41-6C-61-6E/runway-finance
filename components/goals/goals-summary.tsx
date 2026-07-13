'use client';

import { useState, useEffect } from 'react';
import { formatCurrency } from '@/lib/utils/goals';
import { useCardCollapsed } from '@/lib/hooks/use-card-collapsed';
import { CollapsibleCardHeader } from '@/components/ui/collapsible-card-header';
import { Card, CardContent } from '@/components/ui/card';
import { useGoalInflow } from './goal-inflow-context';
import { Target, Coins, PiggyBank, TrendingUp, PieChart, ChevronDown, Clock, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Goal {
  id: string;
  name: string;
  type: string;
  targetAmount: string;
  currentAmount: string;
  allocatedAmount?: string;
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
  const [collapsed, setCollapsed] = useCardCollapsed('goalsSummary');
  const [breakdownCollapsed, setBreakdownCollapsed] = useCardCollapsed('goalsBreakdown');
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
          // Use allocatedAmount if available (for linked accounts), otherwise fall back to currentAmount
          const current = parseFloat(goal.allocatedAmount ?? goal.currentAmount);
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
        Object.entries(byType).forEach(([type, d]) => {
          byTypeWithProgress[type] = {
            ...d,
            progress: d.target > 0 ? Math.min((d.current / d.target) * 100, 100) : 0,
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
      <Card className="animate-pulse">
        <CardContent className="p-5">
          <div className="h-4 bg-muted rounded w-32 mb-6" />
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i}>
                <div className="h-3 bg-muted rounded w-16 mb-2" />
                <div className="h-6 bg-muted rounded w-24 mb-1" />
                <div className="h-2.5 bg-muted/50 rounded w-14" />
              </div>
            ))}
          </div>
          <div className="mt-4 h-2 bg-muted rounded w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.totalGoals === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <div className="text-4xl mb-3">🎯</div>
          <p className="text-lg font-semibold text-foreground mb-1">No goals set yet</p>
          <p className="text-sm text-muted-foreground">Create your first financial goal to start tracking your progress.</p>
        </CardContent>
      </Card>
    );
  }

  const typeIcons: Record<string, string> = {
    savings: '💰',
    payoff: '💳',
    investment: '📈',
    other: '🎯',
  };

  const remaining = Math.max(0, data.totalTarget - data.totalCurrent);
  const progressPercent = data.overallProgress;
  const overallBarColor = progressPercent >= 75 ? 'bg-chart-1' : progressPercent >= 50 ? 'bg-chart-3' : progressPercent >= 25 ? 'bg-status-warning' : 'bg-destructive';

  return (
    <div className="space-y-5">
      <Card>
        <CollapsibleCardHeader
          isCollapsed={collapsed}
          onToggle={setCollapsed}
          title={
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-primary shrink-0" />
              <span>Goals Summary</span>
            </div>
          }
          actions={
            <div className="flex items-center gap-1.5 text-xs sm:text-sm">
              <span className="font-semibold text-foreground">{data.totalGoals} total</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-chart-2">{data.activeGoals} active</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-chart-1">{data.completedGoals} done</span>
            </div>
          }
        />
        {!collapsed && (
          <CardContent>
            {/* 3-column metrics */}
            <div className="grid grid-cols-3 divide-x divide-border">
              <div className="pr-3 sm:pr-4">
                <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                  <Coins className="w-3 h-3" /> Total Target
                </p>
                <p className="text-lg sm:text-2xl font-bold text-foreground truncate blur-number">
                  {formatCurrency(data.totalTarget)}
                </p>
                <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">Across all goals</p>
              </div>
              <div className="px-3 sm:px-4">
                <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                  <PiggyBank className="w-3 h-3" /> Total Saved
                </p>
                <p className="text-lg sm:text-2xl font-bold text-chart-1 truncate blur-number">
                  {formatCurrency(data.totalCurrent)}
                </p>
                <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">Saved so far</p>
              </div>
              <div className="pl-3 sm:pl-4">
                <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                  <TrendingUp className="w-3 h-3" /> Remaining
                </p>
                <p className="text-lg sm:text-2xl font-bold text-foreground truncate blur-number">
                  {formatCurrency(remaining)}
                </p>
                <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">Still needed</p>
              </div>
            </div>

            {/* Progress bar */}
            <div className="border-t border-border mt-4 pt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs sm:text-sm font-medium text-foreground">Overall Progress</span>
                <span className="text-xs sm:text-sm font-bold text-foreground blur-number">{progressPercent.toFixed(1)}%</span>
              </div>
              <div className={`w-full ${overallBarColor}/20 rounded-full h-2 overflow-hidden`}>
                <div className={`h-full rounded-full transition-all duration-700 ${overallBarColor}`} style={{ width: `${progressPercent}%` }} />
              </div>
            </div>

            {/* Projection Pacing Indicator */}
            {data.activeGoals > 0 && (
              <div className="border-t border-border mt-3 pt-3">
                <ProjectionPacing />
              </div>
            )}

            {/* Breakdown by Type (collapsible) */}
            {Object.keys(data.byType).length > 1 && (
              <div className="border-t border-border mt-4 pt-3">
                <button
                  onClick={() => setBreakdownCollapsed(!breakdownCollapsed)}
                  className="flex items-center gap-2 w-full text-left group cursor-pointer"
                  type="button"
                >
                  <PieChart className="w-4 h-4 text-primary shrink-0" />
                  <span className="text-xs sm:text-sm font-medium text-foreground">Breakdown by Type</span>
                  <ChevronDown
                    className={cn(
                      'w-4 h-4 text-muted-foreground transition-transform duration-200 ml-auto',
                      !breakdownCollapsed && 'rotate-180'
                    )}
                  />
                </button>
                {!breakdownCollapsed && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
                    {Object.entries(data.byType).map(([type, td]) => (
                      <div key={type} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                        <span className="text-xl shrink-0">{typeIcons[type] || '🎯'}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="text-xs font-medium text-foreground capitalize">{type}</span>
                            <span className="text-xs text-muted-foreground">{td.count}</span>
                          </div>
                          {(() => {
                            const bc = td.progress >= 75 ? 'bg-chart-1' : td.progress >= 50 ? 'bg-chart-3' : td.progress >= 25 ? 'bg-status-warning' : 'bg-destructive';
                            return (
                              <div className={`w-full ${bc}/20 rounded-full h-1.5 overflow-hidden`}>
                                <div className={`h-full rounded-full transition-all duration-500 ${bc}`} style={{ width: `${td.progress}%` }} />
                              </div>
                            );
                          })()}
                          <div className="flex justify-between mt-0.5">
                            <span className="text-[10px] text-muted-foreground blur-number">{formatCurrency(td.current)}</span>
                            <span className="text-[10px] text-muted-foreground blur-number">{formatCurrency(td.target)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
}

function ProjectionPacing() {
  const [projections, setProjections] = useState<{
    allFundedBy: string | null;
    accounts: Array<{ allFundedBy: string | null; goals: Array<{ willFund: boolean }> }>;
  } | null>(null);
  const { savedInflows } = useGoalInflow();

  useEffect(() => {
    const params = new URLSearchParams();
    params.set('projectionMonths', '120');
    if (savedInflows && Object.keys(savedInflows).length > 0) {
      params.set('accountInflows', JSON.stringify(savedInflows));
    }
    fetch(`/api/goals/projections?${params.toString()}`, { credentials: 'include' })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (!data) return;
        const allFundedBy = data.accounts.length > 0
          ? data.accounts.reduce((latest: string | null, a: { allFundedBy: string | null }) => {
               if (!a.allFundedBy) return latest;
               if (!latest || a.allFundedBy > latest) return a.allFundedBy;
               return latest;
             }, null as string | null)
          : null;
        setProjections({ allFundedBy, accounts: data.accounts });
      })
      .catch(() => {});
  }, [savedInflows]);

  if (!projections) return null;

  const allGoalsFund = projections.accounts.every(a => a.goals.every(g => g.willFund));
  const someWontFund = projections.accounts.some(a => a.goals.some(g => !g.willFund));

  if (allGoalsFund && projections.allFundedBy) {
    const d = new Date(projections.allFundedBy + '-01');
    const label = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    return (
      <div className="flex items-center gap-2">
        <Clock className="w-3.5 h-3.5 text-chart-1 shrink-0" />
        <span className="text-xs text-muted-foreground">
          At current savings rate, all goals funded by <span className="font-semibold text-chart-1">{label}</span>
        </span>
      </div>
    );
  }

  if (someWontFund) {
    return (
      <div className="flex items-center gap-2">
        <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
        <span className="text-xs text-muted-foreground">
          Some goals may not fund within 10 years at current savings rate
        </span>
      </div>
    );
  }

  return null;
}
