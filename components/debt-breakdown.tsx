'use client';

import { useState, useEffect, useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { useRouter } from 'next/navigation';
import { ChartTooltip, TooltipRow, TooltipHeader } from '@/components/charts/chart-tooltip';
import { isAssetAccount, isLiabilityAccount } from '@/lib/utils/account-scope';
import { useCardCollapsed } from '@/lib/hooks/use-card-collapsed';
import { CollapsibleCardHeader } from '@/components/ui/collapsible-card-header';
import { CollapsibleFilterPanel } from '@/components/ui/collapsible-filter-panel';
import { TrendingDown } from 'lucide-react';
import { usePrivacyMode } from '@/components/privacy-mode-provider';

const CHART_COLOR_MAP = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-synthetic)',
  'var(--destructive-synthetic)',
];

const ASSET_DISPLAY_CATEGORIES: Record<string, { label: string }> = {
  checking: { label: 'Cash & Checking' },
  savings: { label: 'Savings' },
  hsachecking: { label: 'HSA (Checking)' },
  investment: { label: 'Taxable Brokerage' },
  brokerage: { label: 'Taxable Brokerage' },
  otherinvestment: { label: 'Other Investments' },
  retirement: { label: 'Retirement' },
  rothira: { label: 'Retirement' },
  traditionalira: { label: 'Retirement' },
  '401k': { label: 'Retirement' },
  '403b': { label: 'Retirement' },
  sepira: { label: 'Retirement' },
  simpleira: { label: 'Retirement' },
  hsa: { label: 'HSA (Investment)' },
  health: { label: 'HSA (Investment)' },
  realestate: { label: 'Real Estate' },
  primaryhome: { label: 'Real Estate' },
  secondaryhome: { label: 'Real Estate' },
  rentalproperty: { label: 'Real Estate' },
  commercial: { label: 'Real Estate' },
  land: { label: 'Real Estate' },
  otherrealestate: { label: 'Real Estate' },
  vehicle: { label: 'Vehicle' },
  crypto: { label: 'Other Investments' },
  metals: { label: 'Other Investments' },
  '529': { label: 'Other Investments' },
  otherAsset: { label: 'Other Investments' },
  other: { label: 'Other Investments' },
};

const DEBT_DISPLAY_CATEGORIES: Record<string, { label: string }> = {
  credit: { label: 'Credit Cards' },
  loan: { label: 'Loans' },
  mortgage: { label: 'Mortgages' },
};

