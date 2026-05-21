'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { ResponsiveLine } from '@nivo/line';
import { ResponsiveBar } from '@nivo/bar';
import { useRouter } from 'next/navigation';
import { formatCurrency, formatPercent } from '@/lib/utils/format';
import { nivoTheme } from '@/components/charts/shared-chart-theme';
import { ChartTooltip, TooltipRow, TooltipHeader } from '@/components/charts/chart-tooltip';
import { ChartEmptyState } from '@/components/charts/chart-empty-state';
import { ChartTypeSelector, type ChartType } from '@/components/charts/chart-type-selector';
import { TimeRangeFilter, type TimeRange } from '@/components/charts/chart-filters';
import { useSyntheticData } from '@/lib/hooks/use-synthetic-data';
import { EstimatePill } from '@/components/ui/estimate-pill';

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
];

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
  const [timeframe, setTimeframe] = useState<TimeRange>('1m');
  const [chartType, setChartType] = useState<ChartType>('line');
  const [data, setData] = useState<any[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [summary, setSummary] = useState<ChartSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showBreakdown, setShowBreakdown] = useState(true);

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
          const next = new Set(prev);
          fetchedCats.forEach((c) => {
            if (prev.size === 0 || !prev.has(c)) {
              next.add(c);
            }
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

  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', {
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
      assetColors[cat] = CHART_COLOR_MAP[index % CHART_COLOR_MAP.length];
    });

    const sortedLiabs = [...availableLiabilities].sort(
      (a, b) => (latestPoint[b] || 0) - (latestPoint[a] || 0)
    );
    const liabColors: Record<string, string> = {};
    sortedLiabs.forEach((cat, index) => {
      liabColors[cat] = CHART_COLOR_MAP[index % CHART_COLOR_MAP.length];
    });

    return { ...assetColors, ...liabColors };
  }, [displayData, availableAssets, availableLiabilities]);

  // Frontend stacking & filtering logic
  const { stackedData, processedChartData, maxVal, minVal } = useMemo(() => {
    if (displayData.length === 0) {
      return { stackedData: [], processedChartData: [], maxVal: 1000, minVal: 0 };
    }

    const latestPoint = displayData[displayData.length - 1] || {};
    const sortedAssets = [...selectedAssets].sort(
      (a, b) => (latestPoint[b] || 0) - (latestPoint[a] || 0)
    );
    const sortedLiabilities = [...selectedLiabilities].sort(
      (a, b) => (latestPoint[b] || 0) - (latestPoint[a] || 0)
    );

    // Compute Net Worth for each date based on selected categories
    const processedPoints = displayData.map((d) => {
      const nw = showBreakdown
        ? selectedAssets.reduce((sum, cat) => sum + (d[cat] || 0), 0) -
          selectedLiabilities.reduce((sum, cat) => sum + (d[cat] || 0), 0)
        : d.netWorth;

      return {
        ...d,
        netWorth: nw,
      };
    });

    const series: Array<{ id: string; color: string; data: Array<{ x: string; y: number; isSynthetic?: boolean }> }> = [];

    if (showBreakdown) {
      // Stacking assets (positive, stack upwards)
      // Iterate backwards so the largest stack is drawn first, allowing overlays to layer correctly
      for (let i = sortedAssets.length - 1; i >= 0; i--) {
        const cat = sortedAssets[i];
        const dataPoints = displayData.map((d) => {
          let stackedVal = 0;
          for (let j = 0; j <= i; j++) {
            stackedVal += (d[sortedAssets[j]] || 0);
          }
          return { x: d.date, y: stackedVal, isSynthetic: d.isSynthetic };
        });

        series.push({
          id: cat,
          color: categoryColors[cat] || 'var(--chart-1)',
          data: dataPoints,
        });
      }

      // Stacking liabilities (negative, stack downwards)
      // Iterate backwards so the largest negative stack is drawn first
      for (let i = sortedLiabilities.length - 1; i >= 0; i--) {
        const cat = sortedLiabilities[i];
        const dataPoints = displayData.map((d) => {
          let stackedVal = 0;
          for (let j = 0; j <= i; j++) {
            stackedVal += (d[sortedLiabilities[j]] || 0);
          }
          return { x: d.date, y: -stackedVal, isSynthetic: d.isSynthetic };
        });

        series.push({
          id: cat,
          color: categoryColors[cat] || 'var(--color-destructive)',
          data: dataPoints,
        });
      }
    } else {
      series.push({
        id: 'Total Assets',
        color: 'var(--color-chart-1)',
        data: displayData.map((d) => ({ x: d.date, y: d.totalAssets, isSynthetic: d.isSynthetic })),
      });
      series.push({
        id: 'Total Liabilities',
        color: 'var(--color-destructive)',
        data: displayData.map((d) => ({ x: d.date, y: -d.totalLiabilities, isSynthetic: d.isSynthetic })),
      });
    }

    // Calculate Y scale bounds dynamically
    const allValues = processedPoints.flatMap((d) => {
      const vals = [d.netWorth];
      if (showBreakdown) {
        const assetsVal = selectedAssets.reduce((sum, cat) => sum + (d[cat] || 0), 0);
        const liabVal = selectedLiabilities.reduce((sum, cat) => sum + (d[cat] || 0), 0);
        vals.push(assetsVal, -liabVal);
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
      stackedData: series,
      processedChartData: processedPoints,
      maxVal: maxValue,
      minVal: minValue,
    };
  }, [displayData, selectedAssets, selectedLiabilities, categoryColors, showBreakdown]);

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

  const SyntheticOverlay = ({ series, xScale, yScale }: any) => {
    const mainSeries = series[0];
    if (!mainSeries || !Array.isArray(mainSeries.data) || mainSeries.data.length < 2) return null;

    const estimatedPoints: Array<{ x: number; y: number }> = [];

    for (const point of mainSeries.data) {
      const dataPoint = point?.data;
      if (!dataPoint?.isSynthetic) continue;

      const px = point.position?.x ?? xScale?.(dataPoint.x);
      const py = point.position?.y ?? yScale?.(dataPoint.y);
      if (Number.isFinite(px) && Number.isFinite(py)) {
        estimatedPoints.push({ x: px, y: py });
      }
    }

    if (estimatedPoints.length < 2) return null;

    const line = (pts: Array<{ x: number; y: number }>) =>
      pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');

    return (
      <path
        d={line(estimatedPoints)}
        fill="none"
        stroke="var(--color-primary)"
        strokeWidth={2.5}
        strokeDasharray="8 4"
        opacity={0.6}
      />
    );
  };

  const sliceTooltip = useCallback(({ slice }: any) => {
    const dateStr = slice.points[0]?.data.x;
    const point = processedChartData.find((d) => d.date === dateStr);
    if (!point) return null;

    const activeAssetCats = availableAssets.filter((cat) => selectedCategories.has(cat) && (point[cat] || 0) > 0);
    const activeLiabCats = availableLiabilities.filter((cat) => selectedCategories.has(cat) && (point[cat] || 0) > 0);

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
              <div className="mt-2 border-t border-border pt-1.5">
                <div className="text-[9px] font-semibold text-muted-foreground uppercase mb-1 tracking-wider">Assets</div>
                {activeAssetCats.map((cat) => (
                  <TooltipRow
                    key={cat}
                    label={cat}
                    value={formatCurrency(point[cat] || 0)}
                    color={categoryColors[cat] || 'var(--color-chart-1)'}
                  />
                ))}
              </div>
            )}

            {activeLiabCats.length > 0 && (
              <div className="mt-2 border-t border-border pt-1.5">
                <div className="text-[9px] font-semibold text-muted-foreground uppercase mb-1 tracking-wider">Liabilities</div>
                {activeLiabCats.map((cat) => (
                  <TooltipRow
                    key={cat}
                    label={cat}
                    value={formatCurrency(point[cat] || 0)}
                    color={categoryColors[cat] || 'var(--color-destructive)'}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="mt-2 border-t border-border pt-1.5">
            <TooltipRow
              label="Total Assets"
              value={formatCurrency(point.totalAssets)}
              color="var(--color-chart-1)"
            />
            <TooltipRow
              label="Total Liabilities"
              value={formatCurrency(point.totalLiabilities)}
              color="var(--color-destructive)"
            />
          </div>
        )}

        {point.isSynthetic && (
          <div className="text-[10px] text-muted-foreground italic mt-1.5 border-t border-border pt-1">
            Estimated value
          </div>
        )}
      </ChartTooltip>
    );
  }, [processedChartData, availableAssets, availableLiabilities, selectedCategories, categoryColors, showBreakdown]);

  const renderChart = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center text-muted-foreground h-72">
          <div className="text-center">
            <div className="w-7 h-7 border-2 border-border border-t-primary rounded-full animate-spin mx-auto mb-2" />
            Loading chart...
          </div>
        </div>
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
      const barData = processedChartData.map((d) => {
        const row: Record<string, any> = {
          id: fmtDate(d.date),
          isSynthetic: d.isSynthetic,
        };
        if (showBreakdown) {
          selectedAssets.forEach((cat) => {
            row[cat] = d[cat] || 0;
          });
          selectedLiabilities.forEach((cat) => {
            row[cat] = -(d[cat] || 0);
          });
        } else {
          row.assets = d.totalAssets;
          row.liabilities = -d.totalLiabilities;
        }
        return row;
      });

      const keys = showBreakdown
        ? [...selectedAssets, ...selectedLiabilities]
        : ['assets', 'liabilities'];

      const barColors = ({ id }: any) => {
        if (showBreakdown) {
          return categoryColors[id] || 'var(--color-primary)';
        } else {
          return id === 'liabilities' ? 'var(--color-destructive)' : 'var(--color-chart-1)';
        }
      };

      return (
        <div className="relative h-full">
          <ResponsiveBar
            data={barData}
            keys={keys}
            indexBy="id"
            margin={{ top: 10, right: 60, left: 90, bottom: 90 }}
            valueScale={{ type: 'linear', min: minVal, max: maxVal }}
            padding={0.05}
            groupMode="stacked"
            borderRadius={2}
            colors={barColors}
            axisLeft={{
              tickSize: 0,
              tickPadding: 12,
              format: (v: number) => {
                const absV = Math.abs(v);
                const sign = v < 0 ? '-' : '';
                if (absV >= 1000000) return `${sign}$${(absV / 1000000).toFixed(1)}M`;
                if (absV >= 1000) return `${sign}$${(absV / 1000).toFixed(0)}K`;
                return `${sign}$${absV}`;
              },
              legend: 'Net Worth',
              legendPosition: 'middle',
              legendOffset: -40,
            }}
            axisBottom={{
              tickSize: 0,
              tickPadding: 12,
              tickValues: timeframe === '1m'
                ? barData.filter((_, i) => i % 3 === 0).map(d => d.id)
                : Math.min(6, Math.max(3, Math.floor(data.length / 15))),
              tickRotation: timeframe === '1m' ? -20 : -45,
              legend: 'Time',
              legendPosition: 'middle',
              legendOffset: 75,
            }}
            enableGridY={true}
            enableGridX={false}
            theme={nivoTheme}
            animate={data.length < 100}
            onClick={({ data: bData }) => {
              const pt = data.find((d) => fmtDate(d.date) === bData.id);
              if (pt) handlePointClick(pt);
            }}
            enableLabel={false}
            tooltip={({ id, data }: any) => {
              const dateStr = data.id ? chartData.find(d => fmtDate(d.date) === data.id)?.date : null;
              const point = processedChartData.find(d => d.date === dateStr);
              if (!point) return null;
              
              const activeAssetCats = availableAssets.filter((cat) => selectedCategories.has(cat) && (point[cat] || 0) > 0);
              const activeLiabCats = availableLiabilities.filter((cat) => selectedCategories.has(cat) && (point[cat] || 0) > 0);

              return (
                <ChartTooltip>
                  <TooltipHeader>{String(data.id)}</TooltipHeader>
                  <TooltipRow
                    label="Net Worth"
                    value={formatCurrency(point.netWorth)}
                    color="var(--color-primary)"
                  />
                  {showBreakdown ? (
                    <>
                      {activeAssetCats.length > 0 && (
                        <div className="mt-2 border-t border-border pt-1.5">
                          <div className="text-[9px] font-semibold text-muted-foreground uppercase mb-1 tracking-wider">Assets</div>
                          {activeAssetCats.map((cat) => (
                            <TooltipRow
                              key={cat}
                              label={cat}
                              value={formatCurrency(point[cat] || 0)}
                              color={categoryColors[cat] || 'var(--color-chart-1)'}
                            />
                          ))}
                        </div>
                      )}
                      {activeLiabCats.length > 0 && (
                        <div className="mt-2 border-t border-border pt-1.5">
                          <div className="text-[9px] font-semibold text-muted-foreground uppercase mb-1 tracking-wider">Liabilities</div>
                          {activeLiabCats.map((cat) => (
                            <TooltipRow
                              key={cat}
                              label={cat}
                              value={formatCurrency(point[cat] || 0)}
                              color={categoryColors[cat] || 'var(--color-destructive)'}
                            />
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="mt-2 border-t border-border pt-1.5">
                      <TooltipRow
                        label="Assets"
                        value={formatCurrency(point.totalAssets)}
                        color="var(--color-chart-1)"
                      />
                      <TooltipRow
                        label="Liabilities"
                        value={formatCurrency(point.totalLiabilities)}
                        color="var(--color-destructive)"
                      />
                    </div>
                  )}
                  {data?.isSynthetic && (
                    <div className="text-[10px] text-muted-foreground italic mt-1 border-t border-border pt-1">
                      Estimated value
                    </div>
                  )}
                </ChartTooltip>
              );
            }}
          />
          <div className="absolute inset-0 pointer-events-none">
            <ResponsiveLine
              data={[{
                id: 'Net Worth',
                data: processedChartData.map((d) => ({ x: d.date, y: d.netWorth, isSynthetic: d.isSynthetic }))
              }]}
              margin={{ top: 10, right: 60, left: 90, bottom: 90 }}
              xScale={{ type: 'time', format: '%Y-%m-%d', useUTC: false, precision: 'day' }}
              yScale={{ type: 'linear', min: minVal, max: maxVal }}
              curve="monotoneX"
              colors={['var(--color-primary)']}
              lineWidth={2}
              enablePoints={false}
              enableGridX={false}
              enableGridY={false}
              axisLeft={null}
              axisBottom={null}
              theme={nivoTheme}
              animate={data.length < 100}
              layers={['lines', SyntheticOverlay]}
              tooltip={() => null}
            />
          </div>
        </div>
      );
    }

    return (
      <div className="relative h-full">
        <ResponsiveLine
          data={stackedData}
          margin={{ top: 10, right: 60, left: 90, bottom: 90 }}
          xScale={{ type: 'time', format: '%Y-%m-%d', useUTC: false, precision: 'day' }}
          yScale={{ type: 'linear', min: minVal, max: maxVal }}
          curve="monotoneX"
          colors={(d: any) => d.color}
          lineWidth={showBreakdown ? 0 : 2}
          enableArea={showBreakdown}
          areaOpacity={0.35}
          enablePoints={false}
          enableGridX={false}
          enableGridY={true}
          axisBottom={{
            tickSize: 0,
            tickPadding: 12,
            tickValues: Math.min(6, Math.max(3, Math.floor(data.length / 15))),
            format: timeframe === '1m' ? '%b %d' : '%b %y',
            tickRotation: timeframe === '1m' ? -20 : -45,
          }}
          axisLeft={{
            tickSize: 0,
            tickPadding: 12,
            format: (v: number) => {
              const absV = Math.abs(v);
              const sign = v < 0 ? '-' : '';
              if (absV >= 1000000) return `${sign}$${(absV / 1000000).toFixed(1)}M`;
              if (absV >= 1000) return `${sign}$${(absV / 1000).toFixed(0)}K`;
              return `${sign}$${absV}`;
            },
          }}
          theme={nivoTheme}
          enableSlices="x"
          sliceTooltip={sliceTooltip}
          animate={data.length < 100}
          layers={[
            'grid',
            'axes',
            'areas',
            'lines',
            'points',
            'slices',
            'mesh',
          ] as any}
        />
        
        <div className="absolute inset-0 pointer-events-none">
          <ResponsiveLine
            data={[{
              id: 'Net Worth',
              data: processedChartData.map((d) => ({ x: d.date, y: d.netWorth, isSynthetic: d.isSynthetic }))
            }]}
            margin={{ top: 10, right: 60, left: 90, bottom: 90 }}
            xScale={{ type: 'time', format: '%Y-%m-%d', useUTC: false, precision: 'day' }}
            yScale={{ type: 'linear', min: minVal, max: maxVal }}
            curve="monotoneX"
            colors={['var(--color-primary)']}
            lineWidth={3}
            enablePoints={false}
            enableGridX={false}
            enableGridY={false}
            axisLeft={null}
            axisBottom={null}
            theme={nivoTheme}
            animate={data.length < 100}
            layers={['lines', SyntheticOverlay]}
            tooltip={() => null}
          />
        </div>
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
