'use client';

import { useState, useEffect, useMemo } from 'react';
import { formatCurrency } from '@/lib/utils/format';
import { useCardCollapsed } from '@/lib/hooks/use-card-collapsed';
import { CollapsibleCardHeader } from '@/components/ui/collapsible-card-header';
import { AreaChart, Area, ResponsiveContainer, Tooltip, YAxis } from 'recharts';
import { ChartTooltip, TooltipHeader, TooltipRow } from '@/components/charts/chart-tooltip';
import { TrendingUp, TrendingDown, BarChart2 } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { formatSafeUTCDate } from '@/lib/utils/date';
import type { QuoteData } from '@/app/api/investments/quotes/route';

interface Holding {
  accountId: string;
  accountName?: string;
  institutionName?: string;
  securityId?: string;
  ticker: string | null;
  name: string;
  quantity?: number;
  price?: number;
  value: number;
  costBasis: number | null;
  unrealizedGainLoss: number | null;
  unrealizedReturnPct: number | null;
  portfolioWeight: number;
  currency?: string;
}

interface HoldingHistoryPoint {
  date: string;
  price: number;
  value: number;
}

interface HoldingHistory {
  key: string;
  ticker: string | null;
  name: string | null;
  points: HoldingHistoryPoint[];
}

interface HoldingSparklineCardsProps {
  holdings: Holding[];
  quotes?: QuoteData[];
  onSelectHolding?: (holding: Holding) => void;
}

function SparklineTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as HoldingHistoryPoint;
  return (
    <ChartTooltip>
      <TooltipHeader>{formatSafeUTCDate(d.date, { month: 'short', day: 'numeric' })}</TooltipHeader>
      <TooltipRow label="Value" value={formatCurrency(d.value)} />
      {d.price > 0 && (
        <TooltipRow label="Price" value={formatCurrency(d.price)} />
      )}
    </ChartTooltip>
  );
}

interface HoldingCardProps {
  holding: Holding;
  history: HoldingHistoryPoint[];
  quote?: QuoteData;
  index: number;
  onClick?: () => void;
}