function formatCompact(value: number): string {
  if (value >= 1000000000) return `$${(value / 1000000000).toFixed(1)}B`;
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

interface AccountData {
  id: string;
  type: string;
  balance: string | number;
  name: string;
}

interface CategoryEntry {
  key: string;
  label: string;
  color: string;
  amount: number;
}

export function DebtBreakdown() {
  const router = useRouter();
  const { privacyMode } = usePrivacyMode();
  const [isCollapsed, setIsCollapsed] = useCardCollapsed('debtBreakdown');
  const [accounts, setAccounts] = useState<AccountData[]>([]);
  const [loading, setLoading] = useState(true);
  const [unit, setUnit] = useState<'$' | '%'>('$');
  const [activeTab, setActiveTab] = useState<'assets' | 'debt'>('assets');
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    fetch('/api/accounts', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => setAccounts(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const { totalAssets, totalLiabilities, assetCategories, debtCategories } = useMemo(() => {
    let assets = 0;
    let liabilities = 0;
    const assetMap: Record<string, number> = {};
    const debtMap: Record<string, number> = {};

    for (const acc of accounts) {
      const balance = typeof acc.balance === 'string' ? parseFloat(acc.balance) : acc.balance;

      if (isAssetAccount(acc.type)) {
        assets += balance;
        const cat = ASSET_DISPLAY_CATEGORIES[acc.type] || { label: 'Other' };
        assetMap[cat.label] = (assetMap[cat.label] || 0) + balance;
      } else if (isLiabilityAccount(acc.type)) {
        const absBalance = Math.abs(balance);
        liabilities += absBalance;
        const cat = DEBT_DISPLAY_CATEGORIES[acc.type] || { label: 'Other Debt' };
        debtMap[cat.label] = (debtMap[cat.label] || 0) + absBalance;
      }
    }

    const makeCategories = (map: Record<string, number>, colorMap: Record<string, { label: string }>, typeKey: string): CategoryEntry[] => {
      const merged: Record<string, { key: string; label: string; amount: number }> = {};
      for (const acc of accounts) {
        const balance = typeof acc.balance === 'string' ? parseFloat(acc.balance) : acc.balance;
        const catInfo = colorMap[acc.type];
        if (!catInfo) continue;
        const val = typeKey === 'debt' ? Math.abs(balance) : balance;
        if (val <= 0) continue;
        merged[catInfo.label] = {
          key: acc.type,
          label: catInfo.label,
          amount: (merged[catInfo.label]?.amount || 0) + val,
        };
      }
      return Object.values(merged)
        .sort((a, b) => b.amount - a.amount)
        .map((entry, i) => ({
          ...entry,
          color: CHART_COLOR_MAP[i % CHART_COLOR_MAP.length],
        }));
    };

    return {
      totalAssets: assets,
      totalLiabilities: liabilities,
      assetCategories: makeCategories(assetMap, ASSET_DISPLAY_CATEGORIES, 'asset'),
      debtCategories: makeCategories(debtMap, DEBT_DISPLAY_CATEGORIES, 'debt'),
    };
  }, [accounts]);

  const activeCategories = activeTab === 'assets' ? assetCategories : debtCategories;
  const activeTotal = activeTab === 'assets' ? totalAssets : totalLiabilities;

  const pieData = useMemo(() => {
    return activeCategories.map((cat, index) => {
      const colorIndex = index % CHART_COLOR_MAP.length;
      return {
        id: cat.label,
        value: unit === '%' && activeTotal > 0 ? (cat.amount / activeTotal) * 100 : cat.amount,
        color: CHART_COLOR_MAP[colorIndex],
        amount: cat.amount,
        key: cat.key,
      };
    });
  }, [activeCategories, activeTotal, unit]);

  const handleClick = (accountType: string) => {
    router.push(`/transactions?accountTypes=${accountType}`);
  };

  const srSummary = useMemo(() => {
    if (activeCategories.length === 0) return '';
    const breakDownStr = activeCategories
      .map((cat) => `${cat.label}: ${formatCompact(cat.amount)} (${activeTotal > 0 ? ((cat.amount / activeTotal) * 100).toFixed(1) : 0}%)`)
      .join(', ');
    return `Total ${activeTab === 'assets' ? 'Assets' : 'Debt'} is ${formatCompact(activeTotal)}. Breakdown: ${breakDownStr}.`;
  }, [activeCategories, activeTotal, activeTab]);

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm">
        <CollapsibleCardHeader
          isCollapsed={isCollapsed}
          onToggle={setIsCollapsed}
          title={
            <div className="flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-primary shrink-0" />
              <span>Breakdown</span>
            </div>
          }
        />
        <div className="p-5 animate-pulse">
          <div className="h-[180px] bg-muted rounded mb-4" />
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-4 bg-muted rounded w-full" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm">
      {!privacyMode && (
        <div className="sr-only" aria-live="polite">
          {srSummary}
        </div>
      )}
      <CollapsibleCardHeader
        isCollapsed={isCollapsed}
        onToggle={setIsCollapsed}
        title={
          <div className="flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-primary shrink-0" />
            <span>Breakdown</span>
          </div>
        }
      />
      {!isCollapsed && (
        <>
          <CollapsibleFilterPanel
            isOpen={showFilters}
            onToggle={() => setShowFilters(!showFilters)}
            feedback={
              <span className="bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider">
                UNIT: {unit === '$' ? 'Value ($)' : 'Percentage (%)'}
              </span>
            }
          >
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mr-1">Display Unit</span>
              <div className="flex bg-muted rounded-lg p-0.5">
                <button
                  onClick={() => setUnit('$')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                    unit === '$'
                      ? 'bg-card text-foreground shadow-sm border border-border'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  $
                </button>
                <button
                  onClick={() => setUnit('%')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                    unit === '%'
                      ? 'bg-card text-foreground shadow-sm border border-border'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  %
                </button>
              </div>
            </div>
          </CollapsibleFilterPanel>
          <div className="px-3 sm:px-5 py-4">
          <div className="flex bg-muted/40 border border-border/50 rounded-xl p-1 w-full gap-1 mb-5 sm:mb-6">
            <button
              onClick={() => setActiveTab('assets')}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer ${
                activeTab === 'assets'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
              }`}
            >
              Assets
            </button>
            <button
              onClick={() => setActiveTab('debt')}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer ${
                activeTab === 'debt'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
              }`}
            >
              Debt
            </button>
          </div>

          <div className="text-center mb-4">
            <p className="text-xs text-muted-foreground mb-0.5">
              {activeTab === 'assets' ? 'Total Assets' : 'Total Debt'}
            </p>
            <p className="text-xl font-bold text-foreground financial-value">
              {formatCompact(activeTotal)}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-6 items-center sm:items-start">
            <div className="h-[200px] sm:h-[220px] flex-shrink-0 w-full sm:w-[45%] max-w-[240px] sm:max-w-none">
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 100, height: 100 }}>
                  <PieChart role="img" aria-label={`${activeTab === 'assets' ? 'Assets' : 'Debt'} Breakdown Pie Chart`}>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="id"
                      cx="50%"
                      cy="50%"
                      innerRadius="65%"
                      outerRadius="100%"
                      paddingAngle={0.5}
                      cornerRadius={3}
                      stroke="none"
                      onClick={(data) => {
                        const key = data.key || (data.payload && data.payload.key);
                        if (key) handleClick(key);
                      }}
                      className="cursor-pointer"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload || !payload.length) return null;
                        const datum = payload[0].payload;
                        return (
                          <ChartTooltip>
                            <TooltipHeader>{String(datum.id)}</TooltipHeader>
                            <TooltipRow label="Amount" value={formatCompact(datum.amount)} />
                            {activeTotal > 0 && (
                              <TooltipRow
                                label="Share"
                                value={`${((datum.amount / activeTotal) * 100).toFixed(1)}%`}
                              />
                            )}
                          </ChartTooltip>
                        );
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
                  No {activeTab} categories
                </div>
              )}
            </div>

            <div className="flex-1 space-y-2 max-h-[220px] overflow-y-auto pt-1">
              {activeCategories.map((cat, index) => {
                const share = activeTotal > 0 ? (cat.amount / activeTotal) * 100 : 0;
                const colorIndex = index % CHART_COLOR_MAP.length;
                return (
                  <div
                    key={cat.label}
                    className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5 transition-colors"
                    onClick={() => handleClick(cat.key)}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: CHART_COLOR_MAP[colorIndex] }}
                    />
                    <span className="text-xs text-foreground/80 flex-1">{cat.label}</span>
                    <span className="text-xs text-foreground font-medium tabular-nums blur-number">
                      {unit === '$' ? formatCompact(cat.amount) : `${share.toFixed(1)}%`}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </>
    )}
  </div>
  );
}
