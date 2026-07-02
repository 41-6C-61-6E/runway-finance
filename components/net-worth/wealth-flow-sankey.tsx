'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { ResponsiveContainer, Sankey, Tooltip } from 'recharts';
import { useRouter } from 'next/navigation';
import { formatCurrency } from '@/lib/utils/format';
import { ChartTooltip, TooltipRow, TooltipHeader } from '@/components/charts/chart-tooltip';
import { ChartEmptyState } from '@/components/charts/chart-empty-state';
import { TimeRangeFilter, type TimeRange } from '@/components/charts/chart-filters';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useCardCollapsed } from '@/lib/hooks/use-card-collapsed';
import { CollapsibleCardHeader } from '@/components/ui/collapsible-card-header';
import { CollapsibleFilterPanel } from '@/components/ui/collapsible-filter-panel';
import { Switch } from '@/components/ui/switch';
import { ArrowLeftRight, HelpCircle, Eye, EyeOff, Search, AlertTriangle } from 'lucide-react';
import { useDateWindow } from '@/lib/hooks/use-date-window';
import { DateWindowNav } from '@/components/charts/date-window-nav';
import { getMonthRange } from '@/lib/utils/date-window';

interface AccountData {
  id: string;
  name: string;
  type: string;
}

interface AccountBreakdown {
  id: string;
  name: string;
  type?: string;
  beg?: number;
  end?: number;
  delta: number;
}

interface SankeyNode {
  id: string;
  label: string;
  color: string;
  value: number;
  percentage: number;
  group?: string;
  isBalancingNode?: boolean;
  accounts?: AccountBreakdown[];
  netWorthChange?: number;
  contributions?: number;
  marketGrowth?: number;
}

interface SankeyLink {
  source: string | number;
  target: string | number;
  value: number;
}

interface WealthFlowSummary {
  beginningNetWorth: number;
  endingNetWorth: number;
  netWorthChange: number;
  percentChange: number;
  reconciliationError: number;
  baseCurrency?: string;
  totalIncome: number;
  totalExpenses: number;
  totalMarketGains: number;
  totalMarketLosses: number;
  totalSavings: number;
  totalDrawdowns: number;
}
interface ReconSourceUse {
  id: string;
  label: string;
  value: number;
  group: string;
}

interface ReconciliationDetails {
  leftSum: number;
  rightSum: number;
  gap: number;
  sources: ReconSourceUse[];
  uses: ReconSourceUse[];
}

interface WealthFlowData {
  nodes: SankeyNode[];
  links: { source: string; target: string; value: number }[];
  summary: WealthFlowSummary;
  reconciliationDetails?: ReconciliationDetails;
}

const GROUP_COLORS: Record<string, string> = {
  income: '#312e81',
  market: '#7c3aed',
  asset: '#0284c7',
  retirement: '#059669',
  liability: '#d97706',
  expense: '#dc2626',
  drawdown: '#64748b',
  allocation: '#0ea5e9',
  unaccounted: '#f59e0b',
  account: '#64748b',
};

const GROUP_LABELS: Record<string, string> = {
  income: 'Income & Dividends',
  market: 'Market Movements',
  asset: 'Asset Changes',
  retirement: 'Retirement Savings',
  liability: 'Liability Changes',
  expense: 'Expenses',
  drawdown: 'Asset Drawdowns',
  allocation: 'Account Allocation',
  unaccounted: 'Unaccounted Flows',
  account: 'Accounts',
};

function roundFlowValue(value: number): number {
  return Math.round(value * 100) / 100;
}

function splitFlowByAccounts(
  totalValue: number,
  accounts: AccountBreakdown[] | undefined
): Array<AccountBreakdown & { flowValue: number }> {
  const validAccounts = (accounts || [])
    .map((account) => ({ ...account, absDelta: Math.abs(account.delta || 0) }))
    .filter((account) => account.absDelta > 0.01);

  const totalAccountDelta = validAccounts.reduce((sum, account) => sum + account.absDelta, 0);
  if (totalAccountDelta <= 0.01 || totalValue <= 0.01) return [];

  let allocated = 0;
  return validAccounts.map((account, index) => {
    const isLast = index === validAccounts.length - 1;
    const flowValue = isLast
      ? roundFlowValue(totalValue - allocated)
      : roundFlowValue((account.absDelta / totalAccountDelta) * totalValue);
    allocated = roundFlowValue(allocated + flowValue);
    return { ...account, flowValue };
  }).filter((account) => account.flowValue > 0.01);
}

