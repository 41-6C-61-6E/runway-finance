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
  LineChart,
  Line,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
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
  return (
    <div className="h-10 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <Line
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
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
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-y sm:divide-y-0 divide-x-0 sm:divide-x divide-border border-t border-border">
          {tiles.map((tile, idx) => (
            <StatTile key={idx} {...tile} />
          ))}
        </div>
      )}
    </div>
  );
}
