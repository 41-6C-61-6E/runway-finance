'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ComposedChart,
  Area,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { useRouter } from 'next/navigation';
import { formatCurrency, formatPercent } from '@/lib/utils/format';
import { getChartXTicks, formatSafeUTCDate } from '@/lib/utils/date';
import { ChartTooltip, TooltipRow, TooltipHeader } from '@/components/charts/chart-tooltip';
import { ChartEmptyState } from '@/components/charts/chart-empty-state';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { ChartTypeSelector, type ChartType } from '@/components/charts/chart-type-selector';
import { TimeRangeFilter, type TimeRange } from '@/components/charts/chart-filters';
import { useSyntheticData } from '@/lib/hooks/use-synthetic-data';
import { EstimatePill } from '@/components/ui/estimate-pill';
import { usePersistentState } from '@/lib/hooks/use-persistent-state';

interface ChartSummary {
  current: number;
  previous: number;
  change: number;
  percentChange: number;
  includedAccounts: number;
  totalAccounts: number;
}

interface ChartResponse {
  data: any[];
  categories?: string[];
  summary: ChartSummary;
}

const typeOptions = [
  { value: 'line' as ChartType, label: 'Line' },
  { value: 'bar' as ChartType, label: 'Bar' },
];

const CHART_COLOR_MAP = [
  'var(--chart-1)',
  'var(--chart-2)', 
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-synthetic)',
  'var(--destructive-synthetic)',
  'var(--destructive-synthetic)',
];

const getCategoryColor = (cat: string, index: number, isAsset: boolean) => {
  const cycle = Math.floor(index / 5);
  const chartNum = (index % 5) + 1;
  const baseVar = `var(--chart-${chartNum})`;
  
  if (isAsset) {
    if (cycle === 0) {
      return baseVar;
    } else if (cycle % 2 === 1) {
      const mixPct = Math.min(75, 20 + Math.floor(cycle / 2) * 20);
      return `color-mix(in oklch, ${baseVar}, white ${mixPct}%)`;
    } else {
      const mixPct = Math.min(75, 20 + (Math.floor(cycle / 2) - 1) * 20);
      return `color-mix(in oklch, ${baseVar}, black ${mixPct}%)`;
    }
  } else {
    // Liabilities get reddish shades
    const baseMixed = `color-mix(in oklch, ${baseVar}, var(--destructive) 60%)`;
    if (cycle === 0) {
      return baseMixed;
    } else if (cycle % 2 === 1) {
      const mixPct = Math.min(75, 20 + Math.floor(cycle / 2) * 20);
      return `color-mix(in oklch, ${baseMixed}, white ${mixPct}%)`;
    } else {
      const mixPct = Math.min(75, 20 + (Math.floor(cycle / 2) - 1) * 20);
      return `color-mix(in oklch, ${baseMixed}, black ${mixPct}%)`;
    }
  }
};

const ASSET_CATEGORIES_LIST = [
  'Cash & Checking',
  'Savings',
  'HSA (Checking)',
  'HSA (Investment)',
  'Taxable Brokerage',
  'Retirement',
  'Real Estate',
  'Vehicle',
  'Other Investments',
  'Other'
];

const LIABILITY_CATEGORIES_LIST = [
  'Credit Cards',
  'Loans',
  'Mortgages',
  'Other Debt'
];

function isAssetCategory(cat: string): boolean {
  return ASSET_CATEGORIES_LIST.includes(cat);
}

function isLiabilityCategory(cat: string): boolean {
  return LIABILITY_CATEGORIES_LIST.includes(cat);
}

function getDateRange(point: any): { startDate: string; endDate: string } {
  const d = new Date(point.date);
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return {
    startDate: start.toISOString().split('T')[0],
    endDate: end.toISOString().split('T')[0],
  };
}

function toFiniteNumber(value: unknown): number {
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : 0;
}

function toDateKey(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }

  if (typeof value === 'string') {
    const dateOnly = value.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
    if (dateOnly) return dateOnly;
  }

  return null;
}

