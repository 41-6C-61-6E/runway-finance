'use client';

import { useState, useEffect, useMemo, useCallback, useRef, Fragment } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useQuery } from '@tanstack/react-query';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { 
  ChevronRight, 
  ChevronDown, 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  Banknote, 
  Home, 
  PiggyBank, 
  CreditCard, 
  Landmark, 
  ArrowRight,
  Filter,
  Plus,
} from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { ChartEmptyState } from '@/components/charts/chart-empty-state';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { ChartTooltip, TooltipRow, TooltipHeader } from '@/components/charts/chart-tooltip';
import { ChartTypeSelector } from '@/components/charts/chart-type-selector';
import { TimeRangeFilter, type TimeRange } from '@/components/charts/chart-filters';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useSyntheticData } from '@/lib/hooks/use-synthetic-data';
import { usePersistentState } from '@/lib/hooks/use-persistent-state';
import { useCardCollapsed } from '@/lib/hooks/use-card-collapsed';
import { CollapsibleCardHeader } from '@/components/ui/collapsible-card-header';
import { CollapsibleFilterPanel } from '@/components/ui/collapsible-filter-panel';

import { Sparkline } from '@/components/ui/sparkline';
import { isAssetAccount, isLiabilityAccount } from '@/lib/utils/account-scope';
import { formatCurrency, formatPercent, formatDate } from '@/lib/utils/format';
import { getChartXTicks, formatSafeUTCDate } from '@/lib/utils/date';
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

interface ChartPreset {
  id: string;
  name: string;
  timeframe: TimeRange;
  chartType: ChartType;
  groupMode: GroupingMode;
  selectedGroups: string[];
  selectedTypes: string[];
  selectedAccounts: string[];
  isCustom?: boolean;
}

const DEFAULT_PRESETS: ChartPreset[] = [
  {
    id: 'net-worth',
    name: 'Net Worth Summary',
    timeframe: 'all',
    chartType: 'line',
    groupMode: 'group',
    selectedGroups: [],
    selectedTypes: [],
    selectedAccounts: [],
  },
  {
    id: 'cash-checking',
    name: 'Cash & Checking',
    timeframe: '3m',
    chartType: 'line',
    groupMode: 'account',
    selectedGroups: ['Banking'],
    selectedTypes: ['Cash & Checking'],
    selectedAccounts: [],
  },
  {
    id: 'brokerage-savings',
    name: 'Brokerage & Savings',
    timeframe: '1y',
    chartType: 'line',
    groupMode: 'type',
    selectedGroups: ['Banking', 'Investments'],
    selectedTypes: ['Savings', 'Taxable Brokerage', 'Retirement'],
    selectedAccounts: [],
  },
  {
    id: 'debt-overview',
    name: 'Debt Overview',
    timeframe: '6m',
    chartType: 'bar',
    groupMode: 'account',
    selectedGroups: ['Credit', 'Loans', 'Liabilities'],
    selectedTypes: [],
    selectedAccounts: [],
  },
];

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

// ── On-demand Transaction Sub-row Component ──────────────────────────────────
interface AccountTransactionsProps {
  accountId: string;
  historyData: any[];
  isLiability: boolean;
}

