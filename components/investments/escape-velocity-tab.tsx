'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatCurrency } from '@/lib/utils/format';
import { cn } from '@/lib/utils';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  Legend,
} from 'recharts';
import { ChartTooltip, TooltipHeader, TooltipRow } from '@/components/charts/chart-tooltip';
import { CollapsibleCardHeader } from '@/components/ui/collapsible-card-header';
import { useCardCollapsed } from '@/lib/hooks/use-card-collapsed';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import {
  TrendingUp,
  Zap,
  ArrowUpRight,
  Layers,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import type { QuoteData } from '@/app/api/investments/quotes/route';

/* ─────────────────────────────────────────────────────────────────────────
   Types & Props
───────────────────────────────────────────────────────────────────────── */

interface EscapeVelocityTabProps {
  totalPortfolioValue: number;
  totalAnnualIncome?: number; // dividend / interest income from investments
  portfolioHistory?: { date: string; value: number; twr?: number }[];
  quotes?: QuoteData[];
}

/* ─────────────────────────────────────────────────────────────────────────
   Helpers
───────────────────────────────────────────────────────────────────────── */

function formatShortCurrency(v: number) {
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(0)}k`;
  return `$${Math.round(v)}`;
}

function formatMonthLabel(ym: string) {
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) return ym;
  return new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'short', year: '2-digit' });
}

/* ─────────────────────────────────────────────────────────────────────────
   Sub-component: Signal Stat Card
───────────────────────────────────────────────────────────────────────── */

interface SignalCardProps {
  label: string;
  value: string;
  sub?: string;
  achieved: boolean | null; // null = neutral / not enough data
  icon: React.ComponentType<{ className?: string }>;
}

function SignalCard({ label, value, sub, achieved, icon: Icon }: SignalCardProps) {
  return (
    <div className={cn(
      'rounded-xl border p-4 flex flex-col gap-2',
      achieved === true
        ? 'bg-chart-1/5 border-chart-1/25'
        : achieved === false
        ? 'bg-card border-border'
        : 'bg-card border-border'
    )}>
      <div className="flex items-center justify-between gap-2">
        <div className={cn(
          'w-7 h-7 rounded-full flex items-center justify-center shrink-0',
          achieved === true ? 'bg-chart-1/20 text-chart-1' : 'bg-muted/50 text-muted-foreground'
        )}>
          <Icon className="w-4 h-4" />
        </div>
        {achieved === true && (
          <CheckCircle2 className="w-4 h-4 text-chart-1 shrink-0" />
        )}
        {achieved === false && (
          <Clock className="w-4 h-4 text-muted-foreground/50 shrink-0" />
        )}
      </div>
      <div>
        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">{label}</div>
        <div className={cn(
          'text-xl font-bold tracking-tight blur-number',
          achieved === true ? 'text-chart-1' : 'text-foreground'
        )}>{value}</div>
        {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Sub-component: Capital vs Labor Donut
───────────────────────────────────────────────────────────────────────── */

function CapitalLaborDonut({
  capitalReturn,
  annualContributions,
}: {
  capitalReturn: number;
  annualContributions: number;
}) {
  const totalActivity = capitalReturn + annualContributions;
  const capitalPct = totalActivity > 0 ? Math.round((capitalReturn / totalActivity) * 100) : 0;
  const laborPct = 100 - capitalPct;
  const escaped = capitalPct >= 50;

  const pieData = [
    { name: 'Capital Returns', value: Math.max(capitalReturn, 0), pct: capitalPct },
    { name: 'Active Contributions', value: Math.max(annualContributions, 0), pct: laborPct },
  ];

  const COLORS = ['var(--color-chart-2)', 'var(--color-chart-1)'];

  const CustomLabel = ({ cx, cy }: any) => (
    <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fill="var(--color-foreground)">
      <tspan x={cx} dy="-8" fontSize="22" fontWeight="700" className="blur-number">
        {capitalPct}%
      </tspan>
      <tspan x={cx} dy="20" fontSize="10" fill="var(--color-muted-foreground)">
        from capital
      </tspan>
    </text>
  );

  return (
    <div className="flex flex-col items-center gap-4 py-2">
      <div className="h-[180px] w-full max-w-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              innerRadius={58}
              outerRadius={82}
              dataKey="value"
              startAngle={90}
              endAngle={-270}
              labelLine={false}
              label={<CustomLabel />}
            >
              {pieData.map((_, i) => (
                <Cell key={i} fill={COLORS[i]} strokeWidth={0} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-2 gap-3 w-full">
        <div className="flex items-start gap-2">
          <div className="w-2.5 h-2.5 rounded-sm mt-0.5 shrink-0" style={{ background: 'var(--color-chart-2)' }} />
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Capital</div>
            <div className="text-sm font-bold text-foreground blur-number">{formatCurrency(capitalReturn)}</div>
            <div className="text-[10px] text-muted-foreground">{capitalPct}% of activity</div>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <div className="w-2.5 h-2.5 rounded-sm mt-0.5 shrink-0" style={{ background: 'var(--color-chart-1)' }} />
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Labor</div>
            <div className="text-sm font-bold text-foreground blur-number">{formatCurrency(annualContributions)}</div>
            <div className="text-[10px] text-muted-foreground">{laborPct}% of activity</div>
          </div>
        </div>
      </div>
      {escaped && (
        <div className="w-full text-center px-3 py-2 rounded-lg bg-chart-1/10 border border-chart-1/25">
          <p className="text-xs font-semibold text-chart-1">
            Capital now drives more than half your annual wealth growth
          </p>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Sub-component: Monthly Returns vs Contributions Bar Chart
───────────────────────────────────────────────────────────────────────── */

function MonthlyCapitalLaborChart({
  savingsData,
  portfolioHistory,
}: {
  savingsData: Array<{ yearMonth: string; income: number; savings: { brokerage: number; retirement: number; hsa: number; savingsAccount: number; cash: number } }>;
  portfolioHistory: { date: string; value: number }[];
}) {
  const chartData = useMemo(() => {
    if (!savingsData || savingsData.length === 0) return [];

    // Build a map of portfolio value by year-month from history
    const portfolioByMonth = new Map<string, number>();
    for (const pt of portfolioHistory) {
      const ym = pt.date.substring(0, 7);
      portfolioByMonth.set(ym, pt.value); // last value for the month wins
    }

    return savingsData.slice(-12).map((d) => {
      // Estimate monthly capital return: portfolio value × assumed monthly rate
      // We derive the month-start portfolio value from the prior month snapshot
      const portfolioVal = portfolioByMonth.get(d.yearMonth) ?? 0;
      const monthlyCapitalReturn = portfolioVal * (0.07 / 12); // 7% annual / 12

      const totalContributions =
        d.savings.brokerage + d.savings.retirement + d.savings.hsa + d.savings.savingsAccount + d.savings.cash;

      return {
        month: formatMonthLabel(d.yearMonth),
        capital: Math.round(monthlyCapitalReturn),
        labor: Math.round(Math.max(totalContributions, 0)),
      };
    });
  }, [savingsData, portfolioHistory]);

  const maxVal = useMemo(() => Math.max(...chartData.flatMap((d) => [d.capital, d.labor]), 1), [chartData]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const capital = payload.find((p: any) => p.dataKey === 'capital')?.value ?? 0;
    const labor = payload.find((p: any) => p.dataKey === 'labor')?.value ?? 0;
    return (
      <ChartTooltip>
        <TooltipHeader>{label}</TooltipHeader>
        <TooltipRow label="Capital Returns" value={formatCurrency(capital)} color="var(--color-chart-2)" />
        <TooltipRow label="Active Contributions" value={formatCurrency(labor)} color="var(--color-chart-1)" />
      </ChartTooltip>
    );
  };

  if (chartData.length === 0) return (
    <div className="h-[180px] flex items-center justify-center text-xs text-muted-foreground">
      No cash flow data available
    </div>
  );

  return (
    <div className="h-[200px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 4, right: 4, left: -22, bottom: 0 }} barGap={3} barCategoryGap="30%">
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} opacity={0.25} />
          <XAxis
            dataKey="month"
            tickLine={false}
            axisLine={false}
            tick={{ fill: 'var(--color-muted-foreground)', fontSize: 10 }}
            interval={1}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fill: 'var(--color-muted-foreground)', fontSize: 10 }}
            tickFormatter={(v) => formatShortCurrency(v)}
            domain={[0, maxVal * 1.15]}
          />
          <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: 'var(--color-muted-foreground)', opacity: 0.06 }} />
          <Bar dataKey="capital" name="Capital Returns" fill="var(--color-chart-2)" radius={[3, 3, 0, 0]} maxBarSize={24} />
          <Bar dataKey="labor" name="Active Contributions" fill="var(--color-chart-1)" radius={[3, 3, 0, 0]} maxBarSize={24} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Sub-component: Savings Rate Trend (area sparkline)
───────────────────────────────────────────────────────────────────────── */

function SavingsRateTrend({
  savingsData,
}: {
  savingsData: Array<{ yearMonth: string; savingsRate: number }>;
}) {
  const chartData = useMemo(() =>
    savingsData.slice(-12).map((d) => ({
      month: formatMonthLabel(d.yearMonth),
      rate: Math.round(d.savingsRate * 100 * 10) / 10, // to percentage
    })),
    [savingsData]
  );

  const avgRate = chartData.length > 0
    ? chartData.reduce((s, d) => s + d.rate, 0) / chartData.length
    : 0;

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
        <span className="text-2xl font-bold text-foreground blur-number tabular-nums">{avgRate.toFixed(1)}%</span>
        <span className="text-xs text-muted-foreground">12-month average</span>
      </div>
      <div className="h-[100px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -30, bottom: 0 }}>
            <defs>
              <linearGradient id="srGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.2} />
                <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} opacity={0.2} />
            <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: 'var(--color-muted-foreground)', fontSize: 9 }} interval={2} />
            <YAxis tickLine={false} axisLine={false} tick={{ fill: 'var(--color-muted-foreground)', fontSize: 9 }} tickFormatter={(v) => `${v}%`} />
            <RechartsTooltip content={<CustomTooltip />} cursor={{ stroke: 'var(--color-border)', strokeWidth: 1 }} />
            <Area type="monotone" dataKey="rate" stroke="var(--color-primary)" strokeWidth={1.5} fill="url(#srGrad)" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Phase Banner
───────────────────────────────────────────────────────────────────────── */

function PhaseBanner({ phase }: { phase: 'build-up' | 'approaching' | 'orbit' }) {
  const config = {
    'build-up': {
      title: 'Build-Up Phase',
      desc: 'Active saving and contributions are the primary engine of your wealth growth. As your portfolio compounds, capital will progressively share the load.',
      bar: 15,
      color: 'bg-muted/40 border-border',
      barColor: 'bg-primary/60',
      labelColor: 'text-foreground',
    },
    'approaching': {
      title: 'Approaching Escape Velocity',
      desc: "Capital returns are closing in on your annual contributions. The compounding effect is becoming visible — you're nearing the tipping point.",
      bar: 60,
      color: 'bg-primary/5 border-primary/20',
      barColor: 'bg-primary',
      labelColor: 'text-primary',
    },
    'orbit': {
      title: 'Escape Velocity Reached',
      desc: 'Your portfolio generates more each year than you contribute through work. Compounding now runs faster than your labor — wealth grows autonomously.',
      bar: 100,
      color: 'bg-chart-1/5 border-chart-1/25',
      barColor: 'bg-chart-1',
      labelColor: 'text-chart-1',
    },
  }[phase];

  return (
    <div className={cn('rounded-xl border p-4 sm:p-5 space-y-3', config.color)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className={cn('text-sm font-bold', config.labelColor)}>{config.title}</div>
          <p className="text-xs text-muted-foreground leading-relaxed mt-1 max-w-prose">{config.desc}</p>
        </div>
        {phase === 'orbit' && <CheckCircle2 className="w-5 h-5 text-chart-1 shrink-0 mt-0.5" />}
        {phase === 'approaching' && <Zap className="w-5 h-5 text-primary shrink-0 mt-0.5" />}
        {phase === 'build-up' && <TrendingUp className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />}
      </div>
      <div className="space-y-1">
        <div className="h-1.5 w-full bg-muted/40 rounded-full overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all duration-700', config.barColor)}
            style={{ width: `${config.bar}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground font-medium">
          <span>Build-Up</span>
          <span>Tipping Point</span>
          <span>Orbit</span>
        </div>
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

  // Fetch savings rate data (12 months)
  const { data: savingsRateData = [], isLoading: srLoading } = useQuery<Array<{
    yearMonth: string;
    income: number;
    expenses: number;
    netCashFlow: number;
    savingsRate: number;
    savings: { retirement: number; hsa: number; brokerage: number; savingsAccount: number; cash: number };
  }>>({
    queryKey: ['cash-flow-savings-rate-ev'],
    queryFn: async () => {
      const res = await fetch('/api/cash-flow/savings-rate?months=12', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch savings rate data');
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  // Fetch the default FIRE plan to get salary
  const { data: firePlans = [], isLoading: firePlansLoading } = useQuery<any[]>({
    queryKey: ['retirement-plans-ev'],
    queryFn: async () => {
      const res = await fetch('/api/retirement/plans', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch plans');
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const defaultPlan = useMemo(
    () => firePlans.find((p) => p.isDefault) || firePlans[0] || null,
    [firePlans]
  );

  // ── Derived metrics ──────────────────────────────────────────────────

  // Annualized portfolio return: use TWR from history if available, else assume 7%
  const latestTwr = useMemo(() => {
    if (!portfolioHistory || portfolioHistory.length === 0) return null;
    const last = portfolioHistory[portfolioHistory.length - 1] as any;
    return typeof last?.twr === 'number' ? last.twr : null;
  }, [portfolioHistory]);

  // Estimate annual return using TWR or fallback to 7%
  const annualReturnRate = latestTwr !== null ? latestTwr / 100 : 0.07;
  const estimatedAnnualCapitalReturn = totalPortfolioValue * Math.max(annualReturnRate, 0);

  // Use dividends/interest as a floor if higher
  const capitalReturn = Math.max(estimatedAnnualCapitalReturn, totalAnnualIncome ?? 0);

  // Annual savings contributions: sum across last 12 months
  const annualContributions = useMemo(() => {
    if (!savingsRateData || savingsRateData.length === 0) return 0;
    return savingsRateData.reduce((sum, d) => {
      const s = d.savings;
      return sum + s.brokerage + s.retirement + s.hsa + s.savingsAccount + s.cash;
    }, 0);
  }, [savingsRateData]);

  // Annual labor income from savings rate API (most recent 12 months average)
  const annualLaborIncome = useMemo(() => {
    if (!savingsRateData || savingsRateData.length === 0) {
      // Fall back to FIRE plan salary
      const salary = parseFloat(defaultPlan?.primarySalary ?? '0') || 0;
      const spouseSalary = parseFloat(defaultPlan?.spouseSalary ?? '0') || 0;
      return salary + spouseSalary;
    }
    return savingsRateData.reduce((sum, d) => sum + d.income, 0);
  }, [savingsRateData, defaultPlan]);

  // Average savings rate
  const avgSavingsRate = useMemo(() => {
    if (!savingsRateData || savingsRateData.length === 0) return null;
    const valid = savingsRateData.filter((d) => d.income > 0);
    if (valid.length === 0) return null;
    return valid.reduce((s, d) => s + d.savingsRate, 0) / valid.length;
  }, [savingsRateData]);

  // Capital-to-Labor ratio
  const capitalToLaborRatio = annualLaborIncome > 0 ? capitalReturn / annualLaborIncome : null;

  // Return-to-Savings ratio (the escape velocity signal)
  const returnToSavingsRatio = annualContributions > 0 ? capitalReturn / annualContributions : null;

  // Determine phase
  const phase: 'build-up' | 'approaching' | 'orbit' = useMemo(() => {
    if (returnToSavingsRatio !== null && returnToSavingsRatio >= 1) return 'orbit';
    const totalWealth = capitalReturn + annualContributions;
    const capitalShare = totalWealth > 0 ? capitalReturn / totalWealth : 0;
    if (capitalShare >= 0.35) return 'approaching';
    return 'build-up';
  }, [returnToSavingsRatio, capitalReturn, annualContributions]);

  const isLoading = srLoading || firePlansLoading;

  const [isCollapsedCapital, setIsCollapsedCapital] = useCardCollapsed('ev-capital-labor');
  const [isCollapsedMonthly, setIsCollapsedMonthly] = useCardCollapsed('ev-monthly-chart');
  const [isCollapsedSavings, setIsCollapsedSavings] = useCardCollapsed('ev-savings-rate');

  if (isLoading) {
    return <LoadingSpinner category="default" className="min-h-[300px]" />;
  }

  return (
    <div className="space-y-5 sm:space-y-6">

      {/* ── Phase Status Banner ── */}
      <PhaseBanner phase={phase} />

      {/* ── Key Signal Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <SignalCard
          label="Annual Capital Return"
          value={formatCurrency(capitalReturn)}
          sub={latestTwr !== null ? `${latestTwr.toFixed(1)}% TWR` : `~${(annualReturnRate * 100).toFixed(0)}% est.`}
          achieved={capitalReturn > 0 ? null : null}
          icon={TrendingUp}
        />
        <SignalCard
          label="Return-to-Savings Ratio"
          value={returnToSavingsRatio !== null ? `${returnToSavingsRatio.toFixed(2)}x` : '—'}
          sub={returnToSavingsRatio !== null
            ? returnToSavingsRatio >= 1
              ? 'Returns exceed contributions'
              : 'Need 1.00x for escape velocity'
            : 'Contribution data unavailable'}
          achieved={returnToSavingsRatio !== null ? returnToSavingsRatio >= 1 : null}
          icon={Zap}
        />
        <SignalCard
          label="Capital vs. Labor Income"
          value={capitalToLaborRatio !== null ? `${(capitalToLaborRatio * 100).toFixed(0)}%` : '—'}
          sub={capitalToLaborRatio !== null
            ? `Portfolio earns ${(capitalToLaborRatio * 100).toFixed(0)}% of your labor income`
            : 'Income data unavailable'}
          achieved={capitalToLaborRatio !== null ? capitalToLaborRatio >= 1 : null}
          icon={ArrowUpRight}
        />
        <SignalCard
          label="Savings Rate"
          value={avgSavingsRate !== null ? `${(avgSavingsRate * 100).toFixed(1)}%` : '—'}
          sub="12-month average"
          achieved={avgSavingsRate !== null ? avgSavingsRate >= 0.2 : null}
          icon={Layers}
        />
      </div>

      {/* ── Capital vs Labor Split ── */}
      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <CollapsibleCardHeader
          isCollapsed={isCollapsedCapital}
          onToggle={setIsCollapsedCapital}
          title={
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-primary shrink-0" />
              <span>Capital vs. Labor: Annual Wealth Generation</span>
            </div>
          }
        />
        {!isCollapsedCapital && (
          <div className="p-4 sm:p-5 border-t border-border/60">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-center">
              <div>
                <CapitalLaborDonut
                  capitalReturn={capitalReturn}
                  annualContributions={annualContributions}
                />
              </div>
              <div className="space-y-4">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Escape velocity is reached when your portfolio&apos;s annual return exceeds the new money you save each year.
                  The donut shows how much of your current wealth generation comes from capital compounding versus active contributions.
                </p>
                <div className="space-y-3">
                  {/* Return vs Contributions bar */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                      <span>Annual Capital Return</span>
                      <span className="blur-number">{formatCurrency(capitalReturn)}</span>
                    </div>
                    <div className="h-2 w-full bg-muted/30 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-chart-2 transition-all duration-700"
                        style={{
                          width: `${Math.min(
                            (capitalReturn / (Math.max(capitalReturn, annualContributions) || 1)) * 100,
                            100
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                      <span>Annual Contributions</span>
                      <span className="blur-number">{formatCurrency(annualContributions)}</span>
                    </div>
                    <div className="h-2 w-full bg-muted/30 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-chart-1 transition-all duration-700"
                        style={{
                          width: `${Math.min(
                            (annualContributions / (Math.max(capitalReturn, annualContributions) || 1)) * 100,
                            100
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                  {annualLaborIncome > 0 && (
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                        <span>Total Labor Income</span>
                        <span className="blur-number">{formatCurrency(annualLaborIncome)}</span>
                      </div>
                      <div className="h-2 w-full bg-muted/30 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-muted-foreground/40 transition-all duration-700"
                          style={{
                            width: `${Math.min(
                              (annualLaborIncome / (Math.max(capitalReturn, annualLaborIncome) || 1)) * 100,
                              100
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Monthly Capital vs. Contributions Chart ── */}
      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <CollapsibleCardHeader
          isCollapsed={isCollapsedMonthly}
          onToggle={setIsCollapsedMonthly}
          title={
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary shrink-0" />
              <span>Monthly Capital Returns vs. Contributions</span>
            </div>
          }
        />
        {!isCollapsedMonthly && (
          <div className="p-4 sm:p-5 border-t border-border/60 space-y-3">
            <p className="text-[10px] text-muted-foreground">
              Monthly estimated portfolio returns (at trailing TWR) versus active savings deposits. As capital returns grow to match or exceed the blue bars, you approach escape velocity.
            </p>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm" style={{ background: 'var(--color-chart-2)' }} />
                <span className="text-[10px] text-muted-foreground">Capital Returns</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm" style={{ background: 'var(--color-chart-1)' }} />
                <span className="text-[10px] text-muted-foreground">Contributions</span>
              </div>
            </div>
            <MonthlyCapitalLaborChart
              savingsData={savingsRateData}
              portfolioHistory={portfolioHistory}
            />
          </div>
        )}
      </div>

      {/* ── Savings Rate Trend ── */}
      {savingsRateData.length > 0 && (
        <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
          <CollapsibleCardHeader
            isCollapsed={isCollapsedSavings}
            onToggle={setIsCollapsedSavings}
            title={
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-primary shrink-0" />
                <span>Savings Rate Trend</span>
              </div>
            }
          />
          {!isCollapsedSavings && (
            <div className="p-4 sm:p-5 border-t border-border/60 space-y-2">
              <p className="text-[10px] text-muted-foreground">
                A higher savings rate accelerates accumulation during the build-up phase but becomes less critical once capital returns exceed contributions.
              </p>
              <SavingsRateTrend savingsData={savingsRateData} />
            </div>
          )}
        </div>
      )}

    </div>
  );
}
