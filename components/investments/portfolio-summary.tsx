import React from 'react';
import { TrendingUp, TrendingDown, DollarSign, Activity, Percent, ArrowUpRight } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/format';

interface SummaryProps {
  totalValue: number;
  totalCost: number;
  totalGainLoss: number;
  totalGainLossPercent: number;
}

export function PortfolioSummary({
  totalValue,
  totalCost,
  totalGainLoss,
  totalGainLossPercent,
}: SummaryProps) {
  const isGain = totalGainLoss >= 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6 mb-6">
      {/* Total Portfolio Value Card */}
      <div className="relative overflow-hidden bg-card/40 backdrop-blur-md border border-border/50 rounded-2xl p-5 sm:p-6 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 hover:border-primary/30 group">
        <div className="absolute top-0 right-0 p-6 opacity-[0.03] group-hover:opacity-[0.06] transition-opacity duration-300 pointer-events-none">
          <DollarSign className="h-32 w-32 text-foreground" />
        </div>
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Portfolio Value</span>
          <div className="p-2 rounded-xl bg-primary/10 text-primary">
            <DollarSign className="h-4 w-4" />
          </div>
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground mb-1 font-sans">
          {formatCurrency(totalValue)}
        </h2>
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          Current aggregate valuation of holdings
        </p>
      </div>

      {/* Net Gain/Loss Card */}
      <div className="relative overflow-hidden bg-card/40 backdrop-blur-md border border-border/50 rounded-2xl p-5 sm:p-6 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 hover:border-primary/30 group">
        <div className="absolute top-0 right-0 p-6 opacity-[0.03] group-hover:opacity-[0.06] transition-opacity duration-300 pointer-events-none">
          {isGain ? <TrendingUp className="h-32 w-32 text-foreground" /> : <TrendingDown className="h-32 w-32 text-foreground" />}
        </div>
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Net Returns</span>
          <div className={`p-2 rounded-xl ${isGain ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
            {isGain ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
          </div>
        </div>
        <h2 className={`text-2xl sm:text-3xl font-bold tracking-tight mb-1 font-sans ${isGain ? 'text-emerald-500' : 'text-rose-500'}`}>
          {isGain ? '+' : ''}{formatCurrency(totalGainLoss)}
        </h2>
        <div className="flex items-center gap-1.5 mt-1">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-semibold leading-5 ${
            isGain ? 'bg-emerald-500/15 text-emerald-500' : 'bg-rose-500/15 text-rose-500'
          }`}>
            {isGain ? '+' : ''}{totalGainLossPercent.toFixed(2)}%
          </span>
          <span className="text-xs text-muted-foreground">total lifetime gain</span>
        </div>
      </div>

      {/* Total Portfolio Cost Card */}
      <div className="relative overflow-hidden bg-card/40 backdrop-blur-md border border-border/50 rounded-2xl p-5 sm:p-6 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 hover:border-primary/30 group">
        <div className="absolute top-0 right-0 p-6 opacity-[0.03] group-hover:opacity-[0.06] transition-opacity duration-300 pointer-events-none">
          <Activity className="h-32 w-32 text-foreground" />
        </div>
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Cost Basis</span>
          <div className="p-2 rounded-xl bg-violet-500/10 text-violet-500">
            <Activity className="h-4 w-4" />
          </div>
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground mb-1 font-sans">
          {formatCurrency(totalCost)}
        </h2>
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          Invested capital or purchase cost
        </p>
      </div>
    </div>
  );
}
