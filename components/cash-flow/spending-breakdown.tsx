'use client';

import { useState, useEffect, useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { useRouter } from 'next/navigation';
import { formatCurrency } from '@/lib/utils/format';
import { ChartTooltip, TooltipRow, TooltipHeader } from '@/components/charts/chart-tooltip';
import { ChartEmptyState } from '@/components/charts/chart-empty-state';
import { ChartTypeSelector, type ChartType } from '@/components/charts/chart-type-selector';
import { TimeRangeFilter, type TimeRange } from '@/components/charts/chart-filters';
import { usePersistentState } from '@/lib/hooks/use-persistent-state';
import { useTheme } from 'next-themes';
import { Search, Check, X } from 'lucide-react';

interface CategoryData {
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  isIncome: boolean;
  amount: number;
  transactionCount: number;
  previousAmount: number;
  change: number;
  percentChange: number;
}

// Color Utility: RGB to HSL conversion
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return [h, s, l];
}

// Color Utility: HSL to RGB conversion
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  let r: number, g: number, b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
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

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthRange(timeframe: TimeRange): { start: string; end: string } {
  const now = new Date();
  const currentYm = getCurrentMonth();

  if (timeframe === '1m') {
    return { start: currentYm, end: currentYm };
  }

  let start: Date;
  switch (timeframe) {
    case '3m':
      start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      break;
    case '6m':
      start = new Date(now.getFullYear(), now.getMonth() - 5, 1);
      break;
    case '1y':
      start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
      break;
    case '5y':
      start = new Date(now.getFullYear() - 5, now.getMonth() + 1, 1);
      break;
    case 'ytd':
      start = new Date(now.getFullYear(), 0, 1);
      break;
    case 'all':
      start = new Date(2000, 0, 1);
      break;
    default:
      start = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  return {
    start: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`,
    end: currentYm,
  };
}

const typeOptions = [
  { value: 'pie' as ChartType, label: 'Pie' },
  { value: 'bar' as ChartType, label: 'Bar' },
];

export function SpendingBreakdown() {
  const router = useRouter();
  const { theme } = useTheme();
  
  const [allCategories, setAllCategories] = useState<CategoryData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [chartType, setChartType] = usePersistentState<ChartType>('runway:spending-breakdown:chartType', 'pie');
  const [timeframe, setTimeframe] = usePersistentState<TimeRange>('runway:spending-breakdown:timeframe', '1m');
  const [excludedCategoryIds, setExcludedCategoryIds] = usePersistentState<Set<string>>(
    'runway:spending-breakdown:excludedCategoryIds',
    new Set(),
    {
      serialize: (val) => JSON.stringify(Array.from(val)),
      deserialize: (raw) => new Set(JSON.parse(raw)),
    }
  );

  const [searchQuery, setSearchQuery] = useState('');

  const queryParams = useMemo(() => {
    const range = getMonthRange(timeframe);
    if (timeframe === '1m') {
      return `month=${range.start}`;
    }
    return `startMonth=${range.start}&endMonth=${range.end}`;
  }, [timeframe]);

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

  const visibleCategories = useMemo(() => {
    return expenseCategories.filter((c) => !excludedCategoryIds.has(c.categoryId));
  }, [expenseCategories, excludedCategoryIds]);

  const totalSpending = useMemo(() => {
    return visibleCategories.reduce((sum, c) => sum + c.amount, 0);
  }, [visibleCategories]);

  const pieData = useMemo(() => {
    const sorted = [...visibleCategories].sort((a, b) => b.amount - a.amount);
    if (sorted.length <= 20) {
      return sorted.map((c) => ({
        id: c.categoryName,
        label: c.categoryName,
        value: c.amount,
        color: getThemeAdaptedColor(c.categoryColor, theme),
        categoryId: c.categoryId,
      }));
    }

    const top19 = sorted.slice(0, 19);
    const rest = sorted.slice(19);
    const restAmount = rest.reduce((sum, c) => sum + c.amount, 0);
    const restIds = rest.map((c) => c.categoryId).join(',');

    const mappedTop = top19.map((c) => ({
      id: c.categoryName,
      label: c.categoryName,
      value: c.amount,
      color: getThemeAdaptedColor(c.categoryColor, theme),
      categoryId: c.categoryId,
    }));

    const otherItem = {
      id: 'Other',
      label: 'Other',
      value: restAmount,
      color: getThemeAdaptedColor('#94a3b8', theme),
      categoryId: restIds,
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
    const range = getMonthRange(timeframe);
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

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm">
        <div className="p-5 pb-2">
          <h3 className="text-sm font-semibold text-foreground">Spending Breakdown</h3>
        </div>
        <div className="h-[380px] flex items-center justify-center text-muted-foreground">
          <div className="w-7 h-7 border-2 border-border border-t-primary rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">Spending Breakdown</h3>
        <ChartEmptyState variant="error" error={error} />
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm">
      {/* ── Card Header ── */}
      <div className="p-5 border-b border-border flex items-center justify-between flex-wrap gap-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Spending Breakdown</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Analyze your expenses by category</p>
        </div>
        <div className="flex items-center gap-3">
          <TimeRangeFilter value={timeframe} onChange={setTimeframe} />
          <ChartTypeSelector value={chartType} options={typeOptions} onChange={setChartType} />
        </div>
      </div>

      {/* ── Card Content Grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 p-6">
        {/* Chart Column (3/5) */}
        <div className="lg:col-span-3 h-[380px] relative flex flex-col justify-center">
          {pieData.length === 0 ? (
            <ChartEmptyState
              variant={excludedCategoryIds.size > 0 ? 'empty' : 'nodata'}
              description={
                excludedCategoryIds.size > 0
                  ? 'All categories are excluded. Adjust your filters.'
                  : 'No spending data for this period'
              }
            />
          ) : (
            <div className="financial-chart h-full w-full relative">
              {chartType === 'bar' ? (() => {
                const maxLabelLen = pieData.length > 0
                  ? Math.max(...pieData.map(d => Math.min(20, d.id.length)))
                  : 0;
                const dynamicLeft = Math.max(80, maxLabelLen * 7 + 12);
                
                return (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      layout="vertical"
                      data={pieData}
                      margin={{ top: 10, right: 10, left: 10, bottom: 10 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} vertical={true} />
                      <XAxis type="number" hide />
                      <YAxis
                        type="category"
                        dataKey="id"
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
                        width={dynamicLeft}
                        tickFormatter={(v) => v.length > 20 ? `${v.slice(0, 20)}...` : v}
                      />
                      <Bar
                        dataKey="value"
                        radius={[0, 2, 2, 0]}
                        onClick={(data: any) => {
                          const catId = data.categoryId || (data.payload && data.payload.categoryId);
                          if (catId) handleClick(catId);
                        }}
                        className="cursor-pointer"
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Bar>
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload || !payload.length) return null;
                          const datum = payload[0].payload;
                          const pct = totalSpending > 0 ? ((datum.value / totalSpending) * 100).toFixed(1) : '0';
                          return (
                            <ChartTooltip>
                              <TooltipHeader>{String(datum.id)}</TooltipHeader>
                              <TooltipRow label="Amount" value={formatCurrency(datum.value)} />
                              <TooltipRow label="Percent" value={`${pct}%`} />
                            </ChartTooltip>
                          );
                        }}
                        cursor={{ fill: 'var(--color-border)', opacity: 0.15 }}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                );
              })() : (
                <>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        dataKey="value"
                        nameKey="id"
                        cx="50%"
                        cy="50%"
                        innerRadius="65%"
                        outerRadius="80%"
                        paddingAngle={0.5}
                        cornerRadius={3}
                        stroke="none"
                        onClick={(data: any) => {
                          const catId = data.categoryId || (data.payload && data.payload.categoryId);
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
              Showing {expenseCategories.length - excludedCategoryIds.size} of {expenseCategories.length}
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
                onClick={() => setExcludedCategoryIds(new Set(expenseCategories.map((c) => c.categoryId)))}
                className="text-primary hover:text-primary/80 hover:underline font-semibold cursor-pointer transition-colors"
              >
                Clear All
              </button>
            </div>
          </div>

          {/* Interactive Scrollable Legend List */}
          <div className="flex-1 overflow-y-auto pr-1 space-y-1.5 scrollbar-thin">
            {filteredCategories.length === 0 ? (
              <div className="text-center py-8 text-xs text-muted-foreground">
                No categories match "{searchQuery}"
              </div>
            ) : (
              filteredCategories.map((c) => {
                const isExcluded = excludedCategoryIds.has(c.categoryId);
                const adaptedColor = getThemeAdaptedColor(c.categoryColor, theme);
                const pct = totalSpending > 0 && !isExcluded
                  ? ((c.amount / totalSpending) * 100).toFixed(1)
                  : totalSpending === 0 && !isExcluded
                    ? '0.0'
                    : null;

                return (
                  <div
                    key={c.categoryId}
                    onClick={() => toggleCategory(c.categoryId)}
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
    </div>
  );
}
