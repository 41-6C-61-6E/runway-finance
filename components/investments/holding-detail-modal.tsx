'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { formatCurrency } from '@/lib/utils/format';
import { formatSafeUTCDate } from '@/lib/utils/date';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { ChartTooltip, TooltipHeader, TooltipRow } from '@/components/charts/chart-tooltip';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import {
  TrendingUp,
  TrendingDown,
  Landmark,
  ShieldCheck,
  Percent,
  CircleDollarSign,
  Activity,
  ArrowRight,
} from 'lucide-react';
import type { QuoteData } from '@/app/api/investments/quotes/route';

interface Holding {
  accountId: string;
  accountName: string;
  institutionName: string;
  securityId: string;
  ticker: string | null;
  name: string;
  quantity: number;
  price: number;
  value: number;
  costBasis: number | null;
  unrealizedGainLoss: number | null;
  unrealizedReturnPct: number | null;
  portfolioWeight: number;
  currency: string;
}

interface Account {
  id: string;
  name: string;
  institution: string | null;
  type: string;
}

interface HoldingDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  holding: Holding | null;
  allHoldings?: Holding[];
  accounts?: Account[];
  quote?: QuoteData;
  recentTransactions?: any[];
}

type RangeOption = '1w' | '1m' | '3m' | '1y' | '5y' | 'all';

interface SecurityHistoryResponse {
  ticker: string;
  shortName: string;
  range: string;
  currentPrice: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  change: number | null;
  changePercent: number | null;
  points: { date: string; close: number; open?: number; high?: number; low?: number }[];
}

