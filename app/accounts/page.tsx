'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useQuery } from '@tanstack/react-query';
import { ResponsiveLine } from '@nivo/line';
import { ResponsiveBar } from '@nivo/bar';
import { nivoTheme } from '@/components/charts/shared-chart-theme';
import { ChartTooltip, TooltipRow, TooltipHeader } from '@/components/charts/chart-tooltip';
import { ChartEmptyState } from '@/components/charts/chart-empty-state';
import { ChartTypeSelector } from '@/components/charts/chart-type-selector';
import { TimeRangeFilter, type TimeRange } from '@/components/charts/chart-filters';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useSyntheticData } from '@/lib/hooks/use-synthetic-data';

import { isAssetAccount, isLiabilityAccount } from '@/lib/utils/account-scope';
import { formatCurrency, formatPercent, formatDate } from '@/lib/utils/format';
import { 
  ChevronRight, 
  ChevronDown, 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  Landmark, 
  Loader2, 
  Plus
} from 'lucide-react';

// ── Types ───────────────────────────────────────────────────────────────────
type ChartType = 'line' | 'bar';
type GroupingMode = 'account' | 'type' | 'group';

interface Account {
  id: string;
  name: string;
  type: string;
  balance: number;
  currency: string;
  institution: string | null;
  isHidden: boolean;
  isExcludedFromNetWorth: boolean;
  connectionId?: string | null;
}

const TYPE_HIERARCHY: Record<string, { group: string; subGroup: string; icon: string }> = {
  checking:   { group: 'Banking',       subGroup: 'Cash & Checking',  icon: '🏦' },
  savings:    { group: 'Banking',       subGroup: 'Savings',          icon: '🏦' },
  other:      { group: 'Banking',       subGroup: 'Cash & Checking',  icon: '🏦' },
  credit:     { group: 'Credit',        subGroup: 'Credit Cards',     icon: '💳' },
  investment: { group: 'Investments',   subGroup: 'Taxable Brokerage', icon: '📈' },
  brokerage:  { group: 'Investments',   subGroup: 'Taxable Brokerage', icon: '📈' },
  retirement: { group: 'Investments',   subGroup: 'Retirement',       icon: '📈' },
  otherinvestment: { group: 'Investments', subGroup: 'Other Investments', icon: '📈' },
  rothira:        { group: 'Investments',   subGroup: 'Roth IRA',         icon: '📈' },
  traditionalira: { group: 'Investments',   subGroup: 'Traditional IRA',  icon: '📈' },
  '401k':         { group: 'Investments',   subGroup: '401(k)',           icon: '📈' },
  '403b':         { group: 'Investments',   subGroup: '403(b)',           icon: '📈' },
  sepira:         { group: 'Investments',   subGroup: 'SEP IRA',          icon: '📈' },
  simpleira:      { group: 'Investments',   subGroup: 'Simple IRA',       icon: '📈' },
  '529':          { group: 'Investments',   subGroup: '529 Account',      icon: '📈' },
  otherAsset: { group: 'Investments',   subGroup: 'Other Assets',     icon: '📈' },
  hsa:        { group: 'Investments',   subGroup: 'HSA Account',      icon: '🏥' },
  hsachecking: { group: 'Banking',      subGroup: 'HSA Account',      icon: '🏥' },
  health:     { group: 'Investments',   subGroup: 'HSA Account',      icon: '🏥' },
  loan:       { group: 'Loans',         subGroup: 'Loans',            icon: '📋' },
  mortgage:   { group: 'Loans',         subGroup: 'Mortgages',        icon: '📋' },
  realestate: { group: 'Real Estate',   subGroup: 'Real Estate',      icon: '🏠' },
  primaryhome: { group: 'Real Estate',  subGroup: 'Primary Home',     icon: '🏠' },
  secondaryhome: { group: 'Real Estate', subGroup: 'Secondary Home',   icon: '🏠' },
  rentalproperty: { group: 'Real Estate', subGroup: 'Rental Property', icon: '🏠' },
  commercial:   { group: 'Real Estate', subGroup: 'Commercial',        icon: '🏢' },
  land:         { group: 'Real Estate', subGroup: 'Land',              icon: '🌳' },
  otherrealestate: { group: 'Real Estate', subGroup: 'Other Real Estate', icon: '🏠' },
  otherLiability: { group: 'Liabilities', subGroup: 'Liabilities',    icon: '⚠️' },
};

const GROUP_ORDER = ['Banking', 'Credit', 'Savings', 'Investments', 'Real Estate', 'Loans', 'Liabilities'];

function getHierarchy(accountType: string) {
  return TYPE_HIERARCHY[accountType.toLowerCase()] ?? { group: 'Other', subGroup: 'Other', icon: '📁' };
}

// ── Colors ──────────────────────────────────────────────────────────────────
const getSeriesColor = (key: string, mode: GroupingMode, index: number, isAsset: boolean) => {
  const cycle = Math.floor(index / 5);
  const chartNum = (index % 5) + 1;
  const baseVar = `var(--chart-${chartNum})`;
  
  if (isAsset) {
    if (cycle === 0) {
      return baseVar;
    } else if (cycle % 2 === 1) {
      // Lighter shades for assets
      const mixPct = Math.min(75, 20 + Math.floor(cycle / 2) * 20);
      return `color-mix(in oklch, ${baseVar}, white ${mixPct}%)`;
    } else {
      // Darker shades for assets
      const mixPct = Math.min(75, 20 + (Math.floor(cycle / 2) - 1) * 20);
      return `color-mix(in oklch, ${baseVar}, black ${mixPct}%)`;
    }
  } else {
    // Liabilities (red/destructive mixed with base chart colors to stay theme-compliant but distinct)
    const baseMixed = `color-mix(in oklch, ${baseVar}, var(--destructive) 60%)`;
    if (cycle === 0) {
      return baseMixed;
    } else if (cycle % 2 === 1) {
      // Lighter liability shades
      const mixPct = Math.min(75, 20 + Math.floor(cycle / 2) * 20);
      return `color-mix(in oklch, ${baseMixed}, white ${mixPct}%)`;
    } else {
      // Darker liability shades
      const mixPct = Math.min(75, 20 + (Math.floor(cycle / 2) - 1) * 20);
      return `color-mix(in oklch, ${baseMixed}, black ${mixPct}%)`;
    }
  }
};

