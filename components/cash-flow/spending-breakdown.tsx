'use client';

import { useState, useEffect, useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { useRouter } from 'next/navigation';
import { formatCurrency } from '@/lib/utils/format';
import { ChartTooltip, TooltipRow, TooltipHeader } from '@/components/charts/chart-tooltip';
import { ChartEmptyState } from '@/components/charts/chart-empty-state';
import { ChartTypeSelector, type ChartType } from '@/components/charts/chart-type-selector';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { formatChartYAxisCurrency, formatChartXAxisDate, getChartXTicksUnified, formatChartDateRange } from '@/lib/utils/chart-format';
import { TimeRangeFilter, type TimeRange } from '@/components/charts/chart-filters';
import { usePersistentState } from '@/lib/hooks/use-persistent-state';
import { getMonthRange } from '@/lib/utils/date-window';
import { useDateWindow } from '@/lib/hooks/use-date-window';
import { DateWindowNav } from '@/components/charts/date-window-nav';
import { rgbToHsl, hslToRgb } from '@/lib/utils/color';
import { useTheme } from 'next-themes';
import { Search, Check, X, PieChart as PieIcon } from 'lucide-react';
import { useCardCollapsed } from '@/lib/hooks/use-card-collapsed';
import { usePrivacyMode } from '@/components/privacy-mode-provider';
import { CollapsibleCardHeader } from '@/components/ui/collapsible-card-header';
import { CollapsibleFilterPanel } from '@/components/ui/collapsible-filter-panel';

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
}



// Theme-adapted color utility
function getThemeAdaptedColor(hex: string, theme: string | undefined): string {
  if (!hex || hex.startsWith('var(')) return hex;
  const cleanedHex = hex.replace('#', '');
  const num = parseInt(cleanedHex, 16);
  if (isNaN(num)) return hex;
  const r = (num >> 16) & 0xff;
  const g = (num >> 8) & 0xff;
  const b = num & 0xff;
  const [h, originalS, originalL] = rgbToHsl(r, g, b);
  
  const activeTheme = theme === 'system' || !theme ? 'moonlight' : theme;
  let s = originalS;
  let l = originalL;
  
  if (activeTheme === 'light') {
    l = Math.min(originalL, 0.55);
    s = Math.max(originalS, 0.55);
  } else {
    // dark or moonlight: soften saturation, boost lightness
    l = Math.max(originalL, 0.62);
    s = Math.min(originalS, 0.68);
  }
  
  const [pr, pg, pb] = hslToRgb(h, s, l);
  return `#${((pr << 16) | (pg << 8) | pb).toString(16).padStart(6, '0')}`;
}



const typeOptions = [
  { value: 'pie' as ChartType, label: 'Pie' },
  { value: 'bar' as ChartType, label: 'Bar' },
];