function routeFlowsThroughAccounts(data: WealthFlowData): WealthFlowData {
  const nodesById = new Map<string, SankeyNode>(
    data.nodes.map((node) => [node.id, { ...node, accounts: node.accounts ? [...node.accounts] : undefined }])
  );
  const accountNodes = new Map<string, SankeyNode>();
  const routedLinks: WealthFlowData['links'] = [];

  const getAccountNode = (side: 'in' | 'out', account: AccountBreakdown): SankeyNode => {
    const id = `account_${side}_${account.id}`;
    const existing = accountNodes.get(id);
    if (existing) return existing;

    const node: SankeyNode = {
      id,
      label: account.name,
      color: side === 'in' ? '#2563eb' : '#475569',
      value: 0,
      percentage: 0,
      group: 'account',
      accounts: [{ ...account }],
    };
    accountNodes.set(id, node);
    return node;
  };

  const addRoutedLink = (source: string, target: string, value: number) => {
    const roundedValue = roundFlowValue(value);
    if (roundedValue <= 0.01) return;
    const existing = routedLinks.find((link) => link.source === source && link.target === target);
    if (existing) {
      existing.value = roundFlowValue(existing.value + roundedValue);
    } else {
      routedLinks.push({ source, target, value: roundedValue });
    }
  };

  for (const link of data.links) {
    const sourceNode = nodesById.get(link.source);
    const targetNode = nodesById.get(link.target);

    if (link.target === 'hub_net_worth_change' && sourceNode) {
      const accountSplits = splitFlowByAccounts(link.value, sourceNode.accounts);
      if (accountSplits.length > 0) {
        for (const account of accountSplits) {
          const accountNode = getAccountNode('in', account);
          accountNode.value = roundFlowValue(accountNode.value + account.flowValue);
          addRoutedLink(link.source, accountNode.id, account.flowValue);
          addRoutedLink(accountNode.id, link.target, account.flowValue);
        }
        continue;
      }
    }

    if (link.source === 'hub_net_worth_change' && targetNode) {
      const accountSplits = splitFlowByAccounts(link.value, targetNode.accounts);
      if (accountSplits.length > 0) {
        for (const account of accountSplits) {
          const accountNode = getAccountNode('out', account);
          accountNode.value = roundFlowValue(accountNode.value + account.flowValue);
          addRoutedLink(link.source, accountNode.id, account.flowValue);
          addRoutedLink(accountNode.id, link.target, account.flowValue);
        }
        continue;
      }
    }

    addRoutedLink(link.source, link.target, link.value);
  }

  const routedNodes = [...data.nodes.map((node) => nodesById.get(node.id)!), ...accountNodes.values()];
  const maxNodeValue = Math.max(...routedNodes.map((node) => node.value || 0), 1);

  return {
    ...data,
    nodes: routedNodes.map((node) => ({
      ...node,
      percentage: ((node.value || 0) / maxNodeValue) * 100,
    })),
    links: routedLinks,
  };
}

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  checking: 'Checking',
  savings: 'Savings',
  hsachecking: 'HSA Checking',
  retirement: 'Retirement',
  rothira: 'Roth IRA',
  traditionalira: 'Traditional IRA',
  '401k': '401(k)',
  '403b': '403(b)',
  sepira: 'SEP IRA',
  simpleira: 'Simple IRA',
  hsa: 'HSA',
  health: 'Health',
  '529': '529 Plan',
  investment: 'Investment',
  brokerage: 'Brokerage',
  otherinvestment: 'Other Investment',
  otherInvestment: 'Other Investment',
  crypto: 'Crypto',
  metals: 'Precious Metals',
  realestate: 'Real Estate',
  primaryhome: 'Primary Home',
  secondaryhome: 'Secondary Home',
  rentalproperty: 'Rental Property',
  commercial: 'Commercial Real Estate',
  land: 'Land',
  otherrealestate: 'Other Real Estate',
  mortgage: 'Mortgage',
  credit: 'Credit Card',
  loan: 'Loan',
  otherliability: 'Other Liability',
  otherLiability: 'Other Liability',
  studentloan: 'Student Loan',
  autoloan: 'Auto Loan',
  otherloan: 'Other Loan',
};

function getAccountTypeLabel(type: string): string {
  const t = type.trim().toLowerCase();
  if (ACCOUNT_TYPE_LABELS[t]) return ACCOUNT_TYPE_LABELS[t];
  if (ACCOUNT_TYPE_LABELS[type]) return ACCOUNT_TYPE_LABELS[type];
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function routeFlowsThroughAccountTypes(data: WealthFlowData): WealthFlowData {
  const nodesById = new Map<string, SankeyNode>(
    data.nodes.map((node) => [node.id, { ...node, accounts: node.accounts ? [...node.accounts] : undefined }])
  );
  const typeNodes = new Map<string, SankeyNode>();
  const routedLinks: WealthFlowData['links'] = [];

  const getTypeNode = (side: 'in' | 'out', type: string): SankeyNode => {
    const cleanType = type || 'other';
    const id = `type_${side}_${cleanType.toLowerCase()}`;
    const existing = typeNodes.get(id);
    if (existing) return existing;

    const node: SankeyNode = {
      id,
      label: getAccountTypeLabel(cleanType),
      color: side === 'in' ? '#2563eb' : '#475569',
      value: 0,
      percentage: 0,
      group: 'account',
      accounts: [],
    };
    typeNodes.set(id, node);
    return node;
  };

  const addRoutedLink = (source: string, target: string, value: number) => {
    const roundedValue = roundFlowValue(value);
    if (roundedValue <= 0.01) return;
    const existing = routedLinks.find((link) => link.source === source && link.target === target);
    if (existing) {
      existing.value = roundFlowValue(existing.value + roundedValue);
    } else {
      routedLinks.push({ source, target, value: roundedValue });
    }
  };

  for (const link of data.links) {
    const sourceNode = nodesById.get(link.source);
    const targetNode = nodesById.get(link.target);

    if (link.target === 'hub_net_worth_change' && sourceNode) {
      const accountSplits = splitFlowByAccounts(link.value, sourceNode.accounts);
      if (accountSplits.length > 0) {
        for (const account of accountSplits) {
          const typeNode = getTypeNode('in', account.type || 'other');
          typeNode.value = roundFlowValue(typeNode.value + account.flowValue);
          if (typeNode.accounts) {
            const existingAcc = typeNode.accounts.find(a => a.id === account.id);
            if (existingAcc) {
              existingAcc.delta = roundFlowValue(existingAcc.delta + account.delta);
            } else {
              typeNode.accounts.push({ ...account });
            }
          }
          addRoutedLink(link.source, typeNode.id, account.flowValue);
          addRoutedLink(typeNode.id, link.target, account.flowValue);
        }
        continue;
      }
    }

    if (link.source === 'hub_net_worth_change' && targetNode) {
      const accountSplits = splitFlowByAccounts(link.value, targetNode.accounts);
      if (accountSplits.length > 0) {
        for (const account of accountSplits) {
          const typeNode = getTypeNode('out', account.type || 'other');
          typeNode.value = roundFlowValue(typeNode.value + account.flowValue);
          if (typeNode.accounts) {
            const existingAcc = typeNode.accounts.find(a => a.id === account.id);
            if (existingAcc) {
              existingAcc.delta = roundFlowValue(existingAcc.delta + account.delta);
            } else {
              typeNode.accounts.push({ ...account });
            }
          }
          addRoutedLink(link.source, typeNode.id, account.flowValue);
          addRoutedLink(typeNode.id, link.target, account.flowValue);
        }
        continue;
      }
    }

    addRoutedLink(link.source, link.target, link.value);
  }

  const routedNodes = [...data.nodes.map((node) => nodesById.get(node.id)!), ...typeNodes.values()];
  const maxNodeValue = Math.max(...routedNodes.map((node) => node.value || 0), 1);

  return {
    ...data,
    nodes: routedNodes.map((node) => ({
      ...node,
      percentage: ((node.value || 0) / maxNodeValue) * 100,
    })),
    links: routedLinks,
  };
}

const SANITIZED_PROPS = new Set([
  'onMouseEnter', 'onMouseLeave', 'onMouseMove', 'onClick', 'onMouseDown', 'onMouseUp',
  'className', 'style', 'tabIndex', 'role',
]);

function sanitizeRestProps(props: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [key, val] of Object.entries(props)) {
    if (SANITIZED_PROPS.has(key) || key.startsWith('on')) {
      out[key] = val;
    }
  }
  return out;
}

