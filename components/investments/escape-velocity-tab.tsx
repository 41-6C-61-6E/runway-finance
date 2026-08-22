'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatCurrency } from '@/lib/utils/format';
import { cn } from '@/lib/utils';
import {
  AreaChart,
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChartTooltip, TooltipHeader, TooltipRow } from '@/components/charts/chart-tooltip';
import { CollapsibleCardHeader } from '@/components/ui/collapsible-card-header';
import { ChartEmptyState } from '@/components/charts/chart-empty-state';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useCardCollapsed } from '@/lib/hooks/use-card-collapsed';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { usePrivacyMode } from '@/components/privacy-mode-provider';
import {
  projectEscapeVelocity,
  buildProjectionChartData,
  useEscapeVelocitySettings,
  formatYearsMonths,
  type EscapeProjection,
} from '@/components/investments/escape-velocity-projection';
import {
  Rocket,
  TrendingUp,
  Zap,
  ArrowUpRight,
  Layers,
  CheckCircle2,
  Settings,
  X,
  Info,
  Orbit,
  PiggyBank,
} from 'lucide-react';

/* ─────────────────────────────────────────────────────────────────────────
   Types & Props
───────────────────────────────────────────────────────────────────────── */

interface EscapeVelocityTabProps {
  totalPortfolioValue: number;
  totalAnnualIncome?: number; // dividend / interest income from investments
  portfolioHistory?: { date: string; value: number; twr?: number }[];
}

interface SavingsDataPoint {
  yearMonth: string;
  income: number;
  expenses: number;
  netCashFlow: number;
  savingsRate: number;
  savings: { brokerage: number; retirement: number; hsa: number; savingsAccount: number; cash: number };
}

interface EscapePhase {
  id: 'build-up' | 'approaching' | 'orbit';
  title: string;
  short: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
  barColor: string;
  ringColor: string;
  textClass: string;
}

/* ─────────────────────────────────────────────────────────────────────────
   Constants & helpers
───────────────────────────────────────────────────────────────────────── */

const PHASES: Record<'build-up' | 'approaching' | 'orbit', EscapePhase> = {
  'build-up': {
    id: 'build-up',
    title: 'Build-Up Phase',
    short: 'Building',
    desc: 'Your salary is the engine. The compounding engine is warming up as your portfolio grows.',
    icon: TrendingUp,
    barColor: 'bg-primary/70',
    ringColor: 'var(--color-primary)',
    textClass: 'text-primary',
  },
  approaching: {
    id: 'approaching',
    title: 'Approaching Escape Velocity',
    short: 'Approaching',
    desc: 'Capital returns are closing in on your contributions. The compounding engine is firing hard.',
    icon: Zap,
    barColor: 'bg-amber-500',
    ringColor: 'rgb(245 158 11)',
    textClass: 'text-amber-500',
  },
  orbit: {
    id: 'orbit',
    title: 'Escape Velocity Reached',
    short: 'In Orbit',
    desc: 'Your portfolio earns more each year than you save. Wealth is compounding on its own. 🚀',
    icon: Rocket,
    barColor: 'bg-chart-1',
    ringColor: 'var(--color-chart-1)',
    textClass: 'text-chart-1',
  },
};

