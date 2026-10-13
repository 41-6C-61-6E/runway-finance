'use client';

import { useMemo } from 'react';
import { X, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from 'recharts';
import { getSeriesColor } from './account-types';
import type { Account } from './account-types';
import type { TimeRange } from '../../charts/chart-filters';
import { getPreciseDateRange } from '../../../lib/utils/date-window';
import { formatCurrency, formatPlainPercent } from '../../../lib/utils/format';
import {
  isAssetAccount,
  isLiabilityAccount,
  isAccountActiveOnDate,
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

interface GroupDetailPanelProps {
  group: string | null;
  accounts: Account[];
  historyData: any[];
  hierarchyTimeframe: TimeRange;
  onHierarchyTimeframeChange?: (tf: TimeRange) => void;
  onClose: () => void;
}

interface GroupTooltipProps
  extends Omit<TooltipProps<number, string>, 'active' | 'payload'> {
  active?: boolean;
  payload?: any[];
  label?: string;
  timeframe: TimeRange;
  colors: Map<string, string>;
}

function GroupTooltip({ active, payload, label, timeframe, colors }: GroupTooltipProps) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((p) => p.value != null && !Number.isNaN(Number(p.value)));
  if (rows.length === 0) return null;
  const total = rows.reduce((sum, p) => sum + (Number(p.value) || 0), 0);

  return (
    <ChartTooltip>
      <TooltipHeader>
        {label
          ? formatChartXAxisDate(String(label), timeframe, {
              isMonthly: timeframe !== '1m',
            })
          : '—'}
      </TooltipHeader>
      <div className="space-y-0.5">
        {rows.map((p) => (
          <TooltipRow
            key={String(p.dataKey)}
            label={String(p.name ?? p.dataKey)}
            value={formatCurrency(Number(p.value) || 0)}
            color={colors.get(String(p.dataKey))}
          />
        ))}
        <TooltipRow
          label="Total"
          value={formatCurrency(total)}
          className="mt-1 pt-1 border-t border-border/40"
        />
      </div>
    </ChartTooltip>
  );
}

interface CompositionEntry {
  name: string;
  value: number;
  color: string;
}

export default function GroupDetailPanel({
  group,
  accounts,
  historyData,
  hierarchyTimeframe,
  onHierarchyTimeframeChange,
  onClose,
}: GroupDetailPanelProps) {
  const {
    windowEnd, setWindowEnd, prevWindow, nextWindow, isNextDisabled, windowLabel, periodOptions, showWindowNav,
  } = useDateWindow(null, `finance:group-detail:${group ?? 'default'}:windowEnd`, hierarchyTimeframe, hierarchyTimeframe);
  const isLiab = useMemo(
    () => accounts.some((a) => isLiabilityAccount(a.type)),
    [accounts]
  );

  // Per-account series colors (shared by chart, tooltip, and donut)
  const colorByAccount = useMemo(() => {
    const map = new Map<string, string>();
    accounts.forEach((acc, i) => {
      map.set(acc.id, getSeriesColor(acc.id, 'account', i, isAssetAccount(acc.type)));
    });
    return map;
  }, [accounts]);

  // Sliced history window (shared by chart + stats) - uses windowEnd for navigable timeframes
  const slicedHistory = useMemo(() => {
    if (historyData.length === 0) return [];
    const range = getPreciseDateRange(hierarchyTimeframe, showWindowNav ? windowEnd : undefined);
    return historyData.filter((d) => d.date >= range.start && d.date <= range.end);
  }, [historyData, hierarchyTimeframe, windowEnd, showWindowNav]);

  // Trend stats for the combined group series over the visible timeframe
  const trendStats = useMemo(() => {
    if (slicedHistory.length === 0) return null;
    const points = slicedHistory.map((d) =>
      accounts.reduce((sum, acc) => {
        const v = d[acc.id];
        // Absent (null/undefined) means the account is no longer active at
        // this date (e.g. mortgage paid off / refinanced) — exclude it.
        return v == null ? sum : sum + (Number(v) || 0);
      }, 0)
    );
    const starting = Math.abs(points[0] || 0);
    const current = Math.abs(points[points.length - 1] || 0);
    const change = current - starting;
    const percentChange = starting ? (change / starting) * 100 : 0;
    return {
      current,
      starting,
      change,
      percentChange,
      isPositive: isLiab ? change <= 0 : change >= 0,
    };
  }, [slicedHistory, accounts, isLiab]);

  // Combined per-account rows for the stacked chart
  const chartData = useMemo(
    () =>
      slicedHistory.map((d) => {
        const row: Record<string, number | string> = { date: d.date };
        for (const acc of accounts) row[acc.id] = d[acc.id] ?? 0;
        return row;
      }),
    [slicedHistory, accounts]
  );

  // Keep the largest account at the base of the stacked area chart. This makes
  // changes in smaller accounts move their own boundary instead of shifting
  // every series below them.
  const chartAccounts = useMemo(() => {
    const latestBalances = new Map<string, number>();
    for (const acc of accounts) {
      for (let i = slicedHistory.length - 1; i >= 0; i--) {
        const value = slicedHistory[i][acc.id];
        if (value != null) {
          latestBalances.set(acc.id, Math.abs(Number(value) || 0));
          break;
        }
      }
    }

    return accounts
      .map((acc, index) => ({ acc, index }))
      .sort(
        (a, b) =>
          (latestBalances.get(b.acc.id) || 0) -
            (latestBalances.get(a.acc.id) || 0) ||
          a.index - b.index
      )
      .map(({ acc }) => acc);
  }, [accounts, slicedHistory]);

  const maxStackedTotal = useMemo(() => {
    if (chartData.length === 0 || accounts.length === 0) return 0;
    let max = 0;
    for (const row of chartData) {
      let sum = 0;
      for (const acc of accounts) sum += (row[acc.id] as number) ?? 0;
      if (sum > max) max = sum;
    }
    return max > 0 ? max : 1;
  }, [chartData, accounts]);

  // Per-account composition at the most recent known balance point
  const composition = useMemo(() => {
    const entries: CompositionEntry[] = [];
    const todayStr = new Date().toISOString().split('T')[0];

    for (const acc of accounts) {
      // 1. Exclude accounts that have ended (refinanced or paid off)
      let isClosedMortgage = false;
      if (acc.metadata) {
        try {
          const meta = typeof acc.metadata === 'string' ? JSON.parse(acc.metadata) : acc.metadata;
          if (meta && ['paid_off', 'refinanced'].includes(meta.mortgageStatus)) {
            const endEventDate = meta.mortgageStatus === 'paid_off' ? meta.payoffDate : meta.refinanceDate;
            if (!endEventDate || todayStr >= endEventDate) {
              isClosedMortgage = true;
            }
          }
        } catch {
          // Ignore parse errors
        }
      }
      if (isClosedMortgage || !isAccountActiveOnDate(acc, todayStr)) {
        continue;
      }

      // 2. Parse live balance (handles number, string representation, and negative liability sign)
      const raw = acc.balance;
      const parsed = typeof raw === 'string' ? parseFloat(raw) : Number(raw);
      let value = Number.isFinite(parsed) ? (isLiab ? Math.abs(parsed) : parsed) : 0;

      // 3. Fallback ONLY when balance is completely unparseable (undefined/NaN/null)
      // and only inspect the latest historical point — never scan backward to resurrect old balances.
      if (!Number.isFinite(parsed) && historyData.length > 0) {
        const latestVal = historyData[historyData.length - 1]?.[acc.id];
        if (latestVal != null) {
          value = isLiab ? Math.abs(Number(latestVal) || 0) : Number(latestVal) || 0;
        }
      }

      if (value > 0) {
        entries.push({
          name: acc.name,
          value,
          color: colorByAccount.get(acc.id) || 'var(--chart-1)',
        });
      }
    }
    return entries.sort((a, b) => b.value - a.value);
  }, [accounts, historyData, colorByAccount, isLiab]);

  const compositionTotal = useMemo(
    () => composition.reduce((sum, entry) => sum + entry.value, 0),
    [composition]
  );

  if (!group || accounts.length === 0) return null;

  const xAxisTicks = getChartXTicksUnified(chartData, hierarchyTimeframe, false, 'date');

  return (
    <div className="bg-sidebar border border-sidebar-border rounded-2xl shadow-sm overflow-hidden text-sidebar-foreground">
      {/* Header */}
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-sidebar-foreground truncate">
                {group}
              </h2>
              <span className="text-[11px] text-muted-foreground bg-muted/60 rounded-full px-2 py-0.5 flex-shrink-0">
                {accounts.length} account{accounts.length !== 1 ? 's' : ''}
              </span>
            </div>

          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close group details"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Total + period delta */}
        <div className="flex items-baseline gap-2.5 mt-2.5 flex-wrap">
          <p className="text-xl sm:text-2xl font-bold font-mono text-sidebar-foreground blur-number">
            {formatCurrency(trendStats?.current ?? 0)}
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
        windowNav={showWindowNav ? (
          <DateWindowNav prev={prevWindow} next={nextWindow} nextDisabled={isNextDisabled} label={windowLabel} options={periodOptions} currentValue={windowEnd} onSelect={setWindowEnd} timeframe={hierarchyTimeframe} />
        ) : undefined}
        className="bg-card/30 border-0"
      />

      <div className="px-4 sm:px-5 pb-5 sm:pb-6 space-y-5">
        {/* Combined group history chart (stacked by account) */}
        <div>
          <div className="h-[240px] w-full relative overflow-hidden flex items-center justify-center">
            {chartData.length < 2 ? (
              <ChartEmptyState variant="insufficient" />
            ) : (
              <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 100, height: 100 }}>
                <AreaChart
                  data={chartData}
                  margin={{ top: 15, right: 8, bottom: 0, left: -10 }}
                >
                  <defs>
                    {chartAccounts.map((acc) => {
                      const color = colorByAccount.get(acc.id) || 'var(--chart-1)';
                      return (
                        <linearGradient
                          key={acc.id}
                          id={`gradient-group-${acc.id}`}
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop offset="5%" stopColor={color} stopOpacity={0.45} />
                          <stop offset="95%" stopColor={color} stopOpacity={0.08} />
                        </linearGradient>
                      );
                    })}
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--color-border)"
                    vertical={false}
                    opacity={0.25}
                  />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: 'var(--color-muted-foreground)', fontSize: 9 }}
                    ticks={xAxisTicks as any}
                    tickFormatter={(d: string) =>
                      formatChartXAxisDate(d, hierarchyTimeframe, {
                        isMonthly: hierarchyTimeframe !== '1m',
                      })
                    }
                    minTickGap={30}
                  />
                  <YAxis
                    width={48}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: 'var(--color-muted-foreground)', fontSize: 9 }}
                    domain={[0, maxStackedTotal]}
                    tickFormatter={(v: number) =>
                      formatChartYAxisCurrency(v, 0, maxStackedTotal)
                    }
                  />
                  <Tooltip
                    content={
                      <GroupTooltip timeframe={hierarchyTimeframe} colors={colorByAccount} />
                    }
                    cursor={{ stroke: 'var(--color-border)', strokeWidth: 1, strokeDasharray: '2 2', opacity: 0.5 }}
                    wrapperStyle={{ zIndex: 50 }}
                  />
                  {chartAccounts.map((acc) => (
                    <Area
                      key={acc.id}
                      type="monotone"
                      dataKey={acc.id}
                      name={acc.name}
                      stackId="group"
                      stroke={colorByAccount.get(acc.id) || 'var(--chart-1)'}
                      strokeWidth={1.5}
                      fill={`url(#gradient-group-${acc.id})`}
                      fillOpacity={1}
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Per-account composition */}
        {composition.length > 1 && (
          <div className="space-y-3 pt-5 border-t border-sidebar-border/60">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {isLiab ? 'Debt breakdown' : 'Balance breakdown'}
            </h3>
            <div className="flex items-center gap-4 sm:gap-5">
              <div
                className="relative flex-shrink-0"
                style={{ width: 130, height: 130 }}
              >
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} initialDimension={{ width: 130, height: 130 }}>
                  <PieChart>
                    <Pie
                      data={composition}
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
                      {composition.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-2">
                  <p className="font-mono text-[11px] font-bold text-sidebar-foreground blur-number text-center leading-tight">
                    {formatCurrency(compositionTotal)}
                  </p>
                </div>
              </div>
              <div className="flex-1 min-w-0 space-y-2">
                {composition.slice(0, 5).map((entry) => (
                  <div
                    key={entry.name}
                    className="flex items-center gap-2 text-xs min-w-0"
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: entry.color }}
                    />
                    <span
                      className="truncate text-sidebar-foreground flex-1 min-w-0"
                      title={entry.name}
                    >
                      {entry.name}
                    </span>
                    <span className="font-mono text-muted-foreground flex-shrink-0 blur-number">
                      {formatCurrency(entry.value)}
                    </span>
                    <span className="w-9 text-right text-muted-foreground flex-shrink-0">
                      {compositionTotal
                        ? Math.round((entry.value / compositionTotal) * 100)
                        : 0}
                      %
                    </span>
                  </div>
                ))}
                {composition.length > 5 && (
                  <p className="text-[11px] text-muted-foreground">
                    +{composition.length - 5} more
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