export function HoldingDetailSheet({
  open,
  onOpenChange,
  holding,
  allHoldings = [],
  accounts = [],
  quote,
  recentTransactions = [],
}: HoldingDetailSheetProps) {
  const [range, setRange] = useState<RangeOption>('1m');
  const [historyData, setHistoryData] = useState<SecurityHistoryResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const ticker = holding?.ticker?.toUpperCase() || null;

  useEffect(() => {
    if (!open || !ticker) {
      setHistoryData(null);
      return;
    }

    setLoading(true);
    fetch(`/api/investments/quotes/security-history?ticker=${encodeURIComponent(ticker)}&range=${range}`, {
      credentials: 'include',
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.points) {
          setHistoryData(data);
        }
      })
      .catch(() => setHistoryData(null))
      .finally(() => setLoading(false));
  }, [open, ticker, range]);

  // Aggregate all positions of this security across multiple accounts
  const crossAccountPositions = useMemo(() => {
    if (!holding) return [];
    const secKey = holding.ticker ? holding.ticker.toUpperCase() : holding.securityId;
    return allHoldings.filter((h) => {
      const k = h.ticker ? h.ticker.toUpperCase() : h.securityId;
      return k === secKey;
    });
  }, [holding, allHoldings]);

  const totalQuantity = useMemo(() => {
    return crossAccountPositions.length > 0
      ? crossAccountPositions.reduce((sum, h) => sum + (h.quantity || 0), 0)
      : (holding?.quantity || 0);
  }, [crossAccountPositions, holding]);

  const currentLivePrice = useMemo(() => {
    if (quote?.price != null && quote.price > 0) return quote.price;
    if (holding?.price != null && holding.price > 0) return holding.price;
    if (holding?.value && holding?.quantity && holding.quantity > 0) return holding.value / holding.quantity;
    return 0;
  }, [quote, holding]);

  const totalValue = useMemo(() => {
    if (totalQuantity > 0 && currentLivePrice > 0) {
      return totalQuantity * currentLivePrice;
    }
    return holding?.value || 0;
  }, [totalQuantity, currentLivePrice, holding]);

  const totalCostBasis = useMemo(() => {
    const sum = crossAccountPositions.reduce((s, h) => s + (h.costBasis || 0), 0);
    return sum > 0 ? sum : holding?.costBasis;
  }, [crossAccountPositions, holding]);

  const totalGainLoss = totalCostBasis != null && totalCostBasis > 0
    ? totalValue - totalCostBasis
    : null;

  const totalReturnPct = totalCostBasis != null && totalCostBasis > 0 && totalGainLoss != null
    ? (totalGainLoss / totalCostBasis) * 100
    : null;

  // Filter transactions matching this security
  const matchingTransactions = useMemo(() => {
    if (!holding) return [];
    const t = holding.ticker?.toLowerCase();
    const n = (holding.name || '').toLowerCase();
    return recentTransactions.filter((tx) => {
      const desc = `${tx.description || ''} ${tx.payee || ''}`.toLowerCase();
      return (t && desc.includes(t)) || (n.length >= 3 && desc.includes(n.slice(0, 8)));
    });
  }, [holding, recentTransactions]);

  const chartPoints = historyData?.points || [];
  const hasChart = chartPoints.length >= 2;

  // Calculate dynamic Y-axis domain
  const yDomain = useMemo((): [number, number] => {
    if (!hasChart) return [0, 100];
    const prices = chartPoints.map((p) => p.close).filter((p) => typeof p === 'number' && !isNaN(p) && p > 0);
    if (prices.length === 0) return [0, 100];
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const delta = max - min;
    const pad = delta === 0 ? min * 0.05 : delta * 0.12;
    return [Math.max(0, min - pad), max + pad];
  }, [chartPoints, hasChart]);

  // Range trend
  const firstPoint = chartPoints[0]?.close ?? 0;
  const lastPoint = chartPoints[chartPoints.length - 1]?.close ?? 0;
  const isRangePositive = lastPoint >= firstPoint;
  const rangeChange = lastPoint - firstPoint;
  const rangeChangePct = firstPoint > 0 ? (rangeChange / firstPoint) * 100 : 0;

  const chartColor = isRangePositive ? 'var(--color-chart-1)' : 'var(--color-destructive)';

  const rangeButtons: { label: string; value: RangeOption }[] = [
    { label: '1W', value: '1w' },
    { label: '1M', value: '1m' },
    { label: '3M', value: '3m' },
    { label: '1Y', value: '1y' },
    { label: '5Y', value: '5y' },
    { label: 'ALL', value: 'all' },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl p-0 overflow-y-auto bg-card">
        {holding && (
          <div className="p-5 sm:p-6 space-y-6">
            {/* Header */}
            <SheetHeader className="text-left space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  {holding.ticker && (
                    <span className="px-2.5 py-1 font-mono text-sm font-bold rounded-lg bg-primary/10 text-primary border border-primary/20">
                      {holding.ticker}
                    </span>
                  )}
                  <span className="text-[11px] px-2 py-0.5 rounded bg-muted text-muted-foreground font-semibold">
                    {quote?.shortName || holding.name}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider block">Portfolio Weight</span>
                  <span className="text-sm font-bold text-foreground blur-number">
                    {(holding.portfolioWeight ?? 0).toFixed(1)}%
                  </span>
                </div>
              </div>
              <SheetTitle className="text-lg sm:text-xl font-bold text-foreground leading-tight">
                {holding.name}
              </SheetTitle>
            </SheetHeader>

          {/* Price & Today's Change Hero */}
          <div className="p-4 rounded-xl bg-muted/20 border border-border/60 flex flex-wrap items-end justify-between gap-3">
            <div>
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
                Current Market Price
              </span>
              <div className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight blur-number">
                {formatCurrency(currentLivePrice)}
              </div>
            </div>
            <div className="text-right">
              {quote?.changePercent != null ? (
                <div className={`flex items-center justify-end gap-1 text-sm font-bold ${
                  quote.changePercent >= 0 ? 'text-chart-1' : 'text-destructive'
                }`}>
                  {quote.changePercent >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                  <span>{quote.changePercent >= 0 ? '+' : ''}{quote.changePercent.toFixed(2)}%</span>
                  {quote.change != null && (
                    <span className="text-xs opacity-80">({quote.change >= 0 ? '+' : ''}{formatCurrency(quote.change)})</span>
                  )}
                </div>
              ) : null}
              <span className="text-[10px] text-muted-foreground">Today</span>
            </div>
          </div>

          {/* Price Chart */}
          {ticker ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Activity className="w-3.5 h-3.5 text-primary" />
                  <span className="font-semibold text-foreground">Price Performance</span>
                  {hasChart && (
                    <span className={`text-xs font-semibold ${isRangePositive ? 'text-chart-1' : 'text-destructive'}`}>
                      ({isRangePositive ? '+' : ''}{(rangeChangePct ?? 0).toFixed(2)}%)
                    </span>
                  )}
                </div>
                {/* Range Filter Buttons */}
                <div className="flex bg-muted/40 p-0.5 rounded-lg border border-border/60">
                  {rangeButtons.map((btn) => (
                    <button
                      key={btn.value}
                      onClick={() => setRange(btn.value)}
                      className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-all ${
                        range === btn.value
                          ? 'bg-primary text-primary-foreground shadow-xs'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {btn.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="h-[200px] w-full border border-border/40 rounded-xl p-2 bg-card relative">
                {loading ? (
                  <LoadingSpinner category="chart" className="h-full" />
                ) : hasChart ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartPoints} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="detailHoldingGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={chartColor} stopOpacity={0.25} />
                          <stop offset="100%" stopColor={chartColor} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} opacity={0.25} />
                      <XAxis
                        dataKey="date"
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: 'var(--color-muted-foreground)', fontSize: 9 }}
                        tickFormatter={(d) => {
                          if (range === '1w') {
                            return formatSafeUTCDate(d, { weekday: 'short' });
                          }
                          return formatSafeUTCDate(d, { month: 'numeric', day: 'numeric' });
                        }}
                        minTickGap={25}
                      />
                      <YAxis
                        domain={yDomain}
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: 'var(--color-muted-foreground)', fontSize: 9 }}
                        tickFormatter={(v) => `$${v.toFixed(0)}`}
                      />
                      <RechartsTooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const p = payload[0].payload;
                          return (
                            <ChartTooltip>
                              <TooltipHeader>
                                {range === '1w'
                                  ? formatSafeUTCDate(p.date, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                                  : formatSafeUTCDate(p.date, { month: 'short', day: 'numeric', year: 'numeric' })}
                              </TooltipHeader>
                              <TooltipRow label="Price" value={formatCurrency(p.close)} color={chartColor} />
                            </ChartTooltip>
                          );
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="close"
                        stroke={chartColor}
                        strokeWidth={2}
                        fill="url(#detailHoldingGrad)"
                        dot={false}
                        activeDot={{ r: 4, fill: chartColor, stroke: chartColor }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-xs text-muted-foreground italic">
                    Historical price data unavailable for this security
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {/* Holdings & Position Details */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5">
              <CircleDollarSign className="w-3.5 h-3.5 text-primary" />
              <span>Your Position Details</span>
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="p-3 rounded-lg bg-muted/20 border border-border/50">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider block">Total Value</span>
                <span className="text-sm font-bold text-foreground blur-number">{formatCurrency(totalValue)}</span>
              </div>
              <div className="p-3 rounded-lg bg-muted/20 border border-border/50">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider block">Shares</span>
                <span className="text-sm font-bold text-foreground font-mono blur-number">
                  {(totalQuantity ?? 0).toLocaleString(undefined, { maximumFractionDigits: 4 })}
                </span>
              </div>
              <div className="p-3 rounded-lg bg-muted/20 border border-border/50">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider block">Cost Basis</span>
                <span className="text-sm font-bold text-foreground blur-number">
                  {totalCostBasis != null ? formatCurrency(totalCostBasis) : '—'}
                </span>
              </div>
              <div className="p-3 rounded-lg bg-muted/20 border border-border/50">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider block">Total Return</span>
                {totalGainLoss != null && totalReturnPct != null && !isNaN(totalReturnPct) ? (
                  <span className={`text-sm font-bold blur-number ${totalGainLoss >= 0 ? 'text-chart-1' : 'text-destructive'}`}>
                    {totalGainLoss >= 0 ? '+' : ''}{totalReturnPct.toFixed(1)}%
                  </span>
                ) : (
                  <span className="text-sm text-muted-foreground/40">—</span>
                )}
              </div>
            </div>
          </div>

          {/* Account Breakdown */}
          {crossAccountPositions.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Landmark className="w-3.5 h-3.5 text-primary" />
                <span>Account Allocation ({crossAccountPositions.length} {crossAccountPositions.length === 1 ? 'account' : 'accounts'})</span>
              </h4>
              <div className="border border-border/60 rounded-xl overflow-hidden divide-y divide-border/40">
                {crossAccountPositions.map((pos, idx) => {
                  const acc = accounts.find((a) => a.id === pos.accountId);
                  const posValue = pos.quantity && currentLivePrice > 0 ? pos.quantity * currentLivePrice : pos.value;
                  return (
                    <div key={`${pos.accountId}-${idx}`} className="p-3 flex items-center justify-between text-xs hover:bg-muted/10">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-primary" />
                        <div>
                          <span className="font-semibold text-foreground">{pos.accountName}</span>
                          <span className="text-[10px] text-muted-foreground block">{pos.institutionName} • {acc?.type || 'Brokerage'}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-foreground font-mono blur-number">{formatCurrency(posValue)}</span>
                        <span className="text-[10px] text-muted-foreground block font-mono">
                          {(pos.quantity ?? 0).toLocaleString(undefined, { maximumFractionDigits: 3 })} shares
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Fundamental Stats */}
          {historyData && (historyData.fiftyTwoWeekHigh || historyData.fiftyTwoWeekLow) ? (
            <div className="space-y-2 pt-2 border-t border-border/50">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                52-Week Range
              </span>
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="blur-number">${historyData.fiftyTwoWeekLow?.toFixed(2) ?? '—'}</span>
                <div className="flex-1 mx-4 h-1.5 bg-muted rounded-full relative">
                  {historyData.fiftyTwoWeekHigh && historyData.fiftyTwoWeekLow && historyData.fiftyTwoWeekHigh > historyData.fiftyTwoWeekLow && currentLivePrice ? (
                    <div
                      className="absolute w-2.5 h-2.5 -top-0.5 rounded-full bg-primary border border-background shadow-xs"
                      style={{
                        left: `calc(${Math.max(0, Math.min(100, ((currentLivePrice - historyData.fiftyTwoWeekLow) / (historyData.fiftyTwoWeekHigh - historyData.fiftyTwoWeekLow)) * 100))}% - 5px)`,
                      }}
                    />
                  ) : null}
                </div>
                <span className="blur-number">${historyData.fiftyTwoWeekHigh?.toFixed(2) ?? '—'}</span>
              </div>
            </div>
          ) : null}

          {/* Activity / Transactions */}
          {matchingTransactions.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-border/50">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-2">
                Recent Security Activity
              </span>
              <div className="space-y-1.5">
                {matchingTransactions.slice(0, 5).map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between text-xs p-2 rounded-lg bg-muted/15 border border-border/30">
                    <div>
                      <span className="font-semibold text-foreground capitalize">{tx.description || tx.payee}</span>
                      <span className="text-[10px] text-muted-foreground block">
                        {formatSafeUTCDate(tx.date, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    </div>
                    <span className="font-mono font-bold text-foreground blur-number">
                      {formatCurrency(Math.abs(tx.amount))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
