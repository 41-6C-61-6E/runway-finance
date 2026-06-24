'use client';

import { useMemo } from 'react';
import { formatCurrency } from '@/lib/utils/format';
import { useCardCollapsed } from '@/lib/hooks/use-card-collapsed';
import { CollapsibleCardHeader } from '@/components/ui/collapsible-card-header';
import {
  CandlestickChart,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Percent,
  Landmark,
  CircleDollarSign,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  ResponsiveContainer,
} from 'recharts';
import type { QuoteData } from '@/app/api/investments/quotes/route';

interface Holding {
  accountId: string;
  ticker: string | null;
  name: string;
  value: number;
  costBasis: number | null;
  unrealizedGainLoss: number | null;
  unrealizedReturnPct: number | null;
  portfolioWeight: number;
}

interface Account {
  id: string;
  name: string;
  balance: number;
  institution: string | null;
  type: string;
  updatedAt?: string;
}

interface HoldingHistoryPoint {
  date: string;
  price: number;
  value: number;
}

interface InvestmentsSummaryProps {
  summary: {
    totalBalance: number;
    totalCostBasis: number | null;
    totalUnrealizedGainLoss: number | null;
    totalUnrealizedReturnPct: number | null;
    holdingsCount: number;
  };
  accounts: Account[];
  holdings: Holding[];
  totalAnnualIncome?: number;
  portfolioHistory?: { date: string; value: number }[]; // last 30 days
  quotes?: QuoteData[];
}

