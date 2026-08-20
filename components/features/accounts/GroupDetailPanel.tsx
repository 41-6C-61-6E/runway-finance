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
import { formatCurrency } from '../../../lib/utils/format';
import { isAssetAccount, isLiabilityAccount } from '../../../lib/utils/account-scope';
import { ChartTooltip, TooltipHeader, TooltipRow } from '../../charts/chart-tooltip';
import {
  formatChartXAxisDate,
  formatChartYAxisCurrency,
  getChartXTicksUnified,
} from '../../../lib/utils/chart-format';
import { ChartEmptyState } from '../../charts/chart-empty-state';

interface GroupDetailPanelProps {
  group: string | null;
  accounts: Account[];
  historyData: any[];
  hierarchyTimeframe: TimeRange;
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
  onClose,
}: GroupDetailPanelProps) {
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

  // Sliced history window (shared by chart + stats)
  const slicedHistory = useMemo(() => {
    if (historyData.length === 0) return [];
    const range = getPreciseDateRange(hierarchyTimeframe);
    return historyData.filter((d) => d.date >= range.start && d.date <= range.end);
  }, [historyData, hierarchyTimeframe]);

  // Trend stats for the combined group series over the visible timeframe
  const trendStats = useMemo(() => {
    if (slicedHistory.length === 0) return null;
    const points = slicedHistory.map((d) =>
      accounts.reduce((sum, acc) => sum + (d[acc.id] ?? 0), 0)
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
    if (historyData.length === 0) return [] as CompositionEntry[];
    const entries: CompositionEntry[] = [];
    for (const acc of accounts) {
      let value = 0;
      // Walk back from the latest point to find the account's most recent known balance
      for (let j = historyData.length - 1; j >= 0; j--) {
        const v = historyData[j][acc.id];
        if (v == null) continue;
        value = v;
        break;
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
  }, [accounts, historyData, colorByAccount]);

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
            <p className="text-xs text-muted-foreground mt-1">
              {isLiab
                ? 'Total debt in this category'
                : 'Combined balance across all accounts'}
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted/60 transition-colors flex-shrink-0 ml-2"
            aria-label="Close group details"
          >
            <X className="w-4 h-4 text-muted-foreground" />
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
              {Math.abs(trendStats.percentChange).toFixed(1)}%)
            </p>
          )}
        </div>
      </div>

      <div className="px-2 sm:px-3 pb-4 sm:pb-5 space-y-5">
        {/* Combined group history chart (stacked by account) */}
        <div className="rounded-2xl border border-sidebar-border bg-card/50 shadow-sm overflow-hidden">
          <div className="p-3 sm:p-4 space-y-2">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Combined history
            </h3>
            {chartData.length < 2 ? (
              <div className="h-[180px]">
                <ChartEmptyState variant="insufficient" />
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart
                  data={chartData}
                  margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
                >
                  <defs>
                    {accounts.map((acc) => {
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
                  />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={{ stroke: 'var(--color-border)' }}
                    tick={{ fill: 'var(--color-muted-foreground)', fontSize: 10 }}
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
                    tick={{ fill: 'var(--color-muted-foreground)', fontSize: 10 }}
                    domain={[0, maxStackedTotal]}
                    tickFormatter={(v: number) =>
                      formatChartYAxisCurrency(v, 0, maxStackedTotal)
                    }
                  />
                  <ReferenceLine y={0} stroke="var(--color-border)" strokeWidth={1} />
                  <Tooltip
                    content={
                      <GroupTooltip timeframe={hierarchyTimeframe} colors={colorByAccount} />
                    }
                    cursor={{ stroke: 'var(--color-border)', opacity: 0.5 }}
                  />
                  {accounts.map((acc) => (
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
          <div className="rounded-2xl border border-sidebar-border bg-card/50 shadow-sm">
            <div className="p-3 sm:p-4 space-y-3">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {isLiab ? 'Debt breakdown' : 'Balance breakdown'}
              </h3>
              <div className="flex items-center gap-4 sm:gap-5">
                <div
                  className="relative flex-shrink-0"
                  style={{ width: 130, height: 130 }}
                >
                  <ResponsiveContainer width="100%" height="100%">
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
          </div>
        )}
      </div>
    </div>
  );
}
