'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePrivacyMode } from '@/components/privacy-mode-provider';
import { CashFlowBreakdownModal } from './cash-flow-breakdown-modal';
import { SavingsRateBreakdownModal } from './savings-rate-breakdown-modal';
import { IncomeExpenseTooltip, SavingsChartTooltip, type TooltipProps } from './income-expense-chart-tooltips';
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
import { formatCurrency, formatPlainPercent } from '@/lib/utils/format';
import { isCashFlowRelevantAccount } from '@/lib/utils/account-scope';
import { formatSafeUTCDate } from '@/lib/utils/date';
import { formatChartYAxisCurrency, formatChartXAxisDate, getChartXTicksUnified } from '@/lib/utils/chart-format';
import { ChartTooltip, TooltipRow, TooltipHeader } from '@/components/charts/chart-tooltip';
import { ChartEmptyState } from '@/components/charts/chart-empty-state';
import { ChartFrame } from '@/components/charts/chart-frame';
import type { ChartType } from '@/components/charts/chart-type-selector';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { TimeRange } from '@/components/charts/chart-filters';
import { TIME_RANGE_PRESETS } from '@/components/charts/chart-filters';
import { ChartTimeframeBar } from '@/components/charts/chart-timeframe-bar';
import { usePersistentState } from '@/lib/hooks/use-persistent-state';
import { ArrowRightLeft, TrendingUp, Info, ChevronDown, ChevronUp, Settings2, PiggyBank, Layers } from 'lucide-react';
import { useDateWindow } from '@/lib/hooks/use-date-window';
import { DateWindowNav } from '@/components/charts/date-window-nav';
import { SegPill } from '@/components/ui/seg-pill';

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

const MONTH_MAP: Record<string, number> = {
  '7d': 1, '30d': 1, '90d': 3, '365d': 12, '1m': 1, '3m': 3, '6m': 6, '1y': 12, '3y': 36, '5y': 60, 'ytd': 12, 'all': 120, '7d_discrete': 1,
};

const incomeExpensePresets = TIME_RANGE_PRESETS.filter((p) => ['1m', '3m', '6m', '1y', '3y', 'ytd', 'all', '30d', '90d', '365d', '5y', '7d', '7d_discrete'].includes(p.value));
const typeOptions = [{ value: 'bar' as ChartType, label: 'Bar' }, { value: 'line' as ChartType, label: 'Area' }];

