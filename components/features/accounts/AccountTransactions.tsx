'use client';

import { useMemo, useCallback, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Receipt, ArrowRight, ChevronDown, Search, Check, Loader2 } from 'lucide-react';
import { AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { useDateWindow } from '@/lib/hooks/use-date-window';
import { DateWindowNav } from '@/components/charts/date-window-nav';
import { Skeleton } from '@/components/ui/skeleton';
import { Select } from '@/components/ui/select';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { formatSafeUTCDate } from '@/lib/utils/date';
import { formatChartYAxisCurrency, formatChartXAxisDate, formatChartDateRange } from '@/lib/utils/chart-format';
import type { TimeRange } from '@/components/charts/chart-filters';
import { ChartTooltip, TooltipHeader, TooltipRow } from '@/components/charts/chart-tooltip';
import { ChartTimeframeBar } from '@/components/charts/chart-timeframe-bar';
import { invalidateAfterTransactionChange } from '@/lib/query-invalidation';
import { cn } from '@/lib/utils';

export interface AccountTransactionsProps {
  accountId: string;
  historyData: any[];
  isLiability: boolean;
  hierarchyTimeframe: TimeRange;
  onHierarchyTimeframeChange?: (tf: TimeRange) => void;
  className?: string;
}

export function AccountTransactions({ accountId, historyData, isLiability, hierarchyTimeframe, onHierarchyTimeframeChange, className }: AccountTransactionsProps) {
  const queryClient = useQueryClient();
  const [openCategoryTxId, setOpenCategoryTxId] = useState<string | null>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryParentId, setNewCategoryParentId] = useState<string | null>(null);
  const [newCategoryColor, setNewCategoryColor] = useState('#6366f1');
  const [newCategoryIsIncome, setNewCategoryIsIncome] = useState(false);
  const [creatingCategoryLoading, setCreatingCategoryLoading] = useState(false);

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

  const { data: rawCategories = [] } = useQuery<any>({
    queryKey: ['categories'],
    queryFn: async () => {
      const res = await fetch('/api/categories', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch categories');
      return res.json();
    },
  });

  const categories = useMemo(() => {
    if (Array.isArray(rawCategories)) return rawCategories;
    if (Array.isArray(rawCategories?.data)) return rawCategories.data;
    return [];
  }, [rawCategories]);

  const parents = useMemo(() => categories.filter((c: any) => !c.parentId), [categories]);
  const getChildren = useCallback(
    (parentId: string) => categories.filter((c: any) => c.parentId === parentId),
    [categories]
  );

  const handleSetCategory = async (
    txId: string,
    categoryId: string | null,
    categoryName?: string | null,
    categoryColor?: string | null
  ) => {
    try {
      const res = await fetch(`/api/transactions/${txId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ categoryId }),
      });
      if (res.ok) {
        queryClient.setQueryData(
          ['account-transactions', accountId, queryStartDate, queryEndDate],
          (old: any) => {
            if (!old?.data) return old;
            return {
              ...old,
              data: old.data.map((t: any) =>
                t.id === txId
                  ? {
                      ...t,
                      categoryId,
                      category: categoryId
                        ? {
                            id: categoryId,
                            name: categoryName ?? '',
                            color: categoryColor ?? '#6366f1',
                          }
                        : null,
                    }
                  : t
              ),
            };
          }
        );
        invalidateAfterTransactionChange(queryClient);
      }
    } catch (err) {
      console.error('Failed to update transaction category', err);
    } finally {
      setOpenCategoryTxId(null);
      setDropdownPos(null);
      setCategoryFilter('');
      setIsCreatingCategory(false);
    }
  };

  const handleCreateCategory = async (txId: string) => {
    if (!newCategoryName.trim()) return;
    setCreatingCategoryLoading(true);
    try {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: newCategoryName.trim(),
          parentId: newCategoryParentId || null,
          color: newCategoryColor,
          isIncome: newCategoryIsIncome,
        }),
      });
      if (res.ok) {
        const createdData = await res.json();
        queryClient.invalidateQueries({ queryKey: ['categories'] });
        await handleSetCategory(
          txId,
          createdData.id,
          newCategoryName.trim(),
          newCategoryColor
        );
      }
    } catch (err) {
      console.error('Failed to create category', err);
    } finally {
      setCreatingCategoryLoading(false);
    }
  };

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
      <ChartTooltip>
        <TooltipHeader>{formatSafeUTCDate(point.date, { month: 'short', day: 'numeric', year: 'numeric' })}</TooltipHeader>
        <TooltipRow label="Balance" value={formatCurrency(point.balance)} />
      </ChartTooltip>
    );
  }, []);

  const chartColor = 'var(--color-primary)';
  const txs = txData?.data || [];

  return (
    <div className={cn('transition-all duration-300', className)}>
      <ChartTimeframeBar
        value={hierarchyTimeframe}
        onChange={(v) => onHierarchyTimeframeChange?.(v)}
        windowNav={showWindowNav ? (
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
        ) : undefined}
        className="bg-card/30 border-0"
      />
      <div className="px-4 sm:px-5 pb-5 sm:pb-6 space-y-5">
        {/* Balance History Chart */}
        <div>
          <div className="h-[240px] w-full relative overflow-hidden flex items-center justify-center">
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

        {/* Recent Transactions */}
        <div className="space-y-3 pt-5 border-t border-sidebar-border/60">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Recent activity</h3>
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
                <div className="text-[10px] sm:text-xs text-destructive text-center py-4">
                  Failed to load transactions.
                </div>
              ) : txs.length === 0 ? (
                <div className="text-[10px] sm:text-xs text-muted-foreground/60 italic text-center py-6">
                  No recent activity found.
                </div>
              ) : (
                <div className="space-y-0.5">
                  {txs.map((tx: any) => {
                    const { text } = formatTransactionAmount(tx.amount);
                    return (
                      <div key={tx.id} className="py-2 flex items-center justify-between text-xs hover:bg-muted/30 px-2 rounded-lg transition-colors">
                        <div className="min-w-0 flex-1 pr-4">
                          <p className="font-medium text-foreground truncate text-xs sm:text-sm">{tx.payee || tx.description || 'Unidentified Transaction'}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[11px] text-muted-foreground">{formatDate(tx.date)}</span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (openCategoryTxId === tx.id) {
                                  setOpenCategoryTxId(null);
                                  setDropdownPos(null);
                                } else {
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  const left = Math.min(rect.left, window.innerWidth - 260);
                                  const spaceBelow = window.innerHeight - rect.bottom;
                                  const top = spaceBelow < 290 ? Math.max(8, rect.top - 290) : rect.bottom + 4;
                                  setDropdownPos({ top, left });
                                  setOpenCategoryTxId(tx.id);
                                  setCategoryFilter('');
                                  setIsCreatingCategory(false);
                                }
                              }}
                              className="group/cat inline-flex items-center gap-1 px-1.5 py-0.5 text-micro rounded-full font-medium border border-transparent transition-all cursor-pointer hover:border-border/60 hover:opacity-90 active:scale-95"
                              style={
                                tx.category
                                  ? {
                                      backgroundColor: `${tx.category.color}15`,
                                      color: tx.category.color,
                                    }
                                  : undefined
                              }
                              title="Click to change category"
                            >
                              {tx.category ? (
                                <>
                                  <span
                                    className="w-1.5 h-1.5 rounded-full shrink-0"
                                    style={{ backgroundColor: tx.category.color }}
                                  />
                                  <span>{tx.category.name}</span>
                                  <ChevronDown className="h-2.5 w-2.5 opacity-50 group-hover/cat:opacity-100 transition-opacity" />
                                </>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
                                  <span>Uncategorized</span>
                                  <ChevronDown className="h-2.5 w-2.5 opacity-50 group-hover/cat:opacity-100 transition-opacity" />
                                </span>
                              )}
                            </button>
                          </div>
                        </div>
                        <span className="font-mono text-xs sm:text-sm font-semibold text-foreground blur-number">{text}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
        </div>

        {/* Category Dropdown Popover */}
        {openCategoryTxId && dropdownPos && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={(e) => {
                e.stopPropagation();
                setOpenCategoryTxId(null);
                setDropdownPos(null);
                setCategoryFilter('');
                setIsCreatingCategory(false);
              }}
            />
            <div
              className="fixed z-50 w-64 bg-card border border-border rounded-xl shadow-2xl max-h-80 flex flex-col text-xs overflow-hidden animate-in fade-in zoom-in-95 duration-100"
              style={{ top: dropdownPos.top, left: dropdownPos.left }}
              onClick={(e) => e.stopPropagation()}
            >
              {isCreatingCategory ? (
                <div className="p-3 space-y-2.5 flex flex-col text-xs">
                  <div className="font-semibold text-foreground uppercase tracking-wider text-[10px]">
                    New Category
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-muted-foreground mb-0.5">
                      Name
                    </label>
                    <input
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      placeholder="Category name"
                      className="w-full px-2 py-1 bg-background border border-input rounded text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                      autoFocus
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-medium text-muted-foreground mb-0.5">
                      Parent Category
                    </label>
                    <Select
                      className="h-8 text-xs rounded px-2"
                      value={newCategoryParentId || ''}
                      onChange={(e) => setNewCategoryParentId(e.target.value || null)}
                    >
                      <option value="">None (top-level)</option>
                      {parents.map((p: any) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </Select>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-0.5">
                    <div className="flex items-center gap-1.5">
                      <input
                        type="color"
                        value={newCategoryColor}
                        onChange={(e) => setNewCategoryColor(e.target.value)}
                        className="w-5 h-5 rounded cursor-pointer border border-input"
                      />
                      <span className="text-[10px] font-mono text-muted-foreground">
                        {newCategoryColor}
                      </span>
                    </div>

                    <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={newCategoryIsIncome}
                        onChange={(e) => setNewCategoryIsIncome(e.target.checked)}
                        className="rounded border-border text-primary focus:ring-ring"
                      />
                      Income
                    </label>
                  </div>

                  <div className="flex gap-2 pt-2 border-t border-border/50">
                    <button
                      type="button"
                      onClick={() => setIsCreatingCategory(false)}
                      className="flex-1 py-1 text-xs text-foreground bg-muted hover:bg-accent rounded-md transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCreateCategory(openCategoryTxId)}
                      disabled={creatingCategoryLoading || !newCategoryName.trim()}
                      className="flex-1 py-1 text-xs font-semibold text-primary-foreground bg-primary rounded-md hover:opacity-90 disabled:opacity-50 transition-all flex items-center justify-center gap-1"
                    >
                      {creatingCategoryLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Create'}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="relative p-2 border-b border-border bg-muted/20">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                    <input
                      value={categoryFilter}
                      onChange={(e) => setCategoryFilter(e.target.value)}
                      placeholder="Search categories..."
                      className="w-full pl-7 pr-2 py-1 text-xs bg-background border border-input rounded-md text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                      autoFocus
                    />
                  </div>

                  <div className="flex-1 overflow-y-auto max-h-56 divide-y divide-border/20">
                    <button
                      type="button"
                      onClick={() => handleSetCategory(openCategoryTxId, null, null, null)}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted transition-colors text-left"
                    >
                      None
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsCreatingCategory(true);
                        setNewCategoryName('');
                        setNewCategoryParentId(null);
                        setNewCategoryColor('#6366f1');
                        setNewCategoryIsIncome(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-primary hover:bg-muted font-medium transition-colors text-left"
                    >
                      + Create new category
                    </button>

                    {(() => {
                      const filter = categoryFilter.toLowerCase();
                      const filteredParents = filter
                        ? parents.filter(
                            (p: any) =>
                              p.name.toLowerCase().includes(filter) ||
                              getChildren(p.id).some((c: any) => c.name.toLowerCase().includes(filter))
                          )
                        : parents;
                      const activeTx = txs.find((t: any) => t.id === openCategoryTxId);

                      if (filteredParents.length === 0) {
                        return (
                          <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                            No categories found
                          </div>
                        );
                      }

                      return filteredParents.map((parent: any) => {
                        const childList = filter
                          ? getChildren(parent.id).filter((c: any) =>
                              c.name.toLowerCase().includes(filter)
                            )
                          : getChildren(parent.id);

                        return (
                          <div key={parent.id} className="py-1">
                            <div className="flex items-center gap-2 px-3 py-1 text-[10px] font-semibold text-muted-foreground/80 uppercase tracking-wider bg-muted/30">
                              <div
                                className="w-1.5 h-1.5 rounded-full"
                                style={{ backgroundColor: parent.color }}
                              />
                              {parent.name}
                            </div>
                            <button
                              type="button"
                              onClick={() => handleSetCategory(openCategoryTxId, parent.id, parent.name, parent.color)}
                              className={`w-full flex items-center gap-2 px-4 py-1.5 text-xs transition-colors text-left ${
                                activeTx?.categoryId === parent.id || activeTx?.category?.id === parent.id
                                  ? 'text-primary bg-primary/10 font-medium'
                                  : 'text-foreground/80 hover:bg-muted'
                              }`}
                            >
                              <div
                                className="w-1.5 h-1.5 rounded-full shrink-0"
                                style={{ backgroundColor: parent.color }}
                              />
                              <span className="flex-1 truncate">{parent.name}</span>
                              {(activeTx?.categoryId === parent.id || activeTx?.category?.id === parent.id) && (
                                <Check className="h-3 w-3 text-primary ml-auto" />
                              )}
                            </button>
                            {childList.map((child: any) => (
                              <button
                                key={child.id}
                                type="button"
                                onClick={() => handleSetCategory(openCategoryTxId, child.id, child.name, child.color)}
                                className={`w-full flex items-center gap-2 pl-6 pr-4 py-1.5 text-xs transition-colors text-left ${
                                  activeTx?.categoryId === child.id || activeTx?.category?.id === child.id
                                    ? 'text-primary bg-primary/10 font-medium'
                                    : 'text-foreground/80 hover:bg-muted'
                                  }`}
                              >
                                <div
                                  className="w-1.5 h-1.5 rounded-full shrink-0"
                                  style={{ backgroundColor: child.color }}
                                />
                                <span className="flex-1 truncate">{child.name}</span>
                                {(activeTx?.categoryId === child.id || activeTx?.category?.id === child.id) && (
                                  <Check className="h-3 w-3 text-primary ml-auto" />
                                )}
                              </button>
                            ))}
                          </div>
                        );
                      });
                    })()}
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
