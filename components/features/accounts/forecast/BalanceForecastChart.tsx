'use client';

import React, { useState, useMemo, useCallback } from 'react';
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
} from 'recharts';
import {
  Calendar,
  Layers,
  Sparkles,
  TrendingUp,
  Activity,
  Sliders,
  DollarSign,
  Info,
  ShieldAlert,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChartTooltip, TooltipRow, TooltipHeader } from '@/components/charts/chart-tooltip';
import { formatCurrency } from '@/lib/utils/format';
import { formatSafeUTCDate } from '@/lib/utils/date';
import { formatChartYAxisCurrency, formatChartXAxisDate } from '@/lib/utils/chart-format';
import { usePrivacyMode } from '@/components/privacy-mode-provider';
import type {
  BalanceForecastPointData,
  HistoricalBalancePointData,
  ForecastHorizon,
  Account,
} from '../account-types';

interface BalanceForecastChartProps {
  projections: BalanceForecastPointData[];
  historical: HistoricalBalancePointData[];
  accounts: Array<{ id: string; name: string; type: string; balance: number }>;
  horizon: ForecastHorizon;
  onHorizonChange: (h: ForecastHorizon) => void;
  safeReserve?: number;
}

type ChartDisplayMode = 'total' | 'by_account' | 'delta';

const HORIZON_OPTIONS: Array<{ id: ForecastHorizon; label: string }> = [
  { id: '30d', label: '30D' },
  { id: '60d', label: '60D' },
  { id: '90d', label: '90D' },
  { id: '6m', label: '6M' },
  { id: '1y', label: '1Y' },
];

const ACCOUNT_COLORS = [
  'var(--color-chart-1)',
  'var(--color-chart-2)',
  'var(--color-chart-3)',
  'var(--color-chart-4)',
  'var(--color-chart-5)',
];

