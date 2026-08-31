'use client';

import { useState, useEffect } from 'react';
import { formatCurrency } from '@/lib/utils/goals';
import { formatPlainPercent } from '@/lib/utils/format';
import { useCardCollapsed } from '@/lib/hooks/use-card-collapsed';
import { CollapsibleCardHeader } from '@/components/ui/collapsible-card-header';
import { Card, CardContent } from '@/components/ui/card';
import { useGoalInflow } from './goal-inflow-context';
import {
  Target,
  Coins,
  TrendingUp,
  PieChart,
  Clock,
  AlertCircle,
} from 'lucide-react';

interface Goal {
  id: string;
  name: string;
  type: string;
  targetAmount: string;
  currentAmount: string;
  allocatedAmount?: string;
  targetDate?: string | null;
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

export function GoalsSidePanel() {
  const [collapsed, setCollapsed] = useCardCollapsed('goalsSidePanel');
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
            progress: d.target > 0 ? Math.max(0, Math.min((d.current / d.target) * 100, 100)) : 0,
          };
        });

        setData({
          totalGoals: goals.length,
          activeGoals,
          completedGoals,
          totalTarget,
          totalCurrent,
          overallProgress: totalTarget > 0 ? Math.max(0, Math.min((totalCurrent / totalTarget) * 100, 100)) : 0,
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
      <Card className="shadow-sm border border-sidebar-border bg-sidebar rounded-2xl animate-pulse">
        <CardContent className="p-5 space-y-4">
          <div className="h-5 bg-muted/60 rounded w-36 mb-2" />
          <div className="h-36 bg-card rounded-full w-36 mx-auto" />
          <div className="h-20 bg-card rounded-xl" />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.totalGoals === 0) {
    return (
      <Card className="shadow-sm border border-sidebar-border bg-sidebar rounded-2xl">
        <CardContent className="p-6 text-center">
          <div className="text-3xl mb-2">🎯</div>
          <p className="text-sm font-bold text-foreground mb-1">No goals set yet</p>
          <p className="text-xs text-muted-foreground">Create your first goal to view overall progress metrics.</p>
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

  // Circular progress SVG parameters
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progressPercent / 100) * circumference;

  return (
    <div className="bg-sidebar border border-sidebar-border rounded-2xl shadow-sm overflow-hidden text-sidebar-foreground">
      <CollapsibleCardHeader
        isCollapsed={collapsed}
        onToggle={setCollapsed}
        collapseDirection="horizontal"
        showMobileToggle={false}
        title={
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-primary shrink-0" />
            <span className="font-bold text-foreground">Overview</span>
          </div>
        }
        actions={
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-chart-2 font-semibold">{data.activeGoals} active</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-chart-1 font-semibold">{data.completedGoals} done</span>
          </div>
        }
        className="border-b border-sidebar-border/60 bg-sidebar"
      />

      {!collapsed && (
        <div className="p-4 sm:p-5 divide-y divide-sidebar-border/50">
          {/* Section 1: Circular Progress Gauge */}
          <div className="py-4 first:pt-0 last:pb-0 flex flex-col items-center justify-center space-y-3 relative">
            <div className="relative w-36 h-36 flex items-center justify-center">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                {/* Track Circle */}
                <circle
                  cx="60"
                  cy="60"
                  r={radius}
                  className="stroke-muted/40"
                  strokeWidth="10"
                  fill="transparent"
                />
                {/* Progress Circle */}
                <circle
                  cx="60"
                  cy="60"
                  r={radius}
                  className="stroke-primary transition-all duration-1000 ease-out"
                  strokeWidth="10"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  fill="transparent"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-2xl font-extrabold text-foreground font-mono blur-number">
                  {formatPlainPercent(progressPercent)}
                </span>
                <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mt-0.5">
                  Funded
                </span>
              </div>
            </div>

            {/* Goal Count Chips */}
            <div className="flex items-center gap-2 text-xs">
              <span className="px-2.5 py-0.5 rounded-full bg-primary/10 text-primary font-bold border border-primary/20 font-mono text-[11px]">
                {data.totalGoals} Total Goals
              </span>
            </div>
          </div>

          {/* Section 2: Summary Financial Stat Rows */}
          <div className="py-4 first:pt-0 last:pb-0 space-y-2">
            <div className="flex items-center justify-between py-1">
              <div className="flex items-center gap-2">
                <Coins className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="text-xs font-medium text-muted-foreground">Total Target</span>
              </div>
              <span className="text-sm font-bold text-foreground font-mono blur-number">
                {formatCurrency(data.totalTarget)}
              </span>
            </div>

            <div className="flex items-center justify-between py-1">
              <div className="flex items-center gap-2">
                <Coins className="w-3.5 h-3.5 text-chart-1 shrink-0" />
                <span className="text-xs font-medium text-muted-foreground">Total Saved</span>
              </div>
              <span className="text-sm font-bold text-chart-1 font-mono blur-number">
                {formatCurrency(data.totalCurrent)}
              </span>
            </div>

            <div className="flex items-center justify-between py-1">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="text-xs font-medium text-muted-foreground">Remaining</span>
              </div>
              <span className="text-sm font-bold text-foreground font-mono blur-number">
                {formatCurrency(remaining)}
              </span>
            </div>
          </div>

          {/* Section 3: Projection Pacing Indicator */}
          {data.activeGoals > 0 && (
            <div className="py-4 first:pt-0 last:pb-0">
              <ProjectionPacingCard />
            </div>
          )}

          {/* Section 4: Breakdown by Goal Type */}
          {Object.keys(data.byType).length > 0 && (
            <div className="py-4 first:pt-0 last:pb-0 space-y-2.5">
              <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <PieChart className="w-3.5 h-3.5 text-primary shrink-0" />
                Breakdown by Type
              </span>
              <div className="space-y-2.5">
                {Object.entries(data.byType).map(([type, td]) => (
                  <div key={type} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-foreground capitalize flex items-center gap-1">
                        <span>{typeIcons[type] || '🎯'}</span>
                        {type}
                      </span>
                      <span className="text-[11px] text-muted-foreground font-mono">
                        {td.count} {td.count === 1 ? 'goal' : 'goals'}
                      </span>
                    </div>
                    <div className="w-full bg-muted/40 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all duration-500"
                        style={{ width: `${td.progress}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                      <span className="blur-number">{formatCurrency(td.current)}</span>
                      <span className="blur-number">{formatCurrency(td.target)}</span>
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

function ProjectionPacingCard() {
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
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        const allFundedBy =
          data.accounts.length > 0
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

  const allGoalsFund = projections.accounts.every((a) => a.goals.every((g) => g.willFund));
  const someWontFund = projections.accounts.some((a) => a.goals.some((g) => !g.willFund));

  if (allGoalsFund && projections.allFundedBy) {
    const d = new Date(projections.allFundedBy + '-01');
    const label = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    return (
      <div className="flex items-start gap-2.5 p-3 rounded-lg bg-chart-1/10 border border-chart-1/20 text-xs">
        <Clock className="w-4 h-4 text-chart-1 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <span className="font-bold text-chart-1 block">On Track for Completion</span>
          <span className="text-muted-foreground text-[11px] leading-tight block">
            At your current savings rate, all active goals will be fully funded by{' '}
            <span className="font-bold text-foreground font-mono">{label}</span>.
          </span>
        </div>
      </div>
    );
  }

  if (someWontFund) {
    return (
      <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs">
        <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <span className="font-bold text-amber-500 block">Pacing Shortfall Alert</span>
          <span className="text-muted-foreground text-[11px] leading-tight block">
            Some goals may not complete within 10 years at current contribution rates.
          </span>
        </div>
      </div>
    );
  }

  return null;
}
