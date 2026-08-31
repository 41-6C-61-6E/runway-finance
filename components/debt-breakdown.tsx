'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Treemap } from 'recharts';
import { useRouter } from 'next/navigation';
import { ChartTooltip, TooltipRow, TooltipHeader } from '@/components/charts/chart-tooltip';
import { isAccountActiveOnDate, isReportableAccount, computeNetWorthTotals } from '@/lib/utils/account-scope';
import { convertCurrency } from '@/lib/constants/currency-rates';
import { formatInTimezone } from '@/lib/utils/timeframe';
import { useUserSettings } from '@/components/user-settings-provider';
import { usePrivacyMode } from '@/components/privacy-mode-provider';
import { formatCompactCurrency } from '@/lib/utils/format';
import { SegPill } from '@/components/ui/seg-pill';

const CHART_COLOR_MAP = [
  'var(--color-chart-1)',
  'var(--color-chart-2)',
  'var(--color-chart-3)',
  'var(--color-chart-4)',
  'var(--color-chart-5)',
  'var(--color-chart-synthetic)',
  'var(--color-destructive-synthetic)',
];

const DEBT_COLOR_MAP = [
  'var(--color-destructive-synthetic)',
  'var(--color-destructive)',
  'var(--color-status-warning)',
  'var(--color-destructive)',
  'var(--color-destructive-synthetic)',
  'var(--color-status-warning)',
  'var(--color-destructive)',
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
  studentloan: { label: 'Student Loans' },
  autoloan: { label: 'Auto Loans' },
  otherloan: { label: 'Other Loans' },
  otherLiability: { label: 'Other Debt' },
  otherliability: { label: 'Other Debt' },
};

type BreakdownView = 'donut' | 'treemap';

function formatCompact(value: number): string {
  return formatCompactCurrency(value);
}

function truncateTreemapLabel(label: string, width: number): string {
  const maxChars = Math.max(4, Math.floor((width - 16) / 7));
  return label.length > maxChars ? `${label.slice(0, maxChars - 1)}…` : label;
}

interface AccountData {
  id: string;
  type: string;
  balance: string | number;
  name: string;
  isHidden?: boolean | null;
  isExcludedFromNetWorth?: boolean | null;
  currency?: string | null;
  metadata?: string | any | null;
}

interface CategoryEntry {
  key: string;
  label: string;
  color: string;
  amount: number;
  group: 'assets' | 'debt';
  share: number; // 0-1 within its group
}