export function SpendingBreakdown() {
  const router = useRouter();
  const { privacyMode } = usePrivacyMode();
  const { theme } = useTheme();
  const [isCollapsed, setIsCollapsed] = useCardCollapsed('spendingBreakdown');
  const [showFilters, setShowFilters] = useState(false);
  
  const [allCategories, setAllCategories] = useState<CategoryData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
  const [chartType, setChartType] = usePersistentState<ChartType>('finance:spending-breakdown:chartType', 'pie');
  const [excludedCategoryIds, setExcludedCategoryIds] = usePersistentState<Set<string>>(
    'finance:spending-breakdown:excludedCategoryIds',
    new Set(),
    {
      serialize: (val) => JSON.stringify(Array.from(val)),
      deserialize: (raw) => new Set(JSON.parse(raw)),
    }
  );

  const [searchQuery, setSearchQuery] = useState('');

  const queryParams = useMemo(() => {
    return `startDate=${dateRange.start}&endDate=${dateRange.end}`;
  }, [dateRange.start, dateRange.end]);



  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`/api/cash-flow/categories?${queryParams}`);
        if (!res.ok) throw new Error('Failed to fetch categories');
        const json = await res.json();
        setAllCategories(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [queryParams]);

  const expenseCategories = useMemo(() => {
    return allCategories.filter((c) => !c.isIncome && c.amount > 0);
  }, [allCategories]);

  const safeExcludedIds = excludedCategoryIds instanceof Set ? excludedCategoryIds : new Set<string>();
  const getCategoryRouteId = (category: CategoryData) => category.sourceCategoryId || category.categoryId;

  const visibleCategories = useMemo(() => {
    return expenseCategories.filter((c) => !safeExcludedIds.has(getCategoryRouteId(c)));
  }, [expenseCategories, safeExcludedIds]);

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
        color: getThemeAdaptedColor(c.categoryColor, theme),
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
      color: getThemeAdaptedColor(c.categoryColor, theme),
      categoryId: getCategoryRouteId(c),
      sourceCategoryId: getCategoryRouteId(c),
    }));

    const otherItem = {
      id: 'Other',
      label: 'Other',
      value: restAmount,
      color: getThemeAdaptedColor('#94a3b8', theme),
      categoryId: restIds,
      sourceCategoryId: restIds,
    };

    return [...mappedTop, otherItem];
  }, [visibleCategories, theme]);

  const filteredCategories = useMemo(() => {
    return expenseCategories.filter((c) =>
      c.categoryName.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [expenseCategories, searchQuery]);

  const toggleCategory = (categoryId: string) => {
    setExcludedCategoryIds((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
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
        <CollapsibleCardHeader
          isCollapsed={isCollapsed}
          onToggle={setIsCollapsed}
          title={
            <div className="flex items-center gap-2">
              <PieIcon className="w-4 h-4 text-primary shrink-0" />
              <span>Spending Breakdown</span>
            </div>
          }
        />
        {!isCollapsed && <LoadingSpinner category="chart" className="h-[380px]" />}
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm">
        <CollapsibleCardHeader
          isCollapsed={isCollapsed}
          onToggle={setIsCollapsed}
          title={
            <div className="flex items-center gap-2">
              <PieIcon className="w-4 h-4 text-primary shrink-0" />
              <span>Spending Breakdown</span>
            </div>
          }
        />
        {!isCollapsed && (
          <div className="p-5">
            <ChartEmptyState variant="error" error={error} />
          </div>
        )}
      </div>
    );
  }

  const headerActions = (
    <div className="flex items-center gap-3">
      <TimeRangeFilter value={timeframe} onChange={setTimeframe} />
      <ChartTypeSelector value={chartType} options={typeOptions} onChange={setChartType} />
    </div>
  );

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
            <PieIcon className="w-4 h-4 text-primary shrink-0" />
            <span>Spending Breakdown</span>
          </div>
        }
      />

      {/* ── Card Content Grid ── */}
      {!isCollapsed && (
        <>
          <CollapsibleFilterPanel
            isOpen={showFilters}
            onToggle={() => setShowFilters(!showFilters)}
            feedbackItems={[
              <span key="timeframe" className="bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider">
                {timeframe.toUpperCase()}
              </span>,
              <span key="chartType" className="bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider">
                {chartType.toUpperCase()}
              </span>,
            ]}
            rightActions={
              showWindowNav && (
                <DateWindowNav
                  prev={prevWindow}
                  next={nextWindow}
                  nextDisabled={isNextDisabled}
                  label={windowLabel}
                  options={periodOptions}
                  currentValue={windowEnd}
                  onSelect={setWindowEnd}
                />
              )
            }
          >
            <div className="flex flex-wrap items-center justify-between gap-4 p-3 bg-muted/20 border border-border/20 rounded-xl">
              <div className="flex items-center">
                <TimeRangeFilter value={timeframe} onChange={setTimeframe} />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mr-1">Style</span>
                <ChartTypeSelector value={chartType} options={typeOptions} onChange={setChartType} />
              </div>
            </div>
          </CollapsibleFilterPanel>
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 p-3 sm:p-6">
          {/* Chart Column (3/5) */}
          <div className="lg:col-span-3 h-[380px] relative flex flex-col justify-center">
            {pieData.length === 0 ? (
              <ChartEmptyState
                variant={safeExcludedIds.size > 0 ? 'empty' : 'nodata'}
                description={
                  safeExcludedIds.size > 0
                    ? 'All categories are excluded. Adjust your filters.'
                    : 'No spending data for this period'
                }
              />
            ) : (
              <div className="h-full w-full relative touch-pan-y">
                {chartType === 'bar' ? (() => {
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
                            aria-label="Spending Breakdown Bar Chart"
                            layout="vertical"
                            data={pieData}
                            margin={{ top: 5, right: 10, left: 10, bottom: 5 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--color-border)" />
                            <XAxis type="number" tickFormatter={(v) => `$${v}`} tick={{ fill: 'var(--color-muted-foreground)', fontSize: 10 }} axisLine={{ stroke: 'var(--color-border)' }} tickLine={false} />
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
                })() : (
                  <>
                    <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 100, height: 100 }}>
                      <PieChart role="img" aria-label="Spending Breakdown Pie Chart" margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
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

          {/* Legend / Filter Column (2/5) */}
          <div className="lg:col-span-2 flex flex-col h-[380px]">
            {/* Search bar */}
            <div className="relative mb-3">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                <Search className="h-4 w-4 text-muted-foreground/60" />
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search categories..."
                className="w-full pl-9 pr-8 py-1.5 text-xs bg-muted/20 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary text-foreground placeholder:text-muted-foreground/50 transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Controls Panel */}
            <div className="flex items-center justify-between text-xs mb-3 pb-2 border-b border-border/60">
              <span className="text-muted-foreground font-medium">
                Showing {expenseCategories.length - safeExcludedIds.size} of {expenseCategories.length}
              </span>
              <div className="flex gap-2.5">
                <button
                  onClick={() => setExcludedCategoryIds(new Set())}
                  className="text-primary hover:text-primary/80 hover:underline font-semibold cursor-pointer transition-colors"
                >
                  Select All
                </button>
                <span className="text-muted-foreground/30">|</span>
                <button
                  onClick={() => setExcludedCategoryIds(new Set(expenseCategories.map((c) => getCategoryRouteId(c))))}
                  className="text-primary hover:text-primary/80 hover:underline font-semibold cursor-pointer transition-colors"
                >
                  Deselect All
                </button>
              </div>
            </div>

            {/* Scrollable list */}
            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 select-none">
              {filteredCategories.length === 0 ? (
                <div className="text-center text-muted-foreground text-xs py-8">
                  No matching categories found
                </div>
              ) : (
                filteredCategories.map((c) => {
                  const routeId = getCategoryRouteId(c);
                  const isExcluded = safeExcludedIds.has(routeId);
                  const adaptedColor = getThemeAdaptedColor(c.categoryColor, theme);
                  const pct = totalSpending > 0 && !isExcluded
                    ? ((c.amount / totalSpending) * 100).toFixed(1)
                    : totalSpending === 0 && !isExcluded
                      ? '0.0'
                      : null;

                  return (
                    <div
                      key={c.categoryId}
                      onClick={() => toggleCategory(routeId)}
                      className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-all select-none border border-transparent ${
                        isExcluded
                          ? 'bg-transparent text-muted-foreground/40 hover:bg-muted/5 opacity-60'
                          : 'bg-muted/10 hover:bg-muted/20 border-border/30 text-foreground hover:shadow-sm'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {/* Interactive toggle box */}
                        <div
                          className={`w-3.5 h-3.5 rounded flex items-center justify-center transition-all border ${
                            isExcluded
                              ? 'border-muted-foreground/30 bg-transparent'
                              : 'border-primary bg-primary text-primary-foreground'
                          }`}
                          style={{
                            borderColor: isExcluded ? undefined : adaptedColor,
                            backgroundColor: isExcluded ? undefined : adaptedColor,
                          }}
                        >
                          {!isExcluded && <Check className="h-2.5 w-2.5 stroke-[3px] text-white" />}
                        </div>

                        {/* Colored circular dot */}
                        <div
                          className="w-2 h-2 rounded-full border border-black/10 dark:border-white/10 flex-shrink-0"
                          style={{
                            backgroundColor: isExcluded ? 'var(--color-border)' : adaptedColor,
                          }}
                        />

                        {/* Category Name */}
                        <span className={`font-medium truncate ${isExcluded ? 'line-through text-muted-foreground/30' : ''}`}>
                          {c.categoryName}
                        </span>
                      </div>

                      {/* Values */}
                      <div className="flex items-center gap-2.5 text-right flex-shrink-0 ml-2">
                        {pct !== null && (
                          <span className="text-[10px] text-muted-foreground/80 bg-muted/40 dark:bg-muted/20 px-1.5 py-0.5 rounded font-mono font-medium">
                            {pct}%
                          </span>
                        )}
                        <span className={`font-semibold font-mono blur-number ${isExcluded ? 'text-muted-foreground/20' : ''}`}>
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
      )}
    </div>
  );
}