export function NetWorthChart() {
  const router = useRouter();
  const { isEnabled } = useSyntheticData();
  const [timeframe, setTimeframe] = usePersistentState<TimeRange>('runway:net-worth:timeframe', '1m');
  const [chartType, setChartType] = usePersistentState<ChartType>('runway:net-worth:chartType', 'line');
  const [data, setData] = useState<any[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = usePersistentState<Set<string>>(
    'runway:net-worth:selectedCategories',
    new Set(),
    {
      serialize: (val) => JSON.stringify(Array.from(val)),
      deserialize: (raw) => new Set(JSON.parse(raw)),
    }
  );
  const [summary, setSummary] = useState<ChartSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showBreakdown, setShowBreakdown] = usePersistentState<boolean>('runway:net-worth:showBreakdown', true);

  const displayData = useMemo(
    () => (isEnabled('netWorth') ? data : data.filter((d) => !d.isSynthetic)),
    [data, isEnabled]
  );

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const url = new URL('/api/net-worth/chart', window.location.origin);
        url.searchParams.set('timeframe', timeframe);

        const response = await fetch(url.toString(), { credentials: 'include' });
        if (!response.ok) throw new Error('Failed to fetch chart data');

        const result: ChartResponse = await response.json();
        const fetchedCats = result.categories || [];
        
        const normalizedData = Array.isArray(result.data)
          ? result.data
              .map((point) => {
                const norm: Record<string, any> = {
                  date: toDateKey(point.date) ?? String(point.date),
                  netWorth: toFiniteNumber(point.netWorth),
                  totalAssets: toFiniteNumber(point.totalAssets),
                  totalLiabilities: toFiniteNumber(point.totalLiabilities),
                  isSynthetic: Boolean(point.isSynthetic),
                };
                fetchedCats.forEach((cat) => {
                  norm[cat] = toFiniteNumber(point[cat]);
                });
                return norm;
              })
              .filter((point) => /^\d{4}-\d{2}-\d{2}$/.test(point.date))
          : [];

        setData(normalizedData);
        setCategories(fetchedCats);
        setSelectedCategories((prev) => {
          const stored = typeof window !== 'undefined' ? localStorage.getItem('runway:net-worth:selectedCategories') : null;
          if (stored !== null) {
            return prev;
          }
          const next = new Set(prev);
          fetchedCats.forEach((c) => {
            next.add(c);
          });
          return next;
        });

        setSummary(result.summary ? {
          current: toFiniteNumber(result.summary.current),
          previous: toFiniteNumber(result.summary.previous),
          change: toFiniteNumber(result.summary.change),
          percentChange: toFiniteNumber(result.summary.percentChange),
          includedAccounts: toFiniteNumber(result.summary.includedAccounts),
          totalAccounts: toFiniteNumber(result.summary.totalAccounts),
        } : null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [timeframe]);

  const handlePointClick = useCallback(
    (point: any) => {
      const { startDate, endDate } = getDateRange(point);
      router.push(`/transactions?startDate=${startDate}&endDate=${endDate}`);
    },
    [router]
  );

  const fmtDate = (d: string) => formatSafeUTCDate(d, {
    month: 'short',
    day: 'numeric',
    year: '2-digit',
  });

  const availableAssets = useMemo(() => {
    return categories.filter(c => isAssetCategory(c));
  }, [categories]);

  const availableLiabilities = useMemo(() => {
    return categories.filter(c => isLiabilityCategory(c));
  }, [categories]);

  const selectedAssets = useMemo(() => {
    return availableAssets.filter(c => selectedCategories.has(c));
  }, [availableAssets, selectedCategories]);

  const selectedLiabilities = useMemo(() => {
    return availableLiabilities.filter(c => selectedCategories.has(c));
  }, [availableLiabilities, selectedCategories]);

  // Sort and match colors exactly with the pie chart
  const categoryColors = useMemo(() => {
    const latestPoint = displayData[displayData.length - 1] || {};

    const sortedAssets = [...availableAssets].sort(
      (a, b) => (latestPoint[b] || 0) - (latestPoint[a] || 0)
    );
    const assetColors: Record<string, string> = {};
    sortedAssets.forEach((cat, index) => {
      assetColors[cat] = getCategoryColor(cat, index, true);
    });

    const sortedLiabs = [...availableLiabilities].sort(
      (a, b) => (latestPoint[b] || 0) - (latestPoint[a] || 0)
    );
    const liabColors: Record<string, string> = {};
    sortedLiabs.forEach((cat, index) => {
      liabColors[cat] = getCategoryColor(cat, index, false);
    });

    return { ...assetColors, ...liabColors };
  }, [displayData, availableAssets, availableLiabilities]);

  // Frontend stacking & filtering logic
  const { rechartsData, processedChartData, maxVal, minVal } = useMemo(() => {
    if (displayData.length === 0) {
      return { rechartsData: [], processedChartData: [], maxVal: 1000, minVal: 0 };
    }

    // Compute Net Worth for each date based on selected categories
    const processedPoints = displayData.map((d) => {
      let totalAssetsVal = 0;
      let totalLiabilitiesVal = 0;
      let hasAssetsData = false;
      let hasLiabilitiesData = false;

      if (showBreakdown) {
        selectedAssets.forEach((cat) => {
          const val = d[cat];
          if (val !== undefined) {
            totalAssetsVal += val;
            hasAssetsData = true;
          }
        });
        selectedLiabilities.forEach((cat) => {
          const val = d[cat];
          if (val !== undefined) {
            totalLiabilitiesVal += val;
            hasLiabilitiesData = true;
          }
        });
      } else {
        totalAssetsVal = d.totalAssets;
        totalLiabilitiesVal = d.totalLiabilities;
        hasAssetsData = true;
        hasLiabilitiesData = true;
      }

      const nw = totalAssetsVal - totalLiabilitiesVal;

      return {
        ...d,
        netWorth: nw,
        _hasData: hasAssetsData || hasLiabilitiesData,
      };
    });

    // Create the final data for Recharts, where liability keys are negative
    const rechartsDataRaw = processedPoints.map((d, index) => {
      const row: Record<string, any> = {
        date: d.date,
        netWorth: d.netWorth,
        totalAssets: d.totalAssets,
        totalLiabilities: -d.totalLiabilities,
        isSynthetic: d.isSynthetic,
      };

      const isActual = !d.isSynthetic;
      const isSynthetic = d.isSynthetic;
      
      row.netWorthActual = isActual ? d.netWorth : null;
      
      const isLastActual = isActual && (index === processedPoints.length - 1 || processedPoints[index + 1]?.isSynthetic);
      row.netWorthSynthetic = (isSynthetic || isLastActual) ? d.netWorth : null;

      if (showBreakdown) {
        selectedAssets.forEach((cat) => {
          const val = d[cat];
          if (val !== undefined) {
            row[cat] = val;
          }
        });
        selectedLiabilities.forEach((cat) => {
          const val = d[cat];
          if (val !== undefined) {
            row[cat] = -val; // Negate liabilities!
          }
        });
      } else {
        row.assets = d.totalAssets;
        row.liabilities = -d.totalLiabilities; // Negate liabilities!
      }
      row._hasData = d._hasData;
      return row;
    });

    let startIdx = 0;
    if (timeframe === 'all') {
      const firstDataIdx = rechartsDataRaw.findIndex(d => d._hasData);
      if (firstDataIdx !== -1) {
        startIdx = firstDataIdx;
      }
    }
    let rechartsData = rechartsDataRaw.slice(startIdx);

    if (timeframe === 'all' && rechartsData.length > 100) {
      const sampled: typeof rechartsData = [];
      const len = rechartsData.length;
      for (let i = 0; i < 100; i++) {
        const index = Math.min(
          Math.floor((i * (len - 1)) / 99),
          len - 1
        );
        sampled.push(rechartsData[index]);
      }
      rechartsData = sampled;
    }

    // Calculate Y scale bounds dynamically
    const allValues = rechartsData.flatMap((d) => {
      const vals = [d.netWorth];
      if (showBreakdown) {
        selectedAssets.forEach((cat) => {
          if (d[cat] !== undefined) vals.push(d[cat]);
        });
        selectedLiabilities.forEach((cat) => {
          if (d[cat] !== undefined) vals.push(d[cat]);
        });
      } else {
        vals.push(d.totalAssets, -d.totalLiabilities);
      }
      return vals;
    });

    const rawMax = Math.max(...allValues, 1000);
    const rawMin = Math.min(...allValues, 0);
    const maxValue = rawMax * 1.15;
    const minValue = rawMin < 0 ? rawMin * 1.15 : 0;

    return {
      rechartsData,
      processedChartData: processedPoints.slice(startIdx),
      maxVal: maxValue,
      minVal: minValue,
    };
  }, [displayData, selectedAssets, selectedLiabilities, showBreakdown, timeframe]);

  const xAxisTicks = useMemo(() => {
    return getChartXTicks(rechartsData, timeframe, 'date');
  }, [rechartsData, timeframe]);

  // Recalculated summary stats matching the filtered selection
  const filteredSummary = useMemo(() => {
    if (!summary || processedChartData.length === 0) return null;
    if (!showBreakdown) return summary;

    const currentPoint = processedChartData[processedChartData.length - 1];
    const previousPoint = processedChartData[0];
    const currentVal = currentPoint.netWorth;
    const previousVal = previousPoint.netWorth;
    const changeVal = currentVal - previousVal;
    const percentChangeVal = previousVal !== 0 ? (changeVal / previousVal) * 100 : 0;

    return {
      ...summary,
      current: currentVal,
      previous: previousVal,
      change: changeVal,
      percentChange: percentChangeVal,
    };
  }, [summary, processedChartData, showBreakdown]);

  const isPositiveChange = filteredSummary ? filteredSummary.change >= 0 : false;

  const handleToggleCategory = (cat: string) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) {
        next.delete(cat);
      } else {
        next.add(cat);
      }
      return next;
    });
  };

  const handleSelectAll = (type: 'assets' | 'liabilities') => {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      const targets = type === 'assets' ? availableAssets : availableLiabilities;
      targets.forEach((t) => next.add(t));
      return next;
    });
  };

  const handleClearAll = (type: 'assets' | 'liabilities') => {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      const targets = type === 'assets' ? availableAssets : availableLiabilities;
      targets.forEach((t) => next.delete(t));
      return next;
    });
  };

  const CustomTooltip = useCallback(({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null;
    
    const point = payload[0].payload;
    const dateStr = point.date;

    const activeAssetCats = availableAssets.filter((cat) => selectedCategories.has(cat) && Math.abs(point[cat] || 0) > 0);
    const activeLiabCats = availableLiabilities.filter((cat) => selectedCategories.has(cat) && Math.abs(point[cat] || 0) > 0);

    return (
      <ChartTooltip>
        <TooltipHeader>{fmtDate(String(dateStr))}</TooltipHeader>
        
        <TooltipRow
          label="Net Worth"
          value={formatCurrency(point.netWorth)}
          color="var(--color-primary)"
        />

        {showBreakdown ? (
          <>
            {activeAssetCats.length > 0 && (
              <div className="mt-2 border-t border-border/40 pt-1.5">
                <div className="text-[9px] font-semibold text-muted-foreground uppercase mb-1 tracking-wider">Assets</div>
                {activeAssetCats.map((cat) => (
                  <TooltipRow
                    key={cat}
                    label={cat}
                    value={formatCurrency(Math.abs(point[cat] || 0))}
                    color={categoryColors[cat] || 'var(--color-chart-1)'}
                  />
                ))}
              </div>
            )}

            {activeLiabCats.length > 0 && (
              <div className="mt-2 border-t border-border/40 pt-1.5">
                <div className="text-[9px] font-semibold text-muted-foreground uppercase mb-1 tracking-wider">Liabilities</div>
                {activeLiabCats.map((cat) => (
                  <TooltipRow
                    key={cat}
                    label={cat}
                    value={formatCurrency(Math.abs(point[cat] || 0))}
                    color={categoryColors[cat] || 'var(--color-destructive)'}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="mt-2 border-t border-border/40 pt-1.5">
            <TooltipRow
              label="Total Assets"
              value={formatCurrency(Math.abs(point.totalAssets))}
              color="var(--color-chart-1)"
            />
            <TooltipRow
              label="Total Liabilities"
              value={formatCurrency(Math.abs(point.totalLiabilities))}
              color="var(--color-destructive)"
            />
          </div>
        )}

        {point.isSynthetic && (
          <div className="text-[10px] text-muted-foreground italic mt-1.5 border-t border-border/40 pt-1">
            Estimated value
          </div>
        )}
      </ChartTooltip>
    );
  }, [availableAssets, availableLiabilities, selectedCategories, categoryColors, showBreakdown]);

  const handleChartClick = useCallback((state: any) => {
    if (state && state.activePayload && state.activePayload.length > 0) {
      const clickedPoint = state.activePayload[0].payload;
      handlePointClick(clickedPoint);
    }
  }, [handlePointClick]);

  const renderChart = () => {
    if (loading) {
      return (
        <LoadingSpinner category="chart" className="h-72" />
      );
    }

    if (error) {
      return <ChartEmptyState variant="error" error={error} />;
    }

    if (data.length === 0) {
      return <ChartEmptyState variant="nodata" description="Net worth data will appear once you sync your accounts" />;
    }

    if (data.length < 2) {
      return <ChartEmptyState variant="insufficient" />;
    }

    if (chartType === 'bar') {
      return (
        <div className="w-full h-full relative">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={rechartsData}
              stackOffset="sign"
              margin={{ top: 15, right: 20, left: 10, bottom: 5 }}
              onClick={handleChartClick}
              className="cursor-pointer"
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={{ stroke: 'var(--color-border)' }}
                tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
                ticks={xAxisTicks}
                tickFormatter={(d) => {
                  if (!d) return '';
                  if (timeframe === '1m') {
                    return formatSafeUTCDate(d, { month: 'short', day: 'numeric' });
                  } else if (timeframe === '5y' || timeframe === 'all') {
                    return formatSafeUTCDate(d, { year: 'numeric' });
                  } else {
                    return formatSafeUTCDate(d, { month: 'short', year: '2-digit' });
                  }
                }}
              />
              <YAxis
                tickLine={false}
                axisLine={{ stroke: 'var(--color-border)' }}
                tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
                domain={[minVal, maxVal]}
                ticks={(() => {
                  const step = (maxVal - minVal) / 4;
                  const raw = [0, 1, 2, 3, 4].map((i) => minVal + step * i);
                  const withZero = Array.from(new Set([...raw, 0])).sort((a, b) => a - b);
                  return withZero;
                })()}
                tickFormatter={(v: number) => {
                  const absV = Math.abs(v);
                  const sign = v < 0 ? '-' : '';
                  if (absV >= 1000000) return `${sign}$${(absV / 1000000).toFixed(1)}M`;
                  if (absV >= 1000) return `${sign}$${(absV / 1000).toFixed(0)}K`;
                  if (absV === 0) return '$0';
                  return `${sign}$${absV.toFixed(0)}`;
                }}
              />
              <ReferenceLine y={0} stroke="var(--color-border)" strokeWidth={1} />
              <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: 'var(--color-border)', opacity: 0.15 }} />
              
              {showBreakdown ? (
                <>
                  {/* Render assets bars stacked (positive) */}
                  {selectedAssets.map((cat) => (
                    <Bar
                      key={cat}
                      dataKey={cat}
                      stackId="stack"
                      fill={categoryColors[cat] || 'var(--color-chart-1)'}
                      radius={[0, 0, 0, 0]}
                    />
                  ))}
                  
                  {/* Render liabilities bars stacked (negative) */}
                  {selectedLiabilities.map((cat) => (
                    <Bar
                      key={cat}
                      dataKey={cat}
                      stackId="stack"
                      fill={categoryColors[cat] || 'var(--color-destructive)'}
                      radius={[0, 0, 0, 0]}
                    />
                  ))}
                </>
              ) : (
                <>
                  {/* Render total assets bar */}
                  <Bar
                    dataKey="assets"
                    stackId="stack"
                    fill="var(--color-chart-1)"
                    radius={[0, 0, 0, 0]}
                  />
                  
                  {/* Render total liabilities bar (negative) */}
                  <Bar
                    dataKey="liabilities"
                    stackId="stack"
                    fill="var(--color-destructive)"
                    radius={[0, 0, 0, 0]}
                  />
                </>
              )}

              {/* Net Worth actual line (solid) */}
              <Line
                type="monotone"
                dataKey="netWorthActual"
                stroke="var(--color-primary)"
                strokeWidth={3}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
              />

              {/* Net Worth synthetic line (dashed) */}
              <Line
                type="monotone"
                dataKey="netWorthSynthetic"
                stroke="var(--color-primary)"
                strokeWidth={3}
                strokeDasharray="5 5"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      );
    }

    return (
      <div className="w-full h-full relative">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={rechartsData}
            stackOffset="sign"
            margin={{ top: 15, right: 20, left: 10, bottom: 5 }}
            onClick={handleChartClick}
            className="cursor-pointer"
          >
            <defs>
              {showBreakdown ? (
                <>
                  {[...selectedAssets, ...selectedLiabilities].map((cat) => {
                    const color = categoryColors[cat] || (isAssetCategory(cat) ? 'var(--color-chart-1)' : 'var(--color-destructive)');
                    const id = `gradient-${cat.replace(/[^a-zA-Z0-9]/g, '-')}`;
                    return (
                      <linearGradient key={cat} id={id} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={color} stopOpacity={0.25} />
                        <stop offset="95%" stopColor={color} stopOpacity={0.03} />
                      </linearGradient>
                    );
                  })}
                </>
              ) : (
                <>
                  <linearGradient id="gradient-assets" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-chart-1)" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="var(--color-chart-1)" stopOpacity={0.03} />
                  </linearGradient>
                  <linearGradient id="gradient-liabilities" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-destructive)" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="var(--color-destructive)" stopOpacity={0.03} />
                  </linearGradient>
                </>
              )}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={{ stroke: 'var(--color-border)' }}
              tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
              ticks={xAxisTicks}
              tickFormatter={(d) => {
                if (!d) return '';
                if (timeframe === '1m') {
                  return formatSafeUTCDate(d, { month: 'short', day: 'numeric' });
                } else if (timeframe === '5y' || timeframe === 'all') {
                  return formatSafeUTCDate(d, { year: 'numeric' });
                } else {
                  return formatSafeUTCDate(d, { month: 'short', year: '2-digit' });
                }
              }}
            />
            <YAxis
              tickLine={false}
              axisLine={{ stroke: 'var(--color-border)' }}
              tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
              domain={[minVal, maxVal]}
              ticks={(() => {
                const step = (maxVal - minVal) / 4;
                const raw = [0, 1, 2, 3, 4].map((i) => minVal + step * i);
                const withZero = Array.from(new Set([...raw, 0])).sort((a, b) => a - b);
                return withZero;
              })()}
              tickFormatter={(v: number) => {
                const absV = Math.abs(v);
                const sign = v < 0 ? '-' : '';
                if (absV >= 1000000) return `${sign}$${(absV / 1000000).toFixed(1)}M`;
                if (absV >= 1000) return `${sign}$${(absV / 1000).toFixed(0)}K`;
                if (absV === 0) return '$0';
                return `${sign}$${absV.toFixed(0)}`;
              }}
            />
            <ReferenceLine y={0} stroke="var(--color-border)" strokeWidth={1} />
            <RechartsTooltip content={<CustomTooltip />} cursor={{ stroke: 'var(--color-ring)', strokeWidth: 1, strokeDasharray: '2 2' }} />
            
            {showBreakdown ? (
              <>
                {/* Render assets areas stacked (positive) */}
                {selectedAssets.map((cat) => (
                  <Area
                    key={cat}
                    type="monotone"
                    dataKey={cat}
                    stackId="stack"
                    stroke={categoryColors[cat] || 'var(--color-chart-1)'}
                    strokeWidth={2}
                    fill={`url(#gradient-${cat.replace(/[^a-zA-Z0-9]/g, '-')})`}
                    dot={false}
                  />
                ))}
                
                {/* Render liabilities areas stacked (negative) */}
                {selectedLiabilities.map((cat) => (
                  <Area
                    key={cat}
                    type="monotone"
                    dataKey={cat}
                    stackId="stack"
                    stroke={categoryColors[cat] || 'var(--color-destructive)'}
                    strokeWidth={2}
                    fill={`url(#gradient-${cat.replace(/[^a-zA-Z0-9]/g, '-')})`}
                    dot={false}
                  />
                ))}
              </>
            ) : (
              <>
                {/* Render total assets area */}
                <Area
                  type="monotone"
                  dataKey="assets"
                  stackId="stack"
                  stroke="var(--color-chart-1)"
                  strokeWidth={2}
                  fill="url(#gradient-assets)"
                  dot={false}
                />
                
                {/* Render total liabilities area (negative) */}
                <Area
                  type="monotone"
                  dataKey="liabilities"
                  stackId="stack"
                  stroke="var(--color-destructive)"
                  strokeWidth={2}
                  fill="url(#gradient-liabilities)"
                  dot={false}
                />
              </>
            )}

            {/* Net Worth actual line (solid) */}
            <Line
              type="monotone"
              dataKey="netWorthActual"
              stroke="var(--color-primary)"
              strokeWidth={3}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
            />

            {/* Net Worth synthetic line (dashed) */}
            <Line
              type="monotone"
              dataKey="netWorthSynthetic"
              stroke="var(--color-primary)"
              strokeWidth={3}
              strokeDasharray="5 5"
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    );
  };

  const chartData = displayData;

  return (
    <div className="w-full bg-card border border-border rounded-xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="p-5 pb-3">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-sm font-medium text-muted-foreground">Net Worth</h2>
              {isEnabled('netWorth') && <EstimatePill />}
            </div>
            <div className="flex items-baseline gap-2">
              <div className="text-3xl font-bold text-foreground blur-number">
                {filteredSummary ? formatCurrency(filteredSummary.current) : '$0'}
              </div>
            </div>
            {filteredSummary && (
              <div className="flex items-center gap-1.5 mt-1.5">
                <span className={`text-sm font-semibold blur-number ${isPositiveChange ? 'text-chart-1' : 'text-destructive'}`}>
                  {isPositiveChange ? '+' : ''}{formatCurrency(filteredSummary.change)}
                </span>
                <span className={`text-xs blur-number ${isPositiveChange ? 'text-chart-1' : 'text-destructive'}`}>
                  ({formatPercent(filteredSummary.percentChange)})
                </span>
                <span className="text-xs text-muted-foreground">in the last {timeframe}</span>
              </div>
            )}
          </div>
          <div className="flex items-start gap-3">
            <ChartTypeSelector value={chartType} options={typeOptions} onChange={setChartType} />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <TimeRangeFilter value={timeframe} onChange={setTimeframe} />
        </div>
        <div className="mt-3 pb-1">
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showBreakdown}
              onChange={(e) => setShowBreakdown(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-border accent-primary"
            />
            <span className="text-xs text-muted-foreground">Show Stacked Breakdown</span>
          </label>
        </div>
      </div>

      {/* Chart */}
      <div className="h-72 px-2 pb-2">
        <div className="financial-chart h-full">
          {renderChart()}
        </div>
      </div>

      {/* Account Type Filters */}
      {showBreakdown && categories.length > 0 && (
        <div className="p-5 border-t border-border bg-muted/10">
          <div className="flex flex-col gap-4">
            {availableAssets.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Asset Types</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleSelectAll('assets')}
                      className="text-[10px] text-primary hover:underline font-medium cursor-pointer"
                    >
                      Select All
                    </button>
                    <span className="text-[10px] text-muted-foreground/30">|</span>
                    <button
                      onClick={() => handleClearAll('assets')}
                      className="text-[10px] text-primary hover:underline font-medium cursor-pointer"
                    >
                      Clear All
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {availableAssets.map((cat) => {
                    const isSelected = selectedCategories.has(cat);
                    const color = categoryColors[cat] || 'var(--chart-1)';
                    return (
                      <button
                        key={cat}
                        onClick={() => handleToggleCategory(cat)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-card text-foreground border-border shadow-sm'
                            : 'bg-transparent text-muted-foreground border-transparent opacity-40 hover:opacity-75'
                        }`}
                      >
                        <span
                          className="w-2 h-2 rounded-full border border-black/10 dark:border-white/10"
                          style={{ backgroundColor: color }}
                        />
                        {cat}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {availableLiabilities.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Liability Types</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleSelectAll('liabilities')}
                      className="text-[10px] text-primary hover:underline font-medium cursor-pointer"
                    >
                      Select All
                    </button>
                    <span className="text-[10px] text-muted-foreground/30">|</span>
                    <button
                      onClick={() => handleClearAll('liabilities')}
                      className="text-[10px] text-primary hover:underline font-medium cursor-pointer"
                    >
                      Clear All
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {availableLiabilities.map((cat) => {
                    const isSelected = selectedCategories.has(cat);
                    const color = categoryColors[cat] || 'var(--color-destructive)';
                    return (
                      <button
                        key={cat}
                        onClick={() => handleToggleCategory(cat)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-card text-foreground border-border shadow-sm'
                            : 'bg-transparent text-muted-foreground border-transparent opacity-40 hover:opacity-75'
                        }`}
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full border border-black/10 dark:border-white/10"
                          style={{ backgroundColor: color }}
                        />
                        {cat}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
