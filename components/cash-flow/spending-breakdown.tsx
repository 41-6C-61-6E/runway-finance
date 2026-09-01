'use client';

import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, Treemap } from 'recharts';
import { useRouter } from 'next/navigation';
import { formatCurrency } from '@/lib/utils/format';
import { formatCompactCurrency } from '@/lib/utils/format';
import { ChartTooltip, TooltipRow, TooltipHeader } from '@/components/charts/chart-tooltip';
import { ChartEmptyState } from '@/components/charts/chart-empty-state';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { formatChartYAxisCurrency, formatChartXAxisDate, getChartXTicksUnified, formatChartDateRange } from '@/lib/utils/chart-format';
import { TimeRangeFilter, type TimeRange } from '@/components/charts/chart-filters';
import { usePersistentState } from '@/lib/hooks/use-persistent-state';
import { getMonthRange } from '@/lib/utils/date-window';
import { useDateWindow } from '@/lib/hooks/use-date-window';
import { DateWindowNav } from '@/components/charts/date-window-nav';
import { Filter, ChevronDown, ChevronUp } from 'lucide-react';

import { usePrivacyMode } from '@/components/privacy-mode-provider';
import { SegPill } from '@/components/ui/seg-pill';

interface CategoryData {
  categoryId: string;
  sourceCategoryId?: string;
  categoryName: string;
  categoryColor: string;
  isIncome: boolean;
  amount: number;
  transactionCount: number;
  previousAmount: number;
  change: number;
  percentChange: number;
  categoryType?: string;
  isDiscretionary?: boolean;
}

const CHART_COLORS = [
  'var(--color-chart-1)', 'var(--color-chart-2)', 'var(--color-chart-3)',
  'var(--color-chart-4)', 'var(--color-chart-5)', 'var(--color-chart-synthetic)',
];

type BreakdownView = 'donut' | 'treemap' | 'bar';