const SankeyCustomNode = ({
  x,
  y,
  width,
  height,
  payload,
  onClick,
  hoveredNode,
  setHoveredNode,
  showPercentages,
  isMobile,
  ...restProps
}: any) => {
  const isRightSide = !payload.sourceLinks || payload.sourceLinks.length === 0;
  const isDimmed = hoveredNode !== null && hoveredNode !== payload.id;

  const rawLabel = payload.label ?? payload.name ?? '';
  const isMobileSize = isMobile;
  const maxLabelLen = isMobileSize ? 10 : 24;
  let label = rawLabel.length > maxLabelLen ? `${rawLabel.slice(0, maxLabelLen)}..` : rawLabel;

  const isLossOrExpense = payload.id.startsWith('exp_');
  const isGainOrIncome = payload.id.startsWith('inc_');
  const signPrefix = isLossOrExpense ? '-' : (isGainOrIncome ? '+' : '');

  const valueLabel = showPercentages && payload.percentage !== undefined
    ? `${signPrefix}${payload.percentage.toFixed(1)}%`
    : payload.value !== undefined
      ? `${signPrefix}${formatCurrency(payload.value)}`
      : '';

  const group = payload.group as string | undefined;
  const isHub = group === 'hub';
  const hubNetWorthChange = payload.netWorthChange as number | undefined;
  const hubDeltaRatio = isHub && hubNetWorthChange !== undefined && payload.value > 0
    ? Math.min(1, Math.abs(hubNetWorthChange) / payload.value)
    : 0;
  const hubDeltaHeight = Math.max(0, height * hubDeltaRatio);
  const hubDeltaY = hubNetWorthChange !== undefined && hubNetWorthChange < 0
    ? y
    : y + height - hubDeltaHeight;
  const hubDeltaCenterY = hubDeltaY + hubDeltaHeight / 2;
  const hubLabelCenterY = hubDeltaHeight >= 18 ? hubDeltaCenterY : y + height / 2;
  const isBalancing = payload.isBalancingNode;
  const groupStripeColor = group ? GROUP_COLORS[group] : undefined;

  const groupLabelSide = isRightSide ? 'left' : 'right';
  const safeProps = sanitizeRestProps(restProps);

  return (
    <g
      {...safeProps}
      onMouseEnter={(e) => {
        setHoveredNode(payload.id);
        if (safeProps.onMouseEnter) safeProps.onMouseEnter(e);
      }}
      onMouseLeave={(e) => {
        setHoveredNode(null);
        if (safeProps.onMouseLeave) safeProps.onMouseLeave(e);
      }}
      onClick={(e) => {
        if (onClick) onClick(payload.id);
        if (safeProps.onClick) safeProps.onClick(e);
      }}
      className="cursor-pointer"
    >

      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={payload.color || 'var(--color-primary)'}
        rx={4}
        fillOpacity={isDimmed ? 0.3 : 0.95}
        stroke={isBalancing ? '#f59e0b' : 'none'}
        strokeWidth={isBalancing ? 1.5 : 0}
        strokeDasharray={isBalancing ? '4 2' : 'none'}
      />
      {isHub ? (
        <>
          {hubNetWorthChange !== undefined && hubDeltaHeight > 0 && (
            <rect
              x={x}
              y={hubDeltaY}
              width={width}
              height={hubDeltaHeight}
              fill={hubNetWorthChange >= 0 ? '#10b981' : '#ef4444'}
              rx={4}
              fillOpacity={isDimmed ? 0.2 : 0.95}
            />
          )}
          <text
            x={x + width + 8}
            y={hubNetWorthChange !== undefined ? hubLabelCenterY - 9 : y + height / 2}
            textAnchor="start"
            dominantBaseline="central"
            fontSize={isMobileSize ? 8 : 10}
            fontWeight={600}
            fill="currentColor"
            className="fill-foreground select-none"
            style={{ opacity: isDimmed ? 0.3 : 1 }}
          >
            {payload.label}
          </text>
          {hubNetWorthChange !== undefined && (
            <text
              x={x + width + 8}
              y={hubLabelCenterY + 8}
              textAnchor="start"
              dominantBaseline="central"
              fontSize={isMobileSize ? 13 : 17}
              fontWeight={800}
              fill={hubNetWorthChange >= 0 ? '#10b981' : '#ef4444'}
              className="select-none"
              style={{ opacity: isDimmed ? 0.3 : 1 }}
            >
              {hubNetWorthChange >= 0 ? '+' : ''}{formatCurrency(hubNetWorthChange)}
            </text>
          )}
          <text
            x={x + width + 8}
            y={y + height + 12}
            textAnchor="start"
            dominantBaseline="central"
            fontSize={isMobileSize ? 7 : 9}
            fill="currentColor"
            className="fill-muted-foreground select-none"
            style={{ opacity: isDimmed ? 0.3 : 0.75 }}
          >
            Middle Bar: {formatCurrency(payload.value)}
          </text>
        </>
      ) : (
        <>
          <text
            x={isRightSide ? x - 8 : x + width + 8}
            y={y + height / 2 - (valueLabel ? 4 : 0)}
            textAnchor={isRightSide ? 'end' : 'start'}
            dominantBaseline="central"
            fontSize={isMobileSize ? 8 : 10}
            fontWeight={isBalancing ? 400 : 600}
            fill="currentColor"
            className="fill-foreground select-none"
            style={{ opacity: isDimmed ? 0.3 : 1, fontStyle: isBalancing ? 'italic' : 'normal' }}
          >
            {label}
          </text>
          {valueLabel && (
            <text
              x={isRightSide ? x - 8 : x + width + 8}
              y={y + height / 2 + 5}
              textAnchor={isRightSide ? 'end' : 'start'}
              dominantBaseline="central"
              fontSize={isMobileSize ? 7 : 9}
              fill="currentColor"
              className="fill-muted-foreground select-none blur-number"
              style={{ opacity: isDimmed ? 0.3 : 0.75 }}
            >
              {valueLabel}
            </text>
          )}
        </>
      )}
    </g>
  );
};