export function DebtBreakdown() {
  const router = useRouter();
  const { privacyMode } = usePrivacyMode();
  const { settings } = useUserSettings() ?? {};
  const baseCurrency = settings?.currency || 'USD';
  const [view, setView] = useState<BreakdownView>('donut');
  const [activeTab, setActiveTab] = useState<'assets' | 'debt'>('assets');

  const { data: accounts = [], isLoading: loading } = useQuery<AccountData[]>({
    queryKey: ['accounts-all'],
    queryFn: async () => {
      const res = await fetch('/api/accounts?includeHidden=true&includeVirtual=true', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch accounts');
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const { totalAssets, totalLiabilities, assetCategories, debtCategories } = useMemo(() => {
    // Timezone-aware "today" — must match the server-side canonical calc.
    const todayStr = formatInTimezone(new Date(), settings?.timezone || 'America/New_York');

    // Canonical scoped totals (reportable + active + currency-converted),
    // consistent with the Overview and History chart.
    const totals = computeNetWorthTotals(accounts, baseCurrency, todayStr);

    const reportableAccounts = accounts.filter(
      (acc) => isReportableAccount(acc) && isAccountActiveOnDate(acc, todayStr)
    );

    const makeCategories = (colorMap: Record<string, { label: string }>, isDebt: boolean): CategoryEntry[] => {
      const map = isDebt ? DEBT_COLOR_MAP : CHART_COLOR_MAP;
      const merged: Record<string, { types: Set<string>; label: string; amount: number }> = {};
      for (const acc of reportableAccounts) {
        const rawBalance = typeof acc.balance === 'string' ? parseFloat(acc.balance) : acc.balance;
        const catInfo = colorMap[acc.type];
        if (!catInfo) continue;
        const converted = convertCurrency(rawBalance, acc.currency || 'USD', baseCurrency);
        const val = isDebt ? Math.abs(converted) : converted;
        if (val <= 0) continue;
        const g = (merged[catInfo.label] ||= { types: new Set<string>(), label: catInfo.label, amount: 0 });
        g.amount += val;
        g.types.add(acc.type);
      }
      return Object.values(merged)
        .sort((a, b) => b.amount - a.amount)
        .map((entry, i) => ({
          ...entry,
          key: [...entry.types].sort().join(','),
          color: map[i % map.length],
          group: (isDebt ? 'debt' : 'assets') as 'assets' | 'debt',
          share: 0,
        }));
    };

    const assetCategories = makeCategories(ASSET_DISPLAY_CATEGORIES, false);
    const debtCategories = makeCategories(DEBT_DISPLAY_CATEGORIES, true);
    const assetsSum = assetCategories.reduce((s, c) => s + c.amount, 0);
    const debtsSum = debtCategories.reduce((s, c) => s + c.amount, 0);
    for (const c of assetCategories) c.share = assetsSum > 0 ? c.amount / assetsSum : 0;
    for (const c of debtCategories) c.share = debtsSum > 0 ? c.amount / debtsSum : 0;
    return {
      totalAssets: totals.totalAssets,
      totalLiabilities: totals.totalLiabilities,
      assetCategories,
      debtCategories,
    };
  }, [accounts, baseCurrency]);

  const activeCategories = activeTab === 'assets' ? assetCategories : debtCategories;
  const activeTotal = activeTab === 'assets' ? totalAssets : totalLiabilities;

  const treemapData = useMemo(
    () =>
      activeCategories.map((cat) => ({
        name: cat.label,
        value: cat.amount,
        key: cat.key,
        color: cat.color,
      })),
    [activeCategories]
  );

  const pieData = useMemo(() => {
    return activeCategories.map((cat) => ({
      id: cat.label,
      value: cat.amount,
      color: cat.color,
      key: cat.key,
    }));
  }, [activeCategories]);

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
        <div className="p-3 sm:p-5 animate-pulse">
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
      <div className="px-3 sm:px-5 pt-4">
        <div className="flex flex-wrap items-center justify-center gap-1">
          <SegPill
            options={[
              { id: 'donut', label: 'Donut' },
              { id: 'treemap', label: 'Treemap' },
            ]}
            value={view as 'donut' | 'treemap'}
            onChange={(v) => setView(v)}
            truncateLabels
          />
          <span className="px-0.5 text-xs text-sidebar-foreground/55 select-none" aria-hidden="true">|</span>
          <SegPill
            options={[
              { id: 'assets', label: 'Assets' },
              { id: 'debt', label: 'Debt' },
            ]}
            value={activeTab}
            onChange={(v) => setActiveTab(v)}
            truncateLabels
          />
        </div>
      </div>
      <div className="px-3 sm:px-5 py-4">
          {view === 'donut' && (
          <>
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
                        const amount = datum.value as number;
                        return (
                          <ChartTooltip>
                            <TooltipHeader>{String(datum.id)}</TooltipHeader>
                            <TooltipRow label="Amount" value={formatCompact(amount)} />
                            {activeTotal > 0 && (
                              <TooltipRow
                                label="Share"
                                value={`${((amount / activeTotal) * 100).toFixed(1)}%`}
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

            <div className="flex-1 space-y-2 pt-1">
              {activeCategories.map((cat) => {
                return (
                  <div
                    key={cat.label}
                    className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5 transition-colors"
                    onClick={() => handleClick(cat.key)}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{
                        backgroundColor: cat.color,
                        backgroundImage:
                          cat.group === 'debt'
                            ? 'repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(127,127,127,0.55) 2px, rgba(127,127,127,0.55) 2.8px)'
                            : undefined,
                      }}
                    />
                    <span className="text-xs text-foreground/80 flex-1">{cat.label}</span>
                    <span className="text-xs text-foreground font-medium tabular-nums blur-number">
                      {formatCompact(cat.amount)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          </>
          )}

          {view === 'treemap' && (
          <div>
            <div className="relative h-[240px] rounded-lg overflow-hidden">
              {treemapData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <Treemap
                    data={treemapData}
                    dataKey="value"
                    nameKey="name"
                    stroke="var(--color-card)"
                    animationDuration={280}
                    animationEasing="ease-out"
                    content={(props: any) => {
                      const { x, y, width, height, index } = props;
                      if (typeof width === 'number' && typeof height === 'number' && width <= 0 && height <= 0) {
                        return <rect key={`tm-${index}`} />;
                      }
                      const item = treemapData[index];
                      if (!item) return <rect key={`tm-${index}`} />;
                      const groupTotal = activeTotal;
                      const sharePct = groupTotal > 0 ? ((item.value as number) / groupTotal) * 100 : 0;
                      const showLabel = width > 42 && height > 24;
                      const showAmount = height > 40;
                      const showPct = height > 54;
                      const r = 3;
                      return (
                        <g key={`tm-${index}`} style={{ cursor: 'pointer' }} onClick={() => item.key && handleClick(String(item.key))}>
                          <defs>
                            <clipPath id={`net-worth-tm-label-${index}`}>
                              <rect x={x + 4} y={y + 2} width={Math.max(0, width - 8)} height={Math.max(0, height - 4)} />
                            </clipPath>
                          </defs>
                          <path
                            d={`M${x + r},${y} h${width - 2 * r} a${r},${r} 0 0 1 ${r},${r} v${height - 2 * r} a${r},${r} 0 0 1 -${r},${r} h${-(width - 2 * r)} a${r},${r} 0 0 1 -${r},-${r} v${-(height - 2 * r)} a${r},${r} 0 0 1 ${r},-${r} Z`}
                            fill={item.color}
                            fillOpacity={0.85}
                            stroke="var(--color-card)"
                          />
                          {showLabel && (
                            <g clipPath={`url(#net-worth-tm-label-${index})`}>
                                <text x={x + 6} y={y + 15} fill="white" stroke="none" strokeWidth={0} fontSize={width < 70 ? 10 : 12} fontWeight="600">
                                  {truncateTreemapLabel(item.name, width)}
                                </text>
                                {showAmount && <text x={x + 6} y={y + 30} fill="white" stroke="none" strokeWidth={0} fontSize={width < 70 ? 10 : 11} opacity="0.9" className="blur-number">
                                {formatCompact(item.value as number)}
                              </text>}
                              {showPct && (
                                <text x={x + 6} y={y + 44} fill="white" stroke="none" strokeWidth={0} fontSize="10" opacity="0.75">
                                  {sharePct.toFixed(1)}%
                                </text>
                              )}
                            </g>
                          )}
                        </g>
                      );
                    }}
                  >
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload || !payload.length) return null;
                        const datum = payload[0].payload;
                        return (
                          <ChartTooltip>
                            <TooltipHeader>{String(datum.name)}</TooltipHeader>
                            <TooltipRow label="Amount" value={formatCompact(datum.value as number)} />
                            {activeTotal > 0 && (
                              <TooltipRow
                                label="Share"
                                value={`${((datum.value as number) / activeTotal * 100).toFixed(1)}%`}
                              />
                            )}
                          </ChartTooltip>
                        );
                      }}
                    />
                  </Treemap>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
                  No categories
                </div>
              )}
            </div>

            <div className="mt-3 flex justify-center">
              {activeCategories.length > 0 ? (
                <div className="w-fit max-w-full">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                    {activeCategories.map((cat) => {
                      const share = activeTotal > 0 ? (cat.amount / activeTotal) * 100 : 0;
                      return (
                        <div
                          key={cat.label}
                          className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded px-2 py-1.5 transition-colors"
                          onClick={() => handleClick(cat.key)}
                        >
                          <span
                            className="w-3 h-3 rounded-sm flex-shrink-0 border border-border"
                            style={{ backgroundColor: cat.color }}
                          />
                          <span className="text-xs text-foreground/80 flex-1 truncate">{cat.label}</span>
                          <span className="text-xs text-foreground font-medium tabular-nums blur-number flex-shrink-0 flex items-baseline gap-1.5">
                            {formatCompact(cat.amount)}
                            <span className="text-[10px] text-muted-foreground font-normal">{share.toFixed(1)}%</span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <p className="text-center text-xs text-muted-foreground">No categories</p>
              )}
            </div>
          </div>
          )}
          </div>
        </div>
      );
}