function AccountTransactions({ accountId, historyData, isLiability }: AccountTransactionsProps) {
  const { data: txData, isLoading, error } = useQuery({
    queryKey: ['account-transactions', accountId],
    queryFn: async () => {
      const res = await fetch(`/api/transactions?accountId=${accountId}&limit=5`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch transactions');
      return res.json();
    },
  });

  const [miniTimeframe, setMiniTimeframe] = useState<TimeRange>('3m');

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

  // Compile history points for this account
  const accountHistory = useMemo(() => {
    if (!historyData || historyData.length === 0) return [];
    return historyData
      .map((d) => {
        const val = d[accountId];
        return {
          date: d.date,
          // Show absolute balance for standard display
          balance: val !== undefined ? Math.abs(val) : undefined,
        };
      })
      .filter((d) => d.balance !== undefined);
  }, [historyData, accountId]);

  const visibleMiniData = useMemo(() => {
    if (accountHistory.length === 0) return [];
    const [startIdx, endIdx] = getTimeframeIndices(accountHistory, miniTimeframe);
    return accountHistory.slice(startIdx, endIdx + 1);
  }, [accountHistory, miniTimeframe]);

  const { minVal, maxVal } = useMemo(() => {
    if (visibleMiniData.length === 0) return { minVal: 0, maxVal: 1000 };
    const vals = visibleMiniData.map(d => d.balance ?? 0);
    const rawMax = Math.max(...vals, 10);
    const rawMin = Math.min(...vals, 0);
    // Add 10% padding
    const padding = (rawMax - rawMin) * 0.1 || 10;
    return {
      minVal: Math.max(0, rawMin - padding),
      maxVal: rawMax + padding,
    };
  }, [visibleMiniData]);

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
      <div className="bg-card/95 border border-border/80 px-2.5 py-1.5 rounded-lg shadow-lg text-[10px] space-y-0.5 backdrop-blur-sm">
        <p className="font-semibold text-muted-foreground">{formatSafeUTCDate(point.date, { month: 'short', day: 'numeric', year: 'numeric' })}</p>
        <p className="font-mono font-bold text-foreground">{formatCurrency(point.balance)}</p>
      </div>
    );
  }, []);

  const chartColor = isLiability ? 'var(--color-destructive)' : 'var(--color-primary)';

  const txs = txData?.data || [];

  return (
    <div className="py-4 px-2 sm:px-6 bg-muted/10 border-t border-border/40 transition-all duration-300">
      <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
        {/* Left Side: Balance History Mini-Chart */}
        <div className="md:col-span-3 flex flex-col space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 select-none">
              <Activity className="w-3.5 h-3.5" /> Balance History
            </span>
            {accountHistory.length >= 2 && (
              <div className="flex bg-muted/80 border border-border/30 rounded-lg p-0.5">
                {(['1m', '3m', '6m', '1y', 'all'] as const).map((r) => (
                  <button
                    type="button"
                    key={r}
                    onClick={() => setMiniTimeframe(r)}
                    className={`px-2 py-0.5 text-[9px] font-semibold rounded capitalize transition-all ${
                      miniTimeframe === r
                        ? 'bg-card text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {r === 'all' ? 'All' : r.toUpperCase()}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="h-[140px] w-full relative bg-card/20 rounded-xl border border-border/20 p-2 overflow-hidden flex items-center justify-center">
            {accountHistory.length < 2 ? (
              <span className="text-[10px] text-muted-foreground/60 italic">Insufficient historical data for this account</span>
            ) : (
              <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 100, height: 100 }}>
                <AreaChart data={visibleMiniData} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id={`gradient-mini-${accountId}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={chartColor} stopOpacity={0.15} />
                      <stop offset="95%" stopColor={chartColor} stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} opacity={0.25} />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: 'var(--color-muted-foreground)', fontSize: 9 }}
                    ticks={miniTicks}
                    tickFormatter={(d) => {
                      if (!d) return '';
                      return formatSafeUTCDate(d, { month: 'short', day: 'numeric' });
                    }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: 'var(--color-muted-foreground)', fontSize: 9 }}
                    domain={[minVal, maxVal]}
                    tickFormatter={(v) => {
                      const absV = Math.abs(v);
                      if (absV >= 1000000) return `$${(absV / 1000000).toFixed(1)}M`;
                      if (absV >= 1000) return `$${(absV / 1000).toFixed(0)}K`;
                      return `$${absV.toFixed(0)}`;
                    }}
                  />
                  <RechartsTooltip content={<MiniTooltip />} cursor={{ stroke: chartColor, strokeWidth: 1, strokeDasharray: '2 2', opacity: 0.5 }} />
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
          <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 select-none">
            <Activity className="w-3.5 h-3.5" /> Recent Activity (Last 5)
          </div>

          <div className="flex-1 flex flex-col justify-center min-h-[140px]">
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
              </div>
            ) : error || !txData ? (
              <div className="text-[10px] text-destructive text-center py-4 bg-card/25 rounded-lg border border-border/20">
                Failed to load transactions.
              </div>
            ) : txs.length === 0 ? (
              <div className="text-[10px] text-muted-foreground/60 italic text-center py-8 bg-card/25 rounded-lg border border-border/20">
                No recent activity found.
              </div>
            ) : (
              <div className="divide-y divide-border/20 border border-border/30 rounded-lg overflow-hidden bg-card/40">
                {txs.map((tx: any) => {
                  const { text, isExpense } = formatTransactionAmount(tx.amount);
                  return (
                    <div key={tx.id} className="py-2 flex items-center justify-between text-xs hover:bg-muted/30 px-3 transition-colors">
                      <div className="min-w-0 flex-1 pr-4">
                        <p className="font-medium text-foreground truncate text-[11px]">{tx.description || tx.payee || 'Unidentified Transaction'}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[9px] text-muted-foreground">{formatDate(tx.date)}</span>
                          {tx.category && (
                            <span 
                              className="px-1.5 py-0.2 text-[8px] rounded-full font-medium"
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
                      <span className={`font-mono text-[11px] font-semibold ${isExpense ? 'text-destructive' : 'text-emerald-500'}`}>
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

const setOptions = {
  serialize: (s: Set<string>) => JSON.stringify(Array.from(s)),
  deserialize: (raw: string) => new Set<string>(JSON.parse(raw)),
};

const getTimeframeIndices = (data: any[], range: TimeRange): [number, number] => {
  if (data.length === 0) return [0, 0];
  const lastIdx = data.length - 1;
  const lastDateStr = data[lastIdx].date;
  const lastDate = new Date(lastDateStr + 'T00:00:00Z');

  let startDate = new Date(lastDate);
  switch (range) {
    case '1m':
      startDate.setUTCMonth(startDate.getUTCMonth() - 1);
      break;
    case '3m':
      startDate.setUTCMonth(startDate.getUTCMonth() - 3);
      break;
    case '6m':
      startDate.setUTCMonth(startDate.getUTCMonth() - 6);
      break;
    case '1y':
      startDate.setUTCFullYear(startDate.getUTCFullYear() - 1);
      break;
    case '5y':
      startDate.setUTCFullYear(startDate.getUTCFullYear() - 5);
      break;
    case 'ytd':
      startDate = new Date(Date.UTC(lastDate.getUTCFullYear(), 0, 1));
      break;
    case 'all':
    default:
      return [0, lastIdx];
  }

  const startStr = startDate.toISOString().split('T')[0];
  let startIdx = data.findIndex(d => d.date >= startStr);
  if (startIdx === -1) startIdx = 0;
  return [startIdx, lastIdx];
};

// ── Main Accounts Dashboard Page ─────────────────────────────────────────────
export default function AccountsPage() {
  const { data: session } = useSession();
  const { isEnabled } = useSyntheticData();
  const isNetWorthEnabled = isEnabled('netWorth');
  const isRealEstateEnabled = isEnabled('realEstate');

  const [timeframe, setTimeframe] = usePersistentState<TimeRange>('runway:accounts:timeframe', '1m');
  const [chartType, setChartType] = usePersistentState<ChartType>('runway:accounts:chartType', 'line');
  const [groupMode, setGroupMode] = usePersistentState<GroupingMode>('runway:accounts:groupMode', 'type');
  const [showHidden, setShowHidden] = usePersistentState<boolean>('runway:accounts:showHidden', false);
  const [isCollapsed, setIsCollapsed] = useCardCollapsed('balanceHistoryChart');
  const [hierarchyCollapsed, setHierarchyCollapsed] = useCardCollapsed('accountsHierarchy');
  const [showHistoryFilters, setShowHistoryFilters] = useState(false);
  const [showHierarchyFilters, setShowHierarchyFilters] = useState(false);

  // ── Chart pan/zoom viewport state ────────────────────────────────────────────
  const [viewStart, setViewStart] = useState<number | null>(null);
  const [viewEnd, setViewEnd] = useState<number | null>(null);

  // Drag tracking refs (don't need re-renders during drag)
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartViewStart = useRef(0);
  const dragStartViewEnd = useRef(0);
  const chartContainerRef = useRef<HTMLDivElement>(null);

  // Flag to prevent timeframe useEffect from resetting custom viewport on double click zoom
  const isZooming = useRef(false);

  // Cursor state (separate from isDragging ref since refs don't trigger re-renders)
  const [isDraggingCursor, setIsDraggingCursor] = useState(false);

  // Tree expanded states
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [expandedSubgroups, setExpandedSubgroups] = useState<Record<string, boolean>>({});
  const [expandedAccounts, setExpandedAccounts] = useState<Record<string, boolean>>({});

  // Dropdown filter selections
  const [selectedGroups, setSelectedGroups] = usePersistentState<Set<string>>('runway:accounts:selectedGroups', new Set(), setOptions);
  const [selectedTypes, setSelectedTypes] = usePersistentState<Set<string>>('runway:accounts:selectedTypes', new Set(), setOptions);
  const [selectedAccounts, setSelectedAccounts] = usePersistentState<Set<string>>('runway:accounts:selectedAccounts', new Set(), setOptions);

  // Dropdown filter selections for Hierarchy
  const [hierarchySelectedGroups, setHierarchySelectedGroups] = usePersistentState<Set<string>>('runway:accounts:hierarchySelectedGroups', new Set(), setOptions);
  const [hierarchySelectedTypes, setHierarchySelectedTypes] = usePersistentState<Set<string>>('runway:accounts:hierarchySelectedTypes', new Set(), setOptions);
  const [hierarchySelectedAccounts, setHierarchySelectedAccounts] = usePersistentState<Set<string>>('runway:accounts:hierarchySelectedAccounts', new Set(), setOptions);
  const hierarchyShowHidden = false;

  // ── Presets / Quick Views State & Handlers ──
  const [customPresets, setCustomPresets] = usePersistentState<ChartPreset[]>('runway:accounts:customPresets', []);
  const [isSavingView, setIsSavingView] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');

  const allPresets = useMemo(() => {
    return [...DEFAULT_PRESETS, ...(customPresets || [])];
  }, [customPresets]);

  const handleApplyPreset = useCallback((preset: ChartPreset) => {
    setTimeframe(preset.timeframe);
    setChartType(preset.chartType);
    setGroupMode(preset.groupMode);
    setSelectedGroups(new Set(preset.selectedGroups || []));
    setSelectedTypes(new Set(preset.selectedTypes || []));
    setSelectedAccounts(new Set(preset.selectedAccounts || []));
  }, [setTimeframe, setChartType, setGroupMode, setSelectedGroups, setSelectedTypes, setSelectedAccounts]);

  const handleSaveCurrentView = useCallback((name: string) => {
    if (!name.trim()) return;
    const newPreset: ChartPreset = {
      id: `custom-${Date.now()}`,
      name: name.trim(),
      timeframe,
      chartType,
      groupMode,
      selectedGroups: Array.from(selectedGroups),
      selectedTypes: Array.from(selectedTypes),
      selectedAccounts: Array.from(selectedAccounts),
      isCustom: true,
    };
    setCustomPresets((prev) => [...(prev || []), newPreset]);
    setIsSavingView(false);
    setNewPresetName('');
  }, [timeframe, chartType, groupMode, selectedGroups, selectedTypes, selectedAccounts, setCustomPresets]);

  const handleDeletePreset = useCallback((id: string) => {
    setCustomPresets((prev) => (prev || []).filter((p) => p.id !== id));
  }, [setCustomPresets]);

  const isPresetActive = useCallback((preset: ChartPreset) => {
    if (preset.timeframe !== timeframe) return false;
    if (preset.chartType !== chartType) return false;
    if (preset.groupMode !== groupMode) return false;
    
    const presetGroups = preset.selectedGroups || [];
    if (presetGroups.length !== selectedGroups.size) return false;
    for (const g of presetGroups) {
      if (!selectedGroups.has(g)) return false;
    }
    
    const presetTypes = preset.selectedTypes || [];
    if (presetTypes.length !== selectedTypes.size) return false;
    for (const t of presetTypes) {
      if (!selectedTypes.has(t)) return false;
    }
    
    const presetAccounts = preset.selectedAccounts || [];
    if (presetAccounts.length !== selectedAccounts.size) return false;
    for (const a of presetAccounts) {
      if (!selectedAccounts.has(a)) return false;
    }
    return true;
  }, [timeframe, chartType, groupMode, selectedGroups, selectedTypes, selectedAccounts]);

  // Dropdown open states
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [typesOpen, setTypesOpen] = useState(false);
  const [accountsOpen, setAccountsOpen] = useState(false);

  // Dropdown open states for Hierarchy
  const [hierarchyGroupsOpen, setHierarchyGroupsOpen] = useState(false);
  const [hierarchyTypesOpen, setHierarchyTypesOpen] = useState(false);
  const [hierarchyAccountsOpen, setHierarchyAccountsOpen] = useState(false);

  // Search filter states
  const [typeSearch, setTypeSearch] = useState('');
  const [accountSearch, setAccountSearch] = useState('');

  // Search filter states for Hierarchy
  const [hierarchyTypeSearch, setHierarchyTypeSearch] = useState('');
  const [hierarchyAccountSearch, setHierarchyAccountSearch] = useState('');

  // Refs for closing dropdowns when clicking outside
  const groupsRef = useRef<HTMLDivElement>(null);
  const typesRef = useRef<HTMLDivElement>(null);
  const accountsRef = useRef<HTMLDivElement>(null);

  // Refs for closing dropdowns for Hierarchy
  const hierarchyGroupsRef = useRef<HTMLDivElement>(null);
  const hierarchyTypesRef = useRef<HTMLDivElement>(null);
  const hierarchyAccountsRef = useRef<HTMLDivElement>(null);

  // Click outside listener
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (groupsRef.current && !groupsRef.current.contains(e.target as Node)) {
        setGroupsOpen(false);
      }
      if (typesRef.current && !typesRef.current.contains(e.target as Node)) {
        setTypesOpen(false);
        setTypeSearch('');
      }
      if (accountsRef.current && !accountsRef.current.contains(e.target as Node)) {
        setAccountsOpen(false);
        setAccountSearch('');
      }

      // Hierarchy Refs
      if (hierarchyGroupsRef.current && !hierarchyGroupsRef.current.contains(e.target as Node)) {
        setHierarchyGroupsOpen(false);
      }
      if (hierarchyTypesRef.current && !hierarchyTypesRef.current.contains(e.target as Node)) {
        setHierarchyTypesOpen(false);
        setHierarchyTypeSearch('');
      }
      if (hierarchyAccountsRef.current && !hierarchyAccountsRef.current.contains(e.target as Node)) {
        setHierarchyAccountsOpen(false);
        setHierarchyAccountSearch('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

  // Filter allAccounts to respect synthetic/estimated data toggles and exclude accounts
  const filteredAllAccounts = useMemo(() => {
    return allAccounts.filter(acc => {
      // 0. Filter out excluded accounts
      if (acc.isExcludedFromNetWorth) {
        return false;
      }
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

  // Compute available Groups, Types, and Accounts for dropdowns
  const availableGroups = useMemo(() => {
    const groups = new Set<string>();
    for (const acc of filteredAllAccounts) {
      if (acc.isHidden && !showHidden) continue;
      groups.add(getHierarchy(acc.type).group);
    }
    return Array.from(groups).sort();
  }, [filteredAllAccounts, showHidden]);

  const availableTypes = useMemo(() => {
    const types = new Set<string>();
    for (const acc of filteredAllAccounts) {
      if (acc.isHidden && !showHidden) continue;
      types.add(getHierarchy(acc.type).subGroup);
    }
    return Array.from(types).sort();
  }, [filteredAllAccounts, showHidden]);

  const availableAccounts = useMemo(() => {
    const list = filteredAllAccounts.filter(acc => !acc.isHidden || showHidden);
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [filteredAllAccounts, showHidden]);

  // Compute available Groups, Types, and Accounts for hierarchy dropdowns
  const hierarchyAvailableGroups = useMemo(() => {
    const groups = new Set<string>();
    for (const acc of filteredAllAccounts) {
      if (acc.isHidden && !hierarchyShowHidden) continue;
      groups.add(getHierarchy(acc.type).group);
    }
    return Array.from(groups).sort();
  }, [filteredAllAccounts, hierarchyShowHidden]);

  const hierarchyAvailableTypes = useMemo(() => {
    const types = new Set<string>();
    for (const acc of filteredAllAccounts) {
      if (acc.isHidden && !hierarchyShowHidden) continue;
      types.add(getHierarchy(acc.type).subGroup);
    }
    return Array.from(types).sort();
  }, [filteredAllAccounts, hierarchyShowHidden]);

  const hierarchyAvailableAccounts = useMemo(() => {
    const list = filteredAllAccounts.filter(acc => !acc.isHidden || hierarchyShowHidden);
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [filteredAllAccounts, hierarchyShowHidden]);

  // 2. Fetch Accounts History Chart Data (only reportable accounts)
  const { data: historyRes, isLoading: historyLoading } = useQuery<{ data: any[]; accounts: any[] }>({
    queryKey: ['accounts-history'],
    queryFn: async () => {
      const res = await fetch(`/api/accounts/history?timeframe=all`, { credentials: 'include' });
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

  // Derived selectedSeriesKeys based on Group, Type, and Account dropdown filters
  const selectedSeriesKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const acc of reportableAccounts) {
      const hierarchy = getHierarchy(acc.type);
      
      // Filter by Group
      if (selectedGroups.size > 0 && !selectedGroups.has(hierarchy.group)) continue;
      
      // Filter by Type (subGroup)
      if (selectedTypes.size > 0 && !selectedTypes.has(hierarchy.subGroup)) continue;
      
      // Filter by Account ID
      if (selectedAccounts.size > 0 && !selectedAccounts.has(acc.id)) continue;

      if (groupMode === 'group') {
        keys.add(hierarchy.group);
      } else if (groupMode === 'type') {
        keys.add(hierarchy.subGroup);
      } else {
        keys.add(acc.id);
      }
    }
    return keys;
  }, [reportableAccounts, selectedGroups, selectedTypes, selectedAccounts, groupMode]);

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
  const { rechartsData, activeAssets, activeLiabilities, processedChartData } = useMemo(() => {
    if (historyData.length === 0) {
      return { rechartsData: [], activeAssets: [], activeLiabilities: [], processedChartData: [] };
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
      let anySelectedHasData = false;

      selectedSeriesKeys.forEach((key) => {
        const accs = seriesAccountsMap.get(key) || [];
        let sum = 0;
        let hasData = false;
        accs.forEach((acc) => {
          const val = d[acc.id];
          if (val !== undefined) {
            sum += val;
            hasData = true;
          }
        });

        if (hasData) {
          point[key] = sum;
          anySelectedHasData = true;
          if (isAssetSeries(key)) {
            totalAssets += sum;
          } else {
            totalLiabilities += sum;
          }
        }
      });

      point.netWorth = totalAssets - totalLiabilities;
      point.totalAssets = totalAssets;
      point.totalLiabilities = totalLiabilities;
      point._hasData = anySelectedHasData;
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

    // Create the final data for Recharts, where liability keys are negative
    const rechartsDataRaw = processedPoints.map((d) => {
      const row: Record<string, any> = {
        date: d.date,
        netWorth: d.netWorth,
        totalAssets: d.totalAssets,
        totalLiabilities: -d.totalLiabilities,
      };
      selectedSeriesKeys.forEach((k) => {
        const val = d[k];
        if (val !== undefined) {
          row[k] = isAssetSeries(k) ? val : -val;
        }
      });
      row._hasData = d._hasData;
      return row;
    });

    // Trim trailing zero balance values for each series key
    selectedSeriesKeys.forEach((k) => {
      // Find the index of the last non-zero value for series key k
      let lastNonZeroIdx = -1;
      for (let i = rechartsDataRaw.length - 1; i >= 0; i--) {
        const val = rechartsDataRaw[i][k];
        if (val !== undefined && val !== 0) {
          lastNonZeroIdx = i;
          break;
        }
      }

      // If we found a last non-zero index, set all subsequent values to undefined
      if (lastNonZeroIdx !== -1) {
        for (let i = lastNonZeroIdx + 1; i < rechartsDataRaw.length; i++) {
          if (rechartsDataRaw[i][k] !== undefined) {
            rechartsDataRaw[i][k] = undefined;
          }
        }
      } else {
        // If the account has only 0 or undefined values, set all to undefined
        for (let i = 0; i < rechartsDataRaw.length; i++) {
          if (rechartsDataRaw[i][k] !== undefined) {
            rechartsDataRaw[i][k] = undefined;
          }
        }
      }
    });

    // Always trim leading days with no data points
    let startIdx = 0;
    const firstDataIdx = rechartsDataRaw.findIndex(d => d._hasData);
    if (firstDataIdx !== -1) {
      startIdx = firstDataIdx;
    }
    const rechartsData = rechartsDataRaw.slice(startIdx);

    return {
      rechartsData,
      activeAssets,
      activeLiabilities,
      processedChartData: processedPoints.slice(startIdx),
    };
  }, [historyData, reportableAccounts, groupMode, selectedSeriesKeys, isAssetSeries]);

  // ── Viewport-sliced data (what the chart actually renders) ──────────────────
  const [defaultStart, defaultEnd] = useMemo(() => {
    return getTimeframeIndices(rechartsData, timeframe);
  }, [rechartsData, timeframe]);

  const currentViewStart = viewStart ?? defaultStart;
  const currentViewEnd = viewEnd ?? defaultEnd;

  const visibleData = useMemo(() => {
    if (rechartsData.length === 0) return [];
    const rawVisible = rechartsData.slice(currentViewStart, currentViewEnd + 1);
    
    // If the visible range is very large (e.g. 'all' timeframe), we downsample the rendered points to 100 points
    if (rawVisible.length > 150) {
      const sampled: typeof rawVisible = [];
      const len = rawVisible.length;
      for (let i = 0; i < 100; i++) {
        const index = Math.min(
          Math.floor((i * (len - 1)) / 99),
          len - 1
        );
        sampled.push(rawVisible[index]);
      }
      return sampled;
    }
    return rawVisible;
  }, [rechartsData, currentViewStart, currentViewEnd]);

  // Reset viewport whenever timeframe changes
  useEffect(() => {
    if (isZooming.current) {
      isZooming.current = false;
      return;
    }
    setViewStart(null);
    setViewEnd(null);
  }, [timeframe]);

  // ── Calculate dynamic Y-axis bounds based on visible data ──────────────────
  const { minVal, maxVal } = useMemo(() => {
    if (visibleData.length === 0) {
      return { minVal: 0, maxVal: 1000 };
    }
    const allValues = visibleData.flatMap((d) => {
      const vals: number[] = [d.netWorth, d.totalAssets, d.totalLiabilities];
      selectedSeriesKeys.forEach((k) => {
        if (d[k] !== undefined) {
          vals.push(d[k]);
        }
      });
      return vals;
    });

    const rawMax = Math.max(...allValues, 1000);
    const rawMin = Math.min(...allValues, 0);
    const maxValue = rawMax * 1.15;
    const minValue = rawMin < 0 ? rawMin * 1.15 : 0;
    return { minVal: minValue, maxVal: maxValue };
  }, [visibleData, selectedSeriesKeys]);

  const xAxisTicks = useMemo(() => {
    return getChartXTicks(visibleData, timeframe, 'date');
  }, [visibleData, timeframe]);

  // ── Pan handlers ─────────────────────────────────────────────────────────────
  const handleChartMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    // Ignore right-clicks or if we have no data
    if (rechartsData.length === 0) return;
    isDragging.current = true;
    setIsDraggingCursor(true);
    dragStartX.current = e.clientX;
    dragStartViewStart.current = currentViewStart;
    dragStartViewEnd.current = currentViewEnd;
  }, [rechartsData.length, currentViewStart, currentViewEnd]);

  const handleChartMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - dragStartX.current;
    const containerWidth = chartContainerRef.current?.clientWidth ?? 1;
    const windowSize = dragStartViewEnd.current - dragStartViewStart.current;
    if (windowSize <= 0) return;

    // Convert pixel delta to data-point delta (negative dx = panning right in time)
    const pointsPerPixel = windowSize / containerWidth;
    const delta = Math.round(-dx * pointsPerPixel);
    const totalPoints = rechartsData.length;

    const maxStart = Math.max(0, totalPoints - windowSize - 1);
    const newStart = Math.max(0, Math.min(maxStart, dragStartViewStart.current + delta));
    const newEnd = Math.min(totalPoints - 1, newStart + windowSize);
    setViewStart(newStart);
    setViewEnd(newEnd);
  }, [rechartsData.length]);

  const handleChartMouseUp = useCallback(() => {
    isDragging.current = false;
    setIsDraggingCursor(false);
  }, []);

  // ── Double-click zoom handler ─────────────────────────────────────────────────
  const handleChartDoubleClick = useCallback((e: React.MouseEvent) => {
    const container = chartContainerRef.current;
    if (!container || visibleData.length === 0) return;

    // Map click x to a date in the visible window
    const rect = container.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const fraction = Math.max(0, Math.min(1, relX / rect.width));
    const idx = Math.round(fraction * (visibleData.length - 1));
    const clickedDate = String(visibleData[idx]?.date ?? '');

    // Determine the next drill-down timeframe
    const zoomMap: Record<TimeRange, TimeRange> = {
      all: '5y',
      '5y': '1y',
      '1y': '6m',
      '6m': '3m',
      '3m': '1m',
      '1m': '1m',
      ytd: '3m',
    };
    const nextTimeframe = zoomMap[timeframe];
    if (nextTimeframe === timeframe) return; // already at minimum zoom level

    // Find the index of clickedDate in full rechartsData
    const fullIdx = rechartsData.findIndex(d => d.date === clickedDate);
    if (fullIdx === -1) return;

    // Calculate default window size for nextTimeframe
    const [nextStart, nextEnd] = getTimeframeIndices(rechartsData, nextTimeframe);
    const windowSize = nextEnd - nextStart;

    // Center around fullIdx
    const half = Math.floor(windowSize / 2);
    const newStart = Math.max(0, Math.min(rechartsData.length - windowSize - 1, fullIdx - half));
    const newEnd = Math.min(rechartsData.length - 1, newStart + windowSize);

    isZooming.current = true;
    setViewStart(newStart);
    setViewEnd(newEnd);
    setTimeframe(nextTimeframe);
  }, [visibleData, timeframe, rechartsData, setTimeframe]);

  // ── Visible date range label for the pill ─────────────────────────────────────
  const visibleDateRange = useMemo(() => {
    if (visibleData.length === 0) return null;
    const first = String(visibleData[0].date);
    const last = String(visibleData[visibleData.length - 1].date);
    if (first === last) return null;
    const fmt = (d: string) => formatSafeUTCDate(d, { month: 'short', year: 'numeric' });
    return `${fmt(first)} – ${fmt(last)}`;
  }, [visibleData]);

  const isPanned = viewStart !== null || viewEnd !== null;


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

    const [startIdx, endIdx] = getTimeframeIndices(historyData, timeframe);
    const slicedHistory = historyData.slice(startIdx, endIdx + 1);

    const points = slicedHistory.map((d) => {
      let sum = 0;
      for (const acc of accs) {
        sum += (d[acc.id] ?? 0);
      }
      return isLiab ? -sum : sum;
    });

    const starting = points.length > 0 ? Math.abs(points[0]) : 0;
    const current = points.length > 0 ? Math.abs(points[points.length - 1]) : 0;

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
  }, [historyData, timeframe]);

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
      if (acc.isHidden && !hierarchyShowHidden) continue;

      const { group, subGroup } = getHierarchy(acc.type);

      // Filter by Group
      if (hierarchySelectedGroups.size > 0 && !hierarchySelectedGroups.has(group)) {
        continue;
      }
      
      // Filter by Type (subGroup)
      if (hierarchySelectedTypes.size > 0 && !hierarchySelectedTypes.has(subGroup)) {
        continue;
      }
      
      // Filter by Account ID
      if (hierarchySelectedAccounts.size > 0 && !hierarchySelectedAccounts.has(acc.id)) {
        continue;
      }

      if (!map.has(group)) map.set(group, new Map());
      const subMap = map.get(group)!;
      if (!subMap.has(subGroup)) subMap.set(subGroup, []);
      subMap.get(subGroup)!.push(acc);
    }

    return map;
  }, [filteredAllAccounts, hierarchyShowHidden, hierarchySelectedGroups, hierarchySelectedTypes, hierarchySelectedAccounts]);

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

  // Grouping mode change helper that resets filter sets and closes popups
  const handleGroupModeChange = useCallback((mode: GroupingMode) => {
    setGroupMode(mode);
    setSelectedGroups(new Set());
    setSelectedTypes(new Set());
    setSelectedAccounts(new Set());
    setGroupsOpen(false);
    setTypesOpen(false);
    setAccountsOpen(false);
  }, []);

  // Tooltip helper
  // Tooltip helper
  const CustomTooltip = useCallback(({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null;
    
    const point = payload[0].payload;
    const dateStr = point.date;

    const formatPointDate = (d: string) => formatSafeUTCDate(d, {
      month: 'short',
      day: 'numeric',
      year: '2-digit',
    });

    const activeKeys = Array.from(selectedSeriesKeys);
    const activeAssets = activeKeys.filter((k) => isAssetSeries(k) && Math.abs(point[k] || 0) > 0);
    const activeLiabilities = activeKeys.filter((k) => !isAssetSeries(k) && Math.abs(point[k] || 0) > 0);

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
                  value={formatCurrency(Math.abs(point[key] || 0))}
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
                  value={formatCurrency(Math.abs(point[key] || 0))}
                  color={info?.color || 'var(--color-destructive)'}
                />
              );
            })}
          </div>
        )}
      </ChartTooltip>
    );
  }, [selectedSeriesKeys, isAssetSeries, seriesInfoMap]);

  return (
    <div className="min-h-screen bg-background text-foreground pb-12 transition-all">
      <PageHeader title="Accounts" icon={Landmark} />

      <div className="max-w-6xl mx-auto px-2 sm:px-6 mt-6 space-y-6">
        <>

            {/* ── Graphics / Chart Card ── */}
            <Card className="bg-card/40 backdrop-blur-md border-border/60 shadow-sm overflow-hidden">
              <CollapsibleCardHeader
                isCollapsed={isCollapsed}
                onToggle={setIsCollapsed}
                title={
                  <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                    <Activity className="w-4 h-4 text-primary" /> Balance History
                  </h3>
                }
              />
              {!isCollapsed && (
                <>
                  <CollapsibleFilterPanel
                    isOpen={showHistoryFilters}
                    onToggle={() => setShowHistoryFilters(!showHistoryFilters)}
                    feedback={
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider">
                          {timeframe.toUpperCase()}
                        </span>
                        <span className="bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider">
                          {chartType === 'line' ? 'Area' : 'Bar'}
                        </span>
                        <span className="bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider">
                          BY {groupMode.toUpperCase()}
                        </span>
                        {(selectedGroups.size > 0 || selectedTypes.size > 0 || selectedAccounts.size > 0) && (
                          <span className="bg-chart-3/15 text-chart-3 border border-chart-3/25 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider">
                            FILTERED
                          </span>
                        )}
                      </div>
                    }
                  >
                    <div className="space-y-4">
                      {/* Timeframe & Chart Style Row */}
                      <div className="flex flex-wrap items-center justify-between gap-4 p-3 bg-muted/20 border border-border/20 rounded-xl">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mr-1">Timeframe</span>
                          <TimeRangeFilter value={timeframe} onChange={setTimeframe} />
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mr-1">Style</span>
                          <ChartTypeSelector 
                            value={chartType} 
                            options={[
                              { value: 'line', label: 'Area' },
                              { value: 'bar', label: 'Bar' }
                            ]} 
                            onChange={(t) => setChartType(t as ChartType)} 
                          />
                        </div>
                      </div>

                      {/* Quick Views Presets */}
                      <div className="flex flex-wrap items-center gap-2 p-3 bg-muted/20 border border-border/20 rounded-xl">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mr-1 select-none">
                          <svg className="w-3.5 h-3.5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                          </svg>
                          Quick Views
                        </span>
                        <div className="flex flex-wrap items-center gap-2">
                          {allPresets.map((preset) => {
                            const active = isPresetActive(preset);
                            return (
                              <button
                                type="button"
                                key={preset.id}
                                onClick={() => handleApplyPreset(preset)}
                                className={`group flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                                  active
                                    ? 'bg-primary/15 border-primary/50 text-primary shadow-sm'
                                    : 'bg-background hover:bg-muted border-border/50 text-muted-foreground hover:text-foreground'
                                }`}
                              >
                                <span>{preset.name}</span>
                                {preset.isCustom && (
                                  <span
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeletePreset(preset.id);
                                    }}
                                    className="w-3.5 h-3.5 rounded-full hover:bg-destructive/20 text-muted-foreground hover:text-destructive flex items-center justify-center text-[10px] ml-0.5 opacity-60 group-hover:opacity-100 transition-opacity"
                                    title="Delete view"
                                  >
                                    &times;
                                  </span>
                                )}
                              </button>
                            );
                          })}

                          {/* Save Current View Form */}
                          {isSavingView ? (
                            <form
                              onSubmit={(e) => {
                                e.preventDefault();
                                handleSaveCurrentView(newPresetName);
                              }}
                              className="flex items-center gap-1 animate-in fade-in slide-in-from-left-2 duration-200"
                            >
                              <input
                                type="text"
                                value={newPresetName}
                                onChange={(e) => setNewPresetName(e.target.value)}
                                placeholder="Name this view..."
                                className="px-2.5 py-1 bg-background border border-input rounded-lg text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary w-32 transition-all"
                                autoFocus
                                required
                              />
                              <button
                                type="submit"
                                className="px-2.5 py-1 bg-primary text-primary-foreground text-xs font-medium rounded-lg hover:opacity-90 transition-opacity"
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setIsSavingView(false);
                                  setNewPresetName('');
                                }}
                                className="px-2.5 py-1 bg-muted text-muted-foreground text-xs font-medium rounded-lg hover:bg-muted/80 transition-colors"
                              >
                                Cancel
                              </button>
                            </form>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setIsSavingView(true)}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border border-dashed border-primary/45 hover:border-primary text-primary hover:bg-primary/5 transition-all"
                            >
                              <span className="text-[14px] leading-none">+</span> Save View
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Chart Controls / Groupings & Contextual Filters */}
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-3 bg-muted/30 border border-border/30 rounded-xl">
                        {/* Mode Pill Selector & Show Hidden Toggle */}
                        <div className="flex flex-wrap items-center gap-4">
                          <div className="flex items-center gap-1">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mr-2">Group By</span>
                            <div className="flex bg-muted/80 border border-border/30 rounded-lg p-0.5">
                              {(['group', 'type', 'account'] as const).map((mode) => (
                                <button
                                  key={mode}
                                  onClick={() => handleGroupModeChange(mode)}
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

                          <div className="flex items-center gap-2 sm:border-l sm:border-border/30 sm:pl-4">
                            <Switch
                              id="chart-show-hidden"
                              checked={showHidden}
                              onCheckedChange={setShowHidden}
                            />
                            <label htmlFor="chart-show-hidden" className="text-xs font-medium text-muted-foreground cursor-pointer">
                              Show Hidden
                            </label>
                          </div>
                        </div>

                        {/* Filter Dropdown for the selected group mode */}
                        <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
                          {groupMode === 'group' && (
                            <div className="relative z-30" ref={groupsRef}>
                              <button
                                type="button"
                                onClick={() => {
                                  setGroupsOpen(!groupsOpen);
                                }}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-2 whitespace-nowrap ${
                                  selectedGroups.size > 0
                                    ? 'bg-primary/15 border border-primary text-primary'
                                    : 'bg-muted/50 border border-input text-foreground hover:bg-muted hover:border-border'
                                }`}
                              >
                                <span>Group</span>
                                {selectedGroups.size > 0 && (
                                  <span className="ml-1 px-1.5 py-0.5 text-[10px] font-semibold bg-primary/25 text-primary rounded-full min-w-[18px] text-center">
                                    {selectedGroups.size}
                                  </span>
                                )}
                                <svg className={`h-3 w-3 transition-transform ${groupsOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                              </button>
                              {groupsOpen && (
                                <div className="absolute top-full right-0 mt-2 w-52 bg-card border border-border rounded-lg shadow-xl z-50 max-h-72 flex flex-col">
                                  <div className="overflow-y-auto flex-1 p-1">
                                    <label className="flex items-center gap-2 px-3 py-2 text-xs text-foreground/80 hover:bg-muted/50 cursor-pointer font-medium transition-colors border-b border-border/30">
                                      <input
                                        type="checkbox"
                                        checked={selectedGroups.size === availableGroups.length && availableGroups.length > 0}
                                        onChange={() => {
                                          if (selectedGroups.size === availableGroups.length) {
                                            setSelectedGroups(new Set());
                                          } else {
                                            setSelectedGroups(new Set(availableGroups));
                                          }
                                        }}
                                        className="rounded border-border bg-background text-primary focus:ring-ring cursor-pointer"
                                      />
                                      Select All
                                    </label>
                                    {availableGroups.map((group) => (
                                      <label
                                        key={group}
                                        className="flex items-center gap-2 px-3 py-2 text-[11px] text-foreground/80 hover:bg-muted/50 cursor-pointer transition-colors border-b border-border/30 last:border-b-0"
                                      >
                                        <input
                                          type="checkbox"
                                          checked={selectedGroups.has(group)}
                                          onChange={() => {
                                            const next = new Set(selectedGroups);
                                            if (next.has(group)) {
                                              next.delete(group);
                                            } else {
                                              next.add(group);
                                            }
                                            setSelectedGroups(next);
                                          }}
                                          className="rounded border-border bg-background text-primary focus:ring-ring cursor-pointer"
                                        />
                                        <span>{group}</span>
                                      </label>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {groupMode === 'type' && (
                            <div className="relative z-30" ref={typesRef}>
                              <button
                                type="button"
                                onClick={() => {
                                  setTypesOpen(!typesOpen);
                                }}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-2 whitespace-nowrap ${
                                  selectedTypes.size > 0
                                    ? 'bg-primary/15 border border-primary text-primary'
                                    : 'bg-muted/50 border border-input text-foreground hover:bg-muted hover:border-border'
                                }`}
                              >
                                <span>Type</span>
                                {selectedTypes.size > 0 && (
                                  <span className="ml-1 px-1.5 py-0.5 text-[10px] font-semibold bg-primary/25 text-primary rounded-full min-w-[18px] text-center">
                                    {selectedTypes.size}
                                  </span>
                                )}
                                <svg className={`h-3 w-3 transition-transform ${typesOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                              </button>
                              {typesOpen && (
                                <div className="absolute top-full right-0 mt-2 w-56 bg-card border border-border rounded-lg shadow-xl z-50 max-h-72 flex flex-col">
                                  <div className="p-2 border-b border-border/50">
                                    <input
                                      type="text"
                                      value={typeSearch}
                                      onChange={(e) => setTypeSearch(e.target.value)}
                                      placeholder="Search types..."
                                      className="w-full px-3 py-1.5 bg-background border border-input rounded-lg text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-shadow"
                                    />
                                  </div>
                                  <div className="overflow-y-auto flex-1 p-1">
                                    <label className="flex items-center gap-2 px-3 py-2 text-xs text-foreground/80 hover:bg-muted/50 cursor-pointer font-medium transition-colors border-b border-border/30">
                                      <input
                                        type="checkbox"
                                        checked={selectedTypes.size === availableTypes.length && availableTypes.length > 0}
                                        onChange={() => {
                                          if (selectedTypes.size === availableTypes.length) {
                                            setSelectedTypes(new Set());
                                          } else {
                                            setSelectedTypes(new Set(availableTypes));
                                          }
                                        }}
                                        className="rounded border-border bg-background text-primary focus:ring-ring cursor-pointer"
                                      />
                                      Select All
                                    </label>
                                    {availableTypes
                                      .filter(t => !typeSearch || t.toLowerCase().includes(typeSearch.toLowerCase()))
                                      .map((type) => (
                                        <label
                                          key={type}
                                          className="flex items-center gap-2 px-3 py-2 text-[11px] text-foreground/80 hover:bg-muted/50 cursor-pointer transition-colors border-b border-border/30 last:border-b-0"
                                        >
                                          <input
                                            type="checkbox"
                                            checked={selectedTypes.has(type)}
                                            onChange={() => {
                                              const next = new Set(selectedTypes);
                                              if (next.has(type)) {
                                                next.delete(type);
                                              } else {
                                                next.add(type);
                                              }
                                              setSelectedTypes(next);
                                            }}
                                            className="rounded border-border bg-background text-primary focus:ring-ring cursor-pointer"
                                          />
                                          <span>{type}</span>
                                        </label>
                                      ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {groupMode === 'account' && (
                            <div className="relative z-30" ref={accountsRef}>
                              <button
                                type="button"
                                onClick={() => {
                                  setAccountsOpen(!accountsOpen);
                                }}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-2 whitespace-nowrap ${
                                  selectedAccounts.size > 0
                                    ? 'bg-primary/15 border border-primary text-primary'
                                    : 'bg-muted/50 border border-input text-foreground hover:bg-muted hover:border-border'
                                }`}
                              >
                                <span>Account</span>
                                {selectedAccounts.size > 0 && (
                                  <span className="ml-1 px-1.5 py-0.5 text-[10px] font-semibold bg-primary/25 text-primary rounded-full min-w-[18px] text-center">
                                    {selectedAccounts.size}
                                  </span>
                                )}
                                <svg className={`h-3 w-3 transition-transform ${accountsOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                              </button>
                              {accountsOpen && (
                                <div className="absolute top-full right-0 mt-2 w-64 bg-card border border-border rounded-lg shadow-xl z-50 max-h-72 flex flex-col">
                                  <div className="p-2 border-b border-border/50">
                                    <input
                                      type="text"
                                      value={accountSearch}
                                      onChange={(e) => setAccountSearch(e.target.value)}
                                      placeholder="Search accounts..."
                                      className="w-full px-3 py-1.5 bg-background border border-input rounded-lg text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-shadow"
                                    />
                                  </div>
                                  <div className="overflow-y-auto flex-1 p-1">
                                    <label className="flex items-center gap-2 px-3 py-2 text-xs text-foreground/80 hover:bg-muted/50 cursor-pointer font-medium transition-colors border-b border-border/30">
                                      <input
                                        type="checkbox"
                                        checked={selectedAccounts.size === availableAccounts.length && availableAccounts.length > 0}
                                        onChange={() => {
                                          if (selectedAccounts.size === availableAccounts.length) {
                                            setSelectedAccounts(new Set());
                                          } else {
                                            setSelectedAccounts(new Set(availableAccounts.map(a => a.id)));
                                          }
                                        }}
                                        className="rounded border-border bg-background text-primary focus:ring-ring cursor-pointer"
                                      />
                                      Select All
                                    </label>
                                    {availableAccounts
                                      .filter(a => !accountSearch || a.name.toLowerCase().includes(accountSearch.toLowerCase()) || (a.institution && a.institution.toLowerCase().includes(accountSearch.toLowerCase())))
                                      .map((acc) => (
                                        <label
                                          key={acc.id}
                                          className="flex items-center gap-3 px-3 py-2 text-[11px] text-foreground/80 hover:bg-muted/50 cursor-pointer transition-colors border-b border-border/30 last:border-b-0"
                                        >
                                          <input
                                            type="checkbox"
                                            checked={selectedAccounts.has(acc.id)}
                                            onChange={() => {
                                              const next = new Set(selectedAccounts);
                                              if (next.has(acc.id)) {
                                                next.delete(acc.id);
                                              } else {
                                                next.add(acc.id);
                                              }
                                              setSelectedAccounts(next);
                                            }}
                                            className="rounded border-border bg-background text-primary focus:ring-ring cursor-pointer"
                                          />
                                          <div className="text-left">
                                            <p className="font-medium text-foreground">{acc.name}</p>
                                            {acc.institution && <p className="text-[10px] text-muted-foreground">{acc.institution}</p>}
                                          </div>
                                        </label>
                                      ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Reset/Clear button inside the same row if there are selected items */}
                          {(selectedGroups.size > 0 || selectedTypes.size > 0 || selectedAccounts.size > 0) && (
                            <button
                              onClick={() => {
                                setSelectedGroups(new Set());
                                setSelectedTypes(new Set());
                                setSelectedAccounts(new Set());
                              }}
                              className="px-2.5 py-1 text-xs font-semibold rounded bg-muted/40 border border-border/20 hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
                            >
                              Clear Filters
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </CollapsibleFilterPanel>
                  <CardContent className="p-2 sm:p-5">
                    <div className="h-[380px] w-full relative">
                      {historyLoading ? (
                        <div className="absolute inset-0 flex items-center justify-center bg-card/20 backdrop-blur-[1px]">
                          <LoadingSpinner category="analysis" />
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
                      ) : (
                        <div className="flex flex-col md:flex-row gap-4 h-full w-full">
                          {/* Chart Area */}
                          <div
                            ref={chartContainerRef}
                            className="flex-1 min-w-0 h-full relative select-none"
                            style={{ cursor: isDraggingCursor ? 'grabbing' : 'grab' }}
                            onMouseDown={handleChartMouseDown}
                            onMouseMove={handleChartMouseMove}
                            onMouseUp={handleChartMouseUp}
                            onMouseLeave={handleChartMouseUp}
                            onDoubleClick={handleChartDoubleClick}
                          >
                            <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 100, height: 100 }}>
                              {chartType === 'bar' ? (
                                <BarChart
                                  data={visibleData}
                                  stackOffset="sign"
                                  margin={{ top: 15, right: 20, left: 10, bottom: 5 }}
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
                                  
                                  {/* Render assets bars (positive stack) */}
                                  {activeAssets.map((key) => {
                                    const info = seriesInfoMap.get(key);
                                    return (
                                      <Bar
                                        key={key}
                                        dataKey={key}
                                        stackId="stack"
                                        fill={info?.color || 'var(--color-chart-1)'}
                                        radius={[0, 0, 0, 0]}
                                      />
                                    );
                                  })}

                                  {/* Render liabilities bars (negative stack) */}
                                  {activeLiabilities.map((key) => {
                                    const info = seriesInfoMap.get(key);
                                    return (
                                      <Bar
                                        key={key}
                                        dataKey={key}
                                        stackId="stack"
                                        fill={info?.color || 'var(--color-destructive)'}
                                        radius={[0, 0, 0, 0]}
                                      />
                                    );
                                  })}
                                </BarChart>
                              ) : (
                                <ComposedChart
                                  data={visibleData}
                                  stackOffset="sign"
                                  margin={{ top: 15, right: 20, left: 10, bottom: 5 }}
                                >
                                  <defs>
                                    {[...activeAssets, ...activeLiabilities].map((key) => {
                                      const info = seriesInfoMap.get(key);
                                      const color = info?.color || (activeAssets.includes(key) ? 'var(--color-chart-1)' : 'var(--color-destructive)');
                                      const id = `gradient-${key.replace(/[^a-zA-Z0-9]/g, '-')}`;
                                      return (
                                        <linearGradient key={key} id={id} x1="0" y1="0" x2="0" y2="1">
                                          <stop offset="5%" stopColor={color} stopOpacity={0.25} />
                                          <stop offset="95%" stopColor={color} stopOpacity={0.03} />
                                        </linearGradient>
                                      );
                                    })}
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
                                  
                                  {/* Render assets areas (positive stack) */}
                                  {activeAssets.map((key) => {
                                    const info = seriesInfoMap.get(key);
                                    return (
                                      <Area
                                        key={key}
                                        type="monotone"
                                        dataKey={key}
                                        stackId="stack"
                                        stroke={info?.color || 'var(--color-chart-1)'}
                                        strokeWidth={2}
                                        fill={`url(#gradient-${key.replace(/[^a-zA-Z0-9]/g, '-')})`}
                                        dot={false}
                                      />
                                    );
                                  })}

                                  {/* Render liabilities areas (negative stack) */}
                                  {activeLiabilities.map((key) => {
                                    const info = seriesInfoMap.get(key);
                                    return (
                                      <Area
                                        key={key}
                                        type="monotone"
                                        dataKey={key}
                                        stackId="stack"
                                        stroke={info?.color || 'var(--color-destructive)'}
                                        strokeWidth={2}
                                        fill={`url(#gradient-${key.replace(/[^a-zA-Z0-9]/g, '-')})`}
                                        dot={false}
                                      />
                                    );
                                  })}
                                </ComposedChart>
                              )}
                            </ResponsiveContainer>

                            {/* Date range pill + Reset View */}
                            {visibleDateRange && (
                              <div className="absolute top-2 left-1/2 -translate-x-1/2 flex items-center gap-2 pointer-events-none z-20">
                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-muted/80 border border-border/40 text-muted-foreground backdrop-blur-sm">
                                  {visibleDateRange}
                                </span>
                                {isPanned && (
                                  <button
                                    className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-primary/15 border border-primary/40 text-primary hover:bg-primary/25 transition-colors pointer-events-auto"
                                    onClick={() => { setViewStart(null); setViewEnd(null); }}
                                    title="Reset to full view"
                                  >
                                    Reset View
                                  </button>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Legend Column */}
                          <div className="w-full md:w-56 flex-shrink-0 flex flex-col justify-start border-t md:border-t-0 md:border-l border-border/20 pt-3 md:pt-0 md:pl-4 overflow-y-auto max-h-[120px] md:max-h-full gap-3">
                            {activeAssets.length > 0 && (
                              <div>
                                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                                  Assets ({activeAssets.length})
                                </span>
                                <div className="space-y-1.5">
                                  {activeAssets.map((key) => {
                                    const info = seriesInfoMap.get(key);
                                    return (
                                      <div key={key} className="flex items-center gap-2 text-xs text-foreground/80 hover:text-foreground transition-colors">
                                        <span 
                                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                          style={{ backgroundColor: info?.color || 'var(--color-chart-1)' }}
                                        />
                                        <span className="truncate" title={info?.label || key}>
                                          {info?.label || key}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                            
                            {activeLiabilities.length > 0 && (
                              <div>
                                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                                  Liabilities ({activeLiabilities.length})
                                </span>
                                <div className="space-y-1.5">
                                  {activeLiabilities.map((key) => {
                                    const info = seriesInfoMap.get(key);
                                    return (
                                      <div key={key} className="flex items-center gap-2 text-xs text-foreground/80 hover:text-foreground transition-colors">
                                        <span 
                                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                          style={{ backgroundColor: info?.color || 'var(--color-destructive)' }}
                                        />
                                        <span className="truncate" title={info?.label || key}>
                                          {info?.label || key}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
              </>
            )}
          </Card>

            {/* ── Expandable Accounts Tree View ── */}
            <Card className="bg-card/40 backdrop-blur-md border-border/60 shadow-sm overflow-hidden">
              <CollapsibleCardHeader
                isCollapsed={hierarchyCollapsed}
                onToggle={setHierarchyCollapsed}
                title={
                  <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                    <Landmark className="w-4 h-4 text-primary" /> Accounts Hierarchy
                  </h3>
                }
              />
              {!hierarchyCollapsed && (
                <CardContent className="p-2 sm:p-5">
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
                      href="/settings?tab=accounts"
                      className="px-5 py-2 bg-primary text-primary-foreground text-xs font-semibold rounded-lg hover:opacity-90 transition-all flex items-center gap-2 mx-auto w-fit"
                    >
                      <Plus className="w-4 h-4" /> Link Institution
                    </Link>
                  </div>
                ) : (
                  <>
                    <CollapsibleFilterPanel
                      isOpen={showHierarchyFilters}
                      onToggle={() => setShowHierarchyFilters(!showHierarchyFilters)}
                      feedback={
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider">
                            Showing {filteredAllAccounts.length} Accounts
                          </span>
                          {(hierarchySelectedGroups.size > 0 || hierarchySelectedTypes.size > 0 || hierarchySelectedAccounts.size > 0) && (
                            <span className="bg-chart-3/15 text-chart-3 border border-chart-3/25 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider">
                              FILTERED
                            </span>
                          )}
                        </div>
                      }
                      className="mb-4 border border-border/40 rounded-xl bg-muted/5"
                    >
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-end gap-4">
                        {/* Right side: Dropdown Filters */}
                        <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end flex-wrap">
                          {/* Group Dropdown */}
                          <div className="relative z-30" ref={hierarchyGroupsRef}>
                            <button
                              type="button"
                              onClick={() => setHierarchyGroupsOpen(!hierarchyGroupsOpen)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-2 whitespace-nowrap ${
                                hierarchySelectedGroups.size > 0
                                  ? 'bg-primary/15 border border-primary text-primary'
                                  : 'bg-muted/50 border border-input text-foreground hover:bg-muted hover:border-border'
                              }`}
                            >
                              <span>Group</span>
                              {hierarchySelectedGroups.size > 0 && (
                                <span className="ml-1 px-1.5 py-0.5 text-[10px] font-semibold bg-primary/25 text-primary rounded-full min-w-[18px] text-center">
                                  {hierarchySelectedGroups.size}
                                </span>
                              )}
                              <svg className={`h-3 w-3 transition-transform ${hierarchyGroupsOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </button>
                            {hierarchyGroupsOpen && (
                              <div className="absolute top-full right-0 mt-2 w-52 bg-card border border-border rounded-lg shadow-xl z-50 max-h-72 flex flex-col">
                                <div className="overflow-y-auto flex-1 p-1">
                                  <label className="flex items-center gap-2 px-3 py-2 text-xs text-foreground/80 hover:bg-muted/50 cursor-pointer font-medium transition-colors border-b border-border/30">
                                    <input
                                      type="checkbox"
                                      checked={hierarchySelectedGroups.size === hierarchyAvailableGroups.length && hierarchyAvailableGroups.length > 0}
                                      onChange={() => {
                                        if (hierarchySelectedGroups.size === hierarchyAvailableGroups.length) {
                                          setHierarchySelectedGroups(new Set());
                                        } else {
                                          setHierarchySelectedGroups(new Set(hierarchyAvailableGroups));
                                        }
                                      }}
                                      className="rounded border-border bg-background text-primary focus:ring-ring cursor-pointer"
                                    />
                                    Select All
                                  </label>
                                  {hierarchyAvailableGroups.map((group) => (
                                    <label
                                      key={group}
                                      className="flex items-center gap-2 px-3 py-2 text-[11px] text-foreground/80 hover:bg-muted/50 cursor-pointer transition-colors border-b border-border/30 last:border-b-0"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={hierarchySelectedGroups.has(group)}
                                        onChange={() => {
                                          const next = new Set(hierarchySelectedGroups);
                                          if (next.has(group)) {
                                            next.delete(group);
                                          } else {
                                            next.add(group);
                                          }
                                          setHierarchySelectedGroups(next);
                                        }}
                                        className="rounded border-border bg-background text-primary focus:ring-ring cursor-pointer"
                                      />
                                      <span>{group}</span>
                                    </label>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Type Dropdown */}
                          <div className="relative z-30" ref={hierarchyTypesRef}>
                            <button
                              type="button"
                              onClick={() => setHierarchyTypesOpen(!hierarchyTypesOpen)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-2 whitespace-nowrap ${
                                hierarchySelectedTypes.size > 0
                                  ? 'bg-primary/15 border border-primary text-primary'
                                  : 'bg-muted/50 border border-input text-foreground hover:bg-muted hover:border-border'
                              }`}
                            >
                              <span>Type</span>
                              {hierarchySelectedTypes.size > 0 && (
                                <span className="ml-1 px-1.5 py-0.5 text-[10px] font-semibold bg-primary/25 text-primary rounded-full min-w-[18px] text-center">
                                  {hierarchySelectedTypes.size}
                                </span>
                              )}
                              <svg className={`h-3 w-3 transition-transform ${hierarchyTypesOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </button>
                            {hierarchyTypesOpen && (
                              <div className="absolute top-full right-0 mt-2 w-56 bg-card border border-border rounded-lg shadow-xl z-50 max-h-72 flex flex-col">
                                <div className="p-2 border-b border-border/50">
                                  <input
                                    type="text"
                                    value={hierarchyTypeSearch}
                                    onChange={(e) => setHierarchyTypeSearch(e.target.value)}
                                    placeholder="Search types..."
                                    className="w-full px-3 py-1.5 bg-background border border-input rounded-lg text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-shadow"
                                  />
                                </div>
                                <div className="overflow-y-auto flex-1 p-1">
                                  <label className="flex items-center gap-2 px-3 py-2 text-xs text-foreground/80 hover:bg-muted/50 cursor-pointer font-medium transition-colors border-b border-border/30">
                                    <input
                                      type="checkbox"
                                      checked={hierarchySelectedTypes.size === hierarchyAvailableTypes.length && hierarchyAvailableTypes.length > 0}
                                      onChange={() => {
                                        if (hierarchySelectedTypes.size === hierarchyAvailableTypes.length) {
                                          setHierarchySelectedTypes(new Set());
                                        } else {
                                          setHierarchySelectedTypes(new Set(hierarchyAvailableTypes));
                                        }
                                      }}
                                      className="rounded border-border bg-background text-primary focus:ring-ring cursor-pointer"
                                    />
                                    Select All
                                  </label>
                                  {hierarchyAvailableTypes
                                    .filter(t => !hierarchyTypeSearch || t.toLowerCase().includes(hierarchyTypeSearch.toLowerCase()))
                                    .map((type) => (
                                      <label
                                        key={type}
                                        className="flex items-center gap-2 px-3 py-2 text-[11px] text-foreground/80 hover:bg-muted/50 cursor-pointer transition-colors border-b border-border/30 last:border-b-0"
                                      >
                                        <input
                                          type="checkbox"
                                          checked={hierarchySelectedTypes.has(type)}
                                          onChange={() => {
                                            const next = new Set(hierarchySelectedTypes);
                                            if (next.has(type)) {
                                              next.delete(type);
                                            } else {
                                              next.add(type);
                                            }
                                            setHierarchySelectedTypes(next);
                                          }}
                                          className="rounded border-border bg-background text-primary focus:ring-ring cursor-pointer"
                                        />
                                        <span>{type}</span>
                                      </label>
                                    ))}
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Account Dropdown */}
                          <div className="relative z-30" ref={hierarchyAccountsRef}>
                            <button
                              type="button"
                              onClick={() => setHierarchyAccountsOpen(!hierarchyAccountsOpen)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-2 whitespace-nowrap ${
                                hierarchySelectedAccounts.size > 0
                                  ? 'bg-primary/15 border border-primary text-primary'
                                  : 'bg-muted/50 border border-input text-foreground hover:bg-muted hover:border-border'
                              }`}
                            >
                              <span>Account</span>
                              {hierarchySelectedAccounts.size > 0 && (
                                <span className="ml-1 px-1.5 py-0.5 text-[10px] font-semibold bg-primary/25 text-primary rounded-full min-w-[18px] text-center">
                                  {hierarchySelectedAccounts.size}
                                </span>
                              )}
                              <svg className={`h-3 w-3 transition-transform ${hierarchyAccountsOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </button>
                            {hierarchyAccountsOpen && (
                              <div className="absolute top-full right-0 mt-2 w-64 bg-card border border-border rounded-lg shadow-xl z-50 max-h-72 flex flex-col">
                                <div className="p-2 border-b border-border/50">
                                  <input
                                    type="text"
                                    value={hierarchyAccountSearch}
                                    onChange={(e) => setHierarchyAccountSearch(e.target.value)}
                                    placeholder="Search accounts..."
                                    className="w-full px-3 py-1.5 bg-background border border-input rounded-lg text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-shadow"
                                  />
                                </div>
                                <div className="overflow-y-auto flex-1 p-1">
                                  <label className="flex items-center gap-2 px-3 py-2 text-xs text-foreground/80 hover:bg-muted/50 cursor-pointer font-medium transition-colors border-b border-border/30">
                                    <input
                                      type="checkbox"
                                      checked={hierarchySelectedAccounts.size === hierarchyAvailableAccounts.length && hierarchyAvailableAccounts.length > 0}
                                      onChange={() => {
                                        if (hierarchySelectedAccounts.size === hierarchyAvailableAccounts.length) {
                                          setHierarchySelectedAccounts(new Set());
                                        } else {
                                          setHierarchySelectedAccounts(new Set(hierarchyAvailableAccounts.map(a => a.id)));
                                        }
                                      }}
                                      className="rounded border-border bg-background text-primary focus:ring-ring cursor-pointer"
                                    />
                                    Select All
                                  </label>
                                  {hierarchyAvailableAccounts
                                    .filter(a => !hierarchyAccountSearch || a.name.toLowerCase().includes(hierarchyAccountSearch.toLowerCase()) || (a.institution && a.institution.toLowerCase().includes(hierarchyAccountSearch.toLowerCase())))
                                    .map((acc) => (
                                      <label
                                        key={acc.id}
                                        className="flex items-center gap-3 px-3 py-2 text-[11px] text-foreground/80 hover:bg-muted/50 cursor-pointer transition-colors border-b border-border/30 last:border-b-0"
                                      >
                                        <input
                                          type="checkbox"
                                          checked={hierarchySelectedAccounts.has(acc.id)}
                                          onChange={() => {
                                            const next = new Set(hierarchySelectedAccounts);
                                            if (next.has(acc.id)) {
                                              next.delete(acc.id);
                                            } else {
                                              next.add(acc.id);
                                            }
                                            setHierarchySelectedAccounts(next);
                                          }}
                                          className="rounded border-border bg-background text-primary focus:ring-ring cursor-pointer"
                                        />
                                        <div className="text-left">
                                          <p className="font-medium text-foreground">{acc.name}</p>
                                          {acc.institution && <p className="text-[10px] text-muted-foreground">{acc.institution}</p>}
                                        </div>
                                      </label>
                                    ))}
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Reset/Clear button inside the same row if there are selected items */}
                          {(hierarchySelectedGroups.size > 0 || hierarchySelectedTypes.size > 0 || hierarchySelectedAccounts.size > 0) && (
                            <button
                              onClick={() => {
                                setHierarchySelectedGroups(new Set());
                                setHierarchySelectedTypes(new Set());
                                setHierarchySelectedAccounts(new Set());
                              }}
                              className="px-2.5 py-1 text-xs font-semibold rounded bg-muted/40 border border-border/20 hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
                            >
                              Clear Filters
                            </button>
                          )}
                        </div>
                      </div>
                    </CollapsibleFilterPanel>
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
                            className="w-full flex items-center justify-between px-2.5 sm:px-4 py-3 bg-muted/40 hover:bg-muted/60 transition-colors cursor-pointer select-none"
                          >
                            <div className="flex items-center min-w-0 flex-1">
                              <div className="w-4 sm:w-5 mr-1 sm:mr-2 flex-shrink-0 flex items-center justify-center">
                                {isGroupExpanded ? (
                                  <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                                ) : (
                                  <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                                )}
                              </div>
                              <span className="text-sm font-bold text-foreground truncate">{group}</span>
                            </div>

                            {/* Group Sparkline */}
                            <div className="hidden sm:flex flex-shrink-0 w-32 justify-center items-center mx-4">
                              <Sparkline 
                                data={groupStats.historyPoints} 
                                isPositive={groupStats.isPositive} 
                                width={90}
                                height={20}
                              />
                            </div>

                            <div className="flex-shrink-0 w-28 sm:w-36 text-right">
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

                          {/* ── Subgroups / Nested Accounts (Flat divide-y container) ── */}
                          {isGroupExpanded && (
                            <div className="border-t border-border/10 divide-y divide-border/10 bg-card/5">
                              {Array.from(subMap.entries()).map(([subgroup, accs]) => {
                                const isLiabSub = accs[0] ? isLiabilityAccount(accs[0].type) : false;
                                const subStats = getTrendStats(accs);

                                // If subgroup has more than 1 account: collapsible subgroup header
                                if (accs.length > 1) {
                                  const subKey = `${group}::${subgroup}`;
                                  const isSubExpanded = expandedSubgroups[subKey] ?? true;
                                  const subChange = formatChange(subStats.change, subStats.percentChange, isLiabSub);

                                  return (
                                    <Fragment key={subgroup}>
                                      {/* Subgroup Header */}
                                      <div
                                        onClick={() => setExpandedSubgroups(prev => ({ ...prev, [subKey]: !isSubExpanded }))}
                                        className="w-full flex items-center justify-between px-2.5 sm:px-4 py-2.5 bg-muted/10 hover:bg-muted/20 cursor-pointer select-none transition-colors"
                                      >
                                        <div className="flex items-center min-w-0 flex-1 pl-0.5 sm:pl-4">
                                          <div className="w-4 sm:w-5 mr-1 sm:mr-2 flex-shrink-0 flex items-center justify-center">
                                            {isSubExpanded ? (
                                              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/80 flex-shrink-0" />
                                            ) : (
                                              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/80 flex-shrink-0" />
                                            )}
                                          </div>
                                          <span className="text-xs font-semibold text-muted-foreground truncate">{subgroup}</span>
                                          <span className="text-[10px] text-muted-foreground/50 ml-1">({accs.length})</span>
                                        </div>

                                        <div className="hidden sm:flex flex-shrink-0 w-32 justify-center items-center mx-4">
                                          <Sparkline 
                                            data={subStats.historyPoints} 
                                            isPositive={subStats.isPositive} 
                                            width={90}
                                            height={20}
                                          />
                                        </div>

                                        <div className="flex-shrink-0 w-28 sm:w-36 text-right">
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
                                      {isSubExpanded && accs.map((acc) => {
                                        const accStats = getTrendStats([acc]);
                                        const accChange = formatChange(accStats.change, accStats.percentChange, isLiabSub);
                                        const isAccExpanded = expandedAccounts[acc.id] ?? false;

                                        return (
                                          <Fragment key={acc.id}>
                                            <div 
                                              onClick={() => setExpandedAccounts(prev => ({ ...prev, [acc.id]: !isAccExpanded }))}
                                              className={`w-full flex items-center justify-between px-2.5 sm:px-4 py-2 hover:bg-muted/10 transition-all cursor-pointer select-none ${
                                                acc.isHidden || acc.isExcludedFromNetWorth ? 'opacity-50 hover:opacity-100' : ''
                                              }`}
                                            >
                                              <div className="flex items-center min-w-0 flex-1 pl-1 sm:pl-8">
                                                <div className="w-4 sm:w-5 mr-1 sm:mr-2 flex-shrink-0 flex items-center justify-center">
                                                  <div className="w-1.5 h-1.5 rounded-full bg-primary/60" />
                                                </div>
                                                <div className="min-w-0 flex-1">
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

                                              <div className="hidden sm:flex flex-shrink-0 w-32 justify-center items-center mx-4">
                                                <Sparkline 
                                                  data={acc.isHidden || acc.isExcludedFromNetWorth ? [] : accStats.historyPoints} 
                                                  isPositive={accStats.isPositive} 
                                                  width={90}
                                                  height={20}
                                                />
                                              </div>

                                              <div className="flex-shrink-0 w-28 sm:w-36 text-right pr-2">
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

                                            {/* Inline Transactions Drawer */}
                                            {isAccExpanded && (
                                              <AccountTransactions 
                                                accountId={acc.id} 
                                                historyData={historyData}
                                                isLiability={isLiabilityAccount(acc.type)}
                                              />
                                            )}
                                          </Fragment>
                                        );
                                      })}
                                    </Fragment>
                                  );
                                }

                                // Single account inside subgroup: render directly inline under Group
                                const acc = accs[0];
                                const accStats = getTrendStats([acc]);
                                const accChange = formatChange(accStats.change, accStats.percentChange, isLiabSub);
                                const isAccExpanded = expandedAccounts[acc.id] ?? false;

                                return (
                                  <Fragment key={acc.id}>
                                    <div 
                                      onClick={() => setExpandedAccounts(prev => ({ ...prev, [acc.id]: !isAccExpanded }))}
                                      className={`w-full flex items-center justify-between px-2.5 sm:px-4 py-2.5 hover:bg-muted/10 transition-all cursor-pointer select-none ${
                                        acc.isHidden || acc.isExcludedFromNetWorth ? 'opacity-50 hover:opacity-100' : ''
                                      }`}
                                    >
                                      <div className="flex items-center min-w-0 flex-1 pl-0.5 sm:pl-4">
                                        <div className="w-4 sm:w-5 mr-1 sm:mr-2 flex-shrink-0 flex items-center justify-center">
                                          <div className="w-1.5 h-1.5 rounded-full bg-primary/60" />
                                        </div>
                                        <div className="min-w-0 flex-1">
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
                                      <div className="hidden sm:flex flex-shrink-0 w-32 justify-center items-center mx-4">
                                        <Sparkline 
                                          data={acc.isHidden || acc.isExcludedFromNetWorth ? [] : accStats.historyPoints} 
                                          isPositive={accStats.isPositive} 
                                          width={90}
                                          height={20}
                                        />
                                      </div>

                                      <div className="flex-shrink-0 w-28 sm:w-36 text-right pr-2">
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

                                    {/* Inline Transactions Drawer */}
                                    {isAccExpanded && (
                                      <AccountTransactions 
                                        accountId={acc.id} 
                                        historyData={historyData}
                                        isLiability={isLiabilityAccount(acc.type)}
                                      />
                                    )}
                                  </Fragment>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
                )}
              </CardContent>
              )}
            </Card>
          </>
      </div>


    </div>
  );
}