function MiniSparkline({ data, isPositive }: { data: number[]; isPositive: boolean }) {
  if (!data || data.length < 2) {
    return <div className="h-10 w-full opacity-20 text-center text-xs flex items-center justify-center text-muted-foreground">—</div>;
  }
  const chartData = data.map((v, i) => ({ i, v }));
  const color = isPositive ? 'var(--color-chart-1)' : 'var(--color-destructive)';
  const gradId = `sparklineGrad-${isPositive ? 'pos' : 'neg'}`;
  return (
    <div className="h-10 w-full mt-1.5">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.25} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#${gradId})`}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

interface StatTileProps {
  label: string;
  value: React.ReactNode;
  subValue?: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  isPositive?: boolean | null;
  sparkData?: number[];
  accent?: boolean;
}

function StatTile({ label, value, subValue, icon: Icon, isPositive, sparkData, accent }: StatTileProps) {
  const showSpark = sparkData && sparkData.length >= 2;
  return (
    <div className={`relative flex flex-col justify-between p-4 sm:p-5 overflow-hidden min-h-[110px] ${accent ? 'bg-primary/5' : ''}`}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</span>
        <Icon className={`w-3.5 h-3.5 shrink-0 ${accent ? 'text-primary' : 'text-muted-foreground/50'}`} />
      </div>
      <div className="flex flex-col gap-0.5 flex-1 justify-end">
        <div className="text-xl sm:text-2xl font-bold text-foreground tracking-tight blur-number leading-tight">
          {value}
        </div>
        {subValue != null && (
          <div className={`text-xs font-semibold flex items-center gap-0.5 ${
            isPositive === true ? 'text-chart-1' : isPositive === false ? 'text-destructive' : 'text-muted-foreground'
          }`}>
            {isPositive === true && <TrendingUp className="w-3 h-3 shrink-0" />}
            {isPositive === false && <TrendingDown className="w-3 h-3 shrink-0" />}
            <span className="blur-number">{subValue}</span>
          </div>
        )}
      </div>
      {showSpark && (
        <div className="mt-2">
          <MiniSparkline data={sparkData!} isPositive={isPositive !== false} />
        </div>
      )}
    </div>
  );
}

export function InvestmentsSummary({
  summary,
  accounts,
  holdings,
  totalAnnualIncome,
  portfolioHistory,
  quotes,
}: InvestmentsSummaryProps) {
  const [isCollapsed, setIsCollapsed] = useCardCollapsed('investmentsSummary');

  const {
    totalBalance,
    totalCostBasis,
    totalUnrealizedGainLoss,
    totalUnrealizedReturnPct,
    holdingsCount,
  } = summary;

  const isReturnPositive = totalUnrealizedGainLoss != null ? totalUnrealizedGainLoss >= 0 : null;

  // 30-day sparkline from portfolio history
  const sparkData = useMemo(() => {
    if (!portfolioHistory || portfolioHistory.length < 2) return undefined;
    // Take last 30 points
    const slice = portfolioHistory.slice(-30);
    return slice.map((p) => p.value);
  }, [portfolioHistory]);

  // Compute today's change (last point vs second-to-last in portfolio history)
  const todayChange = useMemo(() => {
    if (!portfolioHistory || portfolioHistory.length < 2) return null;
    const last = portfolioHistory[portfolioHistory.length - 1];
    const prev = portfolioHistory[portfolioHistory.length - 2];
    if (!last || !prev) return null;
    return { amount: last.value - prev.value, pct: prev.value > 0 ? ((last.value - prev.value) / prev.value) * 100 : 0 };
  }, [portfolioHistory]);

  // Estimated dividend yield
  const divYield = useMemo(() => {
    if (!totalAnnualIncome || !totalBalance || totalBalance <= 0) return null;
    return (totalAnnualIncome / totalBalance) * 100;
  }, [totalAnnualIncome, totalBalance]);

  // Account count (non-zero balance)
  const accountCount = accounts.length;

  const tiles: StatTileProps[] = [
    {
      label: 'Portfolio Value',
      value: formatCurrency(totalBalance),
      subValue: todayChange
        ? `${todayChange.amount >= 0 ? '+' : ''}${formatCurrency(todayChange.amount)} today`
        : undefined,
      icon: CandlestickChart,
      isPositive: todayChange ? todayChange.amount >= 0 : null,
      sparkData,
      accent: true,
    },
    {
      label: 'Unrealized Return',
      value: totalUnrealizedGainLoss != null
        ? `${totalUnrealizedGainLoss >= 0 ? '+' : ''}${formatCurrency(totalUnrealizedGainLoss)}`
        : '—',
      subValue: totalUnrealizedReturnPct != null
        ? `${totalUnrealizedReturnPct >= 0 ? '+' : ''}${totalUnrealizedReturnPct.toFixed(2)}% all-time`
        : undefined,
      icon: isReturnPositive !== false ? TrendingUp : TrendingDown,
      isPositive: isReturnPositive,
    },
    {
      label: 'Cost Basis',
      value: totalCostBasis != null ? formatCurrency(totalCostBasis) : '—',
      subValue: totalCostBasis != null && totalBalance > 0
        ? `${((totalBalance / totalCostBasis - 1) * 100).toFixed(1)}% growth`
        : 'No basis data',
      icon: DollarSign,
      isPositive: totalCostBasis != null ? totalBalance >= totalCostBasis : null,
    },
    {
      label: 'Est. Annual Income',
      value: totalAnnualIncome != null ? formatCurrency(totalAnnualIncome) : '—',
      subValue: divYield != null ? `${divYield.toFixed(2)}% yield` : 'No dividend data',
      icon: CircleDollarSign,
      isPositive: totalAnnualIncome != null && totalAnnualIncome > 0 ? true : null,
    },
    {
      label: 'Holdings',
      value: holdingsCount.toString(),
      subValue: `across ${accountCount} account${accountCount !== 1 ? 's' : ''}`,
      icon: Percent,
      isPositive: null,
    },
    {
      label: 'Accounts',
      value: accountCount.toString(),
      subValue: accounts.map((a) => a.institution || a.name).slice(0, 2).join(', ') || '—',
      icon: Landmark,
      isPositive: null,
    },
  ];

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
      <CollapsibleCardHeader
        isCollapsed={isCollapsed}
        onToggle={setIsCollapsed}
        title={
          <div className="flex items-center gap-2">
            <CandlestickChart className="w-4 h-4 text-primary shrink-0" />
            <span>Portfolio Summary</span>
          </div>
        }
      />
      {!isCollapsed && (
        <div className="border-t border-border bg-card/30">
          <div className="flex lg:grid overflow-x-auto lg:overflow-visible gap-3 lg:gap-0 lg:grid-cols-6 lg:divide-x divide-border -mx-4 px-4 py-4 lg:py-0 lg:mx-0 lg:px-0 scrollbar-none snap-x snap-mandatory">
            {tiles.map((tile, idx) => (
              <div
                key={idx}
                className="w-[185px] lg:w-auto shrink-0 snap-start bg-card lg:bg-transparent border border-border/80 lg:border-0 rounded-xl lg:rounded-none shadow-sm lg:shadow-none hover:border-primary/25 lg:hover:border-transparent transition-all duration-300 hover:scale-[1.01] lg:hover:scale-100"
              >
                <StatTile {...tile} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
