'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useCardCollapsed } from '@/lib/hooks/use-card-collapsed';
import { usePrivacyMode } from '@/components/privacy-mode-provider';
import {
  ComposedChart,
  Bar,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ReferenceLine,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { formatCurrency } from '@/lib/utils/format';
import { formatSafeUTCDate } from '@/lib/utils/date';
import { formatChartYAxisCurrency, formatChartXAxisDate, getChartXTicksUnified } from '@/lib/utils/chart-format';
import { ChartTooltip, TooltipRow, TooltipHeader } from '@/components/charts/chart-tooltip';
import { ChartEmptyState } from '@/components/charts/chart-empty-state';
import { ChartTypeSelector, type ChartType } from '@/components/charts/chart-type-selector';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { TimeRangeFilter, type TimeRange } from '@/components/charts/chart-filters';
import { CollapsibleCardHeader } from '@/components/ui/collapsible-card-header';
import { TIME_RANGE_PRESETS } from '@/components/charts/chart-filters';
import { usePersistentState } from '@/lib/hooks/use-persistent-state';
import { Switch } from '@/components/ui/switch';
import { ArrowRightLeft, TrendingUp, Info, ChevronDown, ChevronUp, Settings2, CheckSquare, Square, RefreshCw } from 'lucide-react';
import { CollapsibleFilterPanel } from '@/components/ui/collapsible-filter-panel';
import { useDateWindow } from '@/lib/hooks/use-date-window';
import { DateWindowNav } from '@/components/charts/date-window-nav';

interface SavingsRatePoint {
  yearMonth: string;
  income: number;
  expenses: number;
  netCashFlow: number;
  savingsRate: number;
  savings: {
    retirement: number;
    hsa: number;
    brokerage: number;
    savingsAccount: number;
    cash: number;
  };
  details: {
    retirement: Array<{ description: string; date: string; amount: number; accountName: string }>;
    hsa: Array<{ description: string; date: string; amount: number; accountName: string }>;
    brokerage: Array<{ description: string; date: string; amount: number; accountName: string }>;
    savingsAccount: Array<{ description: string; date: string; amount: number; accountName: string }>;
    income: Array<{ description: string; date: string; amount: number; accountName: string }>;
    expenses: Array<{ description: string; date: string; amount: number; accountName: string }>;
  };
}

const MONTH_MAP: Record<TimeRange, number> = {
  '1d': 1, '7d': 1, '30d': 1, '365d': 12,
  '1m': 1, '3m': 3, '6m': 6, '1y': 12, '5y': 60, 'ytd': 12, 'all': 120,
  '1d_discrete': 1,
};

const incomeExpensePresets = TIME_RANGE_PRESETS.filter((p) => ['1m', '3m', '6m', '1y', 'ytd', 'all', '30d', '365d', '5y'].includes(p.value));

const typeOptions = [
  { value: 'bar' as ChartType, label: 'Bar' },
  { value: 'line' as ChartType, label: 'Area' },
];

export function IncomeExpenseChart() {
  const { privacyMode } = usePrivacyMode();
  const [selectedSavingsPoint, setSelectedSavingsPoint] = useState<any | null>(null);
  const [selectedCashFlowPoint, setSelectedCashFlowPoint] = useState<any | null>(null);
  const [expandedBucket, setExpandedBucket] = useState<'retirement' | 'hsa' | 'brokerage' | 'savingsAccount' | 'cash' | 'income' | 'expenses' | null>(null);

  // Customization States
  const [excludedAccounts, setExcludedAccounts] = usePersistentState<string[]>('cf-chart:excluded-accounts', []);
  const [excludedCategories, setExcludedCategories] = usePersistentState<string[]>('cf-chart:excluded-categories', []);
  const [savingsComponents, setSavingsComponents] = usePersistentState<string[]>('cf-chart:savings-components', ['retirement', 'hsa', 'brokerage', 'savingsAccount', 'cash']);
  const [includePaystubRetirement, setIncludePaystubRetirement] = usePersistentState<boolean>('cf-chart:include-paystub-retirement', true);
  const [includePaystubHsa, setIncludePaystubHsa] = usePersistentState<boolean>('cf-chart:include-paystub-hsa', true);
  const [adjustIncomeDenominator, setAdjustIncomeDenominator] = usePersistentState<boolean>('cf-chart:adjust-income-denominator', false);

  const [showCustomizer, setShowCustomizer] = useState(false);
  const [activeTab, setActiveTab] = useState<'accounts' | 'categories' | 'formula'>('accounts');
  const [categorySearch, setCategorySearch] = useState('');

  // Fetch all user accounts
  const { data: accountsData = [] } = useQuery<any[]>({
    queryKey: ['accounts-all'],
    queryFn: async () => {
      const res = await fetch('/api/accounts?includeHidden=true&includeVirtual=true');
      if (!res.ok) throw new Error('Failed to fetch accounts');
      return res.json();
    },
  });

  // Fetch all user categories
  const { data: categoriesData = [] } = useQuery<any[]>({
    queryKey: ['categories-all'],
    queryFn: async () => {
      const res = await fetch('/api/categories');
      if (!res.ok) throw new Error('Failed to fetch categories');
      return res.json();
    },
  });

  // Unified Query: Fetch monthly savings and standard cash flow data
  const { data: savingsData = [], isLoading, error: queryError } = useQuery<SavingsRatePoint[]>({
    queryKey: [
      'savings-rate-monthly',
      excludedAccounts,
      excludedCategories,
      savingsComponents,
      includePaystubRetirement,
      includePaystubHsa,
      adjustIncomeDenominator,
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('months', '120');
      if (excludedAccounts.length > 0) {
        params.append('excludedAccounts', excludedAccounts.join(','));
      }
      if (excludedCategories.length > 0) {
        params.append('excludedCategories', excludedCategories.join(','));
      }
      if (savingsComponents.length > 0) {
        params.append('savingsComponents', savingsComponents.join(','));
      }
      params.append('includePaystubRetirement', String(includePaystubRetirement));
      params.append('includePaystubHsa', String(includePaystubHsa));
      params.append('adjustIncomeDenominator', String(adjustIncomeDenominator));

      const res = await fetch(`/api/cash-flow/savings-rate?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch monthly savings rate data');
      return res.json();
    },
  });

  const error = queryError ? (queryError instanceof Error ? queryError.message : String(queryError)) : null;

  const {
    timeframe, setTimeframe,
    windowEnd, setWindowEnd,
    prevWindow, nextWindow, isNextDisabled,
    windowLabel,
    periodOptions,
    showWindowNav,
  } = useDateWindow('finance:income-expense:timeframe', 'finance:income-expense:windowEnd', '1y');
  const [chartType, setChartType] = useState<ChartType>('bar');
  const [isCollapsed, setIsCollapsed] = useCardCollapsed('incomeExpenseChart');
  const [showFilters, setShowFilters] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Active accounts and categorized helper data structures
  const activeDbAccounts = useMemo(() => {
    return accountsData.filter((a: any) => (!a.isHidden && !a.isExcludedFromNetWorth) || a.type === 'paystub');
  }, [accountsData]);

  const parentCategories = useMemo(() => {
    return categoriesData.filter((c: any) => !c.parentId);
  }, [categoriesData]);

  const subCategoriesMap = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const cat of categoriesData) {
      if (cat.parentId) {
        const list = map.get(cat.parentId) || [];
        list.push(cat);
        map.set(cat.parentId, list);
      }
    }
    return map;
  }, [categoriesData]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const numMonths = MONTH_MAP[timeframe] || 12;

  // Windowed Data
  const effectiveSavingsEndIdx = useMemo(() => {
    if (timeframe === 'all') return savingsData.length;
    const idx = savingsData.findIndex((d) => d.yearMonth > windowEnd);
    return idx === -1 ? savingsData.length : idx;
  }, [savingsData, windowEnd, timeframe]);
  const savingsStartIdx = Math.max(0, effectiveSavingsEndIdx - numMonths);
  const windowedSavingsData = timeframe === 'all' ? savingsData : savingsData.slice(savingsStartIdx, effectiveSavingsEndIdx);

  // Map data for Left Chart (Income vs Expenses)
  const data = useMemo(() => {
    return windowedSavingsData.map((d) => ({
      month: formatSafeUTCDate(d.yearMonth + '-01', { month: 'short', year: '2-digit' }),
      yearMonth: d.yearMonth,
      income: d.income,
      expenses: d.expenses,
      net: d.netCashFlow,
      details: d.details || { income: [], expenses: [] },
    }));
  }, [windowedSavingsData]);

  const chartData = useMemo(() => data.map((d) => ({
    ...d,
    expenses: -Math.abs(d.expenses),
  })), [data]);

  // Map data for Right Chart (Savings Rate)
  const savingsChartData = useMemo(() => {
    return windowedSavingsData.map((d) => ({
      month: formatSafeUTCDate(d.yearMonth + '-01', { month: 'short', year: '2-digit' }),
      yearMonth: d.yearMonth,
      income: d.income,
      expenses: d.expenses,
      netCashFlow: d.netCashFlow,
      retirement: d.savings.retirement,
      hsa: d.savings.hsa,
      brokerage: d.savings.brokerage,
      savingsAccount: d.savings.savingsAccount,
      cash: d.savings.cash,
      savingsRate: d.savingsRate * 100,
      details: d.details || { retirement: [], hsa: [], brokerage: [], savingsAccount: [] },
    }));
  }, [windowedSavingsData]);

  const avgSavingsRate = useMemo(() => {
    if (savingsChartData.length === 0) return 0;
    const total = savingsChartData.reduce((sum, d) => sum + d.savingsRate, 0);
    return total / savingsChartData.length;
  }, [savingsChartData]);

  const avgNetIncome = useMemo(() => {
    if (chartData.length === 0) return 0;
    const total = chartData.reduce((sum, d) => sum + d.net, 0);
    return total / chartData.length;
  }, [chartData]);

  const xAxisTicks = useMemo(() => {
    return getChartXTicksUnified(data, timeframe, isMobile, 'yearMonth');
  }, [data, timeframe, isMobile]);

  // Accessibility screen reader summary
  const srSummary = useMemo(() => {
    if (chartData.length === 0) return '';
    const lastPoint = chartData[chartData.length - 1];
    const totalIncome = chartData.reduce((sum, d) => sum + d.income, 0);
    const totalExpenses = chartData.reduce((sum, d) => sum + Math.abs(d.expenses), 0);
    const formattedLastPointMonth = formatChartXAxisDate(lastPoint.yearMonth + '-01', timeframe, { isMonthly: true });
    return `Income versus expenses chart. Over the selected period, total income was ${formatCurrency(totalIncome)} and total expenses were ${formatCurrency(totalExpenses)}. In the most recent month (${formattedLastPointMonth}), income was ${formatCurrency(lastPoint.income)} and expenses were ${formatCurrency(Math.abs(lastPoint.expenses))}.`;
  }, [chartData, timeframe]);

  // Left Y-Axis domains (Income vs Expenses)
  const allValues = chartData.flatMap((d) => [d.income, d.expenses, d.net]);
  const minVal = Math.min(...allValues, 0);
  const maxVal = Math.max(...allValues, 1);

  // Right Y-Axis domains (Savings Rate Stacked Amounts)
  const savingsValues = savingsChartData.flatMap((d) => {
    const posSum = (d.retirement > 0 ? d.retirement : 0) +
                   (d.hsa > 0 ? d.hsa : 0) +
                   (d.brokerage > 0 ? d.brokerage : 0) +
                   (d.savingsAccount > 0 ? d.savingsAccount : 0) +
                   (d.cash > 0 ? d.cash : 0);
    const negSum = (d.retirement < 0 ? d.retirement : 0) +
                   (d.hsa < 0 ? d.hsa : 0) +
                   (d.brokerage < 0 ? d.brokerage : 0) +
                   (d.savingsAccount < 0 ? d.savingsAccount : 0) +
                   (d.cash < 0 ? d.cash : 0);
    return [posSum, negSum];
  });
  const minSavingsVal = Math.min(...savingsValues, 0);
  const maxSavingsVal = Math.max(...savingsValues, 100);

  const leftSavingsMin = minSavingsVal * 1.15;
  const leftSavingsMax = maxSavingsVal * 1.15;

  // Aligning zero between left and right Y-axis for the Savings Rate Chart
  const { rightSavingsMin, rightSavingsMax } = useMemo(() => {
    let minR = 0;
    let maxR = 100;
    if (leftSavingsMin < 0 && leftSavingsMax > 0) {
      minR = 100 * (leftSavingsMin / leftSavingsMax);
    } else if (leftSavingsMin < 0 && leftSavingsMax <= 0) {
      minR = 100;
      maxR = 0;
    }
    return { rightSavingsMin: minR, rightSavingsMax: maxR };
  }, [leftSavingsMin, leftSavingsMax]);

  // Custom ticks to force 0 to be labeled
  const leftYAxisTicks = useMemo(() => {
    const ticks = [0];
    const min = minVal * 1.15;
    const max = maxVal * 1.15;
    if (min < 0) {
      ticks.push(min);
      ticks.push(min / 2);
    }
    if (max > 0) {
      ticks.push(max / 2);
      ticks.push(max);
    }
    return Array.from(new Set(ticks.map(v => Math.round(v)))).sort((a, b) => a - b);
  }, [minVal, maxVal]);

  const savingsYAxisTicks = useMemo(() => {
    const ticks = [0];
    const min = leftSavingsMin;
    const max = leftSavingsMax;
    if (min < 0) {
      ticks.push(min);
      ticks.push(min / 2);
    }
    if (max > 0) {
      ticks.push(max / 2);
      ticks.push(max);
    }
    return Array.from(new Set(ticks.map(v => Math.round(v)))).sort((a, b) => a - b);
  }, [leftSavingsMin, leftSavingsMax]);

  const rightSavingsTicks = useMemo(() => {
    const range = leftSavingsMax - leftSavingsMin;
    if (range === 0) return [0, 20, 40, 60, 80, 100];
    return savingsYAxisTicks.map((tick) => {
      const ratio = (tick - leftSavingsMin) / range;
      const rightVal = rightSavingsMin + ratio * (rightSavingsMax - rightSavingsMin);
      return Math.round(rightVal);
    });
  }, [savingsYAxisTicks, leftSavingsMin, leftSavingsMax, rightSavingsMin, rightSavingsMax]);

  const formatXTick = useCallback((d: string) => {
    return formatChartXAxisDate(d + '-01', timeframe, { isMonthly: true });
  }, [timeframe]);

  const formatYTick = useCallback((v: number) => {
    return formatChartYAxisCurrency(v, minVal * 1.15, maxVal * 1.15);
  }, [minVal, maxVal]);

  const formatSavingsYTick = useCallback((v: number) => {
    return formatChartYAxisCurrency(v, minSavingsVal * 1.15, maxSavingsVal * 1.15);
  }, [minSavingsVal, maxSavingsVal]);

  const handleCloseSavingsModal = () => {
    setSelectedSavingsPoint(null);
    setExpandedBucket(null);
  };

  const handleCloseCashFlowModal = () => {
    setSelectedCashFlowPoint(null);
    setExpandedBucket(null);
  };

  // Tooltips
  const CustomTooltip = useCallback(({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null;
    const point = payload[0]?.payload;
    if (!point) return null;
    const headerDate = formatChartXAxisDate(point.yearMonth + '-01', timeframe, { isMonthly: true });
    return (
      <ChartTooltip>
        <TooltipHeader>{headerDate}</TooltipHeader>
        <TooltipRow label="Income" value={formatCurrency(point.income)} color="var(--color-chart-1)" />
        <TooltipRow label="Expenses" value={formatCurrency(Math.abs(point.expenses))} color="var(--color-destructive)" />
        <TooltipRow label="Net Income" value={formatCurrency(point.net)} color="var(--color-primary)" />
      </ChartTooltip>
    );
  }, [timeframe]);

  const SavingsTooltip = useCallback(({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null;
    const point = payload[0]?.payload;
    if (!point) return null;
    const headerDate = formatChartXAxisDate(point.yearMonth + '-01', timeframe, { isMonthly: true });

    const totalSavings = point.retirement + point.hsa + point.brokerage + point.savingsAccount + point.cash;

    return (
      <ChartTooltip>
        <TooltipHeader>{headerDate}</TooltipHeader>
        <TooltipRow label="Retirement" value={formatCurrency(point.retirement)} color="var(--color-chart-1)" />
        <TooltipRow label="HSA" value={formatCurrency(point.hsa)} color="var(--color-chart-2)" />
        <TooltipRow label="Brokerage" value={formatCurrency(point.brokerage)} color="var(--color-chart-3)" />
        <TooltipRow label="Savings Account" value={formatCurrency(point.savingsAccount)} color="var(--color-chart-4)" />
        <TooltipRow label="Leftover Cash" value={formatCurrency(point.cash)} color="var(--color-chart-5)" />
        <div className="border-t border-border my-1 pt-1 font-semibold text-foreground flex justify-between gap-8 text-xs">
          <span>Total Savings:</span>
          <span>{formatCurrency(totalSavings)}</span>
        </div>
        <div className="font-semibold text-primary flex justify-between gap-8 text-xs">
          <span>Savings Rate:</span>
          <span>{point.savingsRate.toFixed(1)}%</span>
        </div>
      </ChartTooltip>
    );
  }, [timeframe]);

  if (isLoading) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm">
        <CollapsibleCardHeader
          isCollapsed={isCollapsed}
          onToggle={setIsCollapsed}
          title={
            <div className="flex items-center gap-2">
              <ArrowRightLeft className="w-4 h-4 text-primary shrink-0" />
              <span>Net Income & Savings Rate</span>
            </div>
          }
        />
        {!isCollapsed && <LoadingSpinner category="chart" className="h-[320px] m-5" />}
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
              <ArrowRightLeft className="w-4 h-4 text-primary shrink-0" />
              <span>Net Income & Savings Rate</span>
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

  if (data.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm">
        <CollapsibleCardHeader
          isCollapsed={isCollapsed}
          onToggle={setIsCollapsed}
          title={
            <div className="flex items-center gap-2">
              <ArrowRightLeft className="w-4 h-4 text-primary shrink-0" />
              <span>Net Income & Savings Rate</span>
            </div>
          }
        />
        {!isCollapsed && (
          <div className="p-5">
            <ChartEmptyState variant="nodata" description="Income and expense data will appear once you sync your accounts" />
          </div>
        )}
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
      <CollapsibleCardHeader
        isCollapsed={isCollapsed}
        onToggle={setIsCollapsed}
        title={
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="w-4 h-4 text-primary shrink-0" />
            <span>Net Income & Savings Rate</span>
          </div>
        }
      />
      {!isCollapsed && (
        <>
          <CollapsibleFilterPanel
            isOpen={showFilters}
            onToggle={() => setShowFilters(!showFilters)}
            actions={
              <button
                type="button"
                onClick={() => setShowCustomizer(!showCustomizer)}
                className={`flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2.5 py-1 border rounded-lg text-[11px] font-semibold transition-all cursor-pointer shadow-sm select-none shrink-0 ${
                  showCustomizer
                    ? 'bg-primary/10 border-primary/30 text-primary hover:bg-primary/15'
                    : 'bg-background hover:bg-muted border-border/80 text-muted-foreground hover:text-foreground'
                }`}
              >
                <Settings2 size={12} className="text-primary shrink-0" />
                <span className="hidden sm:inline">Customize Data</span>
                {showCustomizer ? (
                  <ChevronUp size={12} className="text-muted-foreground/60 shrink-0" />
                ) : (
                  <ChevronDown size={12} className="text-muted-foreground/60 shrink-0" />
                )}
              </button>
            }
            feedbackItems={[
              <span key="timeframe" className="bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider">
                {timeframe === '1d_discrete' ? '1D' : timeframe.toUpperCase()}
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
                  timeframe={timeframe}
                />
              )
            }
          >
            <div className="flex flex-wrap items-center justify-between gap-4 p-3 bg-muted/20 border border-border/20 rounded-xl">
              <div className="flex items-center">
                <TimeRangeFilter value={timeframe} presets={incomeExpensePresets} onChange={setTimeframe} />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mr-1">Style</span>
                <ChartTypeSelector value={chartType} options={typeOptions} onChange={setChartType} />
              </div>
            </div>
          </CollapsibleFilterPanel>

          {showCustomizer && (
            <div className="border-b border-border bg-muted/5 px-5 py-4 space-y-4 animate-in slide-in-from-top-2 duration-250">
              {/* Tabs */}
              <div className="flex gap-2 border-b border-border/30 pb-2 overflow-x-auto scrollbar-none">
                {(['accounts', 'categories', 'formula'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider border transition-all ${
                      activeTab === tab
                        ? 'bg-background border-border text-primary shadow-sm font-bold'
                        : 'border-transparent text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {tab === 'accounts' && 'Included Accounts'}
                    {tab === 'categories' && 'Excluded Categories'}
                    {tab === 'formula' && 'Savings Formula'}
                  </button>
                ))}
              </div>

              {/* Tab Content: Accounts */}
              {activeTab === 'accounts' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs flex-wrap gap-2">
                    <span className="text-muted-foreground">Select which accounts supply data to the income, expenses, and savings rate calculations.</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setExcludedAccounts([])}
                        className="text-primary hover:underline font-semibold"
                      >
                        Select All
                      </button>
                      <span className="text-muted-foreground/30">|</span>
                      <button
                        onClick={() => setExcludedAccounts(activeDbAccounts.map((a: any) => a.id))}
                        className="text-muted-foreground hover:text-foreground font-semibold"
                      >
                        Clear All
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-[220px] overflow-y-auto pr-1">
                    {activeDbAccounts.map((acc: any) => {
                      const isIncluded = !excludedAccounts.includes(acc.id);
                      return (
                        <label
                          key={acc.id}
                          className={`flex items-center gap-2.5 p-2 rounded-lg border cursor-pointer hover:bg-muted/20 transition-all ${
                            isIncluded ? 'border-primary/20 bg-primary/5' : 'border-border/65 bg-background opacity-60'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isIncluded}
                            onChange={() => {
                              if (isIncluded) {
                                setExcludedAccounts((prev) => [...prev, acc.id]);
                              } else {
                                setExcludedAccounts((prev) => prev.filter((id) => id !== acc.id));
                              }
                            }}
                            className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary focus:ring-offset-background cursor-pointer"
                          />
                          <div className="flex flex-col min-w-0">
                            <span className="text-xs font-semibold text-foreground truncate">{acc.name}</span>
                            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{acc.type}</span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Tab Content: Categories */}
              {activeTab === 'categories' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <span className="text-xs text-muted-foreground">Select spend/income categories to exclude from standard Cash Flow charts.</span>
                    <input
                      type="text"
                      placeholder="Search categories..."
                      value={categorySearch}
                      onChange={(e) => setCategorySearch(e.target.value)}
                      className="h-8 max-w-[200px] text-xs px-2.5 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground/60 focus:ring-primary focus:border-primary"
                    />
                  </div>

                  <div className="border border-border/40 rounded-lg max-h-[220px] overflow-y-auto divide-y divide-border/20 bg-background/50">
                    {parentCategories
                      .filter((p: any) => {
                        if (!categorySearch) return true;
                        const nameMatch = p.name.toLowerCase().includes(categorySearch.toLowerCase());
                        const subs = subCategoriesMap.get(p.id) || [];
                        const subMatch = subs.some((s: any) => s.name.toLowerCase().includes(categorySearch.toLowerCase()));
                        return nameMatch || subMatch;
                      })
                      .map((parent: any) => {
                        const subs = subCategoriesMap.get(parent.id) || [];
                        const isParentExcluded = excludedCategories.includes(parent.id);
                        const matchingSubs = subs.filter((s: any) =>
                          !categorySearch || s.name.toLowerCase().includes(categorySearch.toLowerCase())
                        );

                        return (
                          <div key={parent.id} className="p-2.5 space-y-2">
                            {/* Parent Category Row */}
                            <div className="flex items-center justify-between">
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={!isParentExcluded}
                                  onChange={() => {
                                    if (!isParentExcluded) {
                                      // Exclude parent and all its subcategories
                                      setExcludedCategories((prev) => {
                                        const next = new Set([...prev, parent.id, ...subs.map((s) => s.id)]);
                                        return Array.from(next);
                                      });
                                    } else {
                                      // Include parent and all its subcategories
                                      setExcludedCategories((prev) =>
                                        prev.filter((id) => id !== parent.id && !subs.some((s) => s.id === id))
                                      );
                                    }
                                  }}
                                  className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary focus:ring-offset-background cursor-pointer"
                                  />
                                <span className="text-xs font-bold text-foreground">{parent.name}</span>
                              </label>
                            </div>

                            {/* Subcategories (Indented Grid) */}
                            {matchingSubs.length > 0 && (
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pl-5">
                                {matchingSubs.map((sub: any) => {
                                  const isSubExcluded = excludedCategories.includes(sub.id);
                                  return (
                                    <label key={sub.id} className="flex items-center gap-2 cursor-pointer select-none">
                                      <input
                                        type="checkbox"
                                        checked={!isSubExcluded}
                                        onChange={() => {
                                          if (!isSubExcluded) {
                                            setExcludedCategories((prev) => [...prev, sub.id]);
                                          } else {
                                            setExcludedCategories((prev) => prev.filter((id) => id !== sub.id));
                                          }
                                        }}
                                        className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary focus:ring-offset-background cursor-pointer"
                                      />
                                      <span className="text-xs text-muted-foreground truncate">{sub.name}</span>
                                    </label>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

              {/* Tab Content: Formula */}
              {activeTab === 'formula' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs text-foreground">
                  {/* Paycheck Deductions & Denominator */}
                  <div className="space-y-4 bg-background/30 p-3.5 rounded-xl border border-border/40">
                    <h4 className="font-bold text-xs uppercase tracking-wider text-muted-foreground pb-1.5 border-b border-border/20">Paycheck Contributions</h4>
                    
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex flex-col min-w-0">
                          <span className="font-semibold text-foreground">Include Pre-tax 401(k) / Retirement</span>
                          <span className="text-[10px] text-muted-foreground mt-0.5">Include pre-tax retirement deductions from your paystubs as tracked savings.</span>
                        </div>
                        <Switch
                          checked={includePaystubRetirement}
                          onCheckedChange={setIncludePaystubRetirement}
                        />
                      </div>

                      <div className="flex items-start justify-between gap-4">
                        <div className="flex flex-col min-w-0">
                          <span className="font-semibold text-foreground">Include Pre-tax HSA Deductions</span>
                          <span className="text-[10px] text-muted-foreground mt-0.5">Include pre-tax HSA contributions from your paystubs as tracked savings.</span>
                        </div>
                        <Switch
                          checked={includePaystubHsa}
                          onCheckedChange={setIncludePaystubHsa}
                        />
                      </div>

                      <div className="border-t border-border/20 pt-3 flex items-start justify-between gap-4">
                        <div className="flex flex-col min-w-0">
                          <span className="font-semibold text-foreground">Adjust Denominator (Gross Income)</span>
                          <span className="text-[10px] text-muted-foreground mt-0.5">Add included pre-tax paystub deductions to the savings rate denominator (gross salary vs net paycheck).</span>
                        </div>
                        <Switch
                          checked={adjustIncomeDenominator}
                          onCheckedChange={setAdjustIncomeDenominator}
                          disabled={!includePaystubRetirement && !includePaystubHsa}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Tracked Savings Components */}
                  <div className="space-y-3 bg-background/30 p-3.5 rounded-xl border border-border/40">
                    <h4 className="font-bold text-xs uppercase tracking-wider text-muted-foreground pb-1.5 border-b border-border/20">Tracked Savings Components</h4>
                    <p className="text-[10px] text-muted-foreground">Select which categories of transfers count as savings in your Savings Rate calculation.</p>
                    
                    <div className="space-y-2 max-h-[160px] overflow-y-auto">
                      {[
                        { key: 'retirement', label: 'Retirement Accounts', desc: '401(k), IRA, pension accounts' },
                        { key: 'hsa', label: 'Health Savings Accounts (HSA)', desc: 'Health savings asset transfers' },
                        { key: 'brokerage', label: 'Brokerage / Investments', desc: 'Brokerages, metals, crypto' },
                        { key: 'savingsAccount', label: 'Savings Accounts', desc: 'High-yield and standard savings transfers' },
                        { key: 'cash', label: 'Leftover Cash (Surplus)', desc: 'Remaining unspent cash flow of the month' },
                      ].map((item) => {
                        const isIncluded = savingsComponents.includes(item.key);
                        return (
                          <label key={item.key} className="flex items-center justify-between p-2 rounded-lg border bg-background/40 hover:bg-muted/10 cursor-pointer transition-all">
                            <div className="flex flex-col pr-3">
                              <span className="font-semibold text-foreground">{item.label}</span>
                              <span className="text-[9px] text-muted-foreground mt-0.5">{item.desc}</span>
                            </div>
                            <input
                              type="checkbox"
                              checked={isIncluded}
                              onChange={() => {
                                if (isIncluded) {
                                  setSavingsComponents((prev) => prev.filter((k) => k !== item.key));
                                } else {
                                  setSavingsComponents((prev) => [...prev, item.key]);
                                }
                              }}
                              className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary focus:ring-offset-background cursor-pointer"
                            />
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col sm:flex-row divide-y sm:divide-y-0 sm:divide-x divide-border">
            {/* ── Left Column: Income vs Expenses ── */}
            <div className="flex-1 min-w-0 p-2.5 sm:p-5">
              <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                <ArrowRightLeft className="w-3.5 h-3.5 text-primary shrink-0" />
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Income vs Expenses</span>
                <span className="px-1.5 py-0.5 text-[9px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded uppercase tracking-wide shrink-0">
                  Experimental
                </span>
              </div>
              <div className="h-[260px] sm:h-[300px] w-full relative touch-pan-y">
                <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 100, height: 100 }}>
                  {chartType === 'bar' ? (
                    <ComposedChart role="img" aria-label="Income vs Expenses Composed Chart" data={chartData} stackOffset="sign" margin={{ top: 15, right: 10, left: -10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} opacity={0.3} />
                      <XAxis
                        dataKey="yearMonth"
                        tickLine={false}
                        axisLine={{ stroke: 'var(--color-border)' }}
                        tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
                        ticks={xAxisTicks}
                        tickFormatter={formatXTick}
                        minTickGap={30}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={{ stroke: 'var(--color-border)' }}
                        tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
                        domain={[minVal * 1.15, maxVal * 1.15]}
                        ticks={leftYAxisTicks}
                        tickFormatter={formatYTick}
                      />
                      <ReferenceLine y={0} stroke="var(--color-border)" strokeWidth={1} />
                      <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: 'var(--color-border)', opacity: 0.15 }} />
                      <Bar
                        dataKey="income"
                        name="Income"
                        fill="var(--color-chart-1)"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={24}
                        stackId="a"
                        onClick={(data: any) => setSelectedCashFlowPoint(data?.payload)}
                        style={{ cursor: 'pointer' }}
                      />
                      <Bar
                        dataKey="expenses"
                        name="Expenses"
                        fill="var(--color-destructive)"
                        radius={[0, 0, 4, 4]}
                        maxBarSize={24}
                        stackId="a"
                        onClick={(data: any) => setSelectedCashFlowPoint(data?.payload)}
                        style={{ cursor: 'pointer' }}
                      />
                      <Line
                        type="monotone"
                        dataKey="net"
                        name="Net Income"
                        stroke="var(--color-primary)"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4 }}
                      />
                      <Legend
                        verticalAlign="bottom"
                        iconType="circle"
                        iconSize={10}
                        wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                        formatter={(value: string) => (
                          <span style={{ color: 'var(--color-foreground)' }}>{value}</span>
                        )}
                      />
                    </ComposedChart>
                  ) : (
                    <ComposedChart role="img" aria-label="Income vs Expenses Composed Chart" data={chartData} margin={{ top: 15, right: 10, left: -10, bottom: 5 }}>
                      <defs>
                        <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--color-chart-1)" stopOpacity={0.45} />
                          <stop offset="95%" stopColor="var(--color-chart-1)" stopOpacity={0.08} />
                        </linearGradient>
                        <linearGradient id="expensesGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--color-destructive)" stopOpacity={0.45} />
                          <stop offset="95%" stopColor="var(--color-destructive)" stopOpacity={0.08} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} opacity={0.3} />
                      <XAxis
                        dataKey="yearMonth"
                        tickLine={false}
                        axisLine={{ stroke: 'var(--color-border)' }}
                        tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
                        ticks={xAxisTicks}
                        tickFormatter={formatXTick}
                        minTickGap={30}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={{ stroke: 'var(--color-border)' }}
                        tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
                        domain={[minVal * 1.15, maxVal * 1.15]}
                        ticks={leftYAxisTicks}
                        tickFormatter={formatYTick}
                      />
                      <ReferenceLine y={0} stroke="var(--color-border)" strokeWidth={1} />
                      <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: 'var(--color-border)', opacity: 0.15 }} />
                      <Area
                        type="monotone"
                        dataKey="income"
                        name="Income"
                        fill="url(#incomeGrad)"
                        stroke="var(--color-chart-1)"
                        strokeWidth={2}
                        activeDot={{ r: 4 }}
                        onClick={(data: any) => setSelectedCashFlowPoint(data?.payload)}
                        style={{ cursor: 'pointer' }}
                      />
                      <Area
                        type="monotone"
                        dataKey="expenses"
                        name="Expenses"
                        fill="url(#expensesGrad)"
                        stroke="var(--color-destructive)"
                        strokeWidth={2}
                        activeDot={{ r: 4 }}
                        onClick={(data: any) => setSelectedCashFlowPoint(data?.payload)}
                        style={{ cursor: 'pointer' }}
                      />
                      <Line
                        type="monotone"
                        dataKey="net"
                        name="Net Income"
                        stroke="var(--color-primary)"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4 }}
                      />
                      <Legend
                        verticalAlign="bottom"
                        iconType="circle"
                        iconSize={10}
                        wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                        formatter={(value: string) => (
                          <span style={{ color: 'var(--color-foreground)' }}>{value}</span>
                        )}
                      />
                    </ComposedChart>
                  )}
                </ResponsiveContainer>
                {/* On-chart average net income label overlay styled as a permanent tooltip */}
                <div className="absolute top-1 left-1/2 -translate-x-1/2 bg-muted/95 border border-border rounded-lg px-2.5 py-1 text-[10px] sm:text-xs font-semibold text-muted-foreground shadow-sm pointer-events-none z-10 whitespace-nowrap">
                  Avg. Net Income ({windowLabel}): <span className="text-foreground font-bold">{formatCurrency(avgNetIncome)} / mo</span>
                </div>
              </div>
            </div>

            {/* ── Right Column: Savings Rate (Stacked Bar) ── */}
            <div className="flex-1 min-w-0 p-2.5 sm:p-5">
              <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                <TrendingUp className="w-3.5 h-3.5 text-primary shrink-0" />
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Savings Rate</span>
                <span className="px-1.5 py-0.5 text-[9px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded uppercase tracking-wide shrink-0">
                  Experimental
                </span>
              </div>
              <div className="h-[260px] sm:h-[300px] w-full relative touch-pan-y">
                <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 100, height: 100 }}>
                  <ComposedChart role="img" aria-label="Savings Rate Composed Chart" data={savingsChartData} margin={{ top: 15, right: 10, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} opacity={0.3} />
                    <XAxis
                      dataKey="yearMonth"
                      tickLine={false}
                      axisLine={{ stroke: 'var(--color-border)' }}
                      tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
                      ticks={xAxisTicks}
                      tickFormatter={formatXTick}
                      minTickGap={30}
                    />
                    <YAxis
                      yAxisId="left"
                      tickLine={false}
                      axisLine={{ stroke: 'var(--color-border)' }}
                      tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
                      domain={[minSavingsVal * 1.15, maxSavingsVal * 1.15]}
                      ticks={savingsYAxisTicks}
                      tickFormatter={formatSavingsYTick}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      tickLine={false}
                      axisLine={{ stroke: 'var(--color-border)' }}
                      tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
                      domain={[rightSavingsMin, rightSavingsMax]}
                      ticks={rightSavingsTicks}
                      tickFormatter={(v) => `${v}%`}
                    />
                    <ReferenceLine y={0} yAxisId="left" stroke="var(--color-border)" strokeWidth={1} />
                    <RechartsTooltip content={<SavingsTooltip />} cursor={{ fill: 'var(--color-border)', opacity: 0.15 }} />
                    
                    {/* Stacked bars for savings breakdown */}
                    <Bar yAxisId="left" dataKey="retirement" name="Retirement" stackId="savings" fill="var(--color-chart-1)" maxBarSize={24} onClick={(data: any) => setSelectedSavingsPoint(data?.payload)} style={{ cursor: 'pointer' }} />
                    <Bar yAxisId="left" dataKey="hsa" name="HSA" stackId="savings" fill="var(--color-chart-2)" maxBarSize={24} onClick={(data: any) => setSelectedSavingsPoint(data?.payload)} style={{ cursor: 'pointer' }} />
                    <Bar yAxisId="left" dataKey="brokerage" name="Brokerage" stackId="savings" fill="var(--color-chart-3)" maxBarSize={24} onClick={(data: any) => setSelectedSavingsPoint(data?.payload)} style={{ cursor: 'pointer' }} />
                    <Bar yAxisId="left" dataKey="savingsAccount" name="Savings" stackId="savings" fill="var(--color-chart-4)" maxBarSize={24} onClick={(data: any) => setSelectedSavingsPoint(data?.payload)} style={{ cursor: 'pointer' }} />
                    <Bar yAxisId="left" dataKey="cash" name="Cash" stackId="savings" fill="var(--color-chart-5)" maxBarSize={24} onClick={(data: any) => setSelectedSavingsPoint(data?.payload)} style={{ cursor: 'pointer' }} />
                    
                    {/* Line overlay for the Savings Rate percentage */}
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="savingsRate"
                      name="Savings Rate"
                      stroke="var(--color-primary)"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                    
                    <Legend
                      verticalAlign="bottom"
                      iconType="circle"
                      iconSize={10}
                      wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                      formatter={(value: string) => (
                        <span style={{ color: 'var(--color-foreground)' }}>{value}</span>
                      )}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
                {/* On-chart savings rate label overlay styled as a permanent tooltip */}
                <div className="absolute top-1 left-1/2 -translate-x-1/2 bg-muted/95 border border-border rounded-lg px-2.5 py-1 text-[10px] sm:text-xs font-semibold text-muted-foreground shadow-sm pointer-events-none z-10 whitespace-nowrap">
                  Avg. Savings Rate ({windowLabel}): <span className="text-foreground font-bold">{avgSavingsRate.toFixed(1)}%</span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Cash Flow Breakdown Popup Modal ── */}
      {selectedCashFlowPoint && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={handleCloseCashFlowModal}
        >
          <div
            className="bg-background border border-border rounded-xl shadow-2xl w-full max-w-xl max-h-[85vh] overflow-y-auto animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-border bg-muted/20">
              <div className="flex items-center gap-2">
                <ArrowRightLeft className="w-4 h-4 text-primary" />
                <h3 className="text-base font-semibold text-foreground">
                  Cash Flow Analysis — {formatChartXAxisDate(selectedCashFlowPoint.yearMonth + '-01', timeframe, { isMonthly: true })}
                </h3>
              </div>
              <button
                onClick={handleCloseCashFlowModal}
                className="text-xs text-muted-foreground hover:text-foreground bg-muted hover:bg-muted/80 rounded-lg px-2.5 py-1 transition-colors"
              >
                Close
              </button>
            </div>

            {/* Content */}
            <div className="p-5 space-y-5 bg-background text-sm">
              {/* Summary Hero Box */}
              <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 text-center space-y-1">
                <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Net Cash Flow</div>
                <div className={`text-3xl font-extrabold font-mono blur-number ${selectedCashFlowPoint.net >= 0 ? 'text-primary' : 'text-destructive'}`}>
                  {selectedCashFlowPoint.net >= 0 ? '+' : ''}{formatCurrency(selectedCashFlowPoint.net)}
                </div>
                <div className="text-xs text-muted-foreground">
                  Income: <span className="font-semibold text-foreground blur-number">{formatCurrency(selectedCashFlowPoint.income)}</span>
                  {' '}• Expenses: <span className="font-semibold text-foreground blur-number">{formatCurrency(Math.abs(selectedCashFlowPoint.expenses))}</span>
                </div>
              </div>

              {/* Cash Flow Breakdown */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">Details breakdown</h4>
                  <span className="text-[10px] text-muted-foreground italic">Click any row below to drill down into transaction details</span>
                </div>
                <div className="border border-border rounded-xl divide-y divide-border overflow-hidden bg-background">
                  {/* Total Income */}
                  <div 
                    className="flex flex-col hover:bg-muted/5 transition-colors cursor-pointer"
                    onClick={() => setExpandedBucket(expandedBucket === 'income' ? null : 'income')}
                  >
                    <div className="flex justify-between p-3">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-chart-1" style={{ backgroundColor: 'var(--color-chart-1)' }} />
                        <span className="text-muted-foreground font-medium">Total Income</span>
                      </div>
                      <div className="flex items-center gap-1.5 font-semibold font-mono text-foreground">
                        <span className="blur-number">{formatCurrency(selectedCashFlowPoint.income)}</span>
                        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${expandedBucket === 'income' ? 'rotate-180' : ''}`} />
                      </div>
                    </div>
                    {expandedBucket === 'income' && (
                      <div className="bg-muted/10 border-t border-border px-4 py-2 space-y-1.5 text-xs">
                        {selectedCashFlowPoint.details?.income?.length > 0 ? (
                          selectedCashFlowPoint.details.income.map((tx: any, idx: number) => (
                            <div key={idx} className="flex justify-between gap-4 py-1.5 border-b border-border/10 last:border-0">
                              <div className="flex flex-col">
                                <span className="font-medium text-foreground">{tx.description}</span>
                                <span className="text-[10px] text-muted-foreground">{tx.accountName} • {formatSafeUTCDate(tx.date, { month: 'short', day: 'numeric' })}</span>
                              </div>
                              <span className="font-mono font-medium text-primary">
                                +{formatCurrency(Math.abs(tx.amount))}
                              </span>
                            </div>
                          ))
                        ) : (
                          <div className="text-muted-foreground text-center py-3 italic">No income transactions found in this period.</div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Total Expenses */}
                  <div 
                    className="flex flex-col hover:bg-muted/5 transition-colors cursor-pointer"
                    onClick={() => setExpandedBucket(expandedBucket === 'expenses' ? null : 'expenses')}
                  >
                    <div className="flex justify-between p-3">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-destructive" style={{ backgroundColor: 'var(--color-destructive)' }} />
                        <span className="text-muted-foreground font-medium">Total Expenses</span>
                      </div>
                      <div className="flex items-center gap-1.5 font-semibold font-mono text-foreground">
                        <span className="blur-number">{formatCurrency(Math.abs(selectedCashFlowPoint.expenses))}</span>
                        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${expandedBucket === 'expenses' ? 'rotate-180' : ''}`} />
                      </div>
                    </div>
                    {expandedBucket === 'expenses' && (
                      <div className="bg-muted/10 border-t border-border px-4 py-2 space-y-1.5 text-xs">
                        {selectedCashFlowPoint.details?.expenses?.length > 0 ? (
                          selectedCashFlowPoint.details.expenses.map((tx: any, idx: number) => (
                            <div key={idx} className="flex justify-between gap-4 py-1.5 border-b border-border/10 last:border-0">
                              <div className="flex flex-col">
                                <span className="font-medium text-foreground">{tx.description}</span>
                                <span className="text-[10px] text-muted-foreground">{tx.accountName} • {formatSafeUTCDate(tx.date, { month: 'short', day: 'numeric' })}</span>
                              </div>
                              <span className="font-mono font-medium text-destructive">
                                -{formatCurrency(Math.abs(tx.amount))}
                              </span>
                            </div>
                          ))
                        ) : (
                          <div className="text-muted-foreground text-center py-3 italic">No expense transactions found in this period.</div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex justify-between p-3 bg-primary/[0.03] font-semibold text-foreground border-t border-border">
                    <span>Net Cash Flow</span>
                    <span className={`font-mono blur-number ${selectedCashFlowPoint.net >= 0 ? 'text-primary' : 'text-destructive'}`}>
                      {selectedCashFlowPoint.net >= 0 ? '+' : ''}{formatCurrency(selectedCashFlowPoint.net)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Informative Note */}
              <div className="text-xs text-muted-foreground bg-muted/30 border border-border/20 rounded-xl p-3 flex items-start gap-2 leading-relaxed">
                <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground/60" />
                <span>
                  <strong>Calculation Formula:</strong> Net Cash Flow is computed as Total Income minus Total Expenses. Standard category exclusion rules (e.g. transfers) are automatically applied to reflect true household cash inflows and outflows.
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Savings Breakdown Popup Modal ── */}
      {selectedSavingsPoint && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={handleCloseSavingsModal}
        >
          <div
            className="bg-background border border-border rounded-xl shadow-2xl w-full max-w-xl max-h-[85vh] overflow-y-auto animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-border bg-muted/20">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                <h3 className="text-base font-semibold text-foreground">
                  Savings Analysis — {formatChartXAxisDate(selectedSavingsPoint.yearMonth + '-01', timeframe, { isMonthly: true })}
                </h3>
              </div>
              <button
                onClick={handleCloseSavingsModal}
                className="text-xs text-muted-foreground hover:text-foreground bg-muted hover:bg-muted/80 rounded-lg px-2.5 py-1 transition-colors"
              >
                Close
              </button>
            </div>

            {/* Content */}
            <div className="p-5 space-y-5 bg-background text-sm">
              {/* Summary Hero Box */}
              <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 text-center space-y-1">
                <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Savings Rate</div>
                <div className="text-3xl font-extrabold text-primary font-mono blur-number">
                  {selectedSavingsPoint.savingsRate.toFixed(1)}%
                </div>
                <div className="text-xs text-muted-foreground">
                  Total Saved: <span className="font-semibold text-foreground blur-number">{formatCurrency(selectedSavingsPoint.retirement + selectedSavingsPoint.hsa + selectedSavingsPoint.brokerage + selectedSavingsPoint.savingsAccount + selectedSavingsPoint.cash)}</span>
                  {' '}of Gross Income: <span className="font-semibold text-foreground blur-number">{formatCurrency(selectedSavingsPoint.income)}</span>
                </div>
              </div>

              {/* Cash Flow Inputs & Outputs */}
              <div className="space-y-2">
                <h4 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">Income & Cash Flow</h4>
                <div className="border border-border rounded-xl divide-y divide-border overflow-hidden bg-muted/5">
                  <div className="flex justify-between p-3">
                    <span className="text-muted-foreground">Gross Income (A)</span>
                    <span className="font-semibold font-mono text-foreground blur-number">{formatCurrency(selectedSavingsPoint.income)}</span>
                  </div>
                  <div className="flex justify-between p-3">
                    <span className="text-muted-foreground">Expenses & Taxes (B)</span>
                    <span className="font-semibold font-mono text-foreground blur-number">{formatCurrency(selectedSavingsPoint.expenses)}</span>
                  </div>
                  <div className="flex justify-between p-3 bg-muted/20">
                    <span className="text-muted-foreground font-medium">Net Cash Flow (A − B)</span>
                    <span className="font-semibold font-mono text-foreground blur-number">{formatCurrency(selectedSavingsPoint.netCashFlow)}</span>
                  </div>
                </div>
              </div>

              {/* Savings Contributions Breakdown */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">Savings breakdown</h4>
                  <span className="text-[10px] text-muted-foreground italic">Click any row below to drill down into transaction details</span>
                </div>
                <div className="border border-border rounded-xl divide-y divide-border overflow-hidden bg-background">
                  {/* Retirement */}
                  <div 
                    className="flex flex-col hover:bg-muted/5 transition-colors cursor-pointer"
                    onClick={() => setExpandedBucket(expandedBucket === 'retirement' ? null : 'retirement')}
                  >
                    <div className="flex justify-between p-3">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-chart-1" style={{ backgroundColor: 'var(--color-chart-1)' }} />
                        <span className="text-muted-foreground font-medium">Retirement Contributions</span>
                      </div>
                      <div className="flex items-center gap-1.5 font-semibold font-mono text-foreground">
                        <span className="blur-number">{formatCurrency(selectedSavingsPoint.retirement)}</span>
                        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${expandedBucket === 'retirement' ? 'rotate-180' : ''}`} />
                      </div>
                    </div>
                    {expandedBucket === 'retirement' && (
                      <div className="bg-muted/10 border-t border-border px-4 py-2 space-y-1.5 text-xs">
                        {selectedSavingsPoint.details?.retirement?.length > 0 ? (
                          selectedSavingsPoint.details.retirement.map((tx: any, idx: number) => (
                            <div key={idx} className="flex justify-between gap-4 py-1.5 border-b border-border/10 last:border-0">
                              <div className="flex flex-col">
                                <span className="font-medium text-foreground">{tx.description}</span>
                                <span className="text-[10px] text-muted-foreground">{tx.accountName} • {formatSafeUTCDate(tx.date, { month: 'short', day: 'numeric' })}</span>
                              </div>
                              <span className={`font-mono font-medium ${tx.amount >= 0 ? 'text-primary' : 'text-destructive'}`}>
                                {tx.amount >= 0 ? '+' : ''}{formatCurrency(tx.amount)}
                              </span>
                            </div>
                          ))
                        ) : (
                          <div className="text-muted-foreground text-center py-3 italic">No contributing transactions found in this period.</div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* HSA */}
                  <div 
                    className="flex flex-col hover:bg-muted/5 transition-colors cursor-pointer"
                    onClick={() => setExpandedBucket(expandedBucket === 'hsa' ? null : 'hsa')}
                  >
                    <div className="flex justify-between p-3">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-chart-2" style={{ backgroundColor: 'var(--color-chart-2)' }} />
                        <span className="text-muted-foreground font-medium">HSA / FSA Contributions</span>
                      </div>
                      <div className="flex items-center gap-1.5 font-semibold font-mono text-foreground">
                        <span className="blur-number">{formatCurrency(selectedSavingsPoint.hsa)}</span>
                        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${expandedBucket === 'hsa' ? 'rotate-180' : ''}`} />
                      </div>
                    </div>
                    {expandedBucket === 'hsa' && (
                      <div className="bg-muted/10 border-t border-border px-4 py-2 space-y-1.5 text-xs">
                        {selectedSavingsPoint.details?.hsa?.length > 0 ? (
                          selectedSavingsPoint.details.hsa.map((tx: any, idx: number) => (
                            <div key={idx} className="flex justify-between gap-4 py-1.5 border-b border-border/10 last:border-0">
                              <div className="flex flex-col">
                                <span className="font-medium text-foreground">{tx.description}</span>
                                <span className="text-[10px] text-muted-foreground">{tx.accountName} • {formatSafeUTCDate(tx.date, { month: 'short', day: 'numeric' })}</span>
                              </div>
                              <span className={`font-mono font-medium ${tx.amount >= 0 ? 'text-primary' : 'text-destructive'}`}>
                                {tx.amount >= 0 ? '+' : ''}{formatCurrency(tx.amount)}
                              </span>
                            </div>
                          ))
                        ) : (
                          <div className="text-muted-foreground text-center py-3 italic">No contributing transactions found in this period.</div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Brokerage */}
                  <div 
                    className="flex flex-col hover:bg-muted/5 transition-colors cursor-pointer"
                    onClick={() => setExpandedBucket(expandedBucket === 'brokerage' ? null : 'brokerage')}
                  >
                    <div className="flex justify-between p-3">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-chart-3" style={{ backgroundColor: 'var(--color-chart-3)' }} />
                        <span className="text-muted-foreground font-medium">Brokerage / Investments</span>
                      </div>
                      <div className="flex items-center gap-1.5 font-semibold font-mono text-foreground">
                        <span className="blur-number">{formatCurrency(selectedSavingsPoint.brokerage)}</span>
                        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${expandedBucket === 'brokerage' ? 'rotate-180' : ''}`} />
                      </div>
                    </div>
                    {expandedBucket === 'brokerage' && (
                      <div className="bg-muted/10 border-t border-border px-4 py-2 space-y-1.5 text-xs">
                        {selectedSavingsPoint.details?.brokerage?.length > 0 ? (
                          selectedSavingsPoint.details.brokerage.map((tx: any, idx: number) => (
                            <div key={idx} className="flex justify-between gap-4 py-1.5 border-b border-border/10 last:border-0">
                              <div className="flex flex-col">
                                <span className="font-medium text-foreground">{tx.description}</span>
                                <span className="text-[10px] text-muted-foreground">{tx.accountName} • {formatSafeUTCDate(tx.date, { month: 'short', day: 'numeric' })}</span>
                              </div>
                              <span className={`font-mono font-medium ${tx.amount >= 0 ? 'text-primary' : 'text-destructive'}`}>
                                {tx.amount >= 0 ? '+' : ''}{formatCurrency(tx.amount)}
                              </span>
                            </div>
                          ))
                        ) : (
                          <div className="text-muted-foreground text-center py-3 italic">No contributing transactions found in this period.</div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Savings */}
                  <div 
                    className="flex flex-col hover:bg-muted/5 transition-colors cursor-pointer"
                    onClick={() => setExpandedBucket(expandedBucket === 'savingsAccount' ? null : 'savingsAccount')}
                  >
                    <div className="flex justify-between p-3">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-chart-4" style={{ backgroundColor: 'var(--color-chart-4)' }} />
                        <span className="text-muted-foreground font-medium">Savings Inflows</span>
                      </div>
                      <div className="flex items-center gap-1.5 font-semibold font-mono text-foreground">
                        <span className="blur-number">{formatCurrency(selectedSavingsPoint.savingsAccount)}</span>
                        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${expandedBucket === 'savingsAccount' ? 'rotate-180' : ''}`} />
                      </div>
                    </div>
                    {expandedBucket === 'savingsAccount' && (
                      <div className="bg-muted/10 border-t border-border px-4 py-2 space-y-1.5 text-xs">
                        {selectedSavingsPoint.details?.savingsAccount?.length > 0 ? (
                          selectedSavingsPoint.details.savingsAccount.map((tx: any, idx: number) => (
                            <div key={idx} className="flex justify-between gap-4 py-1.5 border-b border-border/10 last:border-0">
                              <div className="flex flex-col">
                                <span className="font-medium text-foreground">{tx.description}</span>
                                <span className="text-[10px] text-muted-foreground">{tx.accountName} • {formatSafeUTCDate(tx.date, { month: 'short', day: 'numeric' })}</span>
                              </div>
                              <span className={`font-mono font-medium ${tx.amount >= 0 ? 'text-primary' : 'text-destructive'}`}>
                                {tx.amount >= 0 ? '+' : ''}{formatCurrency(tx.amount)}
                              </span>
                            </div>
                          ))
                        ) : (
                          <div className="text-muted-foreground text-center py-3 italic">No contributing transactions found in this period.</div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Cash */}
                  <div 
                    className="flex flex-col hover:bg-muted/5 transition-colors cursor-pointer"
                    onClick={() => setExpandedBucket(expandedBucket === 'cash' ? null : 'cash')}
                  >
                    <div className="flex justify-between p-3">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-chart-5" style={{ backgroundColor: 'var(--color-chart-5)' }} />
                        <span className="text-muted-foreground font-medium">Cash (Leftover checking surplus)</span>
                      </div>
                      <div className="flex items-center gap-1.5 font-semibold font-mono text-foreground">
                        <span className="blur-number">{formatCurrency(selectedSavingsPoint.cash)}</span>
                        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${expandedBucket === 'cash' ? 'rotate-180' : ''}`} />
                      </div>
                    </div>
                    {expandedBucket === 'cash' && (
                      <div className="bg-muted/10 border-t border-border px-4 py-3 text-xs leading-relaxed text-muted-foreground space-y-2">
                        <p>
                          Leftover cash is calculated by subtracting your active savings contributions from your standard cash flow surplus (Net Cash Flow + pre-tax paycheck retirement/HSA deductions).
                        </p>
                        <p>
                          It represents the cash accumulation remaining in checking and depository accounts at the end of the month:
                        </p>
                        <div className="bg-background border border-border rounded-lg p-3 font-mono text-[10px] space-y-1 text-foreground">
                          <div className="flex justify-between">
                            <span>Net Cash Flow:</span>
                            <span className="blur-number">{formatCurrency(selectedSavingsPoint.netCashFlow)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>+ Paystub Deductions:</span>
                            <span className="blur-number">+{formatCurrency(selectedSavingsPoint.details?.retirement?.filter((t: any) => t.accountName === 'Paycheck').reduce((s: any, t: any) => s + t.amount, 0) || 0)}</span>
                          </div>
                          <div className="flex justify-between border-b border-border/30 pb-1 mb-1">
                            <span>− Savings Flows:</span>
                            <span className="blur-number">−{formatCurrency(selectedSavingsPoint.retirement + selectedSavingsPoint.hsa + selectedSavingsPoint.brokerage + selectedSavingsPoint.savingsAccount - (selectedSavingsPoint.details?.retirement?.filter((t: any) => t.accountName === 'Paycheck').reduce((s: any, t: any) => s + t.amount, 0) || 0))}</span>
                          </div>
                          <div className="flex justify-between font-bold text-primary">
                            <span>Leftover Cash:</span>
                            <span className="blur-number">{formatCurrency(selectedSavingsPoint.cash)}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex justify-between p-3 bg-primary/[0.03] font-semibold text-foreground border-t border-border">
                    <span>Total Savings (C)</span>
                    <span className="font-mono blur-number">{formatCurrency(selectedSavingsPoint.retirement + selectedSavingsPoint.hsa + selectedSavingsPoint.brokerage + selectedSavingsPoint.savingsAccount + selectedSavingsPoint.cash)}</span>
                  </div>
                </div>
              </div>

              {/* Informative Note */}
              <div className="text-xs text-muted-foreground bg-muted/30 border border-border/20 rounded-xl p-3 flex items-start gap-2 leading-relaxed">
                <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground/60" />
                <span>
                  <strong>Calculation Formula:</strong> Pre-tax retirement and HSA contributions are isolated from paycheck deductions. Transfers into savings and brokerage accounts are tracked as savings inflows. Leftover cash represents any remaining net income left in your primary bank accounts.
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