export function IncomeExpenseChart() {
  const { privacyMode } = usePrivacyMode();
  const [activeView, setActiveView] = usePersistentState<'income' | 'savingsRate'>('cf-chart:active-view', 'income');
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
  const [activeTab, setActiveTab] = useState<'accounts' | 'categories' | 'savings'>('accounts');
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
  const [chartType, setChartType] = usePersistentState<ChartType>('finance:income-expense:chartType', 'bar');

  const [isMobile, setIsMobile] = useState(false);

  // Active accounts and categorized helper data structures
  const activeDbAccounts = useMemo(() => {
    return accountsData.filter((a: any) => isCashFlowRelevantAccount(a));
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
    return `Income versus expenses chart. Over the selected period, total income was ${formatCurrency(totalIncome)} and total expenses were ${formatCurrency(totalExpenses)}. In the most recent month (${formattedLastPointMonth}), income was ${formatCurrency(lastPoint.income)} and expenses were ${formatCurrency(Math.abs(lastPoint.expenses))}. Average savings rate was ${formatPlainPercent(avgSavingsRate)}.`;
  }, [chartData, timeframe, avgSavingsRate]);

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
  const CustomTooltip = useCallback((props: Omit<TooltipProps, 'timeframe'>) => (
    <IncomeExpenseTooltip {...props} timeframe={timeframe} />
  ), [timeframe]);

  const SavingsTooltip = useCallback((props: Omit<TooltipProps, 'timeframe'>) => (
    <SavingsChartTooltip {...props} timeframe={timeframe} />
  ), [timeframe]);

  if (isLoading) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm">
        <LoadingSpinner category="chart" className="h-[320px] m-5" />
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

  if (data.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm">

          <div className="p-5">
            <ChartEmptyState variant="nodata" description="Income and expense data will appear once you sync your accounts" />
          </div>

      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
      {!privacyMode && (
        <div className="sr-only" aria-live="polite">
          {srSummary}
        </div>
      )}

        <>
          <div className="px-3 sm:px-5 py-3 flex flex-wrap items-center justify-center gap-2 border-b border-border bg-muted/20">
            <SegPill
              options={[{ id: 'income', label: 'Net Income' }, { id: 'savingsRate', label: 'Savings Rate' }]}
              value={activeView}
              onChange={(v) => setActiveView(v as 'income' | 'savingsRate')}
              aria-label="View"
            />
            <span className="text-xs text-muted-foreground/50 hidden sm:inline">|</span>
            <SegPill
              options={[{ id: 'bar', label: 'Bar' }, { id: 'line', label: 'Area' }]}
              value={chartType}
              onChange={(v) => setChartType(v as ChartType)}
              aria-label="Chart style"
            />
            <button
              type="button"
              onClick={() => setShowCustomizer(!showCustomizer)}
              aria-expanded={showCustomizer}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all cursor-pointer select-none ${
                showCustomizer
                  ? 'bg-primary/15 border-primary/20 text-primary'
                  : 'bg-background border-border text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              <Settings2 size={12} className="shrink-0" />
              <span>Customize</span>
              {showCustomizer ? (
                <ChevronUp size={12} className="shrink-0 opacity-60" />
              ) : (
                <ChevronDown size={12} className="shrink-0 opacity-60" />
              )}
            </button>
          </div>

          {showCustomizer && (
            <div className="border-b border-border bg-muted/5 px-5 py-4 space-y-4 animate-in slide-in-from-top-2 duration-250">
              {/* Tabs */}
              <div className="flex gap-2 border-b border-border/30 pb-2 overflow-x-auto scrollbar-none">
                {(['accounts', 'categories', 'savings'] as const).map((tab) => (
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
                    {tab === 'savings' && 'Savings Components'}
                  </button>
                ))}
              </div>

              {/* Tab Content: Accounts */}
              {activeTab === 'accounts' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs flex-wrap gap-2">
                    <span className="text-muted-foreground">Select which accounts supply data to the income and expenses calculations.</span>
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

              {/* Tab Content: Savings Components */}
              {activeTab === 'savings' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <span className="text-xs font-semibold text-foreground">Included Savings Categories</span>
                    <p className="text-xs text-muted-foreground">Select which destinations count as personal savings in the savings rate breakdown.</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1">
                      {[
                        { id: 'retirement', label: 'Retirement (401k/IRA)' },
                        { id: 'hsa', label: 'HSA / Health Savings' },
                        { id: 'brokerage', label: 'Taxable Brokerage' },
                        { id: 'savingsAccount', label: 'Savings Accounts' },
                        { id: 'cash', label: 'Leftover Cash Surplus' },
                      ].map((item) => {
                        const isIncluded = savingsComponents.includes(item.id);
                        return (
                          <label
                            key={item.id}
                            className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer hover:bg-muted/20 transition-all ${
                              isIncluded ? 'border-primary/20 bg-primary/5' : 'border-border/65 bg-background opacity-60'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isIncluded}
                              onChange={() => {
                                if (isIncluded) {
                                  setSavingsComponents((prev) => prev.filter((c) => c !== item.id));
                                } else {
                                  setSavingsComponents((prev) => [...prev, item.id]);
                                }
                              }}
                              className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary focus:ring-offset-background cursor-pointer"
                            />
                            <span className="text-xs font-medium text-foreground">{item.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div className="border-t border-border/40 pt-3 space-y-2.5">
                    <span className="text-xs font-semibold text-foreground">Payroll & Denominator Adjustments</span>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                        <input
                          type="checkbox"
                          checked={includePaystubRetirement}
                          onChange={(e) => setIncludePaystubRetirement(e.target.checked)}
                          className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary focus:ring-offset-background cursor-pointer"
                        />
                        <span>Include Paystub 401(k)</span>
                      </label>
                      <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                        <input
                          type="checkbox"
                          checked={includePaystubHsa}
                          onChange={(e) => setIncludePaystubHsa(e.target.checked)}
                          className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary focus:ring-offset-background cursor-pointer"
                        />
                        <span>Include Paystub HSA</span>
                      </label>
                      <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                        <input
                          type="checkbox"
                          checked={adjustIncomeDenominator}
                          onChange={(e) => setAdjustIncomeDenominator(e.target.checked)}
                          className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary focus:ring-offset-background cursor-pointer"
                        />
                        <span>Gross Up Denominator</span>
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          <ChartTimeframeBar
            value={timeframe}
            onChange={setTimeframe}
            presets={incomeExpensePresets}
            windowNav={
              showWindowNav ? (
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
              ) : undefined
            }
          />

          <div className="p-2.5 sm:p-5">
            <div className="flex items-center justify-between gap-1.5 mb-3 flex-wrap">
              <div className="flex items-center gap-1.5">
                {activeView === 'income' ? (
                  <ArrowRightLeft className="w-3.5 h-3.5 text-primary shrink-0" />
                ) : (
                  <PiggyBank className="w-3.5 h-3.5 text-primary shrink-0" />
                )}
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  {activeView === 'income' ? 'Income vs Expenses' : 'Savings Rate & Components'}
                </span>
              </div>
              <span className="text-[11px] text-muted-foreground italic hidden sm:inline">
                Click any bar or point for point-in-time breakdown
              </span>
            </div>

            <ChartFrame className="h-[260px] sm:h-[300px] touch-pan-y" name="Income and Expenses">
              {activeView === 'income' ? (
                  chartType === 'bar' ? (
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
                  )
                ) : (
                  chartType === 'bar' ? (
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
                        domain={[leftSavingsMin, leftSavingsMax]}
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
                        tickFormatter={(v: number) => `${v}%`}
                      />
                      <ReferenceLine yAxisId="left" y={0} stroke="var(--color-border)" strokeWidth={1} />
                      <RechartsTooltip content={<SavingsTooltip />} cursor={{ fill: 'var(--color-border)', opacity: 0.15 }} />
                      <Bar yAxisId="left" dataKey="retirement" name="Retirement" fill="var(--color-chart-1)" stackId="savings" maxBarSize={24} onClick={(data: any) => setSelectedSavingsPoint(data?.payload)} style={{ cursor: 'pointer' }} />
                      <Bar yAxisId="left" dataKey="hsa" name="HSA" fill="var(--color-chart-2)" stackId="savings" maxBarSize={24} onClick={(data: any) => setSelectedSavingsPoint(data?.payload)} style={{ cursor: 'pointer' }} />
                      <Bar yAxisId="left" dataKey="brokerage" name="Brokerage" fill="var(--color-chart-3)" stackId="savings" maxBarSize={24} onClick={(data: any) => setSelectedSavingsPoint(data?.payload)} style={{ cursor: 'pointer' }} />
                      <Bar yAxisId="left" dataKey="savingsAccount" name="Savings Account" fill="var(--color-chart-4)" stackId="savings" maxBarSize={24} onClick={(data: any) => setSelectedSavingsPoint(data?.payload)} style={{ cursor: 'pointer' }} />
                      <Bar yAxisId="left" dataKey="cash" name="Leftover Cash" fill="var(--color-chart-5)" stackId="savings" maxBarSize={24} onClick={(data: any) => setSelectedSavingsPoint(data?.payload)} style={{ cursor: 'pointer' }} />
                      <Line yAxisId="right" type="monotone" dataKey="savingsRate" name="Savings Rate (%)" stroke="var(--color-primary)" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
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
                        domain={[leftSavingsMin, leftSavingsMax]}
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
                        tickFormatter={(v: number) => `${v}%`}
                      />
                      <ReferenceLine yAxisId="left" y={0} stroke="var(--color-border)" strokeWidth={1} />
                      <RechartsTooltip content={<SavingsTooltip />} cursor={{ fill: 'var(--color-border)', opacity: 0.15 }} />
                      <Area yAxisId="left" type="monotone" dataKey="retirement" name="Retirement" fill="var(--color-chart-1)" stroke="var(--color-chart-1)" fillOpacity={0.4} stackId="savings" activeDot={{ r: 4 }} onClick={(data: any) => setSelectedSavingsPoint(data?.payload)} style={{ cursor: 'pointer' }} />
                      <Area yAxisId="left" type="monotone" dataKey="hsa" name="HSA" fill="var(--color-chart-2)" stroke="var(--color-chart-2)" fillOpacity={0.4} stackId="savings" activeDot={{ r: 4 }} onClick={(data: any) => setSelectedSavingsPoint(data?.payload)} style={{ cursor: 'pointer' }} />
                      <Area yAxisId="left" type="monotone" dataKey="brokerage" name="Brokerage" fill="var(--color-chart-3)" stroke="var(--color-chart-3)" fillOpacity={0.4} stackId="savings" activeDot={{ r: 4 }} onClick={(data: any) => setSelectedSavingsPoint(data?.payload)} style={{ cursor: 'pointer' }} />
                      <Area yAxisId="left" type="monotone" dataKey="savingsAccount" name="Savings Account" fill="var(--color-chart-4)" stroke="var(--color-chart-4)" fillOpacity={0.4} stackId="savings" activeDot={{ r: 4 }} onClick={(data: any) => setSelectedSavingsPoint(data?.payload)} style={{ cursor: 'pointer' }} />
                      <Area yAxisId="left" type="monotone" dataKey="cash" name="Leftover Cash" fill="var(--color-chart-5)" stroke="var(--color-chart-5)" fillOpacity={0.4} stackId="savings" activeDot={{ r: 4 }} onClick={(data: any) => setSelectedSavingsPoint(data?.payload)} style={{ cursor: 'pointer' }} />
                      <Line yAxisId="right" type="monotone" dataKey="savingsRate" name="Savings Rate (%)" stroke="var(--color-primary)" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
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
                  )
                )}
              </ChartFrame>
              {/* On-chart average net income or savings rate label overlay */}
              <div className="absolute top-1 left-1/2 -translate-x-1/2 bg-muted/95 border border-border rounded-lg px-2.5 py-1 text-[10px] sm:text-xs font-semibold text-muted-foreground shadow-sm pointer-events-none z-10 whitespace-nowrap">
                {activeView === 'income' ? (
                  <>
                    Avg. Net Income ({windowLabel}): <span className="text-foreground font-bold">{formatCurrency(avgNetIncome)} / mo</span>
                  </>
                ) : (
                  <>
                    Avg. Savings Rate ({windowLabel}): <span className="text-primary font-bold">{formatPlainPercent(avgSavingsRate)}</span>
                  </>
                )}
              </div>
          </div>
        </>

      {/* ── Cash Flow Breakdown Popup Modal ── */}
      <CashFlowBreakdownModal
        selectedPoint={selectedCashFlowPoint}
        timeframe={timeframe}
        onClose={handleCloseCashFlowModal}
      />

      {/* ── Savings Rate Breakdown Popup Modal ── */}
      <SavingsRateBreakdownModal
        selectedPoint={selectedSavingsPoint}
        timeframe={timeframe}
        onClose={handleCloseSavingsModal}
      />
    </div>
  );
}

