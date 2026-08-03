'use client';

import { useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Receipt, ArrowRight } from 'lucide-react';
import { AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { useDateWindow } from '@/lib/hooks/use-date-window';
import { DateWindowNav } from '@/components/charts/date-window-nav';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { formatSafeUTCDate } from '@/lib/utils/date';
import { formatChartYAxisCurrency, formatChartXAxisDate, formatChartDateRange } from '@/lib/utils/chart-format';
import type { TimeRange } from '@/components/charts/chart-filters';

export interface AccountTransactionsProps {
  accountId: string;
  historyData: any[];
  isLiability: boolean;
  hierarchyTimeframe: TimeRange;
}

export function AccountTransactions({ accountId, historyData, isLiability, hierarchyTimeframe }: AccountTransactionsProps) {
  const {
    timeframe,
    windowEnd,
    setWindowEnd,
    prevWindow,
    nextWindow,
    isNextDisabled,
    windowLabel,
    periodOptions,
    showWindowNav,
    dateRange: txDateRange,
  } = useDateWindow(
    null,
    `finance:account-tx:${accountId}:windowEnd`,
    hierarchyTimeframe,
    hierarchyTimeframe
  );

  const queryStartDate = useMemo(() => {
    if (timeframe === 'all') return undefined;
    return txDateRange.start;
  }, [timeframe, txDateRange.start]);

  const queryEndDate = useMemo(() => {
    if (timeframe === 'all') return undefined;
    return txDateRange.end;
  }, [timeframe, txDateRange.end]);

  const { data: txData, isLoading, error } = useQuery({
    queryKey: ['account-transactions', accountId, queryStartDate, queryEndDate],
    queryFn: async () => {
      let url = `/api/transactions?accountId=${accountId}&limit=5`;
      if (queryStartDate) url += `&startDate=${queryStartDate}`;
      if (queryEndDate) url += `&endDate=${queryEndDate}`;
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch transactions');
      return res.json();
    },
  });

  const formatTransactionAmount = (amount: string) => {
    const num = parseFloat(amount);
    return {
      text: new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        signDisplay: 'exceptZero',
      }).format(num),
      isExpense: num < 0,
    };
  };

  const accountHistory = useMemo(() => {
    if (!historyData || historyData.length === 0) return [];
    return historyData
      .map((d) => {
        const val = d[accountId];
        return {
          date: d.date,
          balance: val !== undefined ? Math.abs(val) : undefined,
        };
      })
      .filter((d) => d.balance !== undefined);
  }, [historyData, accountId]);

  const visibleMiniData = useMemo(() => {
    if (accountHistory.length === 0) return [];
    if (timeframe === 'all') return accountHistory;
    const endDateStr = txDateRange.end;
    const startIdx = accountHistory.findIndex((d: any) => d.date >= txDateRange.start);
    if (startIdx === -1) return [];
    let endIdx = accountHistory.length - 1;
    for (let i = accountHistory.length - 1; i >= 0; i--) {
      if (accountHistory[i].date <= endDateStr) {
        endIdx = i;
        break;
      }
    }
    return accountHistory.slice(startIdx, endIdx + 1);
  }, [accountHistory, timeframe, txDateRange.start, txDateRange.end]);

  const { minVal, maxVal } = useMemo(() => {
    if (visibleMiniData.length === 0) return { minVal: 0, maxVal: 1000 };
    const vals = visibleMiniData.map(d => d.balance ?? 0);
    const rawMax = Math.max(...vals, 10);
    const rawMin = Math.min(...vals, 0);
    const crossesZero = rawMin < 0;
    const range = rawMax - rawMin;
    if (crossesZero) {
      const padding = range * 0.12 || 10;
      return { minVal: rawMin - padding, maxVal: rawMax + padding };
    }
    const dataMin = Math.min(...vals);
    const padding = Math.max(range * 0.08, range < 100 ? 20 : range * 0.08);
    return {
      minVal: dataMin > 0 ? Math.max(0, dataMin - padding) : 0,
      maxVal: rawMax + padding,
    };
  }, [visibleMiniData]);

  const miniYTicks = useMemo(() => {
    const step = (maxVal - minVal) / 4;
    return [0, 1, 2, 3, 4].map((i) => minVal + step * i);
  }, [minVal, maxVal]);

  const miniTicks = useMemo(() => {
    if (visibleMiniData.length < 2) return [];
    if (visibleMiniData.length === 2) return [visibleMiniData[0].date, visibleMiniData[1].date];
    const first = visibleMiniData[0].date;
    const last = visibleMiniData[visibleMiniData.length - 1].date;
    const midIdx = Math.floor(visibleMiniData.length / 2);
    const mid = visibleMiniData[midIdx].date;
    return [first, mid, last];
  }, [visibleMiniData]);

  const MiniTooltip = useCallback(({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null;
    const point = payload[0].payload;
    return (
      <div className="bg-popover/95 border border-border/80 px-2.5 py-1.5 rounded-lg shadow-lg text-[10px] sm:text-xs space-y-0.5 backdrop-blur-sm">
        <p className="font-semibold text-muted-foreground text-[10px] sm:text-xs">{formatSafeUTCDate(point.date, { month: 'short', day: 'numeric', year: 'numeric' })}</p>
        <p className="font-mono font-bold text-foreground blur-number text-xs sm:text-sm">{formatCurrency(point.balance)}</p>
      </div>
    );
  }, []);

  const chartColor = 'var(--color-primary)';
  const txs = txData?.data || [];

  return (
    <div className="py-4 px-0 transition-all duration-300 !border-none [&+div]:!border-t-0 bg-primary/10">
      <div className="grid grid-cols-1 md:grid-cols-5 gap-5 sm:gap-6 px-2 sm:px-4">
        {/* Left Side: Balance History Mini-Chart */}
        <div className="md:col-span-3 flex flex-col space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 select-none">
              Balance History
            </span>
            {showWindowNav && (
              <DateWindowNav
                prev={prevWindow}
                next={nextWindow}
                nextDisabled={isNextDisabled}
                label={windowLabel}
                options={periodOptions}
                currentValue={windowEnd}
                onSelect={setWindowEnd}
                timeframe={timeframe}
              />
            )}
          </div>

          <div className="flex-1 min-h-[140px] w-full relative bg-card/40 rounded-xl border border-border/20 p-2 overflow-hidden flex items-center justify-center">
            {visibleMiniData.length === 0 ? (
              <span className="text-[10px] sm:text-xs text-muted-foreground/60 italic">No data for this time period</span>
            ) : visibleMiniData.length < 2 ? (
              <span className="text-[10px] sm:text-xs text-muted-foreground/60 italic">Insufficient historical data for this account</span>
            ) : (
              <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 100, height: 100 }}>
                <AreaChart data={visibleMiniData} margin={{ top: 15, right: 5, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id={`gradient-mini-${accountId}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={chartColor} stopOpacity={0.35} />
                      <stop offset="95%" stopColor={chartColor} stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} opacity={0.25} />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: 'var(--color-muted-foreground)', fontSize: 9 }}
                    ticks={miniTicks}
                    tickFormatter={(d) => formatChartXAxisDate(d, timeframe, { isMonthly: timeframe !== '1m' })}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: 'var(--color-muted-foreground)', fontSize: 9 }}
                    domain={[minVal, maxVal]}
                    ticks={miniYTicks}
                    tickFormatter={(v: number) => formatChartYAxisCurrency(v, minVal, maxVal)}
                  />
                  <RechartsTooltip content={<MiniTooltip />} cursor={{ stroke: chartColor, strokeWidth: 1, strokeDasharray: '2 2', opacity: 0.5 }} wrapperStyle={{ zIndex: 50 }} />
                  <Area
                    type="monotone"
                    dataKey="balance"
                    stroke={chartColor}
                    strokeWidth={1.5}
                    fill={`url(#gradient-mini-${accountId})`}
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Right Side: Recent Transactions */}
        <div className="md:col-span-2 flex flex-col space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-[10px] sm:text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 select-none">
              Recent Activity
            </div>
            <Link
              href={`/transactions?accountId=${accountId}`}
              className="text-[10px] sm:text-xs font-medium text-muted-foreground hover:text-primary transition-colors flex items-center gap-1 group cursor-pointer"
            >
              <Receipt className="w-3.5 h-3.5" />
              <span>See all</span>
              <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>

          <div className="flex-1 flex flex-col justify-center min-h-[140px]">
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
              </div>
            ) : error || !txData ? (
              <div className="text-[10px] sm:text-xs text-destructive text-center py-4 bg-card/25 rounded-lg border border-border/20">
                Failed to load transactions.
              </div>
            ) : txs.length === 0 ? (
              <div className="text-[10px] sm:text-xs text-muted-foreground/60 italic text-center py-8 bg-card/25 rounded-lg border border-border/20">
                No recent activity found.
              </div>
            ) : (
              <div className="divide-y divide-border/20 border border-border/30 rounded-lg overflow-hidden bg-card/40">
                {txs.map((tx: any) => {
                  const { text } = formatTransactionAmount(tx.amount);
                  return (
                    <div key={tx.id} className="py-2 flex items-center justify-between text-xs hover:bg-muted/30 px-3 transition-colors">
                      <div className="min-w-0 flex-1 pr-4">
                        <p className="font-medium text-foreground truncate text-xs sm:text-sm">{tx.payee || tx.description || 'Unidentified Transaction'}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[9px] sm:text-[10px] text-muted-foreground">{formatDate(tx.date)}</span>
                          {tx.category && (
                            <span 
                              className="px-1.5 py-0.2 text-[8px] sm:text-[9px] rounded-full font-medium"
                              style={{ 
                                backgroundColor: `${tx.category.color}15`, 
                                color: tx.category.color 
                              }}
                            >
                              {tx.category.name}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="font-mono text-xs sm:text-sm font-semibold text-foreground blur-number">
                        {text}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
