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
  Compass,
  Layers,
  HelpCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ChartHoverTooltip } from '@/components/charts/chart-hover-tooltip';
import { TooltipRow, TooltipHeader } from '@/components/charts/chart-tooltip';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

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

  // Coast FIRE Calculation with Real Plan Parameters
  const coastFireInfo = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const currentAge = currentYear - (Number(plan?.primaryBirthYear) || 1985);
    const yearsToRetire = Math.max(1, localRetirementAge - currentAge);

    const accs = Array.isArray(plan?.accounts) ? plan.accounts.filter((a: any) => a.isIncluded !== false) : [];
    const totalBal = accs.reduce((s: number, a: any) => s + (parseFloat(a.balance) || 0), 0);
    const weightedGrowth = totalBal > 0
      ? accs.reduce((s: number, a: any) => s + ((parseFloat(a.balance) || 0) * (parseFloat(a.expectedGrowthRate) || 6.0)), 0) / totalBal
      : 6.0;

    const inflation = parseFloat(plan?.settings?.fixedInflationRate || '3.0');
    const realReturnRate = Math.max(0.5, weightedGrowth - inflation);
    const coastTarget = fireNumber > 0 ? fireNumber / Math.pow(1 + realReturnRate / 100, yearsToRetire) : 0;
    const progress = coastTarget > 0 ? Math.min(100, (currentNetWorth / coastTarget) * 100) : 0;
    const isReached = currentNetWorth >= coastTarget && coastTarget > 0;

    return {
      currentAge,
      yearsToRetire,
      realReturnRate,
      coastTarget,
      progress,
      isReached,
    };
  }, [plan, localRetirementAge, fireNumber, currentNetWorth]);

  // Semi-circle gauge SVG parameters
  const strokeWidth = 10;
  const radius = 50;
  const circumference = Math.PI * radius;
  const clampedProgress = Math.min(100, Math.max(0, fireProgress));
  const strokeDashoffset = circumference - (clampedProgress / 100) * circumference;

  return (
    <div className="bg-sidebar border border-sidebar-border rounded-2xl shadow-sm overflow-hidden text-sidebar-foreground">
      <CollapsibleCardHeader
        isCollapsed={isCollapsed}
        onToggle={setIsCollapsed}
        collapseDirection="horizontal"
        showMobileToggle={false}
        title={
          <div className="flex items-center gap-2">
            <Flame className="w-4 h-4 text-primary shrink-0" />
            <span className="font-bold text-foreground">Scorecard</span>
          </div>
        }
        className="border-b border-sidebar-border/60 bg-sidebar"
      />

      {!isCollapsed && (
        <div className="p-4 sm:p-5 divide-y divide-sidebar-border/50">
          {/* Section 1: Plan Sustainability Grade */}
          <div className="py-4 first:pt-0 last:pb-0 flex items-center justify-between gap-3">
            <div className="space-y-1 min-w-0">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
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

          {/* Section 2: FIRE Target Arc Gauge & Key Indicators */}
          <div className="py-4 first:pt-0 last:pb-0 space-y-4">
            <div className="flex flex-col items-center justify-center space-y-2">
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
                  <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
                    FIRE Goal
                  </span>
                </div>
              </div>

              <div className="w-full flex justify-between text-xs pt-2.5 mt-1 border-t border-sidebar-border/50">
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
            <TooltipProvider delayDuration={100}>
              <div className="space-y-2">
                <span className="text-xs font-bold text-foreground block mb-1">Key Retirement Indicators</span>
                
                {/* Nest Egg at Retirement */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center justify-between py-1.5 cursor-help">
                      <div className="flex items-center gap-2">
                        <Palmtree className="w-4 h-4 text-emerald-500 shrink-0" />
                        <span className="text-xs font-semibold text-foreground">Nest Egg at {localRetirementAge}</span>
                      </div>
                      <span className="text-xs font-extrabold text-emerald-500 font-mono blur-number">
                        {formatCurrency(netWorthAtRetirement)}
                      </span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="left" className="max-w-xs text-xs">
                    Projected liquid and invested net worth accumulated at target retirement age ({localRetirementAge}).
                  </TooltipContent>
                </Tooltip>

                {/* Peak Withdrawal Rate */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center justify-between py-1.5 cursor-help">
                      <div className="flex items-center gap-2">
                        <Activity className="w-4 h-4 text-amber-500 shrink-0" />
                        <span className="text-xs font-semibold text-foreground">Peak Drawdown Rate</span>
                      </div>
                      <span
                        className={cn(
                          'text-[11px] font-bold font-mono px-2.5 py-0.5 rounded-full border',
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
                  </TooltipTrigger>
                  <TooltipContent side="left" className="max-w-xs text-xs">
                    Highest projected annual withdrawal rate from portfolio assets during retirement. Sustainable safe rate is typically under 4.0%.
                  </TooltipContent>
                </Tooltip>

                {/* Years to FIRE */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center justify-between py-1.5 cursor-help">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-cyan-500 shrink-0" />
                        <span className="text-xs font-semibold text-foreground">Years to FI</span>
                      </div>
                      <span className="text-xs font-bold text-foreground font-mono">
                        {yearsToFireDisplay} {typeof yearsToFireDisplay === 'number' ? 'yrs' : ''}
                      </span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="left" className="max-w-xs text-xs">
                    Estimated timeline in years until your liquid & invested net worth reaches your target FIRE number.
                  </TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>
          </div>

           {/* Section 3: Coast FIRE */}
          {coastFireInfo.coastTarget > 0 && (
            <div className="py-4 first:pt-0 last:pb-0">
              <ChartHoverTooltip
                content={
                  <>
                    <TooltipHeader>Coast FIRE Analysis</TooltipHeader>
                    <TooltipRow label="Coast FI Target Today" value={formatCurrency(coastFireInfo.coastTarget)} color="var(--color-primary)" />
                    <TooltipRow label="Current Net Worth" value={formatCurrency(currentNetWorth)} color="var(--color-chart-1)" />
                    <TooltipRow label="Assumed Real Return" value={`${coastFireInfo.realReturnRate.toFixed(1)}%/yr`} color="var(--color-chart-2)" />
                    <div className="mt-2 border-t border-border/40 pt-1.5 text-[10px] text-muted-foreground">
                      No further contributions needed if net worth ≥ Coast target.
                    </div>
                  </>
                }
              >
                <div className="space-y-2 cursor-help">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Compass className="w-3.5 h-3.5 text-cyan-500 shrink-0" />
                      <span className="text-xs font-bold text-foreground flex items-center gap-1">
                        Coast FIRE Goal
                        <HelpCircle className="w-3 h-3 text-muted-foreground/50 hover:text-muted-foreground transition-colors shrink-0" />
                      </span>
                    </div>
                    <span
                      className={cn(
                        'text-[11px] font-bold px-2.5 py-0.5 rounded-full border font-mono',
                        coastFireInfo.isReached
                          ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                          : 'bg-primary/10 text-primary border-primary/20'
                      )}
                    >
                      {coastFireInfo.isReached ? 'Reached' : `${coastFireInfo.progress.toFixed(0)}%`}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between text-xs font-mono">
                    <span className="text-foreground font-semibold blur-number">
                      {formatCurrency(currentNetWorth)} <span className="text-muted-foreground font-normal">/ {formatCurrency(coastFireInfo.coastTarget)}</span>
                    </span>
                    <span className="text-muted-foreground text-[11px]">
                      Age {coastFireInfo.currentAge} → {localRetirementAge}
                    </span>
                  </div>
                  <div className="h-2.5 w-full bg-muted/50 rounded-full overflow-hidden">
                    <div
                      className={cn(
                        'h-full transition-all duration-500 rounded-full',
                        coastFireInfo.isReached ? 'bg-emerald-500' : 'bg-cyan-500'
                      )}
                      style={{ width: `${coastFireInfo.progress}%` }}
                    />
                  </div>
                </div>
              </ChartHoverTooltip>
            </div>
          )}

          {/* Section 5: Upcoming Key Milestones */}
          {milestoneCallouts.length > 0 && (
            <div className="py-4 first:pt-0 last:pb-0 space-y-2.5">
              <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <Landmark className="w-3.5 h-3.5 text-primary shrink-0" />
                Upcoming Key Milestones
              </span>
              <div className="relative pl-4 space-y-2.5 before:absolute before:left-1.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-sidebar-border">
                <TooltipProvider delayDuration={100}>
                  {milestoneCallouts.slice(0, showAllMilestones ? milestoneCallouts.length : 4).map((m, idx) => {
                    return (
                      <Tooltip key={idx}>
                        <TooltipTrigger asChild>
                          <div className="relative flex items-center justify-between gap-2 text-xs py-0.5 cursor-help hover:bg-sidebar-accent/50 rounded px-1 -mx-1 transition-colors">
                            <div className="absolute -left-4 top-1 w-3.5 h-3.5 rounded-full bg-sidebar border-2 border-primary flex items-center justify-center text-[8px]">
                              {m.emoji}
                            </div>
                            <span className="font-bold text-foreground truncate min-w-0">{m.title}</span>
                            <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                              Age {m.age} ({m.year})
                            </span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="left" className="max-w-xs text-xs space-y-1">
                          <div className="font-bold">{m.title} (Age {m.age}, {m.year})</div>
                          {m.note && <div className="text-muted-foreground">{m.note}</div>}
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </TooltipProvider>
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

        </div>
      )}
    </div>
  );
}
