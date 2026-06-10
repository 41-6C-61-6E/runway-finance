'use client';

import { useState, useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { formatCurrency } from '@/lib/utils/format';
import { ChartTooltip, TooltipRow, TooltipHeader } from '@/components/charts/chart-tooltip';
import { ChartEmptyState } from '@/components/charts/chart-empty-state';
import { useCardCollapsed } from '@/lib/hooks/use-card-collapsed';
import { CollapsibleCardHeader } from '@/components/ui/collapsible-card-header';
import { PieChart as PieIcon } from 'lucide-react';

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
  value: number;
  percentage: number;
  color: string;
}

// Map account type to clean categories
const getTaxCategory = (type: string): string => {
  const t = type.toLowerCase();
  if (['rothira', 'traditionalira', '401k', '403b', 'sepira', 'simpleira', 'retirement'].includes(t)) {
    return 'Retirement (Tax-Advantaged)';
  }
  if (['hsa', 'health'].includes(t)) {
    return 'HSA / Health Savings';
  }
  if (['checking', 'savings', 'hsachecking'].includes(t)) {
    return 'Cash / Money Market';
  }
  return 'Taxable Brokerage';
};

export function HoldingsAllocation({ holdings, accounts }: HoldingsAllocationProps) {
  const [isCollapsed, setIsCollapsed] = useCardCollapsed('holdingsAllocationChart');
  const [groupBy, setGroupBy] = useState<GroupByOption>('security');
  const [showAll, setShowAll] = useState(false);

  const accountTypeMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const acc of accounts) {
      m.set(acc.id, acc.type);
    }
    return m;
  }, [accounts]);

  const chartData = useMemo((): ChartItem[] => {
    if (holdings.length === 0) return [];

    const totalPortfolioValue = holdings.reduce((sum, h) => sum + h.value, 0);
    if (totalPortfolioValue <= 0) return [];

    const groupedValues: Record<string, number> = {};

    for (const h of holdings) {
      let key = 'Other';

      if (groupBy === 'security') {
        key = h.ticker || h.name || 'Other';
      } else if (groupBy === 'account') {
        key = `${h.institutionName} - ${h.accountName}`;
      } else if (groupBy === 'taxCategory') {
        const type = accountTypeMap.get(h.accountId) || 'investment';
        key = getTaxCategory(type);
      } else if (groupBy === 'assetClass') {
        key = getAssetClass(h.ticker, h.name);
      }

      groupedValues[key] = (groupedValues[key] || 0) + h.value;
    }

    const items = Object.entries(groupedValues).map(([name, value]) => ({
      name,
      value,
      percentage: (value / totalPortfolioValue) * 100,
      color: '',
    }));

    // Sort descending
    items.sort((a, b) => b.value - a.value);

    // For security/account grouping: show top items only unless showAll
    let finalItems: typeof items = [];
    const INITIAL_LIMIT = 6;
    if (items.length > INITIAL_LIMIT + 1 && groupBy !== 'taxCategory' && groupBy !== 'assetClass' && !showAll) {
      finalItems = items.slice(0, INITIAL_LIMIT);
      const otherValue = items.slice(INITIAL_LIMIT).reduce((sum, item) => sum + item.value, 0);
      const otherPct = (otherValue / totalPortfolioValue) * 100;
      finalItems.push({
        name: `+${items.length - INITIAL_LIMIT} more`,
        value: otherValue,
        percentage: otherPct,
        color: '',
      });
    } else {
      finalItems = items;
    }

    // Apply color palette vars
    return finalItems.map((item, idx) => ({
      ...item,
      color: item.name === 'Other Assets' 
        ? 'var(--color-muted-foreground)' 
        : `var(--color-chart-${(idx % 5) + 1})`,
    }));
  }, [holdings, groupBy, accountTypeMap]);

  const totalValue = useMemo(() => holdings.reduce((sum, h) => sum + h.value, 0), [holdings]);

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
    { value: 'security', label: 'By Asset' },
    { value: 'account', label: 'By Account' },
    { value: 'assetClass', label: 'By Asset Class' },
    { value: 'taxCategory', label: 'By Tax Category' },
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
          {/* Group By Filter Toggles */}
          <div className="flex bg-muted/65 border border-border rounded-lg p-0.5 self-center mb-5 shrink-0">
            {groupOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setGroupBy(opt.value)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                  groupBy === opt.value
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="flex-1 flex flex-col sm:flex-row items-center justify-center gap-4 min-h-[240px]">
            {/* Donut Chart — larger with center label */}
            <div className="w-52 h-52 shrink-0 relative">
              {/* Center label */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Total</span>
                <span className="text-sm font-bold text-foreground blur-number">
                  {totalValue >= 1_000_000
                    ? `$${(totalValue / 1_000_000).toFixed(1)}M`
                    : totalValue >= 1_000
                    ? `$${(totalValue / 1_000).toFixed(0)}K`
                    : `$${totalValue.toFixed(0)}`}
                </span>
              </div>
              <ResponsiveContainer width="100%" height="100%">
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
                          <TooltipRow label="Portfolio %" value={`${d.percentage.toFixed(1)}%`} />
                        </ChartTooltip>
                      );
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Legend Details */}
            <div className="flex-1 w-full space-y-2 max-h-[220px] overflow-y-auto pr-1">
              {chartData.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs py-0.5 border-b border-border/10">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: item.color }} />
                    <span className="text-muted-foreground truncate" title={item.name}>{item.name}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-2 font-medium">
                    <span className="text-foreground font-mono tabular-nums blur-number">{formatCurrency(item.value)}</span>
                    <span className="text-muted-foreground/80 font-mono w-10 text-right tabular-nums">{item.percentage.toFixed(1)}%</span>
                  </div>
                </div>
              ))}
              {/* Show all toggle */}
              {groupBy === 'security' || groupBy === 'account' ? (
                holdings.length > 7 && (
                  <button
                    onClick={() => setShowAll(!showAll)}
                    className="mt-1 text-[10px] font-semibold text-primary hover:text-primary/80 transition-colors w-full text-center py-1"
                  >
                    {showAll ? 'Show less' : `Show all ${holdings.length} holdings`}
                  </button>
                )
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
