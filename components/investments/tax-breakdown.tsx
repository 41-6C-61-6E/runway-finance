'use client';

import { useMemo } from 'react';
import { formatCurrency, formatPlainPercent } from '@/lib/utils/format';
import { useCardCollapsed } from '@/lib/hooks/use-card-collapsed';
import { SidebarCollapseButton } from '@/components/ui/sidebar-collapse-button';
import { PieChart, TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getDisplayTicker, type InvestmentHolding } from '@/lib/types/investments';
import type { QuoteData } from '@/app/api/investments/quotes/route';

interface Account {
  id: string;
  name: string;
  balance: number;
  institution: string | null;
  type: string;
  metadata?: any;
}

interface TaxBreakdownProps {
  accounts: Account[];
  holdings?: InvestmentHolding[];
  quotes?: QuoteData[];
  title?: React.ReactNode;
}

type TaxWrapper = 'Tax-Free' | 'Tax-Deferred' | 'Taxable' | 'Other';

const TAX_WRAPPER_MAP: Record<string, TaxWrapper> = {
  rothira: 'Tax-Free',
  hsa: 'Tax-Free',
  health: 'Tax-Free',
  '401k': 'Tax-Deferred',
  '403b': 'Tax-Deferred',
  traditionalira: 'Tax-Deferred',
  sepira: 'Tax-Deferred',
  simpleira: 'Tax-Deferred',
  pension: 'Tax-Deferred',
  retirement: 'Tax-Deferred',
  investment: 'Taxable',
  brokerage: 'Taxable',
  '529': 'Other',
  otherAsset: 'Other',
  otherinvestment: 'Other',
};

const WRAPPER_COLORS: Record<TaxWrapper, string> = {
  'Tax-Free':     'var(--color-chart-1)',
  'Tax-Deferred': 'var(--color-chart-2)',
  'Taxable':      'var(--color-chart-4)',
  'Other':        'var(--color-muted-foreground)',
};

const WRAPPER_DESCRIPTIONS: Record<TaxWrapper, string> = {
  'Tax-Free':     'Roth IRA, HSA — contributions after-tax, growth & withdrawals tax-free',
  'Tax-Deferred': '401(k), Traditional IRA — contributions pre-tax, taxed on withdrawal',
  'Taxable':      'Brokerage — taxed on dividends and capital gains annually',
  'Other':        '529, education & other accounts',
};

const WRAPPER_ORDER: TaxWrapper[] = ['Tax-Free', 'Tax-Deferred', 'Taxable', 'Other'];