export function BalanceForecastChart({
  projections,
  historical,
  accounts,
  horizon,
  onHorizonChange,
  safeReserve = 1000,
}: BalanceForecastChartProps) {
  const { privacyMode } = usePrivacyMode();
  const [displayMode, setDisplayMode] = useState<ChartDisplayMode>('total');

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  // Merge historical snapshots with forward projections into a unified continuous timeline
  const unifiedData = useMemo(() => {
    const list: Array<Record<string, any>> = [];

    // 1. Historical Actuals (only keep dates strictly before today)
    for (const h of historical) {
      if (h.date < todayStr) {
        list.push({
          date: h.date,
          actualBalance: h.totalBalance,
          isHistorical: true,
          ...h.accounts,
        });
      }
    }

    // 2. Day 0 Bridge (Today): contains both actual and projected start
    const day0Projection = projections[0];
    if (day0Projection) {
      list.push({
        date: day0Projection.date,
        actualBalance: day0Projection.totalBalance,
        projectedBalance: day0Projection.totalBalance,
        isHistorical: false,
        inflows: day0Projection.inflows,
        outflows: day0Projection.outflows,
        netDelta: day0Projection.netDelta,
        events: day0Projection.events,
        ...day0Projection.accounts,
      });
    }

    // 3. Future Projections (Day 1 onward)
    for (let i = 1; i < projections.length; i++) {
      const p = projections[i];
      list.push({
        date: p.date,
        projectedBalance: p.totalBalance,
        isHistorical: false,
        inflows: p.inflows,
        outflows: p.outflows,
        netDelta: p.netDelta,
        events: p.events,
        ...p.accounts,
      });
    }

    return list;
  }, [historical, projections, todayStr]);

  // Compute Y-domain with padding
  const yDomain = useMemo(() => {
    if (unifiedData.length === 0) return [0, 10000];
    let min = Infinity;
    let max = -Infinity;

    for (const d of unifiedData) {
      if (typeof d.actualBalance === 'number') {
        min = Math.min(min, d.actualBalance);
        max = Math.max(max, d.actualBalance);
      }
      if (typeof d.projectedBalance === 'number') {
        min = Math.min(min, d.projectedBalance);
        max = Math.max(max, d.projectedBalance);
      }
    }

    if (min === Infinity) min = 0;
    if (max === -Infinity) max = 1000;

    const pad = Math.max(500, (max - min) * 0.1);
    return [Math.floor(min - pad), Math.ceil(max + pad)];
  }, [unifiedData]);

  const formatXTick = useCallback((v: string) => {
    return formatChartXAxisDate(v, horizon === '6m' || horizon === '1y' ? '1y' : '3m');
  }, [horizon]);

  const formatYTick = useCallback((v: number) => {
    return formatChartYAxisCurrency(v, yDomain[0], yDomain[1]);
  }, [yDomain]);

  return (
    <Card className="border-border/50 bg-card/60 backdrop-blur-sm shadow-xs overflow-hidden">
      {/* ── Chart Header & Controls ── */}
      <div className="p-4 sm:p-5 border-b border-border/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-semibold text-sm sm:text-base text-foreground">Balance Forecast</h3>
          </div>
        </div>

        {/* View Mode & Horizon Selectors */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          {/* Display Mode Toggle */}
          <div className="inline-flex items-center p-0.5 rounded-lg bg-muted/60 border border-border/40 text-xs">
            <button
              onClick={() => setDisplayMode('total')}
              className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                displayMode === 'total'
                  ? 'bg-background text-foreground shadow-xs font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Runway
            </button>
            <button
              onClick={() => setDisplayMode('by_account')}
              className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                displayMode === 'by_account'
                  ? 'bg-background text-foreground shadow-xs font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              By Account
            </button>
            <button
              onClick={() => setDisplayMode('delta')}
              className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                displayMode === 'delta'
                  ? 'bg-background text-foreground shadow-xs font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Cash Flow
            </button>
          </div>

          {/* Horizon Selector */}
          <div className="inline-flex items-center p-0.5 rounded-lg bg-muted/60 border border-border/40 text-xs">
            {HORIZON_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                onClick={() => onHorizonChange(opt.id)}
                className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                  horizon === opt.id
                    ? 'bg-primary text-primary-foreground shadow-xs font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Chart Rendering Canvas ── */}
      <CardContent className="p-4 sm:p-5">
        <div className="h-[340px] sm:h-[380px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            {displayMode === 'delta' ? (
              <BarChart data={unifiedData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} opacity={0.5} />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={{ stroke: 'var(--color-border)' }}
                  tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
                  tickFormatter={formatXTick}
                  minTickGap={35}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
                  width={65}
                  tickFormatter={formatYTick}
                />
                <RechartsTooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload || !payload.length || label === undefined || label === null) return null;
                    const item = payload[0]?.payload;
                    const dateFormatted = formatSafeUTCDate(String(label), {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    });
                    return (
                      <ChartTooltip>
                        <TooltipHeader>{dateFormatted}</TooltipHeader>
                        {item.inflows > 0 && (
                          <TooltipRow
                            label="Expected Inflow"
                            value={`+${formatCurrency(item.inflows)}`}
                            color="var(--color-emerald, #10b981)"
                          />
                        )}
                        {item.outflows > 0 && (
                          <TooltipRow
                            label="Expected Outflow"
                            value={`-${formatCurrency(item.outflows)}`}
                            color="var(--color-rose, #f43f5e)"
                          />
                        )}
                        <TooltipRow
                          label="Net Daily Delta"
                          value={`${item.netDelta >= 0 ? '+' : ''}${formatCurrency(item.netDelta)}`}
                          color={item.netDelta >= 0 ? '#10b981' : '#f43f5e'}
                        />
                        {item.events && item.events.length > 0 && (
                          <div className="pt-2 mt-2 border-t border-border/40 space-y-1">
                            <div className="text-[10px] uppercase font-semibold text-muted-foreground">Scheduled Events</div>
                            {item.events.map((e: any) => (
                              <div key={e.id} className="flex items-center justify-between text-xs gap-4">
                                <span className="truncate max-w-[140px] text-foreground">{e.name}</span>
                                <span className={e.type === 'income' ? 'text-emerald-500 font-medium' : 'text-foreground font-medium'}>
                                  {e.type === 'income' ? '+' : '-'}{formatCurrency(e.amount)}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </ChartTooltip>
                    );
                  }}
                />
                <ReferenceLine y={0} stroke="var(--color-border)" strokeWidth={1} />
                <Bar dataKey="inflows" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={16} />
                <Bar dataKey="outflows" fill="#f43f5e" radius={[3, 3, 0, 0]} maxBarSize={16} />
              </BarChart>
            ) : (
              <ComposedChart data={unifiedData} margin={{ top: 10, right: 15, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="actualGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="var(--primary)" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="projectedGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="var(--primary)" stopOpacity={0.0} />
                  </linearGradient>
                </defs>

                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} opacity={0.5} />

                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={{ stroke: 'var(--color-border)' }}
                  tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
                  tickFormatter={formatXTick}
                  minTickGap={35}
                />
                <YAxis
                  domain={yDomain}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
                  width={65}
                  tickFormatter={formatYTick}
                />

                {/* "Today" Vertical Reference Marker */}
                <ReferenceLine
                  x={todayStr}
                  stroke="var(--color-primary)"
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                  label={{
                    value: 'Today',
                    position: 'top',
                    fill: 'var(--color-primary)',
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                />

                {/* Safe-to-Spend Reference Line */}
                <ReferenceLine
                  y={safeReserve}
                  stroke="#eab308"
                  strokeDasharray="2 4"
                  strokeWidth={1}
                  label={{
                    value: `Safe Buffer (${formatCurrency(safeReserve)})`,
                    position: 'insideBottomRight',
                    fill: '#eab308',
                    fontSize: 10,
                  }}
                />

                <RechartsTooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload || !payload.length || label === undefined || label === null) return null;
                    const item = payload[0]?.payload;
                    const dateFormatted = formatSafeUTCDate(String(label), {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    });
                    const isFuture = String(label) >= todayStr;

                    return (
                      <ChartTooltip>
                        <TooltipHeader>
                          <div className="flex items-center justify-between gap-4">
                            <span>{dateFormatted}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-muted text-muted-foreground">
                              {isFuture ? (label === todayStr ? 'Today' : 'Projected') : 'Actual'}
                            </span>
                          </div>
                        </TooltipHeader>

                        {/* Balance */}
                        {typeof item.actualBalance === 'number' && !isFuture && (
                          <TooltipRow
                            label="Actual Balance"
                            value={formatCurrency(item.actualBalance)}
                            color="var(--primary)"
                          />
                        )}
                        {typeof item.projectedBalance === 'number' && isFuture && (
                          <TooltipRow
                            label="Forecast Balance"
                            value={formatCurrency(item.projectedBalance)}
                            color="var(--primary)"
                          />
                        )}

                        {/* Events on this date */}
                        {item.events && item.events.length > 0 && (
                          <div className="pt-2 mt-2 border-t border-border/40 space-y-1">
                            <div className="text-[10px] uppercase font-semibold text-muted-foreground">
                              Scheduled On This Day
                            </div>
                            {item.events.map((e: any) => (
                              <div key={e.id} className="flex items-center justify-between text-xs gap-4">
                                <span className="truncate max-w-[140px] text-foreground">{e.name}</span>
                                <span
                                  className={
                                    e.type === 'income'
                                      ? 'text-emerald-500 font-semibold'
                                      : 'text-foreground font-semibold'
                                  }
                                >
                                  {e.type === 'income' ? '+' : '-'}
                                  {formatCurrency(e.amount)}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </ChartTooltip>
                    );
                  }}
                />

                {displayMode === 'total' && (
                  <>
                    {/* Historical Actuals (Solid) */}
                    <Area
                      type="monotone"
                      dataKey="actualBalance"
                      stroke="var(--primary)"
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill="url(#actualGradient)"
                      connectNulls={false}
                    />

                    {/* Forward Projection (Dashed / Glowing) */}
                    <Line
                      type="monotone"
                      dataKey="projectedBalance"
                      stroke="var(--primary)"
                      strokeWidth={2.5}
                      strokeDasharray="6 4"
                      dot={false}
                      connectNulls
                    />
                  </>
                )}

                {displayMode === 'by_account' && (
                  <>
                    {accounts.map((acc, idx) => {
                      const strokeColor = ACCOUNT_COLORS[idx % ACCOUNT_COLORS.length];
                      return (
                        <Line
                          key={acc.id}
                          type="monotone"
                          dataKey={acc.id}
                          name={acc.name}
                          stroke={strokeColor}
                          strokeWidth={2}
                          dot={false}
                          connectNulls
                        />
                      );
                    })}
                  </>
                )}
              </ComposedChart>
            )}
          </ResponsiveContainer>
        </div>

        {/* ── Chart Legend / Micro-Footer ── */}
        <div className="mt-3 pt-3 border-t border-border/40 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-primary inline-block rounded" />
              <span>Historical Actual</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-primary border-t border-dashed border-primary inline-block" />
              <span>Forecast Runway</span>
            </div>
          </div>
          <div className="text-[11px] text-muted-foreground/80">
            Updated live with recurring cadence detection & budgets
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
