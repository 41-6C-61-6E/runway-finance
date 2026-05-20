'use client';

import { useState, useEffect, useMemo } from 'react';
import { ResponsivePie } from '@nivo/pie';
import { useRouter } from 'next/navigation';
import { nivoTheme } from '@/components/charts/shared-chart-theme';
import { ChartTooltip, TooltipRow, TooltipHeader } from '@/components/charts/chart-tooltip';
import { isAssetAccount, isLiabilityAccount } from '@/lib/utils/account-scope';
import { useShowMath } from '@/lib/hooks/use-show-math';
import { buildDebtToAssetTrace } from '@/lib/services/trace-engine';
import { CalculationTraceOverlay } from '@/components/financial-logic/calculation-trace';

const RATING_THRESHOLDS = [
  { max: 0.35, label: 'Excellent', hue: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  { max: 0.45, label: 'Good', hue: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  { max: 0.55, label: 'Fair', hue: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' },
  { max: 0.75, label: 'Poor', hue: 'bg-orange-500/15 text-orange-400 border-orange-500/30' },
  { max: Infinity, label: 'Critical', hue: 'bg-red-500/15 text-red-400 border-red-500/30' },
];

const RATING_MESSAGES: Record<string, string> = {
  Excellent: 'Your debt is very low compared to your assets — you\'re in a strong financial position.',
  Good: 'Your debt is manageable and well within healthy levels.',
  Fair: 'Your debt is at a moderate level — consider focusing on paying it down.',
  Poor: 'Your debt is relatively high — a debt reduction plan may be beneficial.',
  Critical: 'Your debt is very high compared to your assets — financial counseling is recommended.',
};

const RATING_PROGRESS_COLORS: Record<string, string> = {
  Excellent: 'bg-emerald-500',
  Good: 'bg-blue-500',
  Fair: 'bg-yellow-500',
  Poor: 'bg-orange-500',
  Critical: 'bg-red-500',
};

// Color mappings that will respect theme colors
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

function getRating(ratio: number) {
  for (const t of RATING_THRESHOLDS) {
    if (ratio < t.max) return t;
  }
  return RATING_THRESHOLDS[RATING_THRESHOLDS.length - 1];
}

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

export function DebtToAssetRatio() {
  const router = useRouter();
  const { enabled: showMath } = useShowMath();
  const [accounts, setAccounts] = useState<AccountData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unit, setUnit] = useState<'$' | '%'>('$');
  const [activeTab, setActiveTab] = useState<'assets' | 'debt'>('assets');

  useEffect(() => {
    const fetchAccounts = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch('/api/accounts', { credentials: 'include' });
        if (!res.ok) throw new Error('Failed to fetch accounts');
        const data = await res.json();
        setAccounts(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };
    fetchAccounts();
  }, []);

  const { totalAssets, totalLiabilities, ratio, rating, assetCategories, debtCategories } = useMemo(() => {
    let assets = 0;
    let liabilities = 0;
    const assetMap: Record<string, number> = {};
    const debtMap: Record<string, number> = {};

    for (const acc of accounts) {
      const balance = typeof acc.balance === 'string' ? parseFloat(acc.balance) : acc.balance;

      if (isAssetAccount(acc.type)) {
        assets += balance;
        const cat = ASSET_DISPLAY_CATEGORIES[acc.type] || { label: 'Other', color: '#6b7280' };
        assetMap[cat.label] = (assetMap[cat.label] || 0) + balance;
      } else if (isLiabilityAccount(acc.type)) {
        const absBalance = Math.abs(balance);
        liabilities += absBalance;
        const cat = DEBT_DISPLAY_CATEGORIES[acc.type] || { label: 'Other Debt', color: '#6b7280' };
        debtMap[cat.label] = (debtMap[cat.label] || 0) + absBalance;
      }
    }

    const rawRatio = assets > 0 ? liabilities / assets : 0;
    const ratingInfo = getRating(rawRatio);

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
      ratio: rawRatio,
      rating: ratingInfo,
      assetCategories: makeCategories(assetMap, ASSET_DISPLAY_CATEGORIES, 'asset'),
      debtCategories: makeCategories(debtMap, DEBT_DISPLAY_CATEGORIES, 'debt'),
    };
  }, [accounts]);

  const debtTrace = useMemo(() => {
    if (!showMath || accounts.length === 0) return null;
    return buildDebtToAssetTrace(accounts);
  }, [accounts, showMath]);

  const activeCategories = activeTab === 'assets' ? assetCategories : debtCategories;
  const activeTotal = activeTab === 'assets' ? totalAssets : totalLiabilities;

  const pieData = useMemo(() => {
    // Assign theme-appropriate colors to categories based on their order
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

  const pct = ratio * 100;

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
        <div className="animate-pulse space-y-4">
          <div className="h-5 bg-muted rounded w-40" />
          <div className="h-10 bg-muted rounded w-24" />
          <div className="h-2 bg-muted rounded-full" />
          <div className="h-40 bg-muted rounded" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-foreground mb-4">Debt to Asset Ratio</h3>
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-foreground mb-4">Debt to Asset Ratio</h3>
        <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">
          No account data available
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm">
      {/* ════════════════════════════════ */}
      {/* CARD 1 — Ratio Summary          */}
      {/* ════════════════════════════════ */}
      <div className="p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4">Debt to Asset Ratio</h3>

        <div className="flex items-center gap-3 mb-4">
          <span className="text-4xl font-bold text-foreground financial-value">
            {pct.toFixed(0)}%
          </span>
          <span className={`inline-flex items-center px-2.5 py-0.5 text-xs font-semibold rounded-full border ${rating.hue}`}>
            {rating.label}
          </span>
        </div>

        <div className="space-y-1.5 mb-3">
          <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
            <div
              className={`h-full ${RATING_PROGRESS_COLORS[rating.label]} transition-all duration-500 rounded-full`}
              style={{ width: `${Math.min(pct, 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>0%</span>
            <span>50%</span>
            <span>100%</span>
          </div>
        </div>

        <p className="text-sm text-muted-foreground leading-relaxed">
          {RATING_MESSAGES[rating.label]}
        </p>
      </div>

      {/* Divider */}
      <div className="border-t border-border" />

      {/* ════════════════════════════════ */}
      {/* CARD 2 — Breakdown              */}
      {/* ════════════════════════════════ */}
      <div className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-foreground">Breakdown</h3>
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

        {/* Tabs */}
        <div className="flex gap-4 mb-5 border-b border-border">
          <button
            onClick={() => setActiveTab('assets')}
            className={`pb-2 text-sm font-medium transition-colors relative ${
              activeTab === 'assets'
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Assets
            {activeTab === 'assets' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-500 rounded-full" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('debt')}
            className={`pb-2 text-sm font-medium transition-colors relative ${
              activeTab === 'debt'
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Debt
            {activeTab === 'debt' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-500 rounded-full" />
            )}
          </button>
        </div>

        {/* Total */}
        <div className="text-center mb-4">
          <p className="text-xs text-muted-foreground mb-0.5">
            {activeTab === 'assets' ? 'Total Assets' : 'Total Debt'}
          </p>
          <p className="text-xl font-bold text-foreground financial-value">
            {formatCompact(activeTotal)}
          </p>
        </div>

        {/* Donut Chart */}
        <div className="h-[180px] mb-4">
          {pieData.length > 0 ? (
            <ResponsivePie
              data={pieData}
              margin={{ top: 5, right: 5, bottom: 5, left: 5 }}
              innerRadius={0.65}
              padAngle={0.5}
              cornerRadius={3}
              colors={{ datum: 'data.color' }}
              borderWidth={0}
              enableArcLinkLabels={false}
              enableArcLabels={false}
              theme={nivoTheme}
              onClick={(datum) => handleClick(datum.data.key as string)}
              tooltip={({ datum }) => (
                <ChartTooltip>
                  <TooltipHeader>{String(datum.label)}</TooltipHeader>
                  <TooltipRow label="Amount" value={formatCompact(datum.data.amount as number)} />
                  {activeTotal > 0 && (
                    <TooltipRow
                      label="Share"
                      value={`${((datum.data.amount as number / activeTotal) * 100).toFixed(1)}%`}
                    />
                  )}
                </ChartTooltip>
              )}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
              No {activeTab} categories
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="space-y-2">
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
      {showMath && debtTrace && <CalculationTraceOverlay trace={debtTrace} />}
    </div>
  );
}