const SankeyCustomLink = ({
  sourceX,
  sourceY,
  targetX,
  targetY,
  linkWidth,
  index,
  payload,
  onClick,
  hoveredNode,
  source,
  target,
  ...restProps
}: any) => {
  const gradId = `wealth-link-grad-${index}`;

  const midX = (sourceX + targetX) / 2;
  const halfW = linkWidth / 2;

  const path = [
    `M ${sourceX},${sourceY - halfW}`,
    `C ${midX},${sourceY - halfW} ${midX},${targetY - halfW} ${targetX},${targetY - halfW}`,
    `L ${targetX},${targetY + halfW}`,
    `C ${midX},${targetY + halfW} ${midX},${sourceY + halfW} ${sourceX},${sourceY + halfW}`,
    'Z',
  ].join(' ');

  const sourceColor = payload?.source?.color || '#94a3b8';
  const targetColor = payload?.target?.color || '#94a3b8';

  const sourceId = payload?.source?.id;
  const targetId = payload?.target?.id;
  const isDimmed = hoveredNode !== null && sourceId !== hoveredNode && targetId !== hoveredNode;
  const opacity = isDimmed ? 0.08 : 0.45;

  const safeProps = sanitizeRestProps(restProps);

  return (
    <g
      {...safeProps}
      onClick={(e) => {
        if (onClick) onClick(sourceId, targetId);
        if (safeProps.onClick) safeProps.onClick(e);
      }}
      className="cursor-pointer"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={sourceColor} stopOpacity={opacity} />
          <stop offset="100%" stopColor={targetColor} stopOpacity={opacity} />
        </linearGradient>
      </defs>
      <path d={path} fill={`url(#${gradId})`} stroke="none" />
    </g>
  );
};