export function TaxBreakdown({ accounts, holdings, quotes, title }: TaxBreakdownProps) {
  const [isCollapsed, setIsCollapsed] = useCardCollapsed('taxBreakdown');
  const wrapperTotals = useMemo(() => {
    const totals: Partial<Record<TaxWrapper, number>> = {};
    for (const acc of accounts) {
      const balance = acc.balance || 0;
      let rothPct: number | null = null;
      if (acc.metadata) {
        const meta = typeof acc.metadata === 'string' ? JSON.parse(acc.metadata) : acc.metadata;
        if (typeof meta.rothPercentage === 'number') {
          rothPct = meta.rothPercentage;
        }
      }

      if (rothPct !== null) {
        // Split the balance: Roth portion is Tax-Free
        const rothVal = balance * (rothPct / 100);
        const nonRothVal = balance * (1 - rothPct / 100);

        totals['Tax-Free'] = (totals['Tax-Free'] ?? 0) + rothVal;

        // Non-Roth gets the default wrapper
        const defaultWrapper = TAX_WRAPPER_MAP[acc.type.toLowerCase()] ?? 'Other';
        // Note: if the default wrapper is already Tax-Free (e.g. rothira), then the remaining portion should go to Tax-Deferred
        const nonRothWrapper = defaultWrapper === 'Tax-Free' ? 'Tax-Deferred' : defaultWrapper;
        totals[nonRothWrapper] = (totals[nonRothWrapper] ?? 0) + nonRothVal;
      } else {
        const wrapper = TAX_WRAPPER_MAP[acc.type.toLowerCase()] ?? 'Other';
        totals[wrapper] = (totals[wrapper] ?? 0) + balance;
      }
    }
    return totals;
  }, [accounts]);

  const total = useMemo(
    () => Object.values(wrapperTotals).reduce((s, v) => s + (v ?? 0), 0),
    [wrapperTotals]
  );

  const activeWrappers = WRAPPER_ORDER.filter((w) => (wrapperTotals[w] ?? 0) > 0);

  // Build live quote map for ticker lookups
  const quoteMap = useMemo(() => {
    const m = new Map<string, QuoteData>();
    for (const q of quotes ?? []) {
      if (q.ticker) m.set(q.ticker.toUpperCase(), q);
    }
    return m;
  }, [quotes]);

  // Aggregate holdings across accounts to compute Top and Worst Performers
  const performers = useMemo(() => {
    if (!holdings || holdings.length === 0) return { top: null, worst: null };

    const map = new Map<string, {
      key: string;
      ticker: string | null;
      name: string;
      value: number;
      costBasis: number;
      hasCostBasis: boolean;
      gainLoss: number;
      hasGainLoss: boolean;
      directReturnPct: number | null;
    }>();

    for (const h of holdings) {
      const ticker = getDisplayTicker(h) || h.ticker || null;
      const key = h.securityId || ticker || h.name;
      const existing = map.get(key);

      const val = h.value || 0;
      const cost = h.costBasis;
      const gl = h.unrealizedGainLoss;

      if (!existing) {
        map.set(key, {
          key,
          ticker,
          name: h.name || ticker || 'Unknown Security',
          value: val,
          costBasis: cost != null ? cost : 0,
          hasCostBasis: cost != null && cost > 0,
          gainLoss: gl != null ? gl : 0,
          hasGainLoss: gl != null,
          directReturnPct: h.unrealizedReturnPct ?? null,
        });
      } else {
        existing.value += val;
        if (cost != null && cost > 0) {
          existing.costBasis += cost;
          existing.hasCostBasis = true;
        }
        if (gl != null) {
          existing.gainLoss += gl;
          existing.hasGainLoss = true;
        }
      }
    }

    const items: Array<{
      key: string;
      ticker: string | null;
      name: string;
      value: number;
      returnPct: number;
      dayChangePct: number | null;
    }> = [];

    for (const item of map.values()) {
      const q = item.ticker ? quoteMap.get(item.ticker.toUpperCase()) : undefined;
      let returnPct: number | null = null;

      if (item.hasCostBasis && item.costBasis > 0 && item.hasGainLoss) {
        returnPct = (item.gainLoss / item.costBasis) * 100;
      } else if (item.directReturnPct != null) {
        returnPct = item.directReturnPct;
      } else if (q?.changePercent != null) {
        returnPct = q.changePercent;
      }

      if (returnPct !== null && !isNaN(returnPct)) {
        items.push({
          key: item.key,
          ticker: item.ticker,
          name: item.name,
          value: item.value,
          returnPct,
          dayChangePct: q?.changePercent ?? null,
        });
      }
    }

    if (items.length === 0) return { top: null, worst: null };

    // Sort descending by return percentage
    items.sort((a, b) => b.returnPct - a.returnPct);

    const top = items[0];
    const worst = items.length > 1 && items[items.length - 1].key !== top.key ? items[items.length - 1] : null;

    return { top, worst };
  }, [holdings, quoteMap]);

  if (accounts.length === 0) return null;

  return (
    <div className="relative bg-sidebar border border-sidebar-border rounded-2xl shadow-sm overflow-hidden text-sidebar-foreground">
      {title && <div className="border-b border-sidebar-border/60 bg-sidebar px-4 sm:px-6 py-3 font-bold">{title}</div>}
      <SidebarCollapseButton
        onClick={() => setIsCollapsed(true)}
        label="Collapse scorecard"
      />
      {!isCollapsed && (
        <div className="p-4 sm:p-5 divide-y divide-sidebar-border/50">
          {/* Section 1: Portfolio Balance */}
          <div className="py-4 first:pt-0 last:pb-0 space-y-1">
            <div className="flex items-center justify-between sm:pr-8">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Portfolio Balance
              </span>
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-foreground font-mono blur-number">
              {formatCurrency(total)}
            </div>
          </div>

          {/* Section 2: Stacked Progress Bar / Wrapper Distribution */}
          <div className="py-4 first:pt-0 last:pb-0 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold">
              <span className="text-foreground flex items-center gap-1.5">
                <PieChart className="w-3.5 h-3.5 text-primary shrink-0" />
                Wrapper Distribution
              </span>
            </div>

            <div className="space-y-1.5">
              <div className="h-2.5 flex rounded-full overflow-hidden gap-px bg-muted/30">
                {activeWrappers.map((wrapper) => {
                  const pct = total > 0 ? ((wrapperTotals[wrapper] ?? 0) / total) * 100 : 0;
                  return (
                    <div
                      key={wrapper}
                      style={{ width: `${pct}%`, background: WRAPPER_COLORS[wrapper] }}
                      className="transition-all duration-500 first:rounded-l-full last:rounded-r-full"
                      title={`${wrapper}: ${formatPlainPercent(pct)}`}
                    />
                  );
                })}
              </div>
              {/* % labels centered on each section of the bar */}
              <div className="flex w-full text-micro text-muted-foreground font-mono">
                {activeWrappers.map((wrapper) => {
                  const pct = total > 0 ? ((wrapperTotals[wrapper] ?? 0) / total) * 100 : 0;
                  return (
                    <div
                      key={wrapper}
                      style={{ width: `${pct}%` }}
                      className="flex justify-center text-center overflow-visible"
                    >
                      {pct >= 5 && <span className="tabular-nums">{Math.round(pct)}%</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Section 3: Wrapper Rows */}
          <div className="py-4 first:pt-0 last:pb-0 space-y-3">
            {activeWrappers.map((wrapper) => {
              const value = wrapperTotals[wrapper] ?? 0;
              const pct = total > 0 ? (value / total) * 100 : 0;
              return (
                <div key={wrapper} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ background: WRAPPER_COLORS[wrapper] }}
                      />
                      <span className="font-semibold text-foreground truncate">{wrapper}</span>
                    </div>
                    <span className="text-xs font-bold text-foreground font-mono blur-number shrink-0">
                      {formatCurrency(value)}
                    </span>
                  </div>
                  {/* Subtle progress track */}
                  <div className="w-full bg-muted/30 rounded-full h-1 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, background: WRAPPER_COLORS[wrapper] }}
                    />
                  </div>
                  <p
                    className="text-[10px] text-muted-foreground/70 leading-relaxed truncate"
                    title={WRAPPER_DESCRIPTIONS[wrapper]}
                  >
                    {WRAPPER_DESCRIPTIONS[wrapper]}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Section 4: Top & Worst Performers */}
          {performers.top && (
            <div className="py-4 first:pt-0 last:pb-0 space-y-3">
              {/* Top Performer */}
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-6 h-6 rounded-lg bg-chart-1/10 border border-chart-1/20 flex items-center justify-center shrink-0">
                    <TrendingUp className="w-3.5 h-3.5 text-chart-1" />
                  </div>
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-chart-1">Top Performer</span>
                      <span className="font-mono text-xs font-bold text-foreground">
                        {performers.top.ticker || performers.top.name}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground truncate max-w-[150px] sm:max-w-[180px]" title={performers.top.name}>
                      {performers.top.name}
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0 font-mono">
                  <span className="text-xs font-bold text-chart-1 blur-number">
                    {performers.top.returnPct >= 0 ? '+' : ''}{formatPlainPercent(performers.top.returnPct, 1)}
                  </span>
                  <div className="text-micro text-muted-foreground blur-number">
                    {formatCurrency(performers.top.value)}
                  </div>
                </div>
              </div>

              {/* Worst Performer */}
              {performers.worst && (
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-6 h-6 rounded-lg bg-destructive/10 border border-destructive/20 flex items-center justify-center shrink-0">
                      <TrendingDown className="w-3.5 h-3.5 text-destructive" />
                    </div>
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-destructive">Worst Performer</span>
                        <span className="font-mono text-xs font-bold text-foreground">
                          {performers.worst.ticker || performers.worst.name}
                        </span>
                      </div>
                      <p className="text-[10px] text-muted-foreground truncate max-w-[150px] sm:max-w-[180px]" title={performers.worst.name}>
                        {performers.worst.name}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0 font-mono">
                    <span className="text-xs font-bold text-destructive blur-number">
                      {performers.worst.returnPct >= 0 ? '+' : ''}{formatPlainPercent(performers.worst.returnPct, 1)}
                    </span>
                    <div className="text-micro text-muted-foreground blur-number">
                      {formatCurrency(performers.worst.value)}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
