'use client';

import { useMemo, useState } from 'react';
import { formatCurrency } from '@/lib/utils/format';
import { Card, CardContent } from '@/components/ui/card';
import { CollapsibleCardHeader } from '@/components/ui/collapsible-card-header';
import { useCardCollapsed } from '@/lib/hooks/use-card-collapsed';
import {
  Flame,
  Target,
  Clock,
  Palmtree,
  ShieldCheck,
  Activity,
  Award,
  Landmark,
  Flag,
  Users,
  ChevronRight,
  TrendingUp,
  DollarSign,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Milestone {
  age: number;
  title: string;
  year: number;
  icon: any;
  emoji: string;
  color: string;
  note: string;
}

interface PlanHealth {
  score: string;
  status: string;
  badge: string;
  desc: string;
}

interface FireProjectionsSidePanelProps {
  plan: any;
  currentNetWorth: number;
  netWorthAtRetirement: number;
  fireNumber: number;
  fireProgress: number;
  yearsToFireDisplay: string | number;
  simulation: any;
  peakWithdrawalRate: number;
  planHealth: PlanHealth;
  localRetirementAge: number;
  milestoneCallouts: Milestone[];
}

export function FireProjectionsSidePanel({
  plan,
  currentNetWorth,
  netWorthAtRetirement,
  fireNumber,
  fireProgress,
  yearsToFireDisplay,
  simulation,
  peakWithdrawalRate,
  planHealth,
  localRetirementAge,
  milestoneCallouts,
}: FireProjectionsSidePanelProps) {
  const [isCollapsed, setIsCollapsed] = useCardCollapsed('fireProjectionsSidePanel');
  const [showAllMilestones, setShowAllMilestones] = useState(false);

  const activeStrategyLabel = useMemo(() => {
    const method = plan?.settings?.withdrawalMethod || plan?.withdrawalMethod || 'textbook';
    if (method === 'tax_optimized') return 'Tax-Bracket Shielding (Fill 12% Bracket)';
    if (method === 'proportional') return 'Proportional Drawdown';
    if (method === 'custom_order') return 'Custom Priority Order';
    return 'Textbook Waterfall (Cash → Taxable → Trad → Roth)';
  }, [plan]);

  // Semi-circle gauge SVG parameters
  const strokeWidth = 10;
  const radius = 50;
  const circumference = Math.PI * radius;
  const clampedProgress = Math.min(100, Math.max(0, fireProgress));
  const strokeDashoffset = circumference - (clampedProgress / 100) * circumference;

  return (
    <div className="space-y-5">
      <Card className="shadow-sm border border-border overflow-hidden">
        <CollapsibleCardHeader
          isCollapsed={isCollapsed}
          onToggle={setIsCollapsed}
          title={
            <div className="flex items-center gap-2">
              <Flame className="w-4 h-4 text-primary shrink-0" />
              <span className="font-bold text-foreground">Scorecard</span>
            </div>
          }
        />

        {!isCollapsed && (
          <CardContent className="p-4 sm:p-5 space-y-5">
            {/* Plan Health Scorecard Hero Card */}
            <div className="bg-muted/30 border border-border/60 rounded-xl p-4 flex items-center justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                  Plan Sustainability
                </span>
                <span className="text-sm font-extrabold text-foreground block truncate">
                  {planHealth.status}
                </span>
                <p className="text-[11px] text-muted-foreground leading-tight line-clamp-2">
                  {planHealth.desc}
                </p>
              </div>
              <div className="flex flex-col items-center justify-center shrink-0 w-14 h-14 rounded-2xl bg-card border border-border shadow-xs">
                <span className="text-xs text-muted-foreground font-semibold">Grade</span>
                <span className="text-xl font-black text-primary font-mono">{planHealth.score}</span>
              </div>
            </div>

            {/* FIRE Target Semi-Circle Arc Gauge */}
            <div className="bg-muted/20 border border-border/50 rounded-xl p-4 flex flex-col items-center justify-center space-y-2">
              <div className="relative w-36 h-20 flex items-start justify-center overflow-hidden">
                <svg className="w-36 h-36" viewBox="0 0 120 120">
                  {/* Gauge Arc Track */}
                  <path
                    d="M 10,60 A 50,50 0 0,1 110,60"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={strokeWidth}
                    className="text-muted/40"
                  />
                  {/* Gauge Arc Progress */}
                  <path
                    d="M 10,60 A 50,50 0 0,1 110,60"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={strokeWidth}
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    className="text-primary transition-all duration-1000 ease-out"
                  />
                </svg>
                <div className="absolute bottom-1 flex flex-col items-center text-center">
                  <span className="text-2xl font-extrabold text-foreground font-mono blur-number">
                    {fireProgress.toFixed(0)}%
                  </span>
                  <span className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider">
                    FIRE Goal
                  </span>
                </div>
              </div>

              <div className="w-full flex justify-between text-xs pt-1 border-t border-border/50">
                <div className="flex flex-col">
                  <span className="text-[10px] text-muted-foreground">Current Net Worth</span>
                  <span className="font-bold text-foreground font-mono blur-number">{formatCurrency(currentNetWorth)}</span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-[10px] text-muted-foreground">Target ({plan?.fiTargetMultiplier || 25}×)</span>
                  <span className="font-bold text-primary font-mono blur-number">{formatCurrency(fireNumber)}</span>
                </div>
              </div>
            </div>

            {/* Key Projection Metrics */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-foreground block mb-1">Key Retirement Indicators</span>
              
              {/* Nest Egg at Retirement */}
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/20 border border-border/50">
                <div className="flex items-center gap-2">
                  <Palmtree className="w-4 h-4 text-emerald-500 shrink-0" />
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-foreground">Nest Egg at {localRetirementAge}</span>
                    <span className="text-[10px] text-muted-foreground">Projected Assets</span>
                  </div>
                </div>
                <span className="text-xs font-extrabold text-emerald-500 font-mono blur-number">
                  {formatCurrency(netWorthAtRetirement)}
                </span>
              </div>

              {/* Peak Withdrawal Rate */}
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/20 border border-border/50">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-amber-500 shrink-0" />
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-foreground">Peak Drawdown Rate</span>
                    <span className="text-[10px] text-muted-foreground">Discretionary Draw</span>
                  </div>
                </div>
                <span
                  className={cn(
                    'text-xs font-bold font-mono px-2 py-0.5 rounded border',
                    peakWithdrawalRate <= 4
                      ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                      : peakWithdrawalRate <= 5.5
                      ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                      : 'bg-rose-500/10 text-rose-500 border-rose-500/20'
                  )}
                >
                  {peakWithdrawalRate.toFixed(1)}%
                </span>
              </div>

              {/* Years to FIRE */}
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/20 border border-border/50">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-cyan-500 shrink-0" />
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-foreground">Years to FI</span>
                    <span className="text-[10px] text-muted-foreground">Timeline Estimate</span>
                  </div>
                </div>
                <span className="text-xs font-bold text-foreground font-mono">
                  {yearsToFireDisplay} {typeof yearsToFireDisplay === 'number' ? 'yrs' : ''}
                </span>
              </div>
            </div>

            {/* Upcoming Milestones Vertical Stepper */}
            {milestoneCallouts.length > 0 && (
              <div className="border-t border-border pt-4 space-y-3">
                <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Landmark className="w-3.5 h-3.5 text-primary" />
                  Upcoming Key Milestones
                </span>
                <div className="relative pl-4 space-y-3 before:absolute before:left-1.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-border">
                  {milestoneCallouts.slice(0, showAllMilestones ? milestoneCallouts.length : 4).map((m, idx) => {
                    const IconComponent = m.icon || Target;
                    return (
                      <div key={idx} className="relative flex items-start gap-2 text-xs">
                        <div className="absolute -left-4 top-0.5 w-3.5 h-3.5 rounded-full bg-card border-2 border-primary flex items-center justify-center text-[8px]">
                          {m.emoji}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-foreground truncate">{m.title}</span>
                            <span className="text-[10px] font-mono text-muted-foreground">
                              Age {m.age} ({m.year})
                            </span>
                          </div>
                          <p className="text-[10px] text-muted-foreground leading-tight line-clamp-1">
                            {m.note}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {milestoneCallouts.length > 4 && (
                  <button
                    onClick={() => setShowAllMilestones((v) => !v)}
                    className="flex items-center gap-1 text-[10px] font-bold text-primary hover:text-primary/80 transition-colors cursor-pointer"
                    type="button"
                  >
                    <ChevronRight className={cn('w-3 h-3 transition-transform duration-200', showAllMilestones && 'rotate-90')} />
                    {showAllMilestones ? 'Show less' : `Show all (${milestoneCallouts.length})`}
                  </button>
                )}
              </div>
            )}

            {/* Withdrawal Strategy Strategy Pill */}
            <div className="border-t border-border pt-4 space-y-1.5">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                Active Drawdown Strategy
              </span>
              <div className="p-2.5 rounded-lg bg-primary/10 border border-primary/20 text-xs font-medium text-primary flex items-center gap-2">
                <Zap className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{activeStrategyLabel}</span>
              </div>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
