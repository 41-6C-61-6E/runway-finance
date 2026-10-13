'use client';

import { useId, useMemo, useState } from 'react';
import { X, ArrowUpRight, ArrowDownRight, Layers } from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from 'recharts';
import {
  getHierarchy,
  getSeriesColor,
  GROUP_ORDER,
  type Account,
} from './account-types';
import type { TimeRange } from '../../charts/chart-filters';
import { getPreciseDateRange } from '../../../lib/utils/date-window';
import { formatCurrency, formatPlainPercent } from '../../../lib/utils/format';
import {
  isAssetAccount,
  isLiabilityAccount,
  isAccountActiveOnDate,
  isReportableAccount,
} from '../../../lib/utils/account-scope';
import { ChartTooltip, TooltipHeader, TooltipRow } from '../../charts/chart-tooltip';
import {
  formatChartXAxisDate,
  formatChartYAxisCurrency,
  getChartXTicksUnified,
} from '../../../lib/utils/chart-format';
import { ChartEmptyState } from '../../charts/chart-empty-state';
import { ChartTimeframeBar } from '../../charts/chart-timeframe-bar';
import { DateWindowNav } from '../../charts/date-window-nav';
import { useDateWindow } from '../../../lib/hooks/use-date-window';

interface AllAccountsDetailPanelProps {
  accounts: Account[];
  historyData: any[];
  hierarchyTimeframe: TimeRange;
  onHierarchyTimeframeChange?: (tf: TimeRange) => void;
  onClose: () => void;
}

interface AllAccountsTooltipProps
  extends Omit<TooltipProps<number, string>, 'active' | 'payload'> {
  active?: boolean;
  payload?: any[];
  label?: string;
  timeframe: TimeRange;
  mode: 'net-worth' | 'by-group';
  groupColors?: Map<string, string>;
}

function AllAccountsTooltip({
  active,
  payload,
  label,
  timeframe,
  mode,
  groupColors,
}: AllAccountsTooltipProps) {
  if (!active || !payload?.length) return null;
  const validRows = payload.filter((p) => p.value != null && !Number.isNaN(Number(p.value)));
  if (validRows.length === 0) return null;

  const headerDate = label
    ? formatChartXAxisDate(String(label), timeframe, {
        isMonthly: timeframe !== '1m',
      })
    : '—';

  if (mode === 'net-worth') {
    const netWorthRow = validRows.find((p) => p.dataKey === 'netWorth') || validRows[0];
    const pointData = netWorthRow?.payload || {};
    const netWorthVal = Number(netWorthRow?.value) || 0;
    const totalAssets = Number(pointData.totalAssets) || 0;
    const totalLiabilities = Number(pointData.totalLiabilities) || 0;

    return (
      <ChartTooltip>
        <TooltipHeader>{headerDate}</TooltipHeader>
        <div className="space-y-1">
          <TooltipRow
            label="Net Worth"
            value={formatCurrency(netWorthVal)}
            color="var(--chart-1)"
          />
          {totalAssets > 0 && (
            <TooltipRow
              label="Total Assets"
              value={formatCurrency(totalAssets)}
              color="var(--chart-2)"
            />
          )}
          {totalLiabilities > 0 && (
            <TooltipRow
              label="Total Debt"
              value={formatCurrency(totalLiabilities)}
              color="var(--destructive)"
            />
          )}
        </div>
      </ChartTooltip>
    );
  }

  // by-group mode
  const netWorthRow = validRows.find((p) => p.dataKey === 'netWorth');
  const netWorthVal = netWorthRow
    ? Number(netWorthRow.value)
    : (validRows[0]?.payload?.netWorth ?? 0);

  const assetRows = validRows.filter(
    (p) => p.dataKey !== 'netWorth' && Number(p.value) > 0
  );
  const liabilityRows = validRows.filter(
    (p) => p.dataKey !== 'netWorth' && Number(p.value) < 0
  );

  const totalAssets = assetRows.reduce((sum, p) => sum + Number(p.value), 0);
  const totalLiabilities = liabilityRows.reduce(
    (sum, p) => sum + Math.abs(Number(p.value)),
    0
  );

  return (
    <ChartTooltip>
      <TooltipHeader>{headerDate}</TooltipHeader>
      <div className="space-y-1.5 min-w-[190px]">
        {/* Net Worth Headline */}
        <div className="pb-1 border-b border-border/40">
          <TooltipRow
            label="Net Worth"
            value={formatCurrency(netWorthVal)}
            color="var(--foreground)"
            className="font-bold text-foreground"
          />
        </div>

        {/* Assets Section */}
        {assetRows.length > 0 && (
          <div className="space-y-0.5">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              <span>Assets</span>
              <span>{formatCurrency(totalAssets)}</span>
            </div>
            {assetRows.map((p) => (
              <TooltipRow
                key={String(p.dataKey)}
                label={String(p.name ?? p.dataKey)}
                value={formatCurrency(Number(p.value) || 0)}
                color={groupColors?.get(String(p.dataKey))}
              />
            ))}
          </div>
        )}

        {/* Debts Section */}
        {liabilityRows.length > 0 && (
          <div className="space-y-0.5 pt-1 border-t border-border/40">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-destructive font-semibold">
              <span>Debts</span>
              <span>{formatCurrency(totalLiabilities)}</span>
            </div>
            {liabilityRows.map((p) => (
              <TooltipRow
                key={String(p.dataKey)}
                label={String(p.name ?? p.dataKey)}
                value={formatCurrency(Math.abs(Number(p.value)) || 0)}
                color={groupColors?.get(String(p.dataKey)) || 'var(--destructive)'}
              />
            ))}
          </div>
        )}
      </div>
    </ChartTooltip>
  );
}