export function SpendingBreakdown() {
  const router = useRouter();
  const { privacyMode } = usePrivacyMode();

  const [showFilters, setShowFilters] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const {
    timeframe, setTimeframe,
    windowEnd, setWindowEnd,
    prevWindow, nextWindow, isNextDisabled,
    windowLabel,
    periodOptions,
    showWindowNav,
    dateRange,
  } = useDateWindow('finance:spending-breakdown:timeframe', 'finance:spending-breakdown:windowEnd', '1m');
  const [view, setView] = usePersistentState<BreakdownView>('finance:spending-breakdown:view', 'donut');
  const [selectedGroups, setSelectedGroups] = usePersistentState<Set<'discretionary' | 'fixed'>>(
    'finance:spending-breakdown:groups', new Set(['discretionary', 'fixed']), {
      serialize: (value) => JSON.stringify(Array.from(value)),
      deserialize: (raw) => new Set(JSON.parse(raw)),
    }
  );
  const [sortBy, setSortBy] = useState<'amount' | 'name'>('amount');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const queryParams = useMemo(() => {
    return `startDate=${dateRange.start}&endDate=${dateRange.end}`;
  }, [dateRange.start, dateRange.end]);

  const { data: allCategories = [], isLoading: loading, error: queryError } = useQuery<CategoryData[]>({
    queryKey: ['cash-flow-categories', queryParams],
    queryFn: async () => {
      const res = await fetch(`/api/cash-flow/categories?${queryParams}`);
      if (!res.ok) throw new Error('Failed to fetch categories');
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });
  const error = queryError ? (queryError instanceof Error ? queryError.message : 'Unknown error') : null;

  const expenseCategories = useMemo(() => {
    return allCategories.filter((c) => !c.isIncome && c.amount > 0);
  }, [allCategories]);

  const safeSelectedGroups = selectedGroups instanceof Set ? selectedGroups : new Set<'discretionary' | 'fixed'>(['discretionary', 'fixed']);
  const categoryGroup = (category: CategoryData) => category.isDiscretionary === false ? 'fixed' as const : 'discretionary' as const;

  const getCategoryRouteId = (category: CategoryData) => category.sourceCategoryId || category.categoryId;

  const visibleCategories = useMemo(() => {
    return expenseCategories.filter((c) => safeSelectedGroups.has(categoryGroup(c)));
  }, [expenseCategories, safeSelectedGroups]);

  const totalSpending = useMemo(() => {
    return visibleCategories.reduce((sum, c) => sum + c.amount, 0);
  }, [visibleCategories]);

  const pieData = useMemo(() => {
    const sorted = [...visibleCategories].sort((a, b) => b.amount - a.amount);
    if (sorted.length <= 15) {
      return sorted.map((c) => ({
        id: c.categoryName,
        label: c.categoryName,
        value: c.amount,
        color: CHART_COLORS[sorted.indexOf(c) % CHART_COLORS.length],
        categoryId: getCategoryRouteId(c),
        sourceCategoryId: getCategoryRouteId(c),
      }));
    }

    const top14 = sorted.slice(0, 14);
    const rest = sorted.slice(14);
    const restAmount = rest.reduce((sum, c) => sum + c.amount, 0);
    const restIds = rest.map((c) => getCategoryRouteId(c)).join(',');

    const mappedTop = top14.map((c) => ({
      id: c.categoryName,
      label: c.categoryName,
      value: c.amount,
      color: CHART_COLORS[sorted.indexOf(c) % CHART_COLORS.length],
      categoryId: getCategoryRouteId(c),
      sourceCategoryId: getCategoryRouteId(c),
    }));

    const otherItem = {
      id: 'Other',
      label: 'Other',
      value: restAmount,
      color: 'var(--color-muted-foreground)',
      categoryId: restIds,
      sourceCategoryId: restIds,
    };

    return [...mappedTop, otherItem];
  }, [visibleCategories]);

  const treemapData = useMemo(() => pieData.map((item) => ({
    name: item.label, value: item.value, color: item.color, categoryId: item.categoryId,
  })), [pieData]);

  const treemapLabel = (label: string, width: number) => {
    const maxChars = Math.max(4, Math.floor((width - 16) / 7));
    return label.length > maxChars ? `${label.slice(0, maxChars - 1)}…` : label;
  };

  const sortedCategories = useMemo(() => [...visibleCategories].sort((a, b) => {
    const comparison = sortBy === 'name'
      ? a.categoryName.localeCompare(b.categoryName)
      : a.amount - b.amount;
    return sortDirection === 'asc' ? comparison : -comparison;
  }), [visibleCategories, sortBy, sortDirection]);

  const handleSort = (nextSortBy: 'amount' | 'name') => {
    if (sortBy === nextSortBy) setSortDirection((direction) => direction === 'asc' ? 'desc' : 'asc');
    else {
      setSortBy(nextSortBy);
      setSortDirection(nextSortBy === 'amount' ? 'desc' : 'asc');
    }
  };

  const toggleGroup = (group: 'discretionary' | 'fixed') => {
    setSelectedGroups((previous) => {
      const next = new Set(previous);
      if (next.has(group)) next.delete(group); else next.add(group);
      return next;
    });
  };

  const handleClick = (categoryId: string) => {
    const range = getMonthRange(timeframe, windowEnd);
    const startDate = `${range.start}-01`;
    const [endYear, endMonthStr] = range.end.split('-').map(Number);
    const lastDay = new Date(endYear, endMonthStr, 0).getDate();
    const endDate = `${range.end}-${String(lastDay).padStart(2, '0')}`;
    if (categoryId.includes(',')) {
      router.push(`/transactions?categoryIds=${categoryId}&startDate=${startDate}&endDate=${endDate}`);
    } else {
      router.push(`/transactions?categoryId=${categoryId}&startDate=${startDate}&endDate=${endDate}`);
    }
  };

  const srSummary = useMemo(() => {
    if (pieData.length === 0) return '';
    const items = pieData.map(d => `${d.label}: ${formatCurrency(d.value)}`).join(', ');
    return `Spending breakdown by category. Total spending is ${formatCurrency(totalSpending)}. Breakdown: ${items}.`;
  }, [pieData, totalSpending]);

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm">
        <LoadingSpinner category="chart" className="h-[380px]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm">

          <div className="p-5">
            <ChartEmptyState variant="error" error={error} />
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

      <div className="px-3 sm:px-5 py-3 flex flex-wrap items-center justify-center gap-2">
        <SegPill<BreakdownView>
          options={[{ id: 'donut', label: 'Donut' }, { id: 'treemap', label: 'Treemap' }, { id: 'bar', label: 'Bar' }]}
          value={view}
          onChange={setView}
          aria-label="Chart type"
        />
        <span className="text-xs text-muted-foreground/50">|</span>
        <SegPill
          options={[{ id: 'discretionary', label: 'Discretionary' }, { id: 'fixed', label: 'Fixed' }]}
          values={safeSelectedGroups}
          onToggle={toggleGroup}
          aria-label="Spending groups"
        />
        <span className="text-xs text-muted-foreground/50">|</span>
        <button type="button" onClick={() => setShowFilters(!showFilters)} aria-expanded={showFilters}
          className="flex items-center gap-1.5 px-2.5 h-8 bg-background hover:bg-muted border border-border/80 rounded-lg text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-all cursor-pointer shadow-sm">
          <Filter size={12} className="text-primary" />
          <span className="hidden sm:inline">Options</span>
          {showFilters ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
        {showWindowNav && (
          <div className="basis-full flex items-center justify-center px-2 sm:px-4 pt-2 pb-0">
            <DateWindowNav prev={prevWindow} next={nextWindow} nextDisabled={isNextDisabled} label={windowLabel}
              options={periodOptions} currentValue={windowEnd} onSelect={setWindowEnd} timeframe={timeframe} />
          </div>
        )}
      </div>

      {/* ── Card Content Grid ── */}

        <>
          {showFilters && (
            <div className="mx-3 sm:mx-5 mb-1 p-4 bg-background/50 border border-border/40 rounded-xl animate-in fade-in slide-in-from-top-1 duration-200">
              <div className="flex justify-center">
                <TimeRangeFilter value={timeframe} onChange={setTimeframe} />
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 p-3 sm:p-6">
          {/* Chart Column (3/5) */}
          <div className="lg:col-span-3 h-[380px] relative flex flex-col justify-center">
            {pieData.length === 0 ? (
              <ChartEmptyState
                variant="nodata"
                description="No spending data for this period"
              />
            ) : (
              <div className="h-full w-full relative touch-pan-y">
                {view === 'bar' ? (() => {
                  const maxLabelLen = pieData.length > 0
                    ? Math.max(...pieData.map(d => Math.min(isMobile ? 10 : 20, d.id.length)))
                    : 0;
                  const dynamicLeft = Math.max(isMobile ? 65 : 80, maxLabelLen * (isMobile ? 6 : 7) + 12);

                  return (
                    <div className="overflow-x-auto overflow-y-hidden h-full w-full scroll-contain-x">
                      <div className="min-w-max h-full">
                        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 100, height: 100 }}>
                          <BarChart
                            role="img"
                            aria-label="Breakdown Bar Chart"
                            layout="vertical"
                            data={pieData}
                            margin={{ top: 5, right: 10, left: 10, bottom: 5 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--color-border)" />
                            <XAxis type="number" tickFormatter={(v) => formatCompactCurrency(v)} tick={{ fill: 'var(--color-muted-foreground)', fontSize: 10 }} axisLine={{ stroke: 'var(--color-border)' }} tickLine={false} />
                            <YAxis dataKey="label" type="category" width={dynamicLeft - 10} tick={{ fill: 'var(--color-muted-foreground)', fontSize: 10 }} axisLine={{ stroke: 'var(--color-border)' }} tickLine={false} />
                            <Tooltip
                              cursor={false}
                              content={({ active, payload }) => {
                                if (!active || !payload || !payload.length) return null;
                                const data = payload[0].payload;
                                const pct = totalSpending > 0 ? ((data.value / totalSpending) * 100).toFixed(1) : '0';
                                return (
                                  <ChartTooltip>
                                    <TooltipHeader>{data.label}</TooltipHeader>
                                    <TooltipRow label="Amount" value={formatCurrency(data.value)} />
                                    <TooltipRow label="Percentage" value={`${pct}%`} />
                                  </ChartTooltip>
                                );
                              }}
                            />
                            <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={20} onClick={(data: any) => handleClick(data.categoryId)} className="cursor-pointer">
                              {pieData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  );
                })() : view === 'treemap' ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <Treemap data={treemapData} dataKey="value" nameKey="name" stroke="var(--card)" animationDuration={280} animationEasing="ease-out"
                      content={(props: any) => {
                        const { x, y, width, height, index } = props;
                        const item = treemapData[index];
                        if (!item || width <= 0 || height <= 0) return <rect key={`tm-${index}`} />;
                        const pct = totalSpending > 0 ? item.value / totalSpending * 100 : 0;
                        const radius = 3;
                        return (
                          <g key={`tm-${index}`} style={{ cursor: 'pointer' }} onClick={() => handleClick(item.categoryId)}>
                            <defs>
                              <clipPath id={`spending-tm-label-${index}`}>
                                <rect x={x + 4} y={y + 2} width={Math.max(0, width - 8)} height={Math.max(0, height - 4)} />
                              </clipPath>
                            </defs>
                            <path d={`M${x + radius},${y} h${width - 2 * radius} a${radius},${radius} 0 0 1 ${radius},${radius} v${height - 2 * radius} a${radius},${radius} 0 0 1 -${radius},${radius} h${-(width - 2 * radius)} a${radius},${radius} 0 0 1 -${radius},-${radius} v${-(height - 2 * radius)} a${radius},${radius} 0 0 1 ${radius},-${radius} Z`} fill={item.color} fillOpacity={0.85} stroke="var(--color-card)" />
                            {width > 42 && height > 24 && <g clipPath={`url(#spending-tm-label-${index})`}>
                              <text x={x + 6} y={y + 15} fill="white" stroke="none" strokeWidth={0} fontSize={width < 70 ? 10 : 12} fontWeight="600">{treemapLabel(item.name, width)}</text>
                              {height > 40 && <text x={x + 6} y={y + 30} fill="white" stroke="none" strokeWidth={0} fontSize={width < 70 ? 10 : 11} className="blur-number">{formatCurrency(item.value)}</text>}
                              {height > 54 && <text x={x + 6} y={y + 44} fill="white" stroke="none" strokeWidth={0} fontSize="10" opacity="0.8">{pct.toFixed(1)}%</text>}
                            </g>}
                          </g>
                        );
                      }}
                    >
                      <Tooltip content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const datum = payload[0].payload;
                        return <ChartTooltip><TooltipHeader>{datum.name}</TooltipHeader><TooltipRow label="Amount" value={formatCurrency(datum.value)} /><TooltipRow label="Percent" value={`${totalSpending > 0 ? (datum.value / totalSpending * 100).toFixed(1) : '0.0'}%`} /></ChartTooltip>;
                      }} />
                    </Treemap>
                  </ResponsiveContainer>
                ) : (
                  <>
                    <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 100, height: 100 }}>
                      <PieChart role="img" aria-label="Breakdown Donut Chart" margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={isMobile ? '60%' : '68%'}
                          outerRadius={isMobile ? '85%' : '92%'}
                          paddingAngle={0.5}
                          cornerRadius={3}
                          stroke="none"
                          onClick={(data: any) => {
                            const catId = data.sourceCategoryId || data.categoryId || (data.payload && (data.payload.sourceCategoryId || data.payload.categoryId));
                            if (catId) handleClick(catId);
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
                            const pct = totalSpending > 0 ? ((datum.value / totalSpending) * 100).toFixed(1) : '0';
                            return (
                              <ChartTooltip>
                                <TooltipHeader>{datum.label}</TooltipHeader>
                                <TooltipRow label="Amount" value={formatCurrency(datum.value)} />
                                <TooltipRow label="Percent" value={`${pct}%`} />
                              </ChartTooltip>
                            );
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none text-center">
                      <div className="text-xl font-bold text-foreground blur-number font-mono">{formatCurrency(totalSpending)}</div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Total Spending</div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Category list */}
          <div className="lg:col-span-2 flex flex-col">
            <div className="flex items-center justify-end gap-2 mb-3 pb-2 border-b border-border/60">
              {(['name', 'amount'] as const).map((field) => (
                <button key={field} type="button" onClick={() => handleSort(field)}
                  className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-1 rounded hover:bg-muted/50 cursor-pointer ${sortBy === field ? 'text-primary' : 'text-muted-foreground'} ${field === 'name' ? 'mr-auto' : ''}`}>
                  {field === 'name' ? 'Category' : 'Amount'}{sortBy === field ? (sortDirection === 'asc' ? ' ↑' : ' ↓') : ''}
                </button>
              ))}
            </div>

            <div className="space-y-1.5 pr-1 select-none">
              {sortedCategories.length === 0 ? (
                <div className="text-center text-muted-foreground text-xs py-8">
                  No categories for the selected types
                </div>
              ) : (
                sortedCategories.map((c) => {
                  const routeId = getCategoryRouteId(c);
                  const categoryColor = pieData.find((item) => item.categoryId === routeId)?.color || 'var(--color-chart-1)';
                  const pct = totalSpending > 0 ? ((c.amount / totalSpending) * 100).toFixed(1) : '0.0';

                  return (
                    <div
                      key={c.categoryId}
                      onClick={() => handleClick(routeId)}
                      className="flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-all border border-transparent bg-muted/10 hover:bg-muted/20 hover:border-border/30 cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: categoryColor }} />

                        <span className="font-medium truncate">{c.categoryName}</span>
                      </div>

                      {/* Values */}
                      <div className="flex items-center gap-2.5 text-right flex-shrink-0 ml-2">
                        <span className="text-[10px] text-muted-foreground/80 bg-muted/40 dark:bg-muted/20 px-1.5 py-0.5 rounded font-mono font-medium">{pct}%</span>
                        <span className="font-semibold font-mono blur-number">
                          {formatCurrency(c.amount)}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
        </>

    </div>
  );
}