function formatShortCurrency(v: number) {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(v / 1_000).toFixed(0)}k`;
  return `$${Math.round(v)}`;
}

function formatMonthLabel(ym: string) {
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) return ym;
  return new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'short', year: '2-digit' });
}

/** Geometrically annualize a cumulative TWR (%) measured over an elapsed window. */
function annualizeReturn(twrPct: number, windowMonths: number): number {
  const totalFactor = 1 + twrPct / 100;
  if (totalFactor <= 0) return Math.max((twrPct / 100) * (12 / windowMonths), -1);
  return Math.pow(totalFactor, 12 / windowMonths) - 1;
}

/* ─────────────────────────────────────────────────────────────────────────
   Info Tooltip — supporting copy that would otherwise clutter the layout
───────────────────────────────────────────────────────────────────────── */

function InfoTooltip({
  label,
  children,
  ariaLabel,
}: {
  label: string;
  children: React.ReactNode;
  ariaLabel: string;
}) {
  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={ariaLabel}
            className="inline-flex items-center justify-center text-muted-foreground/60 hover:text-foreground cursor-help transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded"
          >
            <Info className="w-3.5 h-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="center" className="max-w-[260px] sm:max-w-xs p-3 text-xs space-y-1.5 text-left">
          <div className="font-bold text-foreground pb-1 border-b border-border/50">{label}</div>
          <div className="text-muted-foreground leading-relaxed">{children}</div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Expandable “How this is calculated” disclosure
───────────────────────────────────────────────────────────────────────── */

function ExpandableHelp({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="text-[11px] font-semibold text-muted-foreground hover:text-foreground inline-flex items-center gap-1 cursor-pointer transition-colors"
      >
        {open ? 'Hide details' : 'How is this calculated?'}
        <span className={cn("transition-transform", open && 'rotate-180')}>
          <Info className="w-3.5 h-3.5" />
        </span>
      </button>
      {open && (
        <div className="mt-2 rounded-lg bg-muted/50 border border-border/60 p-3 text-[11px] text-muted-foreground leading-relaxed space-y-1.5 animate-in fade-in-0 zoom-in-95">
          {children}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Hero: Escape-velocity progress ring
───────────────────────────────────────────────────────────────────────── */

function ProgressRing({
  ratio,
  phase,
  hasData,
}: {
  ratio: number | null;
  phase: EscapePhase;
  hasData: boolean;
}) {
  const size = 200;
  const stroke = 16;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = ratio !== null ? Math.max(0, Math.min(ratio, 1)) : 0;
  const offset = c * (1 - pct);
  const isOrbit = phase.id === 'orbit';

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" role="presentation">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-muted)"
          strokeOpacity={0.4}
          strokeWidth={stroke}
        />
        {hasData && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={phase.ringColor}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={offset}
            className={isOrbit ? 'animate-[spin_6s_linear_infinite]' : ''}
            style={{ transition: 'stroke-dashoffset 0.9s cubic-bezier(0.22, 1, 0.36, 1)' }}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <phase.icon className={cn('w-6 h-6 mb-1', phase.textClass)} />
        <div className={cn('text-3xl sm:text-4xl font-bold tracking-tight tabular-nums', hasData ? 'text-foreground' : 'text-muted-foreground/40')}>
          {ratio !== null ? `${Math.round(ratio * 100)}%` : '—'}
        </div>
        <div className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-muted-foreground mt-0.5 px-4">
          of escape velocity
        </div>
        {isOrbit && (
          <div className="mt-1 flex items-center gap-1 text-[10px] font-bold text-chart-1">
            <Orbit className="w-3 h-3" /> ORBIT
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Settings gear — user-configurable assumptions, persisted per user
───────────────────────────────────────────────────────────────────────── */

function EscapeVelocitySettingsMenu() {
  const { settings, patch } = useEscapeVelocitySettings();
  const [open, setOpen] = useState(false);

  const returnSourceActive = (src: 'auto' | 'assumed') =>
    settings.returnSource === src ? 'bg-primary text-primary-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Escape Velocity settings"
          title="Projection settings"
          className={cn(
            'inline-flex items-center justify-center h-8 w-8 rounded-lg border transition-all shrink-0 cursor-pointer shadow-xs',
            open
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-card text-muted-foreground hover:text-foreground border-border hover:bg-muted/80'
          )}
        >
          <Settings className="w-4 h-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={6} className="w-[300px] p-4 space-y-4 bg-card rounded-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-xs text-foreground">
            <Settings className="w-3.5 h-3.5 text-primary" />
            Projection Settings
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close settings"
            className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-muted transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between text-[11px]">
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Savings target</span>
            <span className="font-bold text-foreground tabular-nums">{settings.savingsRateTargetPct.toFixed(0)}%</span>
          </div>
          <Slider
            min={5}
            max={60}
            step={1}
            value={settings.savingsRateTargetPct}
            onValueChange={(v) => patch({ savingsRateTargetPct: v })}
            ariaLabel="Savings rate target"
          />
          <p className="text-[10px] text-muted-foreground">Reference line drawn on the savings-rate trend.</p>
        </div>

        <div className="space-y-1.5">
          <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">Assumed Return</label>
          <div className="grid grid-cols-2 gap-1.5 bg-muted/50 p-1 rounded-lg border border-border">
            <button type="button" onClick={() => patch({ returnSource: 'auto' })} className={cn('py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer', returnSourceActive('auto'))}>
              Auto (TWR)
            </button>
            <button type="button" onClick={() => patch({ returnSource: 'assumed' })} className={cn('py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer', returnSourceActive('assumed'))}>
              Assumed
            </button>
          </div>
          <div className={cn('space-y-1', settings.returnSource !== 'assumed' && 'opacity-45 pointer-events-none')}>
            <div className="flex justify-between text-[11px]">
              <span className="text-muted-foreground">Annual return</span>
              <span className="font-bold text-foreground tabular-nums">{settings.assumedReturnPct.toFixed(1)}%</span>
            </div>
            <Slider
              min={0}
              max={15}
              step={0.5}
              value={settings.assumedReturnPct}
              onValueChange={(v) => patch({ assumedReturnPct: v })}
              ariaLabel="Assumed annual return rate"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between text-[11px]">
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              Approaching at
              <InfoTooltip label="Approaching threshold" ariaLabel="What is the approaching threshold?">
                The return-to-savings ratio at which you enter the “approaching” phase. Default is 0.5× (returns cover half of contributions).
              </InfoTooltip>
            </span>
            <span className="font-bold text-foreground tabular-nums">{settings.approachingThreshold.toFixed(2)}×</span>
          </div>
          <Slider
            min={0.1}
            max={0.9}
            step={0.05}
            value={settings.approachingThreshold}
            onValueChange={(v) => patch({ approachingThreshold: v })}
            ariaLabel="Approaching threshold ratio"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between text-[11px]">
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              Contribution growth
              <InfoTooltip label="Contribution growth" ariaLabel="What is contribution growth?">
                How much your annual savings contributions increase each year (e.g. raise, better savings rate). Higher growth slows the run to escape velocity because the target keeps moving.
              </InfoTooltip>
            </span>
            <span className="font-bold text-foreground tabular-nums">+{settings.contributionGrowthPct.toFixed(1)}%/yr</span>
          </div>
          <Slider
            min={0}
            max={10}
            step={0.5}
            value={settings.contributionGrowthPct}
            onValueChange={(v) => patch({ contributionGrowthPct: v })}
            ariaLabel="Annual contribution growth rate"
          />
        </div>

        <div className="flex items-center justify-between pt-1 border-t border-border/60">
          <span className="text-[10px] text-muted-foreground">Changes apply to the projection only — your metrics stay real.</span>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Signal Card — compact metric tile with tooltip + status
───────────────────────────────────────────────────────────────────────── */

interface SignalCardProps {
  label: string;
  value: string;
  sub?: string;
  achieved: boolean | null; // true = goal met, false = in progress, null = no data
  icon: React.ComponentType<{ className?: string }>;
  tip: React.ReactNode;
}

function SignalCard({ label, value, sub, achieved, icon: Icon, tip }: SignalCardProps) {
  const accent = achieved === true ? 'text-chart-1' : 'text-foreground';
  return (
    <div
      className={cn(
        'relative rounded-xl border p-3 flex flex-col gap-1.5 min-w-0',
        achieved === true ? 'bg-chart-1/5 border-chart-1/30' : 'bg-card border-border'
      )}
    >
      <div className="flex items-center justify-between gap-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <Icon className={cn('w-3.5 h-3.5 shrink-0', achieved === true ? 'text-chart-1' : 'text-muted-foreground')} />
          <span className={cn('text-[10px] font-semibold uppercase tracking-wide truncate', achieved === true ? 'text-chart-1' : 'text-muted-foreground')}>
            {label}
          </span>
        </div>
        <InfoTooltip label={label} ariaLabel={`${label} explanation`}>{tip}</InfoTooltip>
      </div>
      <div className="flex items-baseline gap-1.5 min-w-0">
        <span className={cn('text-lg sm:text-xl font-bold tracking-tight tabular-nums truncate', 'blur-number', accent)}>{value}</span>
        {achieved === true && <CheckCircle2 className="w-3.5 h-3.5 text-chart-1 shrink-0" />}
        {achieved === false && <span className="w-1.5 h-1.5 rounded-full bg-primary/60 shrink-0" />}
      </div>
      {sub && <div className="text-[10px] text-muted-foreground truncate">{sub}</div>}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Milestone Timeline — the run to orbit
───────────────────────────────────────────────────────────────────────── */

function toFutureDateLabel(years: number, months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + years * 12 + months);
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

interface MilestoneTimelineProps {
  ratio: number | null;
  approachingLabel: string; // e.g. "in 4y 2m" or date
  breakEvenLabel: string; // date label or "—"
  approachingReached: boolean;
  breakEvenReached: boolean;
  hasData: boolean;
  phase: EscapePhase;
}

function MilestoneTimeline({
  ratio,
  approachingLabel,
  breakEvenLabel,
  approachingReached,
  breakEvenReached,
  hasData,
  phase,
}: MilestoneTimelineProps) {
  const pct = ratio !== null ? Math.max(0, Math.min(ratio, 1)) * 100 : 0;
  return (
    <div className="w-full">
      <div className="relative h-2 w-full bg-muted/40 rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-700', phase.barColor)}
          style={{ width: `${pct}%` }}
        />
        <div className="absolute inset-0 rounded-full bg-gradient-to-r from-transparent via-white/25 to-transparent" />
      </div>
      {!hasData && (
        <p className="text-[10px] text-muted-foreground mt-2 text-center">
          Connect investment accounts and contribution history to start the countdown.
        </p>
      )}
      {hasData && (
        <div className="grid grid-cols-3 gap-2 mt-2.5">
          <div className="flex flex-col items-center gap-0.5 text-center">
            <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Now</span>
            <span className="text-xs font-bold text-foreground tabular-nums">{ratio !== null ? `${Math.round(ratio * 100)}%` : '—'}</span>
          </div>
          <div className="flex flex-col items-center gap-0.5 text-center">
            <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <Zap className={cn('w-2.5 h-2.5', approachingReached ? 'text-amber-500' : 'text-muted-foreground/50')} />
              Approaching
            </span>
            <span className={cn('text-xs font-bold tabular-nums', approachingReached ? 'text-amber-500' : 'text-muted-foreground')}>
              {approachingReached ? 'Reached' : approachingLabel}
            </span>
          </div>
          <div className="flex flex-col items-center gap-0.5 text-center">
            <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <Rocket className={cn('w-2.5 h-2.5', breakEvenReached ? 'text-chart-1' : 'text-muted-foreground/50')} />
              Orbit
            </span>
            <span className={cn('text-xs font-bold tabular-nums', breakEvenReached ? 'text-chart-1' : 'text-foreground')}>
              {breakEvenReached ? 'Reached' : breakEvenLabel}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Orbit celebration — fires once when crossing into orbit
───────────────────────────────────────────────────────────────────────── */

function useOrbitCelebration(phaseId: string) {
  const [celebrating, setCelebrating] = useState(false);
  const lastPhase = useRef<string | null>(null);
  useEffect(() => {
    const prev = lastPhase.current;
    lastPhase.current = phaseId;
    if (phaseId === 'orbit' && prev !== 'orbit' && prev !== null) {
      setCelebrating(true);
      const t = setTimeout(() => setCelebrating(false), 2600);
      return () => clearTimeout(t);
    }
  }, [phaseId]);
  return celebrating;
}

function OrbitCelebration() {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-chart-1/40 bg-chart-1/10 px-4 py-2.5 animate-in fade-in-0 slide-in-from-top-1 zoom-in-95" role="status">
      <div className="relative shrink-0">
        <Rocket className="w-5 h-5 text-chart-1" />
        <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-chart-1 animate-ping" />
      </div>
      <p className="text-xs font-semibold text-chart-1">
        Escape velocity reached — your capital now out-earns your contributions. Keep it in orbit. 🚀
      </p>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Capital vs Labor Donut
───────────────────────────────────────────────────────────────────────── */

function CapitalLaborDonut({
  capitalReturn,
  annualContributions,
}: {
  capitalReturn: number;
  annualContributions: number;
}) {
  const totalActivity = capitalReturn + annualContributions;
  const capitalPct = totalActivity > 0 ? (capitalReturn / totalActivity) * 100 : 0;
  const laborPct = Math.max(0, 100 - capitalPct);
  const escaped = capitalPct >= 50;

  const pieData = [
    { name: 'Capital Returns', value: Math.max(capitalReturn, 0), pct: capitalPct },
    { name: 'Active Contributions', value: Math.max(annualContributions, 0), pct: laborPct },
  ];

  const COLORS = ['var(--color-chart-2)', 'var(--color-chart-1)'];

  const CustomLabel = ({ cx, cy }: any) => (
    <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fill="var(--color-foreground)">
      <tspan x={cx} dy="-8" fontSize="22" fontWeight="700">
        {Math.round(capitalPct)}%
      </tspan>
      <tspan x={cx} dy="18" fontSize="9" fill="var(--color-muted-foreground)">
        from capital
      </tspan>
    </text>
  );

  return (
    <div className="flex flex-col items-center gap-3 py-1 h-full">
      <div className="h-[150px] w-full max-w-[190px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={70}
              dataKey="value"
              startAngle={90}
              endAngle={-270}
              stroke="var(--color-card)"
              strokeWidth={2}
              labelLine={false}
              label={<CustomLabel />}
            >
              {pieData.map((_, i) => (
                <Cell key={i} fill={COLORS[i]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 w-full">
        <div className="flex items-start gap-2">
          <div className="w-2.5 h-2.5 rounded-sm mt-0.5 shrink-0" style={{ background: 'var(--color-chart-2)' }} />
          <div className="min-w-0">
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Capital</div>
            <div className="text-sm font-bold text-foreground blur-number truncate">{formatCurrency(capitalReturn)}</div>
            <div className="text-[10px] text-muted-foreground">{capitalPct.toFixed(0)}% of generation</div>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <div className="w-2.5 h-2.5 rounded-sm mt-0.5 shrink-0" style={{ background: 'var(--color-chart-1)' }} />
          <div className="min-w-0">
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Contributions</div>
            <div className="text-sm font-bold text-foreground blur-number truncate">{formatCurrency(annualContributions)}</div>
            <div className="text-[10px] text-muted-foreground">{laborPct.toFixed(0)}% of generation</div>
          </div>
        </div>
      </div>
      {escaped && (
        <div className="w-full text-center px-3 py-1.5 rounded-lg bg-chart-1/10 border border-chart-1/25">
          <p className="text-[11px] font-semibold text-chart-1">Capital drives the majority of wealth growth</p>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Monthly Capital Returns vs. Contributions
───────────────────────────────────────────────────────────────────────── */

function MonthlyCapitalLaborChart({
  savingsData,
  portfolioHistory,
  annualReturnRate,
}: {
  savingsData: SavingsDataPoint[];
  portfolioHistory: { date: string; value: number }[];
  annualReturnRate: number;
}) {
  const chartData = useMemo(() => {
    if (!savingsData || savingsData.length === 0) return [];

    // First & last portfolio value per month. The monthly return is based on the
    // START-of-month balance (value held for that month), not the end balance.
    const firstValue = new Map<string, number>();
    const lastValue = new Map<string, number>();
    for (const pt of portfolioHistory) {
      const ym = pt.date.substring(0, 7);
      if (!firstValue.has(ym)) firstValue.set(ym, pt.value);
      lastValue.set(ym, pt.value);
    }

    return savingsData.slice(-12).map((d) => {
      const startVal = firstValue.get(d.yearMonth) ?? lastValue.get(d.yearMonth) ?? 0;
      const monthlyCapitalReturn = startVal * (Math.max(annualReturnRate, 0) / 12);
      const totalContributions =
        d.savings.brokerage + d.savings.retirement + d.savings.hsa + d.savings.savingsAccount + d.savings.cash;
      return {
        month: formatMonthLabel(d.yearMonth),
        capital: Math.round(monthlyCapitalReturn),
        labor: Math.round(Math.max(totalContributions, 0)),
      };
    });
  }, [savingsData, portfolioHistory, annualReturnRate]);

  const maxVal = useMemo(() => Math.max(...chartData.flatMap((d) => [d.capital, d.labor]), 1), [chartData]);
  // Dashed line at the current average contribution level — where returns overtop it is the signal.
  const avgLabor = useMemo(() => {
    if (chartData.length === 0) return 0;
    return Math.round(chartData.reduce((s, d) => s + d.labor, 0) / chartData.length);
  }, [chartData]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const capital = payload.find((p: any) => p.dataKey === 'capital')?.value ?? 0;
    const labor = payload.find((p: any) => p.dataKey === 'labor')?.value ?? 0;
    return (
      <ChartTooltip>
        <TooltipHeader>{label}</TooltipHeader>
        <TooltipRow label="Capital Returns (est.)" value={formatCurrency(capital)} color="var(--color-chart-2)" />
        <TooltipRow label="Active Contributions" value={formatCurrency(labor)} color="var(--color-chart-1)" />
      </ChartTooltip>
    );
  };

  const hasData = chartData.length > 0;

  return (
    <div className="h-[200px] sm:h-[240px] w-full">
      {!hasData ? (
        <div className="h-full flex items-center justify-center">
          <ChartEmptyState variant="nodata" description="Monthly return vs. contribution bars appear once you have both a portfolio and cash-flow history" />
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 4, right: 4, left: -18, bottom: 0 }} barGap={3} barCategoryGap="30%">
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} opacity={0.25} />
            <XAxis
              dataKey="month"
              tickLine={false}
              axisLine={false}
              tick={{ fill: 'var(--color-muted-foreground)', fontSize: 10 }}
              interval="preserveStartEnd"
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fill: 'var(--color-muted-foreground)', fontSize: 10 }}
              tickFormatter={(v) => formatShortCurrency(v)}
              domain={[0, maxVal * 1.15]}
            />
            <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: 'var(--color-muted-foreground)', opacity: 0.06 }} />
            <ReferenceLine
              y={avgLabor}
              stroke="var(--color-chart-1)"
              strokeDasharray="4 4"
              strokeOpacity={0.5}
              label={{ value: 'avg contributions', position: 'insideTopRight', fontSize: 9, fill: 'var(--color-muted-foreground)' }}
            />
            <Bar dataKey="capital" name="Capital Returns" fill="var(--color-chart-2)" radius={[3, 3, 0, 0]} maxBarSize={24} />
            <Bar dataKey="labor" name="Active Contributions" fill="var(--color-chart-1)" radius={[3, 3, 0, 0]} maxBarSize={24} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Projection Chart — the ratio climb to the 1.00x break-even line
───────────────────────────────────────────────────────────────────────── */

function ProjectionChart({
  projection,
  currentContributions,
}: {
  projection: EscapeProjection | null;
  currentContributions: number;
}) {
  const { data, maxYAxis } = useMemo(() => buildProjectionChartData(projection), [projection]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const row = payload[0]?.payload;
    if (!row) return null;
    return (
      <ChartTooltip>
        <TooltipHeader>{label}</TooltipHeader>
        <TooltipRow label="Return-to-Savings" value={`${row.ratio.toFixed(2)}×`} color="var(--color-primary)" />
        <TooltipRow label="Contributions (yr)" value={formatCurrency(row.contributions)} color="var(--color-chart-1)" />
      </ChartTooltip>
    );
  };

  if (!projection || projection.alreadyOrbit || data.length < 2) {
    const inOrbit = projection !== null && projection.alreadyOrbit;
    return (
      <div className="h-[220px] sm:h-[260px] w-full flex items-center justify-center">
        <ChartEmptyState
          variant="nodata"
          description={
            inOrbit
              ? 'Your return-to-savings ratio is already at or above 1.00× — you are in orbit. No forward projection needed.'
              : 'A forward projection appears once you have a portfolio and 12 months of contribution history.'
          }
        />
      </div>
    );
  }

  return (
    <div className="h-[220px] sm:h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id="projGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.25} />
              <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} opacity={0.2} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fill: 'var(--color-muted-foreground)', fontSize: 10 }}
            interval="preserveStartEnd"
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fill: 'var(--color-muted-foreground)', fontSize: 10 }}
            domain={[0, maxYAxis]}
            tickFormatter={(v) => `${v.toFixed(1)}×`}
            width={44}
          />
          <RechartsTooltip content={<CustomTooltip />} cursor={{ stroke: 'var(--color-border)', strokeWidth: 1 }} />
          <ReferenceLine
            y={1}
            stroke="var(--color-chart-1)"
            strokeDasharray="6 4"
            strokeWidth={1.5}
            label={{ value: 'Escape velocity · 1.00×', position: 'insideTopLeft', fontSize: 10, fill: 'var(--color-chart-1)', fontWeight: 700 }}
          />
          <Area type="monotone" dataKey="ratio" stroke="var(--color-primary)" strokeWidth={2} fill="url(#projGrad)" dot={false} activeDot={{ r: 3 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Savings Rate Trend (area) with a configurable target reference line
───────────────────────────────────────────────────────────────────────── */

function SavingsRateTrend({
  savingsData,
  targetPct,
}: {
  savingsData: SavingsDataPoint[];
  targetPct: number;
}) {
  const chartData = useMemo(
    () =>
      savingsData.slice(-12).map((d) => ({
        month: formatMonthLabel(d.yearMonth),
        rate: Math.round(d.savingsRate * 100 * 10) / 10,
      })),
    [savingsData]
  );

  const avgRate =
    chartData.length > 0 ? chartData.reduce((s, d) => s + d.rate, 0) / chartData.length : 0;

  const maxRate = useMemo(() => Math.max(...chartData.map((d) => d.rate), targetPct, 10) * 1.3, [chartData, targetPct]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <ChartTooltip>
        <TooltipHeader>{label}</TooltipHeader>
        <TooltipRow label="Savings Rate" value={`${payload[0]?.value?.toFixed(1)}%`} color="var(--color-primary)" />
      </ChartTooltip>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold text-foreground tabular-nums">{avgRate.toFixed(1)}%</span>
        <span className="text-xs text-muted-foreground">
          12-mo avg · <span className="text-muted-foreground/70">target {targetPct.toFixed(0)}%</span>
        </span>
      </div>
      <div className="h-[110px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 4, right: 8, left: -22, bottom: 0 }}>
            <defs>
              <linearGradient id="srGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.2} />
                <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} opacity={0.2} />
            <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: 'var(--color-muted-foreground)', fontSize: 9 }} interval="preserveStartEnd" />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fill: 'var(--color-muted-foreground)', fontSize: 9 }}
              domain={[0, maxRate]}
              tickFormatter={(v) => `${Math.round(v)}%`}
              width={36}
            />
            <RechartsTooltip content={<CustomTooltip />} cursor={{ stroke: 'var(--color-border)', strokeWidth: 1 }} />
            <ReferenceLine
              y={targetPct}
              stroke="var(--color-muted-foreground)"
              strokeDasharray="4 4"
              strokeOpacity={0.55}
              label={{ value: `target ${targetPct.toFixed(0)}%`, position: 'insideTopRight', fontSize: 9, fill: 'var(--color-muted-foreground)' }}
            />
            <Area type="monotone" dataKey="rate" stroke="var(--color-primary)" strokeWidth={1.5} fill="url(#srGrad)" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Main Component
───────────────────────────────────────────────────────────────────────── */

export function EscapeVelocityTab({
  totalPortfolioValue,
  totalAnnualIncome,
  portfolioHistory = [],
}: EscapeVelocityTabProps) {
  const { privacyMode } = usePrivacyMode();
  const { settings } = useEscapeVelocitySettings();

  // Fetch savings rate data (12 months)
  const { data: savingsRateData = [], isLoading: srLoading } = useQuery<SavingsDataPoint[]>({
    queryKey: ['cash-flow-savings-rate-ev'],
    queryFn: async () => {
      const res = await fetch('/api/cash-flow/savings-rate?months=12', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch savings rate data');
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  // Fetch the default FIRE plan to get salary (labor-income fallback)
  const { data: firePlans = [] } = useQuery<any[]>({
    queryKey: ['retirement-plans-ev'],
    queryFn: async () => {
      const res = await fetch('/api/retirement/plans', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch plans');
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const defaultPlan = useMemo(
    () => (firePlans.find((p) => p.isDefault) as any) || firePlans[0] || null,
    [firePlans]
  );

  /* ── Return window & rate ───────────────────────────────────────── */
  const twrWindowMonths = useMemo(() => {
    if (!portfolioHistory || portfolioHistory.length < 2) return 0;
    const first = new Date(portfolioHistory[0].date);
    const last = new Date(portfolioHistory[portfolioHistory.length - 1].date);
    if (isNaN(first.getTime()) || isNaN(last.getTime())) return 0;
    const elapsedMonths = (last.getFullYear() - first.getFullYear()) * 12 + (last.getMonth() - first.getMonth());
    return Math.max(elapsedMonths, 1);
  }, [portfolioHistory]);

  // Trailing TWR annualized geometrically over the window it actually covers.
  const trailingTwrAnnualized = useMemo(() => {
    if (!portfolioHistory || portfolioHistory.length === 0) return null;
    const latestTwr = (portfolioHistory[portfolioHistory.length - 1] as any)?.twr;
    if (typeof latestTwr !== 'number' || isNaN(latestTwr)) return null;
    const windowMonths = twrWindowMonths || 1;
    if (windowMonths < 6) return null; // too noisy to annualize
    return annualizeReturn(latestTwr, windowMonths) * 100;
  }, [portfolioHistory, twrWindowMonths]);

  const rateIsTwr = settings.returnSource === 'auto' && trailingTwrAnnualized !== null;
  const ratePct = settings.returnSource === 'auto'
    ? (trailingTwrAnnualized ?? 7)
    : settings.assumedReturnPct;
  const annualReturnRate = ratePct / 100;

  /* ── Capital & labor ────────────────────────────────────────────── */
  const estimatedAnnualCapitalReturn = totalPortfolioValue * Math.max(annualReturnRate, 0);
  const capitalReturn = Math.max(estimatedAnnualCapitalReturn, totalAnnualIncome ?? 0);

  const annualContributions = useMemo(() => {
    if (!savingsRateData || savingsRateData.length === 0) return 0;
    return savingsRateData.reduce((sum, d) => {
      const s = d.savings;
      return sum + s.brokerage + s.retirement + s.hsa + s.savingsAccount + s.cash;
    }, 0);
  }, [savingsRateData]);

  const annualLaborIncome = useMemo(() => {
    if (!savingsRateData || savingsRateData.length === 0) {
      const salary = parseFloat((defaultPlan as any)?.primarySalary ?? '0') || 0;
      const spouseSalary = parseFloat((defaultPlan as any)?.spouseSalary ?? '0') || 0;
      return salary + spouseSalary;
    }
    return savingsRateData.reduce((sum, d) => sum + d.income, 0);
  }, [savingsRateData, defaultPlan]);

  const avgSavingsRate = useMemo(() => {
    if (!savingsRateData || savingsRateData.length === 0) return null;
    const valid = savingsRateData.filter((d) => d.income > 0);
    if (valid.length === 0) return null;
    return (valid.reduce((s, d) => s + d.savingsRate, 0) / valid.length) * 100;
  }, [savingsRateData]);

  /* ── The signal ─────────────────────────────────────────────────── */
  const returnToSavingsRatio = annualContributions > 0 ? capitalReturn / annualContributions : null;
  const capitalToLaborRatio = annualLaborIncome > 0 ? capitalReturn / annualLaborIncome : null;

  const hasData = returnToSavingsRatio !== null && totalPortfolioValue > 0;

  const phaseId = useMemo((): 'build-up' | 'approaching' | 'orbit' => {
    if (returnToSavingsRatio !== null && returnToSavingsRatio >= 1 && annualContributions > 0) return 'orbit';
    if (returnToSavingsRatio !== null && returnToSavingsRatio >= settings.approachingThreshold) return 'approaching';
    return 'build-up';
  }, [returnToSavingsRatio, annualContributions, settings.approachingThreshold]);
  const phase = PHASES[phaseId];

  /* ── Projection ─────────────────────────────────────────────────── */
  const projection = useMemo(
    () =>
      hasData
        ? projectEscapeVelocity(
            capitalReturn,
            annualContributions,
            ratePct,
            settings.approachingThreshold,
            settings.contributionGrowthPct
          )
        : null,
    [hasData, capitalReturn, annualContributions, ratePct, settings.approachingThreshold, settings.contributionGrowthPct]
  );

  // Countdown labels for the milestone timeline.
  const approachingLabel = projection
    ? projection.approaching.monthIndex !== null
      ? toFutureDateLabel(projection.approaching.years, projection.approaching.months)
      : '—'
    : '—';
  const breakEvenLabel = projection
    ? projection.breakEven.monthIndex !== null
      ? toFutureDateLabel(projection.breakEven.years, projection.breakEven.months)
      : '40y+'
    : '—';

  const celebrating = useOrbitCelebration(phaseId);

  /* ── Card collapse states ───────────────────────────────────────── */
  const [isCollapsedProjection, setIsCollapsedProjection] = useCardCollapsed('ev-projection');
  const [isCollapsedCapital, setIsCollapsedCapital] = useCardCollapsed('ev-capital-labor');
  const [isCollapsedMonthly, setIsCollapsedMonthly] = useCardCollapsed('ev-monthly-chart');
  const [isCollapsedSavings, setIsCollapsedSavings] = useCardCollapsed('ev-savings-rate');

  if (srLoading) {
    return <LoadingSpinner category="default" className="min-h-[300px]" />;
  }

  // Status line under the hero ring.
  const statusLine = (() => {
    if (!hasData) {
      return <span className="text-muted-foreground">Link investment accounts and contribution history to chart your path to escape velocity.</span>;
    }
    const ratio = returnToSavingsRatio as number;
    if (ratio >= 1) {
      return (
        <span className={phase.textClass}>
          Portfolio returns run <span className="font-bold">{Math.max(0, (ratio - 1) * 100).toFixed(0)}%</span> above your contributions — capital has taken the lead 🚀
        </span>
      );
    }
    return (
      <span className="text-muted-foreground">
        Your portfolio covers <span className="font-bold text-foreground">{(ratio * 100).toFixed(0)}%</span> of this year&apos;s contributions — <span className="font-bold text-foreground">{((1 - ratio) * 100).toFixed(0)}%</span> to go. Keep the momentum.
      </span>
    );
  })();

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Orbit celebration (fires once on crossing) */}
      {celebrating && <OrbitCelebration />}

      {/* ── Hero: progress ring + status + controls ── */}
      <section className="relative bg-card border border-border rounded-2xl shadow-sm p-4 sm:p-6" style={{ overflow: 'visible' }}>
        <div className="flex items-center justify-between mb-4 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Rocket className="w-4 h-4 text-primary shrink-0" />
            <h3 className="font-bold text-sm sm:text-base text-foreground truncate">Path to Escape Velocity</h3>
            <InfoTooltip label="What is escape velocity?" ariaLabel="What is escape velocity?">
              Escape velocity is reached when your <strong>portfolio&apos;s annual return</strong> exceeds the <strong>new money you save each year</strong>. Beyond that point, your wealth compounds faster than your labor, and savings become optional. The ring shows annual capital returns as a fraction of annual contributions (100% = escape velocity).
            </InfoTooltip>
          </div>
          <EscapeVelocitySettingsMenu />
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-6 sm:gap-8">
          <div className="sm:order-1 order-1 flex items-center justify-center">
            <ProgressRing ratio={returnToSavingsRatio} phase={phase} hasData={hasData} />
          </div>
          <div className="sm:order-2 order-2 flex-1 w-full min-w-0 space-y-4">
            <div>
              <div className="flex items-center gap-2">
                <phase.icon className={cn('w-4 h-4', phase.textClass)} />
                <span className={cn('font-bold text-base sm:text-lg', phase.textClass)}>{phase.title}</span>
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed mt-1 max-w-prose">{phase.desc}</p>
            </div>
            <div className="max-w-md">
              <MilestoneTimeline
                ratio={returnToSavingsRatio}
                approachingLabel={approachingLabel}
                breakEvenLabel={breakEvenLabel}
                approachingReached={phaseId !== 'build-up'}
                breakEvenReached={phaseId === 'orbit'}
                hasData={hasData}
                phase={phase}
              />
            </div>
            <div className="pt-1 text-xs leading-relaxed border-t border-border/50">{statusLine}</div>
          </div>
        </div>
      </section>

      {/* ── Signal cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <SignalCard
          label="Annual Capital Return"
          value={hasData ? formatCurrency(capitalReturn) : '—'}
          sub={`${ratePct.toFixed(1)}%/yr ${rateIsTwr ? '· annualized TWR' : '· assumed'}`}
          achieved={null}
          icon={TrendingUp}
          tip={<span>Estimated annual income your portfolio would generate at a {ratePct.toFixed(1)}% return. {rateIsTwr ? 'Rate is annualized from your trailing time-weighted return.' : 'Rate is an assumption you can adjust in ⚙ settings.'}</span>}
        />
        <SignalCard
          label="Return-to-Savings"
          value={returnToSavingsRatio !== null ? `${returnToSavingsRatio.toFixed(2)}×` : '—'}
          sub={returnToSavingsRatio !== null ? (returnToSavingsRatio >= 1 ? 'Returns exceed contributions' : `Need 1.00× to reach orbit`) : 'Needs contribution data'}
          achieved={returnToSavingsRatio === null ? null : returnToSavingsRatio >= 1}
          icon={Zap}
          tip={<span>Annual capital returns ÷ annual contributions. The core escape-velocity signal — hit 1.00× and you&apos;re in orbit.</span>}
        />
        <SignalCard
          label="Capital vs. Labor Income"
          value={capitalToLaborRatio !== null ? `${(capitalToLaborRatio * 100).toFixed(0)}%` : '—'}
          sub={capitalToLaborRatio !== null ? `Earns ${Math.round((capitalToLaborRatio * 100) * 100) / 100}% of your salary` : 'Needs income data'}
          achieved={capitalToLaborRatio === null ? null : capitalToLaborRatio >= 1}
          icon={ArrowUpRight}
          tip={<span>How much your portfolio earns relative to your labor income. At 100%, your investments out-earn your job.</span>}
        />
        <SignalCard
          label="Savings Rate"
          value={avgSavingsRate !== null ? `${avgSavingsRate.toFixed(1)}%` : '—'}
          sub={`of income · 12-mo`}
          achieved={avgSavingsRate === null ? null : avgSavingsRate >= settings.savingsRateTargetPct}
          icon={PiggyBank}
          tip={<span>Your average savings rate over the last 12 months. A higher rate accelerates accumulation while you&apos;re still in build-up.</span>}
        />
      </div>

      {/* ── Projection ── */}
      <div className="bg-card border border-border rounded-2xl shadow-sm" style={{ overflow: 'visible' }}>
        <CollapsibleCardHeader
          isCollapsed={isCollapsedProjection}
          onToggle={setIsCollapsedProjection}
          title={
            <div className="flex items-center gap-2">
              <Orbit className="w-4 h-4 text-primary shrink-0" />
              <span>Time to Escape Velocity</span>
              <InfoTooltip label="How the projection works" ariaLabel="How the projection works?">
                Projects your return-to-savings ratio forward, assuming returns compound at your selected rate and contributions grow by your assumed growth-rate. It stops when the ratio crosses 1.00×. Estimates only — market returns and your behavior vary.
              </InfoTooltip>
            </div>
          }
        />
        {!isCollapsedProjection && (
          <div className="p-4 sm:p-5 border-t border-border/60 space-y-3">
            {!projection && (
              <div className="text-xs text-muted-foreground">
                The projection needs both a linked portfolio and 12 months of contribution history.
              </div>
            )}
            {projection && !projection.alreadyOrbit && (
              <div className="flex items-center flex-wrap gap-x-4 gap-y-1 text-xs">
                <span className="text-muted-foreground">
                  Reaches orbit (~1.00×) around
                  <span className="font-bold text-chart-1 ml-1">{breakEvenLabel === '40y+' ? 'beyond 40y' : ` ${breakEvenLabel}`}</span>
                </span>
                <span className="text-muted-foreground">
                  = <span className="font-bold text-foreground">{formatYearsMonths(projection.breakEven.years, projection.breakEven.months)}</span> from today
                </span>
              </div>
            )}
            <ProjectionChart projection={projection} currentContributions={annualContributions} />
          </div>
        )}
      </div>

      {/* ── Capital vs Labor + Monthly (2-up on desktop) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-6 items-start">
        <div className="bg-card border border-border rounded-2xl shadow-sm" style={{ overflow: 'visible' }}>
          <CollapsibleCardHeader
            isCollapsed={isCollapsedCapital}
            onToggle={setIsCollapsedCapital}
            title={
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-primary shrink-0" />
                <span>Capital vs. Labor: Wealth Generation</span>
                <InfoTooltip label="Capital vs. Labor" ariaLabel="Capital vs. Labor explanation">
                  The share of your annual wealth generation coming from capital compounding (returns) versus active contributions (labor). Escape = when the capital slice keeps growing and covers your saving.
                </InfoTooltip>
              </div>
            }
          />
          {!isCollapsedCapital && (
            <div className="p-4 sm:p-5 border-t border-border/60">
              <CapitalLaborDonut capitalReturn={capitalReturn} annualContributions={annualContributions} />
            </div>
          )}
        </div>

        <div className="bg-card border border-border rounded-2xl shadow-sm" style={{ overflow: 'visible' }}>
          <CollapsibleCardHeader
            isCollapsed={isCollapsedMonthly}
            onToggle={setIsCollapsedMonthly}
            title={
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary shrink-0" />
                <span>Monthly Returns vs. Contributions</span>
              </div>
            }
          />
          {!isCollapsedMonthly && (
            <div className="p-4 sm:p-5 border-t border-border/60 space-y-3">
              <ExpandableHelp>
                <p>
                  Bars compare your <span className="font-semibold text-foreground">estimated monthly portfolio return</span> (start-of-month balance × your rate, divided by 12) against <span className="font-semibold text-foreground">actual contribution deposits</span>. When capital bars start topping the contribution bars, escape velocity is close.
                </p>
              </ExpandableHelp>
              <MonthlyCapitalLaborChart
                savingsData={savingsRateData}
                portfolioHistory={portfolioHistory}
                annualReturnRate={Math.max(annualReturnRate, 0)}
              />
            </div>
          )}
        </div>
      </div>

      {/* ── Savings Rate Trend ── */}
      {savingsRateData.length > 0 && (
        <div className="bg-card border border-border rounded-2xl shadow-sm" style={{ overflow: 'visible' }}>
          <CollapsibleCardHeader
            isCollapsed={isCollapsedSavings}
            onToggle={setIsCollapsedSavings}
            title={
              <div className="flex items-center gap-2">
                <PiggyBank className="w-4 h-4 text-primary shrink-0" />
                <span>Savings Rate Trend</span>
                <InfoTooltip label="Savings rate" ariaLabel="Savings rate explanation">
                  The share of income you save each month. Higher rates accelerate accumulation during build-up; past escape velocity they matter less since capital does the compounding.
                </InfoTooltip>
              </div>
            }
          />
          {!isCollapsedSavings && (
            <div className="p-4 sm:p-5 border-t border-border/60 space-y-3">
              <SavingsRateTrend savingsData={savingsRateData} targetPct={settings.savingsRateTargetPct} />
            </div>
          )}
        </div>
      )}

      {/* Screen-reader summary for screen-reader users only */}
      {!privacyMode && (
        <div className="sr-only" aria-live="polite">
          {hasData
            ? `Escape velocity progress is ${Math.round((returnToSavingsRatio as number) * 100)} percent. ${projection && !projection.alreadyOrbit ? `Projected to reach escape velocity in about ${formatYearsMonths(projection.breakEven.years, projection.breakEven.months)}.` : ''}`
            : 'No data yet. Connect investment accounts to start.'}
        </div>
      )}
    </div>
  );
}