export function WealthFlowSankey() {
  const router = useRouter();
  const [isCollapsed, setIsCollapsed] = useCardCollapsed('networth-flow-sankey-collapsed');
  const [showFilters, setShowFilters] = useState(false);

  const {
    timeframe,
    setTimeframe,
    windowEnd,
    setWindowEnd,
    nextWindow,
    prevWindow,
    isNextDisabled,
    windowLabel,
    showWindowNav,
    periodOptions,
    dateRange,
  } = useDateWindow('finance:sankey:timeframe', 'finance:sankey:windowEnd', '1m');

  const [wealthFlowData, setWealthFlowData] = useState<WealthFlowData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allAccounts, setAllAccounts] = useState<AccountData[]>([]);
  const [accountsLoaded, setAccountsLoaded] = useState(false);
  const [allCategories, setAllCategories] = useState<any[]>([]);
  const [excludedAccountIds, setExcludedAccountIds] = useState<Set<string>>(new Set());
  const [isMobile, setIsMobile] = useState(false);
  const [showPercentages, setShowPercentages] = useState<boolean>(false);
  const [routeThroughAccounts, setRouteThroughAccounts] = useState<boolean>(false);
  const [routeThroughAccountTypes, setRouteThroughAccountTypes] = useState<boolean>(false);

  const handleRouteThroughAccountsChange = (checked: boolean) => {
    setRouteThroughAccounts(checked);
    if (checked) {
      setRouteThroughAccountTypes(false);
    }
  };

  const handleRouteThroughAccountTypesChange = (checked: boolean) => {
    setRouteThroughAccountTypes(checked);
    if (checked) {
      setRouteThroughAccounts(false);
    }
  };

  const [accountFilterOpen, setAccountFilterOpen] = useState(false);
  const [accountSearch, setAccountSearch] = useState('');
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [themeVersion, setThemeVersion] = useState(0);
  const [chartMounted, setChartMounted] = useState(false);
  const [selectedNodeDetails, setSelectedNodeDetails] = useState<any | null>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const accountFilterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    fetch('/api/accounts')
      .then((r) => (r.ok ? r.json() : []))
      .then((json) => setAllAccounts(Array.isArray(json) ? json : []))
      .catch(() => setAllAccounts([]))
      .finally(() => setAccountsLoaded(true));
  }, []);

  useEffect(() => {
    fetch('/api/categories')
      .then((r) => (r.ok ? r.json() : []))
      .then((json) => setAllCategories(Array.isArray(json) ? json : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (accountFilterRef.current && !accountFilterRef.current.contains(e.target as Node)) {
        setAccountFilterOpen(false);
        setAccountSearch('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    setChartMounted(true);
  }, []);

  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((m) => {
        if (m.attributeName === 'data-theme') {
          setThemeVersion((v) => v + 1);
        }
      });
    });
    observer.observe(document.documentElement, { attributes: true });
    return () => observer.disconnect();
  }, []);

  const getAccountIdsParam = (excluded: Set<string>, accounts: AccountData[]): string => {
    if (excluded.size === 0 || excluded.size >= accounts.length) return '';
    const included = accounts.filter((a) => !excluded.has(a.id));
    return included.length > 0 ? `&accountIds=${included.map((a) => a.id).join(',')}` : '';
  };

  useEffect(() => {
    if (!accountsLoaded) return;

    let isCurrent = true;

    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const acctParam = getAccountIdsParam(excludedAccountIds, allAccounts);
        const url = `/api/wealth-flow?startDate=${dateRange.start}&endDate=${dateRange.end}${acctParam}`;

        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`Failed to load wealth flow data (${res.status})`);
        }
        const data = await res.json();
        if (isCurrent) {
          setWealthFlowData(data);
        }
      } catch (err) {
        if (isCurrent) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (isCurrent) {
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      isCurrent = false;
    };
  }, [timeframe, windowEnd, excludedAccountIds, allAccounts, accountsLoaded]);

  const getAccountIdsForClass = useCallback((classKey: string) => {
    return allAccounts
      .filter((a) => {
        const t = a.type.toLowerCase();
        if (classKey === 'cash') {
          return ['checking', 'savings', 'hsachecking'].includes(t);
        }
        if (classKey === 'retirement') {
          return ['retirement', 'rothira', 'traditionalira', '401k', '403b', 'sepira', 'simpleira', 'hsa', 'health', '529'].includes(t);
        }
        if (classKey === 'brokerage') {
          return ['investment', 'brokerage', 'otherinvestment', 'otherInvestment', 'crypto', 'metals'].includes(t);
        }
        if (classKey === 'realestate') {
          return ['realestate', 'primaryhome', 'secondaryhome', 'rentalproperty', 'commercial', 'land', 'otherrealestate', 'mortgage'].includes(t);
        }
        if (classKey === 'liability') {
          const isLiab = ['credit', 'loan', 'mortgage', 'otherliability', 'otherLiability', 'studentloan', 'autoloan', 'otherloan'].includes(t);
          return isLiab && t !== 'mortgage';
        }
        return false;
      })
      .map((a) => a.id)
      .join(',');
  }, [allAccounts]);

  const navigateToTransactions = useCallback(
    (filters: { categoryId?: string; categoryIds?: string; type?: string; accountIds?: string }) => {
      const params = new URLSearchParams();
      params.set('startDate', dateRange.start);
      params.set('endDate', dateRange.end);

      if (filters.categoryId) params.set('categoryId', filters.categoryId);
      if (filters.categoryIds) params.set('categoryIds', filters.categoryIds);
      if (filters.type) params.set('type', filters.type);
      if (filters.accountIds) params.set('accountIds', filters.accountIds);

      router.push(`/transactions?${params.toString()}`);
    },
    [timeframe, windowEnd, router]
  );

  const displayWealthFlowData = useMemo(() => {
    if (!wealthFlowData) return null;
    if (routeThroughAccounts) {
      return routeFlowsThroughAccounts(wealthFlowData);
    }
    if (routeThroughAccountTypes) {
      return routeFlowsThroughAccountTypes(wealthFlowData);
    }
    return wealthFlowData;
  }, [wealthFlowData, routeThroughAccounts, routeThroughAccountTypes]);

  const routeFlowElement = useCallback((elementId: string) => {
    if (elementId.startsWith('account_in_') || elementId.startsWith('account_out_')) {
      const accountId = elementId.replace(/^account_(in|out)_/, '');
      navigateToTransactions({ accountIds: accountId });
      return;
    }

    if (elementId.startsWith('type_in_') || elementId.startsWith('type_out_')) {
      const node = displayWealthFlowData?.nodes.find(n => n.id === elementId);
      if (node && node.accounts && node.accounts.length > 0) {
        const accountIds = node.accounts.map(a => a.id).join(',');
        navigateToTransactions({ accountIds });
      }
      return;
    }

    // 1. Snapshot-based nodes open detail modal
    const snapshotNodeIds = [
      'inc_market_gains',
      'exp_market_losses',
      'inc_real_estate_appreciation',
      'exp_real_estate_depreciation',
      'inc_balance_adjustments',
      'exp_balance_adjustments',
      'hub_net_worth_change'
    ];

    if (snapshotNodeIds.includes(elementId)) {
      const node = displayWealthFlowData?.nodes.find(n => n.id === elementId);
      if (node) {
        setSelectedNodeDetails(node);
      }
      return;
    }

    // 2. Transaction-based nodes navigate to /transactions
    if (elementId.startsWith('inc_')) {
      const catId = elementId.substring(4);
      if (catId === 'uncategorized_tx') {
        navigateToTransactions({ type: 'income' });
      } else {
        navigateToTransactions({ categoryId: catId });
      }
      return;
    }

    if (elementId.startsWith('exp_')) {
      const catId = elementId.substring(4);
      if (catId === 'uncategorized_tx' || catId === 'expenses') {
        navigateToTransactions({ type: 'expense' });
      } else {
        navigateToTransactions({ categoryId: catId });
      }
      return;
    }
  }, [navigateToTransactions, displayWealthFlowData]);

  const handleNodeClick = useCallback(
    (nodeId: string) => {
      routeFlowElement(nodeId);
    },
    [routeFlowElement]
  );

  const handleLinkClick = useCallback(
    (sourceId: string, targetId: string) => {
      if (targetId && targetId !== 'hub_net_worth_change') {
        routeFlowElement(targetId);
      } else if (sourceId && sourceId !== 'hub_net_worth_change') {
        routeFlowElement(sourceId);
      }
    },
    [routeFlowElement]
  );



  const processedData = useMemo(() => {
    if (!displayWealthFlowData || !displayWealthFlowData.nodes) return { nodes: [], links: [] };

    const nodes = displayWealthFlowData.nodes.map((n) => ({ ...n, name: n.label || n.id }));
    const links = displayWealthFlowData.links
      .map((l) => {
        const sourceIndex = nodes.findIndex((n) => n.id === l.source);
        const targetIndex = nodes.findIndex((n) => n.id === l.target);
        return { source: sourceIndex, target: targetIndex, value: l.value };
      })
      .filter((l) => l.source !== -1 && l.target !== -1 && l.value > 0);

    return { nodes, links };
  }, [displayWealthFlowData, themeVersion]);

  const columnMetrics = useMemo(() => {
    if (!processedData || processedData.nodes.length === 0) return null;

    const nodes = processedData.nodes;
    const links = processedData.links;

    const columns = new Array(nodes.length).fill(-1);
    const incomingCount = new Array(nodes.length).fill(0);
    links.forEach((l) => {
      incomingCount[l.target]++;
    });

    const queue: number[] = [];
    nodes.forEach((n, idx) => {
      if (incomingCount[idx] === 0) {
        columns[idx] = 0;
        queue.push(idx);
      }
    });

    let iterations = 0;
    const maxIterations = nodes.length * 10;
    while (queue.length > 0) {
      iterations++;
      if (iterations > maxIterations) {
        console.error('Cycle detected in Wealth Flow Sankey graph! Aborting topological sort.');
        break;
      }
      const u = queue.shift()!;
      links.forEach((l) => {
        if (l.source === u) {
          if (columns[l.target] < columns[u] + 1) {
            columns[l.target] = columns[u] + 1;
            queue.push(l.target);
          }
        }
      });
    }

    const maxCol = Math.max(...columns);
    const metrics = Array.from({ length: maxCol + 1 }, () => ({
      count: 0,
      totalValue: 0,
    }));

    nodes.forEach((node, idx) => {
      const col = columns[idx];
      if (col >= 0) {
        metrics[col].count++;
        metrics[col].totalValue += node.value || 0;
      }
    });

    return { columns, metrics };
  }, [processedData]);

  const margin = useMemo(
    () =>
      isMobile
        ? { top: 15, right: 75, bottom: 15, left: 75 }
        : { top: 25, right: 180, bottom: 25, left: 180 },
    [isMobile]
  );

  const nodePadding = isMobile ? 14 : 26;

  const chartHeight = useMemo(() => {
    if (!columnMetrics || columnMetrics.metrics.length === 0) {
      return 520;
    }
    const maxNodes = Math.max(...columnMetrics.metrics.map((m) => m.count));
    const minNodeHeight = isMobile ? 15 : 20;
    const requiredUsableHeight = maxNodes * minNodeHeight + (maxNodes - 1) * nodePadding;
    const verticalMargin = margin.top + margin.bottom;
    const calculatedHeight = requiredUsableHeight + verticalMargin;
    return Math.max(520, calculatedHeight + 30);
  }, [columnMetrics, isMobile, nodePadding, margin]);

  const usableHeight = chartHeight - margin.top - margin.bottom;

  const scale = useMemo(() => {
    if (!columnMetrics || columnMetrics.metrics.length === 0) return 0;

    let minScale = Infinity;
    columnMetrics.metrics.forEach((metric) => {
      if (metric.totalValue > 0) {
        const padding = (metric.count - 1) * nodePadding;
        const colScale = Math.max(0, usableHeight - padding) / metric.totalValue;
        if (colScale < minScale) {
          minScale = colScale;
        }
      }
    });

    return minScale === Infinity ? 0 : minScale;
  }, [columnMetrics, usableHeight, nodePadding]);

  const sankeyNode = useMemo(
    () => (
      <SankeyCustomNode
        onClick={handleNodeClick}
        hoveredNode={hoveredNode}
        setHoveredNode={setHoveredNode}
        showPercentages={showPercentages}
        isMobile={isMobile}
      />
    ),
    [
      handleNodeClick,
      hoveredNode,
      setHoveredNode,
      showPercentages,
      themeVersion,
      isMobile,
    ]
  );

  const sankeyLink = useMemo(
    () => (
      <SankeyCustomLink
        onClick={handleLinkClick}
        hoveredNode={hoveredNode}
      />
    ),
    [
      handleLinkClick,
      hoveredNode,
      themeVersion,
    ]
  );

  const sankeyTooltip = useMemo(
    () => (
      <Tooltip
        isAnimationActive={false}
        allowEscapeViewBox={{ x: true, y: true }}
        content={(props: any) => {
          const { active, payload, x, y } = props;
          if (!active || !payload || !payload.length) return null;
          const data = payload[0].payload;

          const isLink =
            data.source &&
            typeof data.source === 'object' &&
            data.target &&
            typeof data.target === 'object';

          if (isLink) {
            const linkValue = data.value;
            const sourceNode = data.source;
            const targetNode = data.target;
            const sourceTotal = sourceNode.value || 0;
            const targetTotal = targetNode.value || 0;
            const pctOfSource = sourceTotal > 0 ? (linkValue / sourceTotal) * 100 : 0;
            const pctOfTarget = targetTotal > 0 ? (linkValue / targetTotal) * 100 : 0;

            return (
              <ChartTooltip x={x} y={y}>
                <TooltipHeader>
                  {sourceNode.label ?? sourceNode.name} → {targetNode.label ?? targetNode.name}
                </TooltipHeader>
                <TooltipRow label="Amount" value={formatCurrency(linkValue)} />
                {showPercentages && (
                  <>
                    <TooltipRow label="Of Source" value={`${pctOfSource.toFixed(1)}%`} />
                    <TooltipRow label="Of Target" value={`${pctOfTarget.toFixed(1)}%`} />
                  </>
                )}
              </ChartTooltip>
            );
          } else {
            const displayValue =
              showPercentages && data.percentage !== undefined
                ? `${data.percentage.toFixed(1)}%`
                : formatCurrency(data.value);

            const accounts = data.accounts as any[] | undefined;
            const group = data.group as string | undefined;
            const groupLabel = group ? GROUP_LABELS[group] : undefined;
            const hubNetWorthChange = data.netWorthChange as number | undefined;

            return (
              <ChartTooltip x={x} y={y}>
                <TooltipHeader>
                  {data.label ?? data.name}
                </TooltipHeader>
                {groupLabel && (
                  <TooltipRow label="Category" value={groupLabel} />
                )}
                {hubNetWorthChange !== undefined ? (
                  <>
                    <TooltipRow
                      label={hubNetWorthChange >= 0 ? 'Net Worth Increase' : 'Net Worth Decrease'}
                      value={`${hubNetWorthChange >= 0 ? '+' : ''}${formatCurrency(hubNetWorthChange)}`}
                    />
                    <TooltipRow label="Middle Bar" value={formatCurrency(data.value)} />
                  </>
                ) : data.contributions !== undefined && data.marketGrowth !== undefined ? (
                  <>
                    <TooltipRow label="Contributions" value={formatCurrency(data.contributions)} />
                    <TooltipRow label="Market Growth" value={formatCurrency(data.marketGrowth)} />
                    <div className="border-t border-border/30 my-1" />
                    <TooltipRow label="Total Change" value={formatCurrency(data.value)} />
                  </>
                ) : (
                  <TooltipRow
                    label={showPercentages ? 'Percentage' : 'Total'}
                    value={displayValue}
                  />
                )}
                {accounts && accounts.length > 0 && (
                  <div className="border-t border-border/30 mt-2 pt-2 space-y-1">
                    <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Account Breakdown
                    </div>
                    {accounts.slice(0, 6).map((a) => (
                      <div key={a.id} className="flex justify-between gap-3 text-xs">
                        <span className="text-muted-foreground truncate max-w-[120px]">
                          {a.name}
                        </span>
                        <span className={`font-mono tabular-nums ${a.delta >= 0 ? 'text-chart-1' : 'text-destructive'}`}>
                          {a.delta >= 0 ? '+' : ''}{formatCurrency(a.delta)}
                        </span>
                      </div>
                    ))}
                    {accounts.length > 6 && (
                      <div className="text-[10px] text-muted-foreground italic">
                        +{accounts.length - 6} more accounts
                      </div>
                    )}
                  </div>
                )}
              </ChartTooltip>
            );
          }
        }}
      />
    ),
    [showPercentages, themeVersion, wealthFlowData]
  );

  const toggleAccount = (id: string) => {
    setExcludedAccountIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const clearExcluded = () => {
    setExcludedAccountIds(new Set());
  };

  const selectOnly = (id: string) => {
    const next = new Set(allAccounts.map((a) => a.id));
    next.delete(id);
    setExcludedAccountIds(next);
  };

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm">
        <CollapsibleCardHeader
          isCollapsed={isCollapsed}
          onToggle={setIsCollapsed}
          title="Wealth Flow Diagram"
        />
        {!isCollapsed && <LoadingSpinner category="sankey" className="h-[450px]" />}
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm">
        <CollapsibleCardHeader
          isCollapsed={isCollapsed}
          onToggle={setIsCollapsed}
          title="Wealth Flow Diagram"
        />
        {!isCollapsed && (
          <div className="p-5">
            <ChartEmptyState variant="error" error={error} />
          </div>
        )}
      </div>
    );
  }

  const allAccountsExcluded =
    allAccounts.length > 0 && excludedAccountIds.size >= allAccounts.length;
  const filteredAccountsList = allAccounts.filter((a) =>
    a.name.toLowerCase().includes(accountSearch.toLowerCase())
  );

  const summary = wealthFlowData?.summary;

  return (
    <>
      {/* ── Main Sankey Card ─────────────────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-xl shadow-sm">
        <CollapsibleCardHeader
          isCollapsed={isCollapsed}
          onToggle={setIsCollapsed}
          title={
            <div className="flex items-center gap-2">
              <ArrowLeftRight className="w-4 h-4 text-primary shrink-0" />
              <span>Wealth Building Flow</span>
            </div>
          }
        />

        {!isCollapsed && (
          <>
            <CollapsibleFilterPanel
              isOpen={showFilters}
              onToggle={() => setShowFilters(!showFilters)}
              feedback={
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider">
                    {timeframe.toUpperCase()}
                  </span>
                  <span className="bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider">
                    {showPercentages ? '%' : '$'}
                  </span>
                  {routeThroughAccounts && (
                    <span className="bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider">
                      ACCOUNT ROUTING
                    </span>
                  )}
                  {routeThroughAccountTypes && (
                    <span className="bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider">
                      TYPE ROUTING
                    </span>
                  )}
                  {excludedAccountIds.size > 0 && (
                    <span
                      className="goal-pill px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider"
                      style={{ '--goal-color': 'var(--chart-3)' } as React.CSSProperties}
                    >
                      {allAccounts.length - excludedAccountIds.size} ACCOUNTS
                    </span>
                  )}

                </div>
              }
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
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-4 p-3 bg-muted/20 border border-border/20 rounded-xl">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <TimeRangeFilter
                      value={timeframe}
                      onChange={setTimeframe}
                    />
                  </div>

                  <div className="flex items-center gap-2 border-l border-border/30 pl-4">
                    <button
                      onClick={() => setShowPercentages(!showPercentages)}
                      className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
                        showPercentages
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background hover:bg-muted text-muted-foreground border-border'
                      }`}
                    >
                      Show percentages (%)
                    </button>
                  </div>

                  <div className="flex items-center gap-2 border-l border-border/30 pl-4">
                    <Switch
                      checked={routeThroughAccounts}
                      onCheckedChange={handleRouteThroughAccountsChange}
                      id="wealth-flow-account-routing"
                    />
                    <label
                      htmlFor="wealth-flow-account-routing"
                      className="text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer"
                    >
                      Route through accounts
                    </label>
                  </div>

                  <div className="flex items-center gap-2 border-l border-border/30 pl-4">
                    <Switch
                      checked={routeThroughAccountTypes}
                      onCheckedChange={handleRouteThroughAccountTypesChange}
                      id="wealth-flow-type-routing"
                    />
                    <label
                      htmlFor="wealth-flow-type-routing"
                      className="text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer"
                    >
                      Route through account types
                    </label>
                  </div>
                </div>

                {allAccounts.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Filters:
                    </span>
                    <div className="relative" ref={accountFilterRef}>
                      <button
                        onClick={() => setAccountFilterOpen(!accountFilterOpen)}
                        className="text-xs bg-background border border-border rounded-lg px-3 py-1.5 hover:bg-muted text-foreground flex items-center gap-1.5"
                      >
                        <span>
                          Accounts
                          {excludedAccountIds.size > 0
                            ? ` (${allAccounts.length - excludedAccountIds.size})`
                            : ''}
                        </span>
                      </button>

                      {accountFilterOpen && (
                        <div className="absolute left-0 mt-1 w-64 bg-card border border-border rounded-xl shadow-xl z-50 p-2 space-y-2">
                          <div className="relative flex items-center bg-muted/30 border border-border rounded-lg px-2 py-1">
                            <Search className="w-3.5 h-3.5 text-muted-foreground mr-1.5 shrink-0" />
                            <input
                              type="text"
                              placeholder="Search accounts..."
                              value={accountSearch}
                              onChange={(e) => setAccountSearch(e.target.value)}
                              className="bg-transparent border-none text-xs text-foreground focus:outline-none w-full"
                            />
                          </div>

                          <div className="max-h-60 overflow-y-auto space-y-0.5">
                            {filteredAccountsList.map((a) => {
                              const isExcluded = excludedAccountIds.has(a.id);
                              return (
                                <div
                                  key={a.id}
                                  className="flex items-center justify-between p-1.5 hover:bg-muted rounded-lg text-xs cursor-pointer"
                                  onClick={() => toggleAccount(a.id)}
                                >
                                  <span className={isExcluded ? 'text-muted-foreground/60' : 'text-foreground'}>
                                    {a.name}
                                  </span>
                                  <div className="flex items-center gap-1">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        selectOnly(a.id);
                                      }}
                                      className="text-[10px] text-primary hover:underline px-1 py-0.5"
                                    >
                                      only
                                    </button>
                                    {isExcluded ? (
                                      <EyeOff className="w-3.5 h-3.5 text-muted-foreground/40" />
                                    ) : (
                                      <Eye className="w-3.5 h-3.5 text-primary" />
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {excludedAccountIds.size > 0 && (
                            <button
                              onClick={clearExcluded}
                              className="w-full text-[10px] bg-muted/40 text-primary border border-border hover:bg-muted text-center py-1 rounded"
                            >
                              Reset Account Filters
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </CollapsibleFilterPanel>

            <div className="p-4 md:p-6 pt-0">
              {/* ── Net Worth Summary Metric Cards ───────────────────────────────────── */}
              {summary && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Beginning Net Worth
                    </span>
                    <div className="text-xl font-bold mt-1.5 font-mono text-foreground select-all">
                      {formatCurrency(summary.beginningNetWorth)}
                    </div>
                  </div>
                  <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Ending Net Worth
                    </span>
                    <div className="text-xl font-bold mt-1.5 font-mono text-foreground select-all">
                      {formatCurrency(summary.endingNetWorth)}
                    </div>
                  </div>
                  <div className="bg-card border border-border rounded-xl p-4 shadow-sm relative overflow-hidden">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Change in Net Worth
                    </span>
                    <div
                      className={`text-xl font-bold mt-1.5 font-mono select-all flex items-baseline gap-2 ${
                        summary.netWorthChange >= 0 ? 'text-emerald-500' : 'text-rose-500'
                      }`}
                    >
                      {summary.netWorthChange >= 0 ? '+' : ''}
                      {formatCurrency(summary.netWorthChange)}
                      <span className="text-xs font-medium bg-muted px-2 py-0.5 rounded text-muted-foreground font-sans">
                        {summary.percentChange >= 0 ? '+' : ''}
                        {summary.percentChange.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {allAccountsExcluded ? (
                <div className="h-[400px] flex items-center justify-center">
                  <ChartEmptyState
                    variant="empty"
                    description="All accounts are excluded. Adjust your filters."
                  />
                </div>
              ) : processedData.nodes.length === 0 ? (
                <div className="h-[400px] flex items-center justify-center">
                  <ChartEmptyState
                    variant="nodata"
                    description="No data available for the selected range."
                  />
                </div>
              ) : (
                <div ref={chartContainerRef} style={{ height: chartHeight }} className="w-full min-w-0">
                  {chartMounted && chartHeight > 0 && (
                    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                      <Sankey
                        data={processedData}
                        node={sankeyNode}
                        link={sankeyLink}
                        nodeWidth={12}
                        nodePadding={nodePadding}
                        margin={margin}
                        sort={false}
                        align="left"
                      >
                        {sankeyTooltip}
                      </Sankey>
                    </ResponsiveContainer>
                  )}
                </div>
              )}

              {/* ── Net Worth Drivers Table ────────────────────────────────────── */}
              {summary && processedData.nodes.length > 0 && (
                <div className="mt-6 bg-card border border-border/50 rounded-xl p-5">
                  <h4 className="text-sm font-semibold text-foreground mb-3">
                    Net Worth Drivers <span className="font-normal text-muted-foreground">for {windowLabel}</span>
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <DriverRow label="Income & Dividends" value={summary.totalIncome} positive />
                      <DriverRow label="Expenses" value={summary.totalExpenses} negative />
                      <DriverRow label="Income Surplus" value={summary.totalIncome - summary.totalExpenses}
                        positive={summary.totalIncome >= summary.totalExpenses} />
                    </div>
                    <div className="space-y-2">
                      <DriverRow label="Market Gains" value={summary.totalMarketGains} positive />
                      <DriverRow label="Market Losses" value={summary.totalMarketLosses} negative />
                      <DriverRow label="Net Market"
                        value={summary.totalMarketGains - summary.totalMarketLosses}
                        positive={summary.totalMarketGains >= summary.totalMarketLosses} />
                    </div>
                    <div className="space-y-2">
                      <DriverRow label="Account Savings" value={summary.totalSavings} positive />
                      <DriverRow label="Account Drawdowns" value={summary.totalDrawdowns} negative />
                      <div className="pt-1 border-t border-border/40 mt-1">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-semibold text-foreground">Net Worth Change</span>
                          <span
                            className={`text-sm font-bold font-mono ${
                              summary.netWorthChange >= 0 ? 'text-emerald-500' : 'text-rose-500'
                            }`}
                          >
                            {summary.netWorthChange >= 0 ? '+' : ''}{formatCurrency(summary.netWorthChange)}
                            <span className="text-[10px] ml-1 opacity-70">
                              ({summary.percentChange >= 0 ? '+' : ''}{summary.percentChange.toFixed(1)}%)
                            </span>
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {selectedNodeDetails && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          onClick={() => setSelectedNodeDetails(null)}
          style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
        >
          <div
            className="bg-background border border-border rounded-xl shadow-2xl w-full max-w-xl max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-border bg-muted/20">
              <h3 className="text-base font-semibold text-foreground">
                {selectedNodeDetails.label ?? selectedNodeDetails.name} Details
              </h3>
              <button
                onClick={() => setSelectedNodeDetails(null)}
                className="text-xs text-muted-foreground hover:text-foreground bg-muted hover:bg-muted/80 rounded-lg px-2.5 py-1 transition-colors"
              >
                Close
              </button>
            </div>

            <div className="p-5 space-y-4 bg-background">
              <div className="flex justify-between items-center bg-muted/20 border border-border/40 rounded-xl p-4">
                <span className="text-sm text-muted-foreground font-semibold">Total Change</span>
                <span
                  className={`text-lg font-bold font-mono ${
                    (selectedNodeDetails.netWorthChange ?? selectedNodeDetails.value) >= 0 ? 'text-emerald-500' : 'text-rose-500'
                  }`}
                >
                  {selectedNodeDetails.netWorthChange !== undefined
                    ? selectedNodeDetails.netWorthChange >= 0 ? '+' : ''
                    : selectedNodeDetails.id.startsWith('exp_') ? '-' : '+'}
                  {formatCurrency(selectedNodeDetails.netWorthChange ?? selectedNodeDetails.value)}
                </span>
              </div>

              {selectedNodeDetails.accounts && selectedNodeDetails.accounts.length > 0 ? (
                <div className="border border-border/40 rounded-xl overflow-hidden">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead className="bg-muted/30 text-muted-foreground uppercase tracking-wider text-[10px] font-semibold border-b border-border/40">
                      <tr>
                        <th className="p-3">Account</th>
                        <th className="p-3 text-right">Start Balance</th>
                        <th className="p-3 text-right">End Balance</th>
                        <th className="p-3 text-right">Net Change</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/30">
                      {selectedNodeDetails.accounts.map((acc: any) => {
                        const showSign = acc.delta >= 0 ? '+' : '';
                        return (
                          <tr key={acc.id} className="hover:bg-muted/10 transition-colors">
                            <td className="p-3 font-medium text-foreground">{acc.name}</td>
                            <td className="p-3 text-right font-mono text-muted-foreground">{formatCurrency(acc.beg)}</td>
                            <td className="p-3 text-right font-mono text-muted-foreground">{formatCurrency(acc.end)}</td>
                            <td className={`p-3 text-right font-mono font-semibold ${acc.delta >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                              {showSign}{formatCurrency(acc.delta)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-4">
                  No account breakdown available for this node.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function DriverRow({ label, value, positive, negative }: { label: string; value: number; positive?: boolean; negative?: boolean }) {
  const isPositive = positive === true;
  const isNegative = negative === true;
  const colorClass = isPositive ? 'text-chart-1' : isNegative ? 'text-destructive' : 'text-foreground';

  return (
    <div className="flex justify-between items-center">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-xs font-mono tabular-nums ${colorClass}`}>
        {isPositive && value > 0 ? '+' : isNegative && value > 0 ? '-' : ''}
        {formatCurrency(value)}
      </span>
    </div>
  );
}