function HoldingCard({ holding, history, quote, index, onClick }: HoldingCardProps) {
  const hasHistory = history.length >= 2;
  
  // Calculate 30-day delta from history
  const startVal = hasHistory ? history[0].value : holding.value;
  const endVal = hasHistory ? history[history.length - 1].value : holding.value;
  const delta30d = endVal - startVal;
  const pct30d = startVal > 0 ? (delta30d / startVal) * 100 : 0;
  const is30dPositive = delta30d >= 0;

  // Determine gain/loss display
  const hasReturn = holding.unrealizedGainLoss !== null && holding.costBasis !== null && holding.costBasis > 0;
  const isReturnPositive = holding.unrealizedGainLoss != null ? holding.unrealizedGainLoss >= 0 : null;

  // Live quote day change
  const dayChangePositive = quote?.changePercent != null ? quote.changePercent >= 0 : null;

  // Line color is green for positive 30d trend, red for negative
  const lineColor = is30dPositive ? 'var(--color-chart-1)' : 'var(--color-destructive)';

  // Calculate dynamic Y-axis domain so the curve contours realistically
  const yDomain = useMemo((): [number, number] => {
    if (!hasHistory) return [0, 100];
    const vals = history.map((p) => p.value);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const delta = max - min;
    const pad = delta === 0 ? min * 0.05 : delta * 0.15;
    return [Math.max(0, min - pad), max + pad];
  }, [history, hasHistory]);

  const gradId = `sparkGrad-${index}-${holding.accountId}-${holding.ticker || 'unlisted'}`;

  return (
    <div
      onClick={onClick}
      className="bg-card border border-border rounded-xl p-4 flex flex-col gap-3 hover:border-primary/40 hover:-translate-y-0.5 hover:shadow-md transition-all duration-300 group cursor-pointer"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {holding.ticker && (
            <span className="inline-block px-1.5 py-0.5 font-mono text-[10px] font-bold rounded bg-primary/10 text-primary border border-primary/20 leading-none mb-1">
              {holding.ticker}
            </span>
          )}
          <div className="text-xs font-semibold text-foreground truncate max-w-[140px]" title={holding.name}>
            {holding.name}
          </div>
        </div>
        {/* Portfolio weight */}
        <div className="text-right shrink-0">
          <div className="text-lg font-bold text-foreground blur-number">{holding.portfolioWeight.toFixed(1)}%</div>
          <div className="text-[10px] text-muted-foreground">of portfolio</div>
        </div>
      </div>

      {/* Sparkline & 30-Day Trend Indicator */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-muted-foreground/70">30D Trend</span>
          {hasHistory && (
            <span className={`font-semibold flex items-center gap-0.5 ${is30dPositive ? 'text-chart-1' : 'text-destructive'}`}>
              {is30dPositive ? '+' : ''}{pct30d.toFixed(1)}%
            </span>
          )}
        </div>
        <div className="h-14 w-full -mx-0.5">
          {hasHistory ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={history} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
                <defs>
                  <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={lineColor} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <YAxis domain={yDomain} hide />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={lineColor}
                  strokeWidth={1.8}
                  fill={`url(#${gradId})`}
                  dot={false}
                  isAnimationActive={false}
                  activeDot={{ r: 3, fill: lineColor, stroke: lineColor }}
                />
                <Tooltip content={<SparklineTooltip />} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-[10px] text-muted-foreground/50 italic">
              No history data
            </div>
          )}
        </div>
      </div>

      {/* Portfolio weight bar */}
      <div className="space-y-1">
        <div className="h-1 bg-muted/40 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${Math.min(holding.portfolioWeight, 100)}%`, background: lineColor }}
          />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <div className="text-muted-foreground mb-0.5">Value</div>
          <div className="font-bold text-foreground blur-number">{formatCurrency(holding.value)}</div>
        </div>
        {hasReturn ? (
          <div className="text-right">
            <div className="text-muted-foreground mb-0.5">Total Return</div>
            <div className={`font-bold blur-number ${isReturnPositive ? 'text-chart-1' : 'text-destructive'}`}>
              {isReturnPositive ? '+' : ''}{holding.unrealizedReturnPct!.toFixed(1)}%
            </div>
          </div>
        ) : quote?.changePercent != null ? (
          <div className="text-right">
            <div className="text-muted-foreground mb-0.5">Today</div>
            <div className={`font-bold flex items-center justify-end gap-0.5 ${dayChangePositive ? 'text-chart-1' : 'text-destructive'}`}>
              {dayChangePositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              <span>{dayChangePositive ? '+' : ''}{quote.changePercent!.toFixed(2)}%</span>
            </div>
          </div>
        ) : (
          <div className="text-right">
            <div className="text-muted-foreground mb-0.5">Cost Basis</div>
            <div className="font-bold text-muted-foreground/50">—</div>
          </div>
        )}
      </div>

      {/* Live price if available */}
      {quote?.price != null && (
        <div className="flex items-center justify-between text-[10px] text-muted-foreground border-t border-border/40 pt-2">
          <span>Live price</span>
          <div className="flex items-center gap-1">
            <span className="font-mono font-semibold text-foreground blur-number">{formatCurrency(quote.price)}</span>
            {quote.changePercent != null && (
              <span className={`${dayChangePositive ? 'text-chart-1' : 'text-destructive'} font-semibold`}>
                {dayChangePositive ? '+' : ''}{quote.changePercent.toFixed(2)}%
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function HoldingSparklineCards({ holdings, quotes, onSelectHolding }: HoldingSparklineCardsProps) {
  const [isCollapsed, setIsCollapsed] = useCardCollapsed('holdingSparklines');
  const [historyData, setHistoryData] = useState<HoldingHistory[]>([]);
  const [loading, setLoading] = useState(false);

  // Show top 8 holdings by portfolio weight
  const topHoldings = useMemo(
    () => [...holdings].sort((a, b) => b.portfolioWeight - a.portfolioWeight).slice(0, 8),
    [holdings]
  );

  useEffect(() => {
    if (topHoldings.length === 0) return;
    setLoading(true);
    fetch('/api/investments/holding-history?days=30', { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => setHistoryData(data.history ?? []))
      .catch(() => setHistoryData([]))
      .finally(() => setLoading(false));
  }, [topHoldings.length]);

  // Build a map from ticker/securityId/name → history points
  const historyMap = useMemo(() => {
    const m = new Map<string, HoldingHistoryPoint[]>();
    for (const h of historyData) {
      if (h.ticker) m.set(h.ticker.toUpperCase(), h.points);
      if (h.name) m.set(h.name, h.points);
      m.set(h.key, h.points);
    }
    return m;
  }, [historyData]);

  // Build quote map
  const quoteMap = useMemo(() => {
    const m = new Map<string, QuoteData>();
    for (const q of quotes ?? []) {
      if (q.ticker) m.set(q.ticker.toUpperCase(), q);
    }
    return m;
  }, [quotes]);

  if (holdings.length === 0) return null;

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm">
      <CollapsibleCardHeader
        isCollapsed={isCollapsed}
        onToggle={setIsCollapsed}
        title={
          <div className="flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-primary shrink-0" />
            <span>Top Holdings</span>
            <span className="text-[10px] font-normal text-muted-foreground">(30-day history)</span>
          </div>
        }
      />
      {!isCollapsed && (
        <div className="p-4 sm:p-5">
          {loading ? (
            <LoadingSpinner category="default" className="h-[120px]" />
          ) : (
            <div className="flex sm:grid overflow-x-auto sm:overflow-visible gap-3 sm:grid-cols-3 lg:grid-cols-4 -mx-4 px-4 pb-3 sm:pb-0 sm:mx-0 sm:px-0 scrollbar-none snap-x snap-mandatory">
              {topHoldings.map((holding, idx) => {
                const key = holding.ticker ? holding.ticker.toUpperCase() : (holding.securityId ?? holding.name);
                const history = historyMap.get(key) ?? (holding.ticker ? historyMap.get(holding.ticker.toUpperCase()) : []) ?? [];
                const quote = holding.ticker ? quoteMap.get(holding.ticker.toUpperCase()) : undefined;
                return (
                  <div key={`${holding.accountId}-${key}-${idx}`} className="w-[245px] sm:w-auto shrink-0 snap-start">
                    <HoldingCard
                      holding={holding}
                      history={history}
                      quote={quote}
                      index={idx}
                      onClick={() => onSelectHolding?.(holding)}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