// ── Inline Sparkline SVG ────────────────────────────────────────────────────
interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  isPositive: boolean;
}

export function Sparkline({ data, width = 120, height = 30, isPositive }: SparklineProps) {
  if (!data || data.length < 2) {
    return (
      <div className="w-[120px] h-[30px] flex items-center justify-center text-[10px] text-muted-foreground/40 italic">
        No history
      </div>
    );
  }
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min;

  const points = data.map((val, index) => {
    const x = (index / (data.length - 1)) * width;
    const y = range === 0 ? height / 2 : height - ((val - min) / range) * height;
    return `${x},${y}`;
  });

  const path = `M ${points.join(' L ')}`;
  const strokeColor = isPositive ? '#10b981' : '#ef4444';

  return (
    <svg width={width} height={height} className="overflow-visible">
      <path
        d={path}
        fill="none"
        stroke={strokeColor}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ── On-demand Transaction Sub-row Component ──────────────────────────────────
interface AccountTransactionsProps {
  accountId: string;
}

function AccountTransactions({ accountId }: AccountTransactionsProps) {
  const { data: txData, isLoading, error } = useQuery({
    queryKey: ['account-transactions', accountId],
    queryFn: async () => {
      const res = await fetch(`/api/transactions?accountId=${accountId}&limit=5`, { credentials: 'include' });
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

  if (isLoading) {
    return (
      <div className="py-3 px-6 space-y-2 bg-muted/10">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
      </div>
    );
  }

  if (error || !txData) {
    return (
      <div className="py-3 px-6 text-xs text-destructive bg-muted/10">
        Failed to load transactions.
      </div>
    );
  }

  const txs = txData.data || [];

  if (txs.length === 0) {
    return (
      <div className="py-4 px-6 text-xs text-muted-foreground text-center bg-muted/10">
        No recent activity found for this account.
      </div>
    );
  }

  return (
    <div className="py-3 px-6 bg-muted/10 border-t border-border/40 transition-all duration-300">
      <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
        <Activity className="w-3.5 h-3.5" /> Recent Activity (Last 5 Transactions)
      </div>
      <div className="divide-y divide-border/20 border border-border/30 rounded-lg overflow-hidden bg-card/40">
        {txs.map((tx: any) => {
          const { text, isExpense } = formatTransactionAmount(tx.amount);
          return (
            <div key={tx.id} className="py-2 flex items-center justify-between text-xs hover:bg-muted/30 px-3 transition-colors">
              <div className="min-w-0 flex-1 pr-4">
                <p className="font-medium text-foreground truncate">{tx.description || tx.payee || 'Unidentified Transaction'}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-muted-foreground">{formatDate(tx.date)}</span>
                  {tx.category && (
                    <span 
                      className="px-1.5 py-0.2 text-[9px] rounded-full font-medium"
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
              <span className={`font-mono font-semibold ${isExpense ? 'text-destructive' : 'text-emerald-500'}`}>
                {text}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Accounts Dashboard Page ─────────────────────────────────────────────
export default function AccountsPage() {
  const { data: session } = useSession();
  const { isEnabled } = useSyntheticData();
  const isNetWorthEnabled = isEnabled('netWorth');
  const isRealEstateEnabled = isEnabled('realEstate');

  const [timeframe, setTimeframe] = useState<TimeRange>('1m');
  const [chartType, setChartType] = useState<ChartType>('line');
  const [groupMode, setGroupMode] = useState<GroupingMode>('type');
  const [showHidden, setShowHidden] = useState(false);

  // Tree expanded states
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [expandedSubgroups, setExpandedSubgroups] = useState<Record<string, boolean>>({});
  const [expandedAccounts, setExpandedAccounts] = useState<Record<string, boolean>>({});

  // Checkbox filters for the chart
  const [selectedSeriesKeys, setSelectedSeriesKeys] = useState<Set<string>>(new Set());

  // 1. Fetch Accounts list (including hidden ones)
  const { data: allAccounts = [], isLoading: accountsLoading } = useQuery<Account[]>({
    queryKey: ['accounts', true],
    queryFn: async () => {
      const res = await fetch('/api/accounts?includeHidden=true', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch accounts');
      return res.json();
    },
    enabled: !!session?.user,
  });

  // Filter allAccounts to respect synthetic/estimated data toggles
  const filteredAllAccounts = useMemo(() => {
    return allAccounts.filter(acc => {
      // 1. If net worth synthetic estimates are disabled, hide manual/unsynced accounts
      if (!isNetWorthEnabled && !acc.connectionId) {
        return false;
      }
      // 2. If real estate synthetic estimates are disabled, hide manual real estate accounts
      const isRealEstate = [
        'realestate',
        'primaryhome',
        'secondaryhome',
        'rentalproperty',
        'commercial',
        'land',
        'otherrealestate'
      ].includes(acc.type.toLowerCase());
      if (isRealEstate && !isRealEstateEnabled && !acc.connectionId) {
        return false;
      }
      return true;
    });
  }, [allAccounts, isNetWorthEnabled, isRealEstateEnabled]);

  // 2. Fetch Accounts History Chart Data (only reportable accounts)
  const { data: historyRes, isLoading: historyLoading } = useQuery<{ data: any[]; accounts: any[] }>({
    queryKey: ['accounts-history', timeframe],
    queryFn: async () => {
      const res = await fetch(`/api/accounts/history?timeframe=${timeframe}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch history');
      return res.json();
    },
    enabled: !!session?.user,
  });

  const historyData = historyRes?.data || [];
  const reportableAccounts = historyRes?.accounts || [];

  // ── Establish all unique series keys for the active chart grouping mode ──
  const uniqueSeriesKeys = useMemo(() => {
    if (reportableAccounts.length === 0) return [];
    
    const keys = new Set<string>();
    for (const acc of reportableAccounts) {
      if (groupMode === 'group') {
        keys.add(getHierarchy(acc.type).group);
      } else if (groupMode === 'type') {
        keys.add(getHierarchy(acc.type).subGroup);
      } else {
        keys.add(acc.id);
      }
    }
    return Array.from(keys);
  }, [reportableAccounts, groupMode]);

  // Set default selection to all keys on initial load or mode change
  useEffect(() => {
    if (uniqueSeriesKeys.length > 0) {
      setSelectedSeriesKeys(new Set(uniqueSeriesKeys));
    }
  }, [uniqueSeriesKeys]);

  const isAssetSeries = useCallback((key: string) => {
    if (groupMode === 'account') {
      const acc = reportableAccounts.find(a => a.id === key);
      return acc ? isAssetAccount(acc.type) : true;
    } else if (groupMode === 'type') {
      const acc = reportableAccounts.find(a => getHierarchy(a.type).subGroup === key);
      return acc ? isAssetAccount(acc.type) : true;
    } else {
      const acc = reportableAccounts.find(a => getHierarchy(a.type).group === key);
      return acc ? isAssetAccount(acc.type) : true;
    }
  }, [reportableAccounts, groupMode]);

  // Dynamic Series mapping & Color assignment
  const seriesInfoMap = useMemo(() => {
    const map = new Map<string, { label: string; color: string; isAsset: boolean }>();
    
    // Sort keys: assets first, then liabilities
    const sortedKeys = [...uniqueSeriesKeys].sort((a, b) => {
      const aAsset = isAssetSeries(a);
      const bAsset = isAssetSeries(b);
      if (aAsset && !bAsset) return -1;
      if (!aAsset && bAsset) return 1;
      return a.localeCompare(b);
    });

    let assetIndex = 0;
    let liabilityIndex = 0;
    sortedKeys.forEach((key) => {
      const isAsset = isAssetSeries(key);
      const index = isAsset ? assetIndex++ : liabilityIndex++;
      let label = key;
      if (groupMode === 'account') {
        const acc = reportableAccounts.find(a => a.id === key);
        label = acc ? acc.name : key;
      }
      const color = getSeriesColor(key, groupMode, index, isAsset);
      map.set(key, { label, color, isAsset });
    });

    return map;
  }, [uniqueSeriesKeys, groupMode, reportableAccounts, isAssetSeries]);

  // ── Calculate dynamic stacking and data structures ──
  const { stackedData, processedChartData, maxVal, minVal } = useMemo(() => {
    if (historyData.length === 0) {
      return { stackedData: [], processedChartData: [], maxVal: 1000, minVal: 0 };
    }

    // Compile accounts list matching each checked series
    const seriesAccountsMap = new Map<string, Account[]>();
    for (const acc of reportableAccounts) {
      let key = '';
      if (groupMode === 'group') key = getHierarchy(acc.type).group;
      else if (groupMode === 'type') key = getHierarchy(acc.type).subGroup;
      else key = acc.id;

      if (selectedSeriesKeys.has(key)) {
        if (!seriesAccountsMap.has(key)) seriesAccountsMap.set(key, []);
        seriesAccountsMap.get(key)!.push(acc);
      }
    }

    // Process daily points for checked series
    const processedPoints = historyData.map((d) => {
      const point: Record<string, any> = { date: d.date };
      let totalAssets = 0;
      let totalLiabilities = 0;

      selectedSeriesKeys.forEach((key) => {
        const accs = seriesAccountsMap.get(key) || [];
        const sum = accs.reduce((s, acc) => s + (d[acc.id] || 0), 0);
        point[key] = sum;

        if (isAssetSeries(key)) {
          totalAssets += sum;
        } else {
          totalLiabilities += sum;
        }
      });

      point.netWorth = totalAssets - totalLiabilities;
      point.totalAssets = totalAssets;
      point.totalLiabilities = totalLiabilities;
      return point;
    });

    const activeKeys = Array.from(seriesAccountsMap.keys());
    const activeAssets = activeKeys.filter(k => isAssetSeries(k)).sort((a, b) => {
      const latestPoint = processedPoints[processedPoints.length - 1] || {};
      return (latestPoint[b] || 0) - (latestPoint[a] || 0);
    });
    const activeLiabilities = activeKeys.filter(k => !isAssetSeries(k)).sort((a, b) => {
      const latestPoint = processedPoints[processedPoints.length - 1] || {};
      return (latestPoint[b] || 0) - (latestPoint[a] || 0);
    });

    const series: any[] = [];

    // Stack assets (growing upwards, paint largest first)
    for (let i = activeAssets.length - 1; i >= 0; i--) {
      const key = activeAssets[i];
      const info = seriesInfoMap.get(key);
      const dataPoints = processedPoints.map((d) => {
        let stackedVal = 0;
        for (let j = 0; j <= i; j++) {
          stackedVal += (d[activeAssets[j]] || 0);
        }
        return { x: d.date, y: stackedVal };
      });

      series.push({
        id: key,
        color: info?.color || 'var(--chart-1)',
        data: dataPoints,
      });
    }

    // Stack liabilities (growing downwards, paint largest negative first)
    for (let i = activeLiabilities.length - 1; i >= 0; i--) {
      const key = activeLiabilities[i];
      const info = seriesInfoMap.get(key);
      const dataPoints = processedPoints.map((d) => {
        let stackedVal = 0;
        for (let j = 0; j <= i; j++) {
          stackedVal += (d[activeLiabilities[j]] || 0);
        }
        return { x: d.date, y: -stackedVal };
      });

      series.push({
        id: key,
        color: info?.color || 'var(--color-destructive)',
        data: dataPoints,
      });
    }

    // Find bounds
    const allValues = processedPoints.flatMap((d) => [
      d.netWorth,
      d.totalAssets,
      -d.totalLiabilities
    ]);

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
  }, [historyData, reportableAccounts, groupMode, selectedSeriesKeys, isAssetSeries, seriesInfoMap]);


  // Hierarchy statistics calculations
  const getTrendStats = useCallback((accs: Account[]) => {
    if (historyData.length === 0) {
      const current = accs.reduce((sum, a) => sum + parseFloat(String(a.balance)), 0);
      return {
        current,
        starting: current,
        change: 0,
        percentChange: 0,
        historyPoints: [],
        isPositive: true,
      };
    }

    const firstAcc = accs[0];
    const isLiab = firstAcc ? isLiabilityAccount(firstAcc.type) : false;

    const points = historyData.map((d) => {
      let sum = 0;
      for (const acc of accs) {
        sum += (d[acc.id] ?? 0);
      }
      return isLiab ? -sum : sum;
    });

    const starting = Math.abs(points[0]);
    const current = Math.abs(points[points.length - 1]);

    let change = 0;
    let percentChange = 0;
    let isPositive = true;

    if (isLiab) {
      change = current - starting; // positive means debt went up
      percentChange = starting !== 0 ? (change / starting) * 100 : 0;
      isPositive = change <= 0; // Good if debt decreased
    } else {
      change = current - starting;
      percentChange = starting !== 0 ? (change / starting) * 100 : 0;
      isPositive = change >= 0; // Good if assets increased
    }

    return {
      current,
      starting,
      change,
      percentChange,
      historyPoints: points,
      isPositive,
    };
  }, [historyData]);

  const formatChange = (change: number, percentChange: number, isLiab: boolean) => {
    const absChange = Math.abs(change);
    const textVal = formatCurrency(absChange);
    const textPct = formatPercent(percentChange);
    const isGood = isLiab ? change <= 0 : change >= 0;

    const sign = change > 0 ? '+' : change < 0 ? '-' : '';
    return {
      text: `${sign}${textVal} (${textPct})`,
      isPositive: isGood,
    };
  };

  // Organize accounts hierarchy tree
  const treeHierarchy = useMemo(() => {
    const map = new Map<string, Map<string, Account[]>>();

    for (const acc of filteredAllAccounts) {
      if (acc.isHidden && !showHidden) continue;

      const { group, subGroup } = getHierarchy(acc.type);
      if (!map.has(group)) map.set(group, new Map());
      const subMap = map.get(group)!;
      if (!subMap.has(subGroup)) subMap.set(subGroup, []);
      subMap.get(subGroup)!.push(acc);
    }

    return map;
  }, [filteredAllAccounts, showHidden]);

  const sortedGroups = useMemo(() => {
    return Array.from(treeHierarchy.keys()).sort((a, b) => {
      const ai = GROUP_ORDER.indexOf(a);
      const bi = GROUP_ORDER.indexOf(b);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.localeCompare(b);
    });
  }, [treeHierarchy]);

  // Checkbox helpers
  const handleToggleSeriesKey = (key: string) => {
    setSelectedSeriesKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleQuickSelect = (action: 'all' | 'none' | 'assets' | 'liabilities') => {
    if (action === 'all') {
      setSelectedSeriesKeys(new Set(uniqueSeriesKeys));
    } else if (action === 'none') {
      setSelectedSeriesKeys(new Set());
    } else if (action === 'assets') {
      const assets = uniqueSeriesKeys.filter(k => isAssetSeries(k));
      setSelectedSeriesKeys(new Set(assets));
    } else if (action === 'liabilities') {
      const liabilities = uniqueSeriesKeys.filter(k => !isAssetSeries(k));
      setSelectedSeriesKeys(new Set(liabilities));
    }
  };

  // Tooltip helper
  const sliceTooltip = useCallback(({ slice }: any) => {
    const rawX = slice.points[0]?.data.x;
    const dateStr = rawX instanceof Date 
      ? rawX.toISOString().split('T')[0] 
      : typeof rawX === 'string'
        ? rawX.split('T')[0]
        : String(rawX);
    const point = processedChartData.find((d) => d.date === dateStr);
    if (!point) return null;

    const formatPointDate = (d: string) => new Date(d).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: '2-digit',
    });

    const activeKeys = Array.from(selectedSeriesKeys);
    const activeAssets = activeKeys.filter((k) => isAssetSeries(k) && (point[k] || 0) > 0);
    const activeLiabilities = activeKeys.filter((k) => !isAssetSeries(k) && (point[k] || 0) > 0);

    return (
      <ChartTooltip>
        <TooltipHeader>{formatPointDate(String(dateStr))}</TooltipHeader>
        
        <TooltipRow
          label="Total"
          value={formatCurrency(point.netWorth)}
          color="var(--color-primary)"
        />

        {activeAssets.length > 0 && (
          <div className="mt-2 border-t border-border/40 pt-1.5">
            <div className="text-[9px] font-semibold text-muted-foreground uppercase mb-1 tracking-wider">Assets</div>
            {activeAssets.map((key) => {
              const info = seriesInfoMap.get(key);
              return (
                <TooltipRow
                  key={key}
                  label={info?.label || key}
                  value={formatCurrency(point[key] || 0)}
                  color={info?.color || 'var(--color-chart-1)'}
                />
              );
            })}
          </div>
        )}

        {activeLiabilities.length > 0 && (
          <div className="mt-2 border-t border-border/40 pt-1.5">
            <div className="text-[9px] font-semibold text-muted-foreground uppercase mb-1 tracking-wider">Liabilities</div>
            {activeLiabilities.map((key) => {
              const info = seriesInfoMap.get(key);
              return (
                <TooltipRow
                  key={key}
                  label={info?.label || key}
                  value={formatCurrency(point[key] || 0)}
                  color={info?.color || 'var(--color-destructive)'}
                />
              );
            })}
          </div>
        )}
      </ChartTooltip>
    );
  }, [processedChartData, selectedSeriesKeys, isAssetSeries, seriesInfoMap]);

  return (
    <div className="min-h-screen bg-background text-foreground pb-12 transition-all">
      {/* ── Page Header ── */}
      <div className="border-b border-border/40 bg-card/10 backdrop-blur-md sticky top-0 z-40 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Landmark className="w-6 h-6 text-primary" />
          <h1 className="text-xl font-bold tracking-tight text-foreground">Accounts</h1>
        </div>
        

      </div>

      <div className="max-w-6xl mx-auto px-6 mt-6 space-y-6">
        <>

            {/* ── Graphics / Chart Card ── */}
            <Card className="bg-card/40 backdrop-blur-md border-border/60 shadow-sm overflow-hidden">
              <CardHeader className="p-5 pb-3 border-b border-border/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-base font-bold text-foreground flex items-center gap-2">
                    <Activity className="w-4 h-4 text-primary" /> Balance History
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">Stacked balance over time and aggregate net worth trend.</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  {/* Timeframe selector */}
                  <TimeRangeFilter value={timeframe} onChange={setTimeframe} />
                  
                  {/* Chart type selector */}
                  <ChartTypeSelector 
                    value={chartType} 
                    options={[
                      { value: 'line', label: 'Area' },
                      { value: 'bar', label: 'Bar' }
                    ]} 
                    onChange={(t) => setChartType(t as ChartType)} 
                  />

                  {/* Toggle Show Hidden */}
                  <div className="flex items-center gap-1.5 pl-2 border-l border-border/50">
                    <label htmlFor="show-hidden-toggle" className="text-[10px] font-semibold text-muted-foreground uppercase cursor-pointer">
                      Show Hidden
                    </label>
                    <Switch
                      id="show-hidden-toggle"
                      checked={showHidden}
                      onCheckedChange={setShowHidden}
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-5 space-y-5">
                {/* ── Chart Controls / Groupings ── */}
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-3 bg-muted/30 border border-border/30 rounded-xl">
                  {/* Mode Pill Selector */}
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mr-2">Group By</span>
                    <div className="flex bg-muted/80 border border-border/30 rounded-lg p-0.5">
                      {(['group', 'type', 'account'] as const).map((mode) => (
                        <button
                          key={mode}
                          onClick={() => setGroupMode(mode)}
                          className={`px-3 py-1 text-xs font-semibold rounded-md capitalize transition-all ${
                            groupMode === mode
                              ? 'bg-card text-foreground shadow-sm'
                              : 'text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {mode === 'type' ? 'Type' : mode}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Quick Filters */}
                  <div className="flex flex-wrap gap-2 text-xs font-medium">
                    <button 
                      onClick={() => handleQuickSelect('all')}
                      className="px-2.5 py-1 rounded bg-muted/60 border border-border/40 hover:bg-muted text-foreground transition-all"
                    >
                      Select All
                    </button>
                    <button 
                      onClick={() => handleQuickSelect('assets')}
                      className="px-2.5 py-1 rounded bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/15 text-emerald-500 transition-all"
                    >
                      Assets Only
                    </button>
                    <button 
                      onClick={() => handleQuickSelect('liabilities')}
                      className="px-2.5 py-1 rounded bg-destructive/10 border border-destructive/20 hover:bg-destructive/15 text-destructive transition-all"
                    >
                      Liabilities Only
                    </button>
                    <button 
                      onClick={() => handleQuickSelect('none')}
                      className="px-2.5 py-1 rounded bg-muted/40 border border-border/20 hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                {/* ── Checkbox filters Bar ── */}
                {uniqueSeriesKeys.length > 0 && (
                  <div className="flex flex-wrap gap-2 p-2 bg-muted/10 border border-border/20 rounded-xl max-h-24 overflow-y-auto">
                    {uniqueSeriesKeys.map((key) => {
                      const info = seriesInfoMap.get(key);
                      const isChecked = selectedSeriesKeys.has(key);
                      return (
                        <button
                          key={key}
                          onClick={() => handleToggleSeriesKey(key)}
                          className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all duration-200 flex items-center gap-1.5 ${
                            isChecked
                              ? 'bg-card text-foreground shadow-sm'
                              : 'bg-transparent border-border/40 text-muted-foreground hover:text-foreground hover:border-border'
                          }`}
                          style={{
                            borderColor: isChecked ? info?.color : undefined,
                            borderWidth: '1.5px',
                          }}
                        >
                          <span 
                            className={`w-2 h-2 rounded-full transition-all ${isChecked ? 'scale-100' : 'scale-50 opacity-40'}`} 
                            style={{ backgroundColor: info?.color }}
                          />
                          {info?.label || key}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* ── Chart Container ── */}
                <div className="h-[380px] w-full relative">
                  {historyLoading ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-card/20 backdrop-blur-[1px]">
                      <div className="text-center">
                        <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-2" />
                        <p className="text-xs text-muted-foreground">Crunching historical snapshots...</p>
                      </div>
                    </div>
                  ) : reportableAccounts.length === 0 ? (
                    <ChartEmptyState 
                      variant="nodata" 
                      description="Connect a SimpleFIN link first to import account balances and generate trends." 
                    />
                  ) : historyData.length < 2 ? (
                    <ChartEmptyState variant="insufficient" />
                  ) : selectedSeriesKeys.size === 0 ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-muted/10 border border-dashed border-border/40 rounded-xl">
                      <p className="text-xs text-muted-foreground">Select one or more filters above to render the chart.</p>
                    </div>
                  ) : chartType === 'bar' ? (
                    /* Nivo Bar Chart Rendering */
                    <div className="w-full h-full relative">
                      <ResponsiveBar
                        data={processedChartData.map((d) => {
                          const row: Record<string, any> = {
                            id: d.date,
                          };
                          selectedSeriesKeys.forEach((k) => {
                            const val = d[k] || 0;
                            row[k] = isAssetSeries(k) ? val : -val;
                          });
                          return row;
                        })}
                        keys={Array.from(selectedSeriesKeys)}
                        indexBy="id"
                        margin={{ top: 15, right: 20, left: 60, bottom: 45 }}
                        valueScale={{ type: 'linear', min: minVal, max: maxVal }}
                        padding={0.15}
                        groupMode="stacked"
                        borderRadius={1}
                        colors={({ id }: any) => seriesInfoMap.get(String(id))?.color || 'var(--color-primary)'}
                        axisLeft={{
                          tickSize: 0,
                          tickPadding: 8,
                          format: (v: number) => {
                            const absV = Math.abs(v);
                            const sign = v < 0 ? '-' : '';
                            if (absV >= 1000000) return `${sign}$${(absV / 1000000).toFixed(1)}M`;
                            if (absV >= 1000) return `${sign}$${(absV / 1000).toFixed(0)}K`;
                            return `${sign}$${absV}`;
                          },
                        }}
                        axisBottom={{
                          tickSize: 0,
                          tickPadding: 8,
                          tickValues: timeframe === '1m'
                            ? processedChartData.filter((_, i) => i % 5 === 0).map(d => d.date)
                            : Math.min(8, Math.max(3, Math.floor(processedChartData.length / 12))),
                          format: timeframe === '1m' ? (d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : (d) => new Date(d).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
                        }}
                        enableGridY={true}
                        enableGridX={false}
                        theme={nivoTheme}
                        enableLabel={false}
                        tooltip={({ id, value, data }: any) => {
                          const dateStr = data.id;
                          const point = processedChartData.find(d => d.date === dateStr);
                          if (!point) return null;
                          const label = seriesInfoMap.get(String(id))?.label || String(id);
                          return (
                            <ChartTooltip>
                              <TooltipHeader>{new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</TooltipHeader>
                              <TooltipRow
                                label="Total"
                                value={formatCurrency(point.netWorth)}
                                color="var(--color-primary)"
                              />
                              <div className="mt-1 border-t border-border pt-1">
                                <TooltipRow
                                  label={label}
                                  value={formatCurrency(Math.abs(value))}
                                  color={seriesInfoMap.get(String(id))?.color || 'var(--color-primary)'}
                                />
                              </div>
                            </ChartTooltip>
                          );
                        }}
                      />
                      {/* Bar Net Worth Overlay Removed */}
                    </div>
                  ) : (
                    /* Nivo Line Chart Rendering */
                    <div className="w-full h-full relative">
                      <ResponsiveLine
                        data={stackedData}
                        margin={{ top: 15, right: 20, left: 60, bottom: 45 }}
                        xScale={{ type: 'time', format: '%Y-%m-%d', useUTC: false, precision: 'day' }}
                        yScale={{ type: 'linear', min: minVal, max: maxVal }}
                        curve="monotoneX"
                        colors={(d: any) => d.color}
                        lineWidth={0}
                        enableArea={true}
                        areaOpacity={0.3}
                        enablePoints={false}
                        enableGridX={false}
                        enableGridY={true}
                        axisBottom={{
                          tickSize: 0,
                          tickPadding: 8,
                          tickValues: Math.min(8, Math.max(3, Math.floor(processedChartData.length / 12))),
                          format: timeframe === '1m' ? '%b %d' : '%b %y',
                        }}
                        axisLeft={{
                          tickSize: 0,
                          tickPadding: 8,
                          format: (v: number) => {
                            const absV = Math.abs(v);
                            const sign = v < 0 ? '-' : '';
                            if (absV >= 1000000) return `${sign}$${(absV / 1000000).toFixed(1)}M`;
                            if (absV >= 1000) return `${sign}$${(absV / 1000).toFixed(0)}K`;
                            return `${sign}$${absV}`;
                          },
                        }}
                        theme={nivoTheme}
                        useMesh={true}
                        enableSlices="x"
                        sliceTooltip={sliceTooltip}
                      />
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* ── Expandable Accounts Tree View ── */}
            <Card className="bg-card/40 backdrop-blur-md border-border/60 shadow-sm overflow-hidden">
              <CardHeader className="p-5 pb-3 border-b border-border/30">
                <CardTitle className="text-base font-bold text-foreground flex items-center gap-2">
                  <Landmark className="w-4 h-4 text-primary" /> Accounts Hierarchy
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">Hierarchical directory of linked accounts with historical trend sparklines.</p>
              </CardHeader>
              <CardContent className="p-5">
                {accountsLoading ? (
                  <div className="space-y-4">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                  </div>
                ) : filteredAllAccounts.length === 0 ? (
                  <div className="p-12 text-center border border-dashed border-border/40 rounded-xl">
                    <p className="text-muted-foreground text-sm mb-4">No accounts linked yet.</p>
                    <Link
                      href="/settings"
                      className="px-5 py-2 bg-primary text-primary-foreground text-xs font-semibold rounded-lg hover:opacity-90 transition-all flex items-center gap-2 mx-auto w-fit"
                    >
                      <Plus className="w-4 h-4" /> Link Institution
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {sortedGroups.map((group) => {
                      const subMap = treeHierarchy.get(group);
                      if (!subMap) return null;
                      
                      // Gather all accounts in this Group
                      const groupAccounts: Account[] = [];
                      subMap.forEach(accs => groupAccounts.push(...accs));

                      const groupStats = getTrendStats(groupAccounts);
                      const isGroupExpanded = expandedGroups[group] ?? true;

                      const groupChange = formatChange(
                        groupStats.change, 
                        groupStats.percentChange, 
                        groupAccounts[0] ? isLiabilityAccount(groupAccounts[0].type) : false
                      );

                      return (
                        <div key={group} className="border border-border/30 rounded-xl overflow-hidden bg-card/25 shadow-sm">
                          {/* ── Group Header Row ── */}
                          <div 
                            onClick={() => setExpandedGroups(prev => ({ ...prev, [group]: !isGroupExpanded }))}
                            className="w-full flex items-center justify-between px-4 py-3 bg-muted/40 hover:bg-muted/60 transition-colors rounded-xl cursor-pointer select-none"
                          >
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              {isGroupExpanded ? (
                                <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                              )}
                              <span className="text-sm font-bold text-foreground truncate">{group}</span>
                            </div>

                            {/* Group Sparkline */}
                            <div className="hidden sm:block mx-4">
                              <Sparkline 
                                data={groupStats.historyPoints} 
                                isPositive={groupStats.isPositive} 
                              />
                            </div>

                            <div className="flex items-center gap-4 flex-shrink-0">
                              <div className="text-right">
                                <p className="font-mono text-sm font-bold text-foreground blur-number">
                                  {formatCurrency(groupStats.current)}
                                </p>
                                <span className={`text-[10px] font-semibold flex items-center gap-0.5 justify-end ${
                                  groupChange.isPositive ? 'text-emerald-500' : 'text-destructive'
                                }`}>
                                  {groupChange.isPositive ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                                  {groupChange.text}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* ── Subgroups / Nested Accounts ── */}
                          {isGroupExpanded && (
                            <div className="px-3 pb-3 pt-1.5 space-y-2 border-t border-border/10 bg-card/10">
                              {Array.from(subMap.entries()).map(([subgroup, accs]) => {
                                const isLiabSub = accs[0] ? isLiabilityAccount(accs[0].type) : false;
                                const subStats = getTrendStats(accs);

                                // If subgroup has more than 1 account: collapsible subgroup header
                                if (accs.length > 1) {
                                  const subKey = `${group}::${subgroup}`;
                                  const isSubExpanded = expandedSubgroups[subKey] ?? true;
                                  const subChange = formatChange(subStats.change, subStats.percentChange, isLiabSub);

                                  return (
                                    <div key={subgroup} className="ml-2 border-l border-border/40 pl-2 space-y-1.5">
                                      {/* Subgroup Header */}
                                      <div
                                        onClick={() => setExpandedSubgroups(prev => ({ ...prev, [subKey]: !isSubExpanded }))}
                                        className="flex items-center justify-between py-1.5 px-2.5 rounded-lg hover:bg-muted/30 cursor-pointer select-none"
                                      >
                                        <div className="flex items-center gap-2 min-w-0 flex-1">
                                          {isSubExpanded ? (
                                            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/80 flex-shrink-0" />
                                          ) : (
                                            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/80 flex-shrink-0" />
                                          )}
                                          <span className="text-xs font-semibold text-muted-foreground truncate">{subgroup}</span>
                                          <span className="text-[10px] text-muted-foreground/50">({accs.length})</span>
                                        </div>

                                        <div className="hidden sm:block mx-4">
                                          <Sparkline 
                                            data={subStats.historyPoints} 
                                            isPositive={subStats.isPositive} 
                                            width={100}
                                            height={24}
                                          />
                                        </div>

                                        <div className="text-right">
                                          <p className="font-mono text-xs font-bold text-muted-foreground blur-number">
                                            {formatCurrency(subStats.current)}
                                          </p>
                                          <span className={`text-[9px] font-medium ${
                                            subChange.isPositive ? 'text-emerald-500' : 'text-destructive'
                                          }`}>
                                            {subChange.text}
                                          </span>
                                        </div>
                                      </div>

                                      {/* Nested Accounts inside Subgroup */}
                                      {isSubExpanded && (
                                        <div className="space-y-1.5 pl-4">
                                          {accs.map((acc) => {
                                            const accStats = getTrendStats([acc]);
                                            const accChange = formatChange(accStats.change, accStats.percentChange, isLiabSub);
                                            const isAccExpanded = expandedAccounts[acc.id] ?? false;

                                            return (
                                              <div key={acc.id} className="border border-border/10 rounded-lg overflow-hidden bg-card/10">
                                                <div 
                                                  onClick={() => setExpandedAccounts(prev => ({ ...prev, [acc.id]: !isAccExpanded }))}
                                                  className={`flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/40 transition-all cursor-pointer group/row ${
                                                    acc.isHidden || acc.isExcludedFromNetWorth ? 'opacity-50 hover:opacity-100' : ''
                                                  }`}
                                                >
                                                  <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-3">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-primary/60 flex-shrink-0" />
                                                    <div className="min-w-0">
                                                      <div className="flex items-center gap-1.5">
                                                        <span className="text-xs font-medium text-foreground truncate">{acc.name}</span>
                                                        {acc.isHidden && (
                                                          <span className="text-[9px] font-bold text-destructive bg-destructive/10 px-1 rounded">Hidden</span>
                                                        )}
                                                        {acc.isExcludedFromNetWorth && (
                                                          <span className="text-[9px] font-bold text-orange-500 bg-orange-500/10 px-1 rounded">Excluded</span>
                                                        )}
                                                      </div>
                                                      <span className="text-[10px] text-muted-foreground truncate block">{acc.institution || 'Unknown Institution'}</span>
                                                    </div>
                                                  </div>

                                                  <div className="hidden sm:block mx-4">
                                                    <Sparkline 
                                                      data={acc.isHidden || acc.isExcludedFromNetWorth ? [] : accStats.historyPoints} 
                                                      isPositive={accStats.isPositive} 
                                                      width={80}
                                                      height={20}
                                                    />
                                                  </div>

                                                  <div className="flex items-center gap-3.5 flex-shrink-0">
                                                    <div className="text-right pr-2">
                                                      <p className="font-mono text-xs font-bold text-foreground blur-number">
                                                        {formatCurrency(acc.balance)}
                                                      </p>
                                                      {!(acc.isHidden || acc.isExcludedFromNetWorth) && (
                                                        <span className={`text-[9px] ${
                                                          accChange.isPositive ? 'text-emerald-500' : 'text-destructive'
                                                        }`}>
                                                          {accChange.text}
                                                        </span>
                                                      )}
                                                    </div>
                                                  </div>
                                                </div>

                                                {/* Inline Transactions Drawer */}
                                                {isAccExpanded && (
                                                  <AccountTransactions accountId={acc.id} />
                                                )}
                                              </div>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  );
                                }

                                // Single account inside subgroup: render directly inline under Group
                                const acc = accs[0];
                                const accStats = getTrendStats([acc]);
                                const accChange = formatChange(accStats.change, accStats.percentChange, isLiabSub);
                                const isAccExpanded = expandedAccounts[acc.id] ?? false;

                                return (
                                  <div key={acc.id} className="ml-2 border-l border-border/40 pl-2">
                                    <div className="border border-border/10 rounded-lg overflow-hidden bg-card/10">
                                      <div 
                                        onClick={() => setExpandedAccounts(prev => ({ ...prev, [acc.id]: !isAccExpanded }))}
                                        className={`flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/40 transition-all cursor-pointer group/row ${
                                          acc.isHidden || acc.isExcludedFromNetWorth ? 'opacity-50 hover:opacity-100' : ''
                                        }`}
                                      >
                                        <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-3">
                                          <div className="w-1.5 h-1.5 rounded-full bg-primary/60 flex-shrink-0" />
                                          <div className="min-w-0">
                                            <div className="flex items-center gap-1.5">
                                              <span className="text-xs font-semibold text-foreground truncate">{acc.name}</span>
                                              {acc.isHidden && (
                                                <span className="text-[9px] font-bold text-destructive bg-destructive/10 px-1 rounded">Hidden</span>
                                              )}
                                              {acc.isExcludedFromNetWorth && (
                                                <span className="text-[9px] font-bold text-orange-500 bg-orange-500/10 px-1 rounded">Excluded</span>
                                              )}
                                            </div>
                                            <span className="text-[10px] text-muted-foreground truncate block">
                                              {acc.institution || 'Unknown Institution'} · {subgroup}
                                            </span>
                                          </div>
                                        </div>

                                        {/* Sparkline for single account */}
                                        <div className="hidden sm:block mx-4">
                                          <Sparkline 
                                            data={acc.isHidden || acc.isExcludedFromNetWorth ? [] : accStats.historyPoints} 
                                            isPositive={accStats.isPositive} 
                                            width={100}
                                            height={24}
                                          />
                                        </div>

                                        <div className="flex items-center gap-3.5 flex-shrink-0">
                                          <div className="text-right pr-2">
                                            <p className="font-mono text-xs font-bold text-foreground blur-number">
                                              {formatCurrency(acc.balance)}
                                            </p>
                                            {!(acc.isHidden || acc.isExcludedFromNetWorth) && (
                                              <span className={`text-[9px] ${
                                                accChange.isPositive ? 'text-emerald-500' : 'text-destructive'
                                              }`}>
                                                {accChange.text}
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                      </div>

                                      {/* Inline Transactions Drawer */}
                                      {isAccExpanded && (
                                        <AccountTransactions accountId={acc.id} />
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
      </div>


    </div>
  );
}