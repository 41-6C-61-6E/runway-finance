'use client';

import { useState, useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { formatCurrency } from '@/lib/utils/format';
import { formatCompactCurrency, formatPlainPercent } from '@/lib/utils/format';
import { ChartTooltip, TooltipRow, TooltipHeader } from '@/components/charts/chart-tooltip';
import { ChartEmptyState } from '@/components/charts/chart-empty-state';
import { useCardCollapsed } from '@/lib/hooks/use-card-collapsed';
import { CollapsibleCardHeader } from '@/components/ui/collapsible-card-header';
import { AppTabs } from '@/components/ui/app-tabs';
import { PieChart as PieIcon } from 'lucide-react';
import { getDisplayTicker } from '@/lib/types/investments';

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
  balance: number;
  institution: string | null;
  type: string;
  metadata?: any;
}

interface HoldingsAllocationProps {
  holdings: Holding[];
  accounts: Account[];
}

type GroupByOption = 'security' | 'account' | 'taxCategory' | 'assetClass';

// Classify tickers into broad asset classes by name/ticker heuristics
const getAssetClass = (ticker: string | null, name: string): string => {
  const t = (ticker ?? '').toLowerCase();
  const n = name.toLowerCase();
  if (['bnd', 'agg', 'shy', 'iei', 'tlt', 'tips', 'lqd', 'hyg', 'mub'].includes(t) ||
      n.includes('bond') || n.includes('treasury') || n.includes('fixed income') || n.includes('income fund')) {
    return 'Fixed Income';
  }
  if (n.includes('real estate') || n.includes('reit') || t === 'vnq' || t === 'o') {
    return 'Real Estate';
  }
  if (n.includes('commodity') || n.includes('gold') || n.includes('oil') || t === 'gld' || t === 'slv') {
    return 'Commodities';
  }
  if (n.includes('cash') || n.includes('money market') || n.includes('settlement') || n.includes('sweep')) {
    return 'Cash';
  }
  // Default: equities
  return 'Equities';
};

interface ChartItem {
  name: string;
  /** Fund/security display name (used by "By Asset"). */
  fundName?: string;
  /** Ticker symbol (used by "By Asset"). */
  ticker?: string;
  value: number;
  percentage: number;
  color: string;
}

export type TaxWrapper = 'Tax-Free' | 'Tax-Deferred' | 'Taxable' | 'Other';

const TAX_WRAPPER_MAP: Record<string, TaxWrapper> = {
  rothira: 'Tax-Free',
  roth: 'Tax-Free',
  roth_ira: 'Tax-Free',
  hsa: 'Tax-Free',
  health: 'Tax-Free',
  '401k': 'Tax-Deferred',
  '403b': 'Tax-Deferred',
  '457b': 'Tax-Deferred',
  traditionalira: 'Tax-Deferred',
  traditional_ira: 'Tax-Deferred',
  sepira: 'Tax-Deferred',
  sep_ira: 'Tax-Deferred',
  simpleira: 'Tax-Deferred',
  simple_ira: 'Tax-Deferred',
  pension: 'Tax-Deferred',
  retirement: 'Tax-Deferred',
  ira: 'Tax-Deferred',
  investment: 'Taxable',
  brokerage: 'Taxable',
  individual: 'Taxable',
  joint: 'Taxable',
  '529': 'Other',
  otherasset: 'Other',
  otherinvestment: 'Other',
};

const WRAPPER_COLORS: Record<TaxWrapper, string> = {
  'Tax-Free':     'var(--color-chart-1)',
  'Tax-Deferred': 'var(--color-chart-2)',
  'Taxable':      'var(--color-chart-4)',
  'Other':        'var(--color-muted-foreground)',
};

const getTaxWrapper = (type: string, name: string = '', metadata?: any): TaxWrapper => {
  const t = (type || '').toLowerCase();
  const n = (name || '').toLowerCase();

  // If metadata specifies isRoth or 100% Roth
  if (metadata) {
    try {
      const meta = typeof metadata === 'string' ? JSON.parse(metadata) : metadata;
      if (meta?.isRoth === true || (typeof meta?.rothPercentage === 'number' && meta.rothPercentage >= 100)) {
        return 'Tax-Free';
      }
    } catch {}
  }

  // Name check for Roth
  if (n.includes('roth')) {
    return 'Tax-Free';
  }

  // Name check for 401k/IRA if type is generic retirement
  if (n.includes('401k') || n.includes('401(k)') || n.includes('traditional') || n.includes('sep') || n.includes('simple')) {
    return 'Tax-Deferred';
  }

  return TAX_WRAPPER_MAP[t] ?? (t.includes('roth') ? 'Tax-Free' : 'Taxable');
};

export function HoldingsAllocation({ holdings, accounts }: HoldingsAllocationProps) {
  const [isCollapsed, setIsCollapsed] = useCardCollapsed('holdingsAllocationChart');
  const [groupBy, setGroupBy] = useState<GroupByOption>('security');
  const [showAll, setShowAll] = useState(false);

  const accountMap = useMemo(() => {
    const m = new Map<string, Account>();
    for (const acc of accounts) {
      m.set(acc.id, acc);
    }
    return m;
  }, [accounts]);

  const totalValue = useMemo(() => holdings.reduce((sum, h) => sum + h.value, 0), [holdings]);

  const chartData = useMemo((): ChartItem[] => {
    if (holdings.length === 0 || totalValue <= 0) return [];

    const groupedValues: Record<string, number> = {};

    // For "By Asset": remember the fund name + ticker for each security key.
    const securityMeta: Record<string, { name: string; ticker: string | null }> = {};

    for (const h of holdings) {
      let key = 'Other';

      if (groupBy === 'security') {
        key = getDisplayTicker(h) || h.name || 'Other';
        if (getDisplayTicker(h)) {
          if (!securityMeta[key]) {
            securityMeta[key] = { name: h.name, ticker: getDisplayTicker(h) };
          }
        } else {
          securityMeta[key] = { name: h.name, ticker: null };
        }
      } else if (groupBy === 'account') {
        key = `${h.institutionName} - ${h.accountName}`;
      } else if (groupBy === 'taxCategory') {
        const acc = accountMap.get(h.accountId);
        const type = acc?.type || 'investment';
        const name = acc?.name || h.accountName || '';

        let rothPct: number | null = null;
        if (acc?.metadata) {
          try {
            const meta = typeof acc.metadata === 'string' ? JSON.parse(acc.metadata) : acc.metadata;
            if (typeof meta?.rothPercentage === 'number') {
              rothPct = meta.rothPercentage;
            }
          } catch {}
        }

        if (rothPct !== null) {
          const rothVal = h.value * (rothPct / 100);
          const nonRothVal = h.value * (1 - rothPct / 100);

          groupedValues['Tax-Free'] = (groupedValues['Tax-Free'] ?? 0) + rothVal;

          const defaultWrapper = TAX_WRAPPER_MAP[type.toLowerCase()] ?? (type.toLowerCase().includes('roth') ? 'Tax-Free' : 'Tax-Deferred');
          const nonRothWrapper = defaultWrapper === 'Tax-Free' ? 'Tax-Deferred' : defaultWrapper;
          groupedValues[nonRothWrapper] = (groupedValues[nonRothWrapper] ?? 0) + nonRothVal;
          continue;
        }

        const wrapper = getTaxWrapper(type, name, acc?.metadata);
        groupedValues[wrapper] = (groupedValues[wrapper] ?? 0) + h.value;
        continue;
      } else if (groupBy === 'assetClass') {
        key = getAssetClass(getDisplayTicker(h), h.name);
      }

      groupedValues[key] = (groupedValues[key] || 0) + h.value;
    }

    const items: ChartItem[] = Object.entries(groupedValues).map(([name, value]) => {
      const meta = groupBy === 'security' ? securityMeta[name] : undefined;
      return {
        name,
        fundName: meta?.name,
        ticker: meta?.ticker ?? undefined,
        value,
        percentage: (value / totalValue) * 100,
        color: '',
      };
    });

    // Sort descending
    items.sort((a, b) => b.value - a.value);

    let finalItems: typeof items = [];
    const INITIAL_LIMIT = 6;
    if (items.length > INITIAL_LIMIT + 1 && groupBy !== 'taxCategory' && groupBy !== 'assetClass' && !showAll) {
      finalItems = items.slice(0, INITIAL_LIMIT);
      const otherValue = items.slice(INITIAL_LIMIT).reduce((sum, item) => sum + item.value, 0);
      const otherPct = (otherValue / totalValue) * 100;
      finalItems.push({
        name: `+${items.length - INITIAL_LIMIT} more`,
        value: otherValue,
        percentage: otherPct,
        color: '',
        fundName: undefined,
        ticker: undefined,
      });
    } else {
      finalItems = items;
    }

    return finalItems.map((item, idx) => ({
      ...item,
      color: groupBy === 'taxCategory' && WRAPPER_COLORS[item.name as TaxWrapper]
        ? WRAPPER_COLORS[item.name as TaxWrapper]
        : item.name === 'Other Assets' 
        ? 'var(--color-muted-foreground)' 
        : `var(--color-chart-${(idx % 5) + 1})`,
    }));
  }, [holdings, groupBy, accountMap, totalValue, showAll]);

  if (holdings.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm">
        <CollapsibleCardHeader
          isCollapsed={isCollapsed}
          onToggle={setIsCollapsed}
          title={
            <div className="flex items-center gap-2">
              <PieIcon className="w-4 h-4 text-primary shrink-0" />
              <span>Asset Allocation</span>
            </div>
          }
        />
        {!isCollapsed && (
          <div className="p-5">
            <ChartEmptyState variant="nodata" description="No allocation data available" />
          </div>
        )}
      </div>
    );
  }

  const groupOptions: { value: GroupByOption; label: string }[] = [
    { value: 'security', label: 'Asset' },
    { value: 'account', label: 'Account' },
    { value: 'assetClass', label: 'Class' },
    { value: 'taxCategory', label: 'Wrapper' },
  ];

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm flex flex-col h-full">
      <CollapsibleCardHeader
        isCollapsed={isCollapsed}
        onToggle={setIsCollapsed}
        title={
          <div className="flex items-center gap-2">
            <PieIcon className="w-4 h-4 text-primary shrink-0" />
            <span>Asset Allocation</span>
          </div>
        }
      />

      {!isCollapsed && (
        <div className="flex-1 flex flex-col p-4 sm:p-5">
          {/* Secondary Controls: Grouping Filter */}
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider select-none">
                Group by
              </span>
              <AppTabs
                tabs={groupOptions.map((opt) => ({ id: opt.value, label: opt.label }))}
                activeTab={groupBy}
                onChange={(tabId) => setGroupBy(tabId as GroupByOption)}
                variant="pills"
                size="sm"
                aria-label="Group holdings by"
              />
            </div>
          </div>

          <div className="flex-1 flex flex-col sm:flex-row items-center justify-center gap-4 min-h-[240px]">
            {/* Donut Chart */}
            <div className="w-52 h-52 shrink-0 relative">
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Total</span>
                <span className="text-sm font-bold text-foreground blur-number">
                  {formatCompactCurrency(totalValue)}
                </span>
              </div>
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} initialDimension={{ width: 100, height: 100 }}>
                <PieChart>
                  <Pie
                    data={chartData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius="65%"
                    outerRadius="85%"
                    paddingAngle={1}
                    cornerRadius={3}
                    stroke="none"
                  >
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload || !payload.length) return null;
                      const d = payload[0].payload as ChartItem;
                      return (
                        <ChartTooltip>
                          <TooltipHeader>
                            <div className="flex items-center gap-1.5">
                              <span className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
                              <span>{d.name}</span>
                            </div>
                          </TooltipHeader>
                          <TooltipRow label="Value" value={formatCurrency(d.value)} />
                          <TooltipRow label="Portfolio %" value={formatPlainPercent(d.percentage)} />
                        </ChartTooltip>
                      );
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Legend Details */}
            <div className="flex-1 w-full flex flex-col justify-center min-w-0">
              <div className="space-y-2 max-h-[200px] sm:max-h-[220px] overflow-y-auto pr-1">
                {chartData.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs py-0.5 border-b border-border/10">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: item.color }} />
                      {groupBy === 'security' ? (
                        item.ticker ? (
                          <span className="flex items-center gap-1.5 min-w-0" title={`${item.fundName ?? ''} (${item.ticker})`.trim()}>
                            <span className="font-semibold font-mono text-foreground shrink-0">{item.ticker}</span>
                            {item.fundName && item.fundName !== item.ticker ? (
                              <span className="truncate text-foreground/80">{item.fundName}</span>
                            ) : null}
                          </span>
                        ) : (
                          <span className="truncate text-foreground/80" title={item.fundName ?? item.name}>{item.fundName ?? item.name}</span>
                        )
                      ) : (
                        <span className="text-muted-foreground truncate" title={item.name}>{item.name}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ml-2 font-medium">
                      <span className="text-foreground font-mono tabular-nums blur-number">{formatCurrency(item.value)}</span>
                      <span className="text-muted-foreground/80 font-mono w-10 text-right tabular-nums">{formatPlainPercent(item.percentage)}</span>
                    </div>
                  </div>
                ))}
              </div>
              {groupBy === 'security' || groupBy === 'account' ? (
                holdings.length > 7 && (
                  <div className="pt-2 mt-1 border-t border-border/30 shrink-0">
                    <button
                      type="button"
                      onClick={() => setShowAll(!showAll)}
                      className="text-xs font-semibold text-primary hover:text-primary/80 transition-colors w-full text-center py-1 rounded hover:bg-primary/5 cursor-pointer"
                    >
                      {showAll ? 'Show less' : `Show all ${holdings.length} holdings`}
                    </button>
                  </div>
                )
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