interface GroupAllocationEntry {
  name: string;
  value: number;
  count: number;
  isAsset: boolean;
  color: string;
}

export default function AllAccountsDetailPanel({
  accounts,
  historyData,
  hierarchyTimeframe,
  onHierarchyTimeframeChange,
  onClose,
}: AllAccountsDetailPanelProps) {
  const [chartMode, setChartMode] = useState<'net-worth' | 'by-group'>('by-group');
  const panelId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const netWorthGradientId = `gradient-all-accounts-networth-${panelId}`;
  const getGradientId = (group: string) =>
    `gradient-group-all-${panelId}-${group.toLowerCase().replace(/[^a-z0-9_-]/g, '-')}`;

  const {
    windowEnd,
    setWindowEnd,
    prevWindow,
    nextWindow,
    isNextDisabled,
    windowLabel,
    periodOptions,
    showWindowNav,
  } = useDateWindow(
    null,
    'finance:all-accounts:windowEnd',
    hierarchyTimeframe,
    hierarchyTimeframe
  );

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  // Compute live current totals across all active accounts
  const currentTotals = useMemo(() => {
    let totalAssets = 0;
    let totalLiabilities = 0;

    for (const acc of accounts) {
      if (!isReportableAccount(acc)) continue;
      if (!isAccountActiveOnDate(acc, todayStr)) continue;

      const raw = acc.balance;
      const parsed = typeof raw === 'string' ? parseFloat(raw) : Number(raw);
      if (!Number.isFinite(parsed)) continue;

      if (isAssetAccount(acc.type)) {
        totalAssets += parsed;
      } else if (isLiabilityAccount(acc.type)) {
        totalLiabilities += Math.abs(parsed);
      }
    }

    return {
      totalAssets,
      totalLiabilities,
      netWorth: totalAssets - totalLiabilities,
      debtRatio: totalAssets > 0 ? (totalLiabilities / totalAssets) * 100 : 0,
    };
  }, [accounts, todayStr]);

  // Sliced history window
  const slicedHistory = useMemo(() => {
    if (historyData.length === 0) return [];
    const range = getPreciseDateRange(hierarchyTimeframe, showWindowNav ? windowEnd : undefined);
    return historyData.filter((d) => d.date >= range.start && d.date <= range.end);
  }, [historyData, hierarchyTimeframe, windowEnd, showWindowNav]);

  // Overall trend stats for Net Worth
  const trendStats = useMemo(() => {
    if (slicedHistory.length === 0) return null;

    const points = slicedHistory.map((d) => {
      if (typeof d.netWorth === 'number' && !Number.isNaN(d.netWorth)) {
        return d.netWorth;
      }
      let net = 0;
      for (const acc of accounts) {
        const v = d[acc.id];
        if (v == null) continue;
        const num = Number(v) || 0;
        if (isAssetAccount(acc.type)) net += num;
        else if (isLiabilityAccount(acc.type)) net -= Math.abs(num);
      }
      return net;
    });

    const starting = points[0] ?? 0;
    const current = points[points.length - 1] ?? 0;
    const change = current - starting;
    const percentChange = starting !== 0 ? (change / Math.abs(starting)) * 100 : 0;

    return {
      starting,
      current,
      change,
      percentChange,
      isPositive: change >= 0,
    };
  }, [slicedHistory, accounts]);

  const isLiabilityGroup = (group: string) =>
    ['Loans', 'Liabilities', 'Credit'].includes(group);

  // Distinct groups present among accounts with stable colors
  const presentGroups = useMemo(() => {
    const set = new Set<string>();
    accounts.forEach((a) => {
      set.add(getHierarchy(a.type).group);
    });
    return Array.from(set).sort((a, b) => {
      const ai = GROUP_ORDER.indexOf(a);
      const bi = GROUP_ORDER.indexOf(b);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.localeCompare(b);
    });
  }, [accounts]);

  const presentAssetGroups = useMemo(
    () => presentGroups.filter((g) => !isLiabilityGroup(g)),
    [presentGroups]
  );

  const presentLiabilityGroups = useMemo(
    () => presentGroups.filter((g) => isLiabilityGroup(g)),
    [presentGroups]
  );

  const colorByGroup = useMemo(() => {
    const map = new Map<string, string>();
    presentAssetGroups.forEach((group, i) => {
      map.set(group, getSeriesColor(group, 'group', i, true));
    });
    presentLiabilityGroups.forEach((group, i) => {
      map.set(group, getSeriesColor(group, 'group', i, false));
    });
    return map;
  }, [presentAssetGroups, presentLiabilityGroups]);

  // Combined chart data supporting Net Worth mode & By Group balance sheet mode
  const chartData = useMemo(() => {
    return slicedHistory.map((d) => {
      const row: Record<string, any> = {
        date: d.date,
        netWorth: d.netWorth ?? 0,
        totalAssets: 0,
        totalLiabilities: 0,
      };

      for (const acc of accounts) {
        const v = d[acc.id];
        if (v == null) continue;
        const num = Number(v) || 0;
        const isAsset = isAssetAccount(acc.type);
        const isLiab = isLiabilityAccount(acc.type);
        const { group } = getHierarchy(acc.type);

        if (isAsset) {
          row.totalAssets += num;
          row[group] = (row[group] || 0) + num;
        } else if (isLiab) {
          const abs = Math.abs(num);
          row.totalLiabilities += abs;
          // In By Group mode, liabilities stack downwards below the $0 baseline
          row[group] = (row[group] || 0) - abs;
        } else {
          row[group] = (row[group] || 0) + num;
        }
      }

      if (d.netWorth == null) {
        row.netWorth = row.totalAssets - row.totalLiabilities;
      }

      return row;
    });
  }, [slicedHistory, accounts]);

  // Min / Max for Net Worth mode YAxis
  const netWorthDomain = useMemo(() => {
    if (chartData.length === 0) return [0, 1];
    let min = Infinity;
    let max = -Infinity;
    for (const r of chartData) {
      const v = Number(r.netWorth) || 0;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
    const pad = (max - min) * 0.1 || Math.abs(max) * 0.1 || 1000;
    const lower = min < 0 ? min - pad : Math.max(0, min - pad);
    const upper = max + pad;
    return [lower, upper];
  }, [chartData]);

  // Y-axis domain for By Group balance sheet mode (assets above 0, liabilities below 0, Net Worth line)
  const byGroupDomain = useMemo(() => {
    if (chartData.length === 0) return [0, 1];
    let maxPos = 0;
    let maxNeg = 0;

    for (const row of chartData) {
      let posSum = 0;
      let negSum = 0;
      for (const g of presentAssetGroups) {
        posSum += Math.max(0, (row[g] as number) ?? 0);
      }
      for (const g of presentLiabilityGroups) {
        negSum += Math.abs(Math.min(0, (row[g] as number) ?? 0));
      }
      if (posSum > maxPos) maxPos = posSum;
      if (negSum > maxNeg) maxNeg = negSum;

      const nw = Number(row.netWorth) || 0;
      if (nw > maxPos) maxPos = nw;
      if (nw < -maxNeg) maxNeg = Math.abs(nw);
    }

    const upper = maxPos > 0 ? maxPos * 1.08 : 1000;
    const lower = maxNeg > 0 ? -maxNeg * 1.15 : 0;
    return [lower, upper];
  }, [chartData, presentAssetGroups, presentLiabilityGroups]);

  // Segregated allocation datasets: Assets vs Debts
  const [allocationMode, setAllocationMode] = useState<'assets' | 'debts'>('assets');

  const assetAllocation = useMemo(() => {
    const groupMap = new Map<string, { name: string; value: number; count: number; isAsset: boolean }>();

    for (const acc of accounts) {
      if (!isReportableAccount(acc)) continue;
      if (!isAccountActiveOnDate(acc, todayStr)) continue;
      if (!isAssetAccount(acc.type)) continue;

      const { group } = getHierarchy(acc.type);
      const raw = acc.balance;
      const parsed = typeof raw === 'string' ? parseFloat(raw) : Number(raw);
      if (!Number.isFinite(parsed) || parsed <= 0) continue;

      const existing = groupMap.get(group) || {
        name: group,
        value: 0,
        count: 0,
        isAsset: true,
      };
      existing.value += parsed;
      existing.count += 1;
      groupMap.set(group, existing);
    }

    const entries: GroupAllocationEntry[] = Array.from(groupMap.values()).map((g) => ({
      ...g,
      color: colorByGroup.get(g.name) || 'var(--chart-1)',
    }));

    return entries.sort((a, b) => b.value - a.value);
  }, [accounts, todayStr, colorByGroup]);

  const debtAllocation = useMemo(() => {
    const groupMap = new Map<string, { name: string; value: number; count: number; isAsset: boolean }>();

    for (const acc of accounts) {
      if (!isReportableAccount(acc)) continue;
      if (!isAccountActiveOnDate(acc, todayStr)) continue;
      if (!isLiabilityAccount(acc.type)) continue;

      const { group } = getHierarchy(acc.type);
      const raw = acc.balance;
      const parsed = typeof raw === 'string' ? parseFloat(raw) : Number(raw);
      if (!Number.isFinite(parsed) || parsed === 0) continue;

      const absVal = Math.abs(parsed);
      const existing = groupMap.get(group) || {
        name: group,
        value: 0,
        count: 0,
        isAsset: false,
      };
      existing.value += absVal;
      existing.count += 1;
      groupMap.set(group, existing);
    }

    const entries: GroupAllocationEntry[] = Array.from(groupMap.values()).map((g) => ({
      ...g,
      color: colorByGroup.get(g.name) || 'var(--destructive)',
    }));

    return entries.sort((a, b) => b.value - a.value);
  }, [accounts, todayStr, colorByGroup]);

  const assetAllocationTotal = useMemo(
    () => assetAllocation.reduce((sum, g) => sum + g.value, 0),
    [assetAllocation]
  );

  const debtAllocationTotal = useMemo(
    () => debtAllocation.reduce((sum, g) => sum + g.value, 0),
    [debtAllocation]
  );

  const activeAllocation =
    allocationMode === 'debts' && debtAllocation.length > 0
      ? debtAllocation
      : assetAllocation.length > 0
      ? assetAllocation
      : debtAllocation;

  const isShowingAssets = activeAllocation === assetAllocation;
  const currentAllocationTotal = isShowingAssets ? assetAllocationTotal : debtAllocationTotal;

  const xAxisTicks = getChartXTicksUnified(chartData, hierarchyTimeframe, false, 'date');

  return (
    <div className="bg-sidebar border border-sidebar-border rounded-2xl shadow-sm overflow-hidden text-sidebar-foreground">
      {/* Header */}
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-6 h-6 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                <Layers className="w-3.5 h-3.5" />
              </div>
              <h2 className="text-sm sm:text-base font-bold text-sidebar-foreground truncate">
                All Accounts
              </h2>
              <span className="text-[11px] text-muted-foreground bg-muted/60 rounded-full px-2 py-0.5 flex-shrink-0">
                {accounts.length} account{accounts.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close all accounts overview"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Total Net Worth + delta */}
        <div className="flex items-baseline gap-2.5 mt-2.5 flex-wrap">
          <p className="text-xl sm:text-2xl font-bold font-mono text-sidebar-foreground blur-number">
            {formatCurrency(trendStats?.current ?? currentTotals.netWorth)}
          </p>
          {trendStats && trendStats.change !== 0 && (
            <p
              className={`text-xs sm:text-sm font-medium ${
                trendStats.isPositive ? 'text-chart-1' : 'text-destructive'
              }`}
            >
              {trendStats.change >= 0 ? (
                <ArrowUpRight className="w-3.5 h-3.5 inline -mt-0.5 mr-0.5" />
              ) : (
                <ArrowDownRight className="w-3.5 h-3.5 inline -mt-0.5 mr-0.5" />
              )}
              {formatCurrency(Math.abs(trendStats.change))} (
              {formatPlainPercent(Math.abs(trendStats.percentChange))})
            </p>
          )}
        </div>
      </div>

      <ChartTimeframeBar
        value={hierarchyTimeframe}
        onChange={(v) => onHierarchyTimeframeChange?.(v)}
        windowNav={
          showWindowNav ? (
            <DateWindowNav
              prev={prevWindow}
              next={nextWindow}
              nextDisabled={isNextDisabled}
              label={windowLabel}
              options={periodOptions}
              currentValue={windowEnd}
              onSelect={setWindowEnd}
              timeframe={hierarchyTimeframe}
            />
          ) : undefined
        }
        className="bg-card/30 border-0"
      />

      <div className="px-4 sm:px-5 pb-5 sm:pb-6 space-y-5">
        {/* Chart View with Mode Toggle */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {chartMode === 'net-worth' ? 'Net Worth Trend' : 'Group Breakdown Over Time'}
              </h3>
              {chartMode === 'by-group' && (
                <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className="w-3.5 h-0.5 bg-foreground rounded-full inline-block" />
                  <span>Net Worth</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-1 bg-muted/60 p-0.5 rounded-lg text-xs">
              <button
                type="button"
                onClick={() => setChartMode('net-worth')}
                className={`px-2.5 py-0.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
                  chartMode === 'net-worth'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Net Worth
              </button>
              <button
                type="button"
                onClick={() => setChartMode('by-group')}
                className={`px-2.5 py-0.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
                  chartMode === 'by-group'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                By Group
              </button>
            </div>
          </div>

          <div className="h-[240px] w-full relative overflow-hidden flex items-center justify-center">
            {chartData.length < 2 ? (
              <ChartEmptyState variant="insufficient" />
            ) : chartMode === 'net-worth' ? (
              <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 100, height: 100 }}>
                <AreaChart
                  data={chartData}
                  margin={{ top: 15, right: 8, bottom: 0, left: -10 }}
                >
                  <defs>
                    <linearGradient id={netWorthGradientId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.45} />
                      <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0.06} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="var(--color-border)"
                    opacity={0.35}
                  />
                  <XAxis
                    dataKey="date"
                    ticks={xAxisTicks}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: 'var(--color-muted-foreground)', fontSize: 10 }}
                    tickFormatter={(val: string) =>
                      formatChartXAxisDate(val, hierarchyTimeframe, {
                        isMonthly: hierarchyTimeframe !== '1m',
                      })
                    }
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: 'var(--color-muted-foreground)', fontSize: 10 }}
                    domain={netWorthDomain}
                    tickFormatter={(v: number) =>
                      formatChartYAxisCurrency(v, Number(netWorthDomain[0]), Number(netWorthDomain[1]))
                    }
                  />
                  {Number(netWorthDomain[0]) < 0 && (
                    <ReferenceLine y={0} stroke="var(--color-border)" strokeDasharray="3 3" />
                  )}
                  <Tooltip
                    content={
                      <AllAccountsTooltip
                        timeframe={hierarchyTimeframe}
                        mode="net-worth"
                      />
                    }
                    cursor={{
                      stroke: 'var(--color-border)',
                      strokeWidth: 1,
                      strokeDasharray: '2 2',
                      opacity: 0.5,
                    }}
                    wrapperStyle={{ zIndex: 50 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="netWorth"
                    name="Net Worth"
                    stroke="var(--chart-1)"
                    strokeWidth={2}
                    fill={`url(#${netWorthGradientId})`}
                    fillOpacity={1}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 100, height: 100 }}>
                <ComposedChart
                  data={chartData}
                  stackOffset="sign"
                  margin={{ top: 15, right: 8, bottom: 0, left: -10 }}
                >
                  <defs>
                    {presentGroups.map((g) => {
                      const color = colorByGroup.get(g) || 'var(--chart-1)';
                      const gradId = getGradientId(g);
                      return (
                        <linearGradient key={g} id={gradId} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={color} stopOpacity={0.45} />
                          <stop offset="95%" stopColor={color} stopOpacity={0.08} />
                        </linearGradient>
                      );
                    })}
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="var(--color-border)"
                    opacity={0.35}
                  />
                  <XAxis
                    dataKey="date"
                    ticks={xAxisTicks}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: 'var(--color-muted-foreground)', fontSize: 10 }}
                    tickFormatter={(val: string) =>
                      formatChartXAxisDate(val, hierarchyTimeframe, {
                        isMonthly: hierarchyTimeframe !== '1m',
                      })
                    }
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: 'var(--color-muted-foreground)', fontSize: 10 }}
                    domain={byGroupDomain}
                    tickFormatter={(v: number) =>
                      formatChartYAxisCurrency(v, Number(byGroupDomain[0]), Number(byGroupDomain[1]))
                    }
                  />
                  <ReferenceLine y={0} stroke="var(--color-border)" strokeWidth={1} strokeDasharray="3 3" />
                  <Tooltip
                    content={
                      <AllAccountsTooltip
                        timeframe={hierarchyTimeframe}
                        mode="by-group"
                        groupColors={colorByGroup}
                      />
                    }
                    cursor={{
                      stroke: 'var(--color-border)',
                      strokeWidth: 1,
                      strokeDasharray: '2 2',
                      opacity: 0.5,
                    }}
                    wrapperStyle={{ zIndex: 50 }}
                  />
                  {/* Asset Groups: Stack above $0 */}
                  {presentAssetGroups.map((g) => {
                    const gradId = getGradientId(g);
                    return (
                      <Area
                        key={g}
                        type="monotone"
                        dataKey={g}
                        name={g}
                        stackId="all-groups"
                        stroke={colorByGroup.get(g) || 'var(--chart-1)'}
                        strokeWidth={1.5}
                        fill={`url(#${gradId})`}
                        fillOpacity={1}
                      />
                    );
                  })}
                  {/* Liability Groups: Stack below $0 */}
                  {presentLiabilityGroups.map((g) => {
                    const gradId = getGradientId(g);
                    return (
                      <Area
                        key={g}
                        type="monotone"
                        dataKey={g}
                        name={g}
                        stackId="all-groups"
                        stroke={colorByGroup.get(g) || 'var(--destructive)'}
                        strokeWidth={1.5}
                        fill={`url(#${gradId})`}
                        fillOpacity={1}
                      />
                    );
                  })}
                  {/* Net Worth Line overlay */}
                  <Line
                    type="monotone"
                    dataKey="netWorth"
                    name="Net Worth"
                    stroke="var(--foreground)"
                    strokeWidth={2}
                    dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Group Allocation Donut */}
        {activeAllocation.length > 0 && (
          <div className="space-y-3 pt-5 border-t border-sidebar-border/60">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {isShowingAssets ? 'Asset allocation' : 'Debt breakdown'}
              </h3>
              {assetAllocation.length > 0 && debtAllocation.length > 0 && (
                <div className="flex items-center gap-1 bg-muted/60 p-0.5 rounded-lg text-xs">
                  <button
                    type="button"
                    onClick={() => setAllocationMode('assets')}
                    className={`px-2 py-0.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
                      isShowingAssets
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Assets ({assetAllocation.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setAllocationMode('debts')}
                    className={`px-2 py-0.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
                      !isShowingAssets
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Debts ({debtAllocation.length})
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-4 sm:gap-5">
              <div
                className="relative flex-shrink-0"
                style={{ width: 130, height: 130 }}
              >
                <ResponsiveContainer
                  width="100%"
                  height="100%"
                  minWidth={0}
                  minHeight={0}
                  initialDimension={{ width: 130, height: 130 }}
                >
                  <PieChart>
                    <Pie
                      data={activeAllocation}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius="65%"
                      outerRadius="95%"
                      paddingAngle={2}
                      cornerRadius={3}
                      startAngle={90}
                      endAngle={-270}
                      stroke="none"
                    >
                      {activeAllocation.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-2">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider leading-none">
                    {isShowingAssets ? 'Total Assets' : 'Total Debt'}
                  </span>
                  <p className="font-mono text-[11px] font-bold text-sidebar-foreground blur-number text-center leading-tight mt-0.5">
                    {formatCurrency(currentAllocationTotal)}
                  </p>
                </div>
              </div>
              <div className="flex-1 min-w-0 space-y-2">
                {activeAllocation.slice(0, 6).map((entry) => (
                  <div
                    key={entry.name}
                    className="flex items-center gap-2 text-xs min-w-0"
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: entry.color }}
                    />
                    <span
                      className="truncate text-sidebar-foreground flex-1 min-w-0 font-medium"
                      title={entry.name}
                    >
                      {entry.name}
                      <span className="text-muted-foreground font-normal ml-1">
                        ({entry.count})
                      </span>
                    </span>
                    <span className="font-mono text-muted-foreground flex-shrink-0 blur-number">
                      {formatCurrency(entry.value)}
                    </span>
                    <span className="w-9 text-right text-muted-foreground flex-shrink-0">
                      {currentAllocationTotal
                        ? Math.round((entry.value / currentAllocationTotal) * 100)
                        : 0}
                      %
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
