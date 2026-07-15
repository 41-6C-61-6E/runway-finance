'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { ResponsiveContainer, Sankey, Tooltip } from 'recharts';
import { formatCurrency } from '@/lib/utils/format';
import { ChartTooltip, TooltipRow, TooltipHeader } from '@/components/charts/chart-tooltip';
import { ChartEmptyState } from '@/components/charts/chart-empty-state';
import { TimeRangeFilter, type TimeRange } from '@/components/charts/chart-filters';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useCardCollapsed } from '@/lib/hooks/use-card-collapsed';
import { CollapsibleCardHeader } from '@/components/ui/collapsible-card-header';
import { CollapsibleFilterPanel } from '@/components/ui/collapsible-filter-panel';
import { Switch } from '@/components/ui/switch';
import { ArrowLeftRight, HelpCircle, Search, Eye, EyeOff, TrendingUp, TrendingDown, Info, ChevronDown } from 'lucide-react';
import { useDateWindow } from '@/lib/hooks/use-date-window';
import { DateWindowNav } from '@/components/charts/date-window-nav';
import type { WealthFlowData, WealthFlowNode, WealthFlowSummary, WealthFlowAccountDetail } from '@/lib/types/financial';

interface AccountData {
  id: string;
  name: string;
  type: string;
}

interface FlowNode {
  id: string;
  label: string;
  name?: string;
  color: string;
  value: number;
  percentage: number;
  type?: string;
  accountGroup?: string;
  accounts?: WealthFlowAccountDetail[];
  netWorthChange?: number;
  visualImbalance?: number;
  description?: string;
}

interface FlowLink {
  source: string | number;
  target: string | number;
  value: number;
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
  x, y, width, height, payload,
  onClick, hoveredNode, setHoveredNode,
  showPercentages, isMobile, ...restProps
}: any) => {
  const isRightSide = !payload.sourceLinks || payload.sourceLinks.length === 0;
  const isDimmed = hoveredNode !== null && hoveredNode !== payload.id;

  const rawLabel = payload.label ?? payload.name ?? '';
  const maxLabelLen = isMobile ? 10 : 24;
  const label = rawLabel.length > maxLabelLen ? `${rawLabel.slice(0, maxLabelLen)}..` : rawLabel;

  const nodeType = payload.type as string | undefined;
  const isIncrease = nodeType === 'increase';
  const isDecrease = nodeType === 'decrease';
  const isHub = nodeType === 'hub';

  const signPrefix = isIncrease ? '+' : (isDecrease ? '-' : '');
  const valueLabel = showPercentages && payload.percentage !== undefined
    ? `${signPrefix}${payload.percentage.toFixed(1)}%`
    : payload.value !== undefined ? `${signPrefix}${formatCurrency(payload.value)}` : '';

  const hubVisualImbalance = payload.visualImbalance as number | undefined;
  const isNetSurplus = (hubVisualImbalance || 0) >= 0;
  const maxFlow = payload.value || 0;
  const imbalance = Math.abs(hubVisualImbalance || 0);

  const hubDeltaRatio = isHub && maxFlow > 0 ? Math.min(1, imbalance / maxFlow) : 0;
  const hubDeltaHeight = Math.max(0, height * hubDeltaRatio);
  const hubDeltaY = y + height - hubDeltaHeight;
  const hubDeltaCenterY = hubDeltaY + hubDeltaHeight / 2;

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
        x={x} y={y} width={width} height={height}
        fill={payload.color || 'var(--color-primary)'}
        rx={0}
        fillOpacity={isDimmed ? 0.3 : 0.95}
        stroke={isHub ? (payload.color || '#0ea5e9') : 'none'}
        strokeWidth={isHub ? 1.5 : 0}
      />

      {isHub && (
        <>
          {hubVisualImbalance !== undefined && hubDeltaHeight > 0 && (
            <rect
              x={x} y={hubDeltaY} width={width} height={hubDeltaHeight}
              fill={hubVisualImbalance >= 0 ? '#10b981' : '#ef4444'}
              rx={0}
              fillOpacity={isDimmed ? 0.2 : 1}
            />
          )}
          <foreignObject
            x={x + width + 4}
            y={hubDeltaCenterY - 24}
            width={400}
            height={50}
            pointerEvents="none"
            style={{ opacity: isDimmed ? 0.3 : 1 }}
          >
            <div style={{
              display: 'inline-block', width: 'fit-content',
              background: 'var(--background)',
              border: '1px solid var(--border)',
              borderRadius: '6px', padding: '4px 10px',
            }}>
              <div style={{ fontSize: isMobile ? 8 : 10, fontWeight: 600, lineHeight: 1.4 }}>
                {payload.label}
              </div>
              {hubVisualImbalance !== undefined && (
                <div className="blur-number" style={{
                  fontSize: isMobile ? 13 : 17, fontWeight: 800,
                  color: hubVisualImbalance >= 0 ? '#10b981' : '#ef4444',
                  lineHeight: 1.3,
                }}>
                  {hubVisualImbalance >= 0 ? '+' : ''}{formatCurrency(hubVisualImbalance)}
                </div>
              )}
            </div>
          </foreignObject>
        </>
      )}

      {!isHub && (
        <>
          <text
            x={isRightSide ? x - 8 : x + width + 8}
            y={y + height / 2 - (valueLabel ? 4 : 0)}
            textAnchor={isRightSide ? 'end' : 'start'}
            dominantBaseline="central"
            fontSize={isMobile ? 8 : 10}
            fontWeight={600}
            fill="currentColor"
            className="fill-foreground select-none"
            style={{ opacity: isDimmed ? 0.3 : 1 }}
          >
            {label}
          </text>
          {valueLabel && (
            <text
              x={isRightSide ? x - 8 : x + width + 8}
              y={y + height / 2 + 5}
              textAnchor={isRightSide ? 'end' : 'start'}
              dominantBaseline="central"
              fontSize={isMobile ? 7 : 9}
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
  sourceX, sourceY, targetX, targetY, linkWidth, index,
  payload, onClick, hoveredNode, ...restProps
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

function routeFlowsThroughAccounts(data: WealthFlowData): WealthFlowData {
  const accountNodes = new Map<string, WealthFlowNode>();
  const newLinks: Array<{ source: string; target: string; value: number }> = [];

  for (const link of data.links) {
    const sourceNode = data.nodes.find(n => n.id === link.source);
    const targetNode = data.nodes.find(n => n.id === link.target);

    const linkToHub = link.target === 'hub_net_worth_change' && sourceNode?.type === 'increase';
    const linkFromHub = link.source === 'hub_net_worth_change' && targetNode?.type === 'decrease';

    if (linkToHub && sourceNode?.accounts && sourceNode.accounts.length > 0) {
      for (const acc of sourceNode.accounts) {
        const nodeId = `account_in_${acc.id}`;
        const flowValue = Math.abs(acc.signedNWDelta);
        if (flowValue <= 0.01) continue;

        if (!accountNodes.has(nodeId)) {
          accountNodes.set(nodeId, {
            id: nodeId, label: acc.name, color: sourceNode.color,
            value: 0, percentage: 0, type: 'increase',
            accounts: [acc],
          });
        }
        const n = accountNodes.get(nodeId)!;
        n.value += flowValue;

        newLinks.push({ source: link.source, target: nodeId, value: flowValue });
        newLinks.push({ source: nodeId, target: link.target, value: flowValue });
      }
    } else if (linkFromHub && targetNode?.accounts && targetNode.accounts.length > 0) {
      for (const acc of targetNode.accounts) {
        const nodeId = `account_out_${acc.id}`;
        const flowValue = Math.abs(acc.signedNWDelta);
        if (flowValue <= 0.01) continue;

        if (!accountNodes.has(nodeId)) {
          accountNodes.set(nodeId, {
            id: nodeId, label: acc.name, color: targetNode.color,
            value: 0, percentage: 0, type: 'decrease',
            accounts: [{ ...acc, signedNWDelta: flowValue }],
          });
        }
        const n = accountNodes.get(nodeId)!;
        n.value += flowValue;

        newLinks.push({ source: link.source, target: nodeId, value: flowValue });
        newLinks.push({ source: nodeId, target: link.target, value: flowValue });
      }
    } else {
      newLinks.push(link);
    }
  }

  const newNodes = [...data.nodes];
  for (const [, n] of accountNodes) {
    newNodes.push(n);
  }

  const hubNode = newNodes.find(n => n.id === 'hub_net_worth_change');
  if (hubNode) {
    const totalIn = newLinks.filter(l => l.target === 'hub_net_worth_change').reduce((s, l) => s + l.value, 0);
    const totalOut = newLinks.filter(l => l.source === 'hub_net_worth_change').reduce((s, l) => s + l.value, 0);
    hubNode.value = Math.max(totalIn, totalOut, Math.abs(hubNode.netWorthChange || 0)) || 0.01;
    hubNode.visualImbalance = totalIn - totalOut;
  }

  const maxVal = Math.max(...newNodes.map(n => n.value), 1);
  for (const n of newNodes) {
    n.percentage = (n.value / maxVal) * 100;
  }

  return { ...data, nodes: newNodes, links: newLinks };
}

function DetailModal({
  node, onClose, allAccounts,
}: {
  node: WealthFlowNode | null;
  onClose: () => void;
  allAccounts: AccountData[];
}) {
  if (!node) return null;

  const isHub = node.type === 'hub';
  const isIncrease = node.type === 'increase';
  const isDecrease = node.type === 'decrease';

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-background border border-border rounded-xl shadow-2xl w-full max-w-xl max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-border bg-muted/20">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ background: node.color }} />
            <h3 className="text-base font-semibold text-foreground">
              {node.label}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-xs text-muted-foreground hover:text-foreground bg-muted hover:bg-muted/80 rounded-lg px-2.5 py-1 transition-colors"
          >
            Close
          </button>
        </div>

        <div className="p-5 space-y-4 bg-background">
          {node.description && (
            <p className="text-xs text-muted-foreground leading-relaxed bg-muted/30 border border-border/20 rounded-xl p-3 flex items-start gap-2">
              <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground/60" />
              {node.description}
            </p>
          )}

          {isHub && (
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-center">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Increases</div>
                <div className="text-sm font-bold text-emerald-500 font-mono mt-1 blur-number">
                  +{formatCurrency(node.visualImbalance !== undefined && node.visualImbalance >= 0 ? node.visualImbalance : 0)}
                </div>
              </div>
              <div className="bg-card border border-border/40 rounded-xl p-3 text-center">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Net Change</div>
                <div className={`text-sm font-bold font-mono mt-1 blur-number ${(node.netWorthChange || 0) >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                  {(node.netWorthChange || 0) >= 0 ? '+' : ''}{formatCurrency(node.netWorthChange || 0)}
                </div>
              </div>
              <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 text-center">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Decreases</div>
                <div className="text-sm font-bold text-rose-500 font-mono mt-1 blur-number">
                  -{formatCurrency(node.visualImbalance !== undefined && node.visualImbalance < 0 ? Math.abs(node.visualImbalance) : 0)}
                </div>
              </div>
            </div>
          )}

          {!isHub && (
            <div className={`flex justify-between items-center rounded-xl p-4 ${
              isIncrease ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-rose-500/10 border border-rose-500/20'
            }`}>
              <span className="text-sm text-muted-foreground font-semibold">Total {isIncrease ? 'Increase' : 'Decrease'}</span>
              <span className={`text-lg font-bold font-mono blur-number ${isIncrease ? 'text-emerald-500' : 'text-rose-500'}`}>
                {isIncrease ? '+' : '-'}{formatCurrency(node.value)}
              </span>
            </div>
          )}

          {node.accountGroup && (
            <div className="text-xs text-muted-foreground bg-muted/20 rounded-lg px-3 py-2 flex items-center gap-1.5">
              <span className="font-semibold uppercase tracking-wider text-[10px]">Account Group:</span>
              {node.accountGroup}
            </div>
          )}

          {node.accounts && node.accounts.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5" />
                Account Breakdown
              </h4>
              <div className="border border-border/40 rounded-xl overflow-hidden">
                <table className="w-full text-[11px] text-left border-collapse">
                  <thead className="bg-muted/30 text-muted-foreground uppercase tracking-wider text-[9px] font-semibold border-b border-border/40">
                    <tr>
                      <th className="p-2.5">Account</th>
                      <th className="p-2.5 text-right">Start</th>
                      <th className="p-2.5 text-right">End</th>
                      <th className="p-2.5 text-right">NW Impact</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {node.accounts.map((acc) => {
                      const nwImpact = isIncrease ? Math.abs(acc.signedNWDelta) : -Math.abs(acc.signedNWDelta);
                      return (
                        <tr key={acc.id} className="hover:bg-muted/10 transition-colors">
                          <td className="p-2.5 font-medium text-foreground truncate max-w-[120px]">{acc.name}</td>
                          <td className="p-2.5 text-right font-mono text-muted-foreground blur-number">{formatCurrency(acc.beginningBalance)}</td>
                          <td className="p-2.5 text-right font-mono text-muted-foreground blur-number">{formatCurrency(acc.endingBalance)}</td>
                          <td className={`p-2.5 text-right font-mono font-semibold blur-number ${nwImpact >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                            {nwImpact >= 0 ? '+' : ''}{formatCurrency(nwImpact)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!node.accounts || node.accounts.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              No account breakdown available.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function WealthFlowSankey() {
  const [isCollapsed, setIsCollapsed] = useCardCollapsed('networth-flow-sankey-collapsed');
  const [isDriversCollapsed, setIsDriversCollapsed] = useCardCollapsed('wealthFlowDrivers');
  const [showFilters, setShowFilters] = useState(false);

  const {
    timeframe, setTimeframe, windowEnd, setWindowEnd,
    nextWindow, prevWindow, isNextDisabled, windowLabel,
    showWindowNav, periodOptions, dateRange,
  } = useDateWindow('finance:sankey:timeframe', 'finance:sankey:windowEnd', '1m');

  const [wealthFlowData, setWealthFlowData] = useState<WealthFlowData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allAccounts, setAllAccounts] = useState<AccountData[]>([]);
  const [accountsLoaded, setAccountsLoaded] = useState(false);
  const [excludedAccountIds, setExcludedAccountIds] = useState<Set<string>>(new Set());
  const [isMobile, setIsMobile] = useState(false);
  const [showPercentages, setShowPercentages] = useState(false);
  const [routeThroughAccounts, setRouteThroughAccounts] = useState(false);
  const [accountFilterOpen, setAccountFilterOpen] = useState(false);
  const [accountSearch, setAccountSearch] = useState('');
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [themeVersion, setThemeVersion] = useState(0);
  const [chartMounted, setChartMounted] = useState(false);
  const [selectedNodeDetails, setSelectedNodeDetails] = useState<WealthFlowNode | null>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const accountFilterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
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
        const url = `/api/wealth-flow?startDate=${dateRange.start}&endDate=${dateRange.end}&timeframe=${timeframe}${acctParam}`;

        const res = await fetch(url);
        if (!res.ok) throw new Error(`Failed to load wealth flow data (${res.status})`);
        const data = await res.json();
        if (isCurrent) setWealthFlowData(data);
      } catch (err) {
        if (isCurrent) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (isCurrent) setLoading(false);
      }
    };

    fetchData();
    return () => { isCurrent = false; };
  }, [timeframe, windowEnd, excludedAccountIds, allAccounts, accountsLoaded]);

  const displayWealthFlowData = useMemo(() => {
    if (!wealthFlowData) return null;
    if (routeThroughAccounts) return routeFlowsThroughAccounts(wealthFlowData);
    return wealthFlowData;
  }, [wealthFlowData, routeThroughAccounts]);

  const handleNodeClick = useCallback(
    (nodeId: string) => {
      const node = displayWealthFlowData?.nodes.find(n => n.id === nodeId);
      if (node) setSelectedNodeDetails(node);
    },
    [displayWealthFlowData]
  );

  const handleLinkClick = useCallback(
    (sourceId: string, targetId: string) => {
      if (targetId && targetId !== 'hub_net_worth_change') {
        const node = displayWealthFlowData?.nodes.find(n => n.id === targetId);
        if (node) setSelectedNodeDetails(node);
      } else if (sourceId && sourceId !== 'hub_net_worth_change') {
        const node = displayWealthFlowData?.nodes.find(n => n.id === sourceId);
        if (node) setSelectedNodeDetails(node);
      }
    },
    [displayWealthFlowData]
  );

  const processedData = useMemo(() => {
    if (!displayWealthFlowData || !displayWealthFlowData.nodes) return { nodes: [], links: [] };

    const nodes = displayWealthFlowData.nodes.map((n) => ({ ...n, name: n.label || n.id }));

    const hubIdx = nodes.findIndex((n) => n.id === 'hub_net_worth_change');
    if (hubIdx !== -1) {
      const [hub] = nodes.splice(hubIdx, 1);
      nodes.push(hub);
    }

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
    links.forEach((l) => { incomingCount[l.target]++; });

    const queue: number[] = [];
    nodes.forEach((n, idx) => {
      if (incomingCount[idx] === 0) {
        columns[idx] = 0;
        queue.push(idx);
      }
    });

    let iterations = 0;
    while (queue.length > 0) {
      if (iterations++ > nodes.length * 10) break;
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
    const metrics = Array.from({ length: maxCol + 1 }, () => ({ count: 0, totalValue: 0 }));
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
    () => isMobile
      ? { top: 15, right: 75, bottom: 15, left: 75 }
      : { top: 25, right: 180, bottom: 25, left: 180 },
    [isMobile]
  );

  const nodePadding = isMobile ? 14 : 26;

  const chartHeight = useMemo(() => {
    if (!columnMetrics || columnMetrics.metrics.length === 0) return 520;
    const maxNodes = Math.max(...columnMetrics.metrics.map((m) => m.count));
    const minNodeHeight = isMobile ? 15 : 20;
    const requiredUsableHeight = maxNodes * minNodeHeight + (maxNodes - 1) * nodePadding;
    const verticalMargin = margin.top + margin.bottom;
    return Math.max(520, requiredUsableHeight + verticalMargin + 30);
  }, [columnMetrics, isMobile, nodePadding, margin]);

  const usableHeight = chartHeight - margin.top - margin.bottom;

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
    [handleNodeClick, hoveredNode, setHoveredNode, showPercentages, themeVersion, isMobile]
  );

  const sankeyLink = useMemo(
    () => (
      <SankeyCustomLink
        onClick={handleLinkClick}
        hoveredNode={hoveredNode}
      />
    ),
    [handleLinkClick, hoveredNode, themeVersion]
  );

  const sankeyTooltip = useMemo(
    () => (
      <Tooltip
        isAnimationActive={false}
        allowEscapeViewBox={{ x: true, y: true }}
        content={(props: any) => {
          const { active, payload, coordinate } = props;
          const x = coordinate?.x;
          const y = coordinate?.y;
          if (!active || !payload || !payload.length) return null;
          const data = payload[0].payload;

          const isLink = data.source && typeof data.source === 'object' && data.target && typeof data.target === 'object';

          if (isLink) {
            const linkValue = data.value;
            const sourceNode = data.source;
            const targetNode = data.target;
            return (
              <ChartTooltip x={x} y={y} containerRef={chartContainerRef}>
                <TooltipHeader>
                  {sourceNode.label ?? sourceNode.name} → {targetNode.label ?? targetNode.name}
                </TooltipHeader>
                <TooltipRow label="Amount" value={formatCurrency(linkValue)} />
              </ChartTooltip>
            );
          }

          const node = processedData.nodes.find((n: any) => n.name === (data.name || data.label)) || data;
          const displayValue = showPercentages
            ? `${node.percentage?.toFixed(1)}%`
            : formatCurrency(node.value);
          const accounts = node.accounts as WealthFlowAccountDetail[] | undefined;

          return (
            <ChartTooltip x={x} y={y} containerRef={chartContainerRef}>
              <TooltipHeader>
                {node.label || node.name}
              </TooltipHeader>

              {node.type === 'hub' ? (
                <>
                  <TooltipRow
                    label="Net Change"
                    value={`${(node.netWorthChange || 0) >= 0 ? '+' : ''}${formatCurrency(node.netWorthChange || 0)}`}
                    color={(node.netWorthChange || 0) >= 0 ? '#10b981' : '#ef4444'}
                  />
                  <TooltipRow label="Total Increases" value={formatCurrency(node.visualImbalance !== undefined && node.visualImbalance >= 0 ? node.visualImbalance : 0)} />
                  <TooltipRow label="Total Decreases" value={formatCurrency(node.visualImbalance !== undefined && node.visualImbalance < 0 ? Math.abs(node.visualImbalance) : 0)} />
                </>
              ) : (
                <TooltipRow
                  label={showPercentages ? 'Percentage' : 'Total'}
                  value={displayValue}
                />
              )}

              {node.description && (
                <div className="border-t border-border/30 mt-2 pt-2">
                  <div className="text-[10px] text-muted-foreground leading-relaxed">
                    {node.description}
                  </div>
                </div>
              )}

              {accounts && accounts.length > 0 && (
                <div className="border-t border-border/30 mt-2 pt-2 space-y-1">
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Account Breakdown
                  </div>
                  {accounts.slice(0, 6).map((a) => (
                    <div key={a.id} className="flex justify-between gap-3 text-xs">
                      <span className="text-muted-foreground truncate max-w-[120px]">{a.name}</span>
                      <span className={`font-mono tabular-nums ${a.signedNWDelta >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {a.signedNWDelta >= 0 ? '+' : ''}{formatCurrency(a.signedNWDelta)}
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
        }}
      />
    ),
    [showPercentages, themeVersion, processedData]
  );

  const toggleAccount = (id: string) => {
    setExcludedAccountIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearExcluded = () => setExcludedAccountIds(new Set());

  const selectOnly = (id: string) => {
    const next = new Set(allAccounts.map((a) => a.id));
    next.delete(id);
    setExcludedAccountIds(next);
  };

  const drivers = useMemo(() => {
    if (!displayWealthFlowData) return { increases: [], decreases: [] };
    return {
      increases: displayWealthFlowData.nodes.filter(n => n.type === 'increase'),
      decreases: displayWealthFlowData.nodes.filter(n => n.type === 'decrease'),
    };
  }, [displayWealthFlowData]);

  const allAccountsExcluded = allAccounts.length > 0 && excludedAccountIds.size >= allAccounts.length;
  const filteredAccountsList = allAccounts.filter((a) =>
    a.name.toLowerCase().includes(accountSearch.toLowerCase())
  );
  const summary = wealthFlowData?.summary;

  return (
    <>
      <div className="bg-card border border-border rounded-xl shadow-sm">
        <CollapsibleCardHeader
          isCollapsed={isCollapsed}
          onToggle={setIsCollapsed}
          title={
            <div className="flex items-center gap-2">
              <ArrowLeftRight className="w-4 h-4 text-primary shrink-0" />
<span>Wealth Flow</span>
            <span className="font-normal text-muted-foreground text-xs"> for {windowLabel}</span>
            </div>
          }
        />

        {!isCollapsed && (
          <>
            <CollapsibleFilterPanel
              isOpen={showFilters}
              onToggle={() => setShowFilters(!showFilters)}
              feedbackItems={[
                <span key="timeframe" className="bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider">
                  {timeframe === '1d_discrete' ? '1D' : timeframe.toUpperCase()}
                </span>,
                <span key="unit" className="bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider">
                  {showPercentages ? '%' : '$'}
                </span>,
                ...(routeThroughAccounts ? [
                  <span key="account-routing" className="bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider">
                    ACCOUNTS
                  </span>
                ] : []),
                ...(excludedAccountIds.size > 0 ? [
                  <span key="accounts" className="bg-chart-3/10 text-chart-3 border border-chart-3/20 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider">
                    {allAccounts.length - excludedAccountIds.size} ACCOUNTS
                  </span>
                ] : []),
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
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-4 p-3 bg-muted/20 border border-border/20 rounded-xl">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <TimeRangeFilter value={timeframe} onChange={setTimeframe} />
                  </div>

                  <div className="flex items-center gap-2 border-l border-border/30 pl-4">
                    <Switch
                      checked={showPercentages}
                      onCheckedChange={setShowPercentages}
                      id="wealth-flow-show-percentages"
                    />
                    <label
                      htmlFor="wealth-flow-show-percentages"
                      className="text-xs font-medium text-muted-foreground cursor-pointer"
                    >
                      Show percentages (%)
                    </label>
                  </div>

                  <div className="flex items-center gap-2 border-l border-border/30 pl-4">
                    <Switch
                      checked={routeThroughAccounts}
                      onCheckedChange={setRouteThroughAccounts}
                      id="wealth-flow-account-routing"
                    />
                    <label
                      htmlFor="wealth-flow-account-routing"
                      className="text-xs font-medium text-muted-foreground cursor-pointer"
                    >
                      Per account
                    </label>
                  </div>

                  {allAccounts.length > 0 && (
                    <div className="flex items-center gap-2 border-l border-border/30 pl-4">
                      <span className="text-xs font-medium text-muted-foreground select-none">
                        Filtered Accounts:
                      </span>
                      <div className="relative" ref={accountFilterRef}>
                        <button
                          type="button"
                          onClick={() => { setAccountFilterOpen(!accountFilterOpen); setAccountSearch(''); }}
                          className="text-xs bg-background border border-border rounded-lg px-3 py-1.5 hover:bg-muted text-foreground flex items-center gap-1.5 whitespace-nowrap transition-colors select-none cursor-pointer"
                        >
                          <span>
                            Accounts
                            {excludedAccountIds.size > 0
                              ? ` (${allAccounts.length - excludedAccountIds.size})`
                              : ''}
                          </span>
                          <ChevronDown className={`h-3.5 w-3.5 transition-transform text-muted-foreground ${accountFilterOpen ? 'rotate-180' : ''}`} />
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

                            <div className="max-h-60 overflow-y-auto space-y-0.5 pr-1 scrollbar-thin">
                              {filteredAccountsList.length === 0 ? (
                                <div className="px-2 py-3 text-xs text-muted-foreground text-center">No results</div>
                              ) : (
                                <>
                                  <div
                                    className="flex items-center gap-2 p-1.5 hover:bg-muted rounded-lg text-xs cursor-pointer border-b border-border/45 pb-2 mb-1.5 font-semibold"
                                    onClick={() => {
                                      const allSelected = filteredAccountsList.every((a) => !excludedAccountIds.has(a.id));
                                      const next = new Set(excludedAccountIds);
                                      filteredAccountsList.forEach((a) => allSelected ? next.add(a.id) : next.delete(a.id));
                                      setExcludedAccountIds(next);
                                    }}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={filteredAccountsList.every((a) => !excludedAccountIds.has(a.id))}
                                      onChange={(e) => {
                                        e.stopPropagation();
                                        const allSelected = filteredAccountsList.every((a) => !excludedAccountIds.has(a.id));
                                        const next = new Set(excludedAccountIds);
                                        filteredAccountsList.forEach((a) => allSelected ? next.add(a.id) : next.delete(a.id));
                                        setExcludedAccountIds(next);
                                      }}
                                      className="rounded border-border bg-background text-primary focus:ring-ring h-3.5 w-3.5 cursor-pointer accent-primary"
                                    />
                                    <span>Select All</span>
                                  </div>
                                  {filteredAccountsList.map((a) => {
                                    const isExcluded = excludedAccountIds.has(a.id);
                                    return (
                                      <div
                                        key={a.id}
                                        className="flex items-center justify-between p-1.5 hover:bg-muted rounded-lg text-xs cursor-pointer group"
                                        onClick={() => toggleAccount(a.id)}
                                      >
                                        <div className="flex items-center gap-2 min-w-0 flex-1">
                                          <input
                                            type="checkbox"
                                            checked={!isExcluded}
                                            onChange={(e) => {
                                              e.stopPropagation();
                                              toggleAccount(a.id);
                                            }}
                                            className="rounded border-border bg-background text-primary focus:ring-ring h-3.5 w-3.5 cursor-pointer accent-primary"
                                          />
                                          <span className={`truncate ${isExcluded ? 'text-muted-foreground/60' : 'text-foreground'}`}>
                                            {a.name}
                                          </span>
                                        </div>
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            selectOnly(a.id);
                                          }}
                                          className="text-[10px] text-primary hover:underline px-1 py-0.5 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity ml-2 shrink-0"
                                        >
                                          only
                                        </button>
                                      </div>
                                    );
                                  })}
                                </>
                              )}
                            </div>

                            {excludedAccountIds.size > 0 && (
                              <button
                                onClick={clearExcluded}
                                className="w-full text-[10px] bg-muted/40 text-primary border border-border hover:bg-muted text-center py-1 rounded-lg font-medium transition-colors cursor-pointer"
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
              </div>
            </CollapsibleFilterPanel>

            <div className="p-4 md:p-6 pt-0">
              {loading ? (
                <LoadingSpinner category="sankey" className="h-[400px]" />
              ) : error ? (
                <div className="h-[400px] flex items-center justify-center">
                  <ChartEmptyState variant="error" error={error} />
                </div>
              ) : allAccountsExcluded ? (
                <div className="h-[400px] flex items-center justify-center">
                  <ChartEmptyState variant="empty" description="All accounts are excluded. Adjust your filters." />
                </div>
              ) : processedData.nodes.length === 0 ? (
                <div className="h-[400px] flex items-center justify-center">
                  <ChartEmptyState variant="nodata" description="No data available for the selected range." />
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
            </div>
          </>
        )}
      </div>

      {summary && processedData.nodes.length > 0 && (
        <div className="bg-card border border-border rounded-xl shadow-sm">
          <CollapsibleCardHeader
            isCollapsed={isDriversCollapsed}
            onToggle={setIsDriversCollapsed}
            title={
              <div className="flex items-center gap-2">
                <span>Net Worth Drivers</span>
                <span className="font-normal text-muted-foreground text-xs">for {windowLabel}</span>
              </div>
            }
          />
          {!isDriversCollapsed && (
            <div className="p-5">
              <div className="max-w-xl mx-auto space-y-3">
                <div className="flex justify-between items-center text-sm font-medium pb-2">
                  <span className="text-muted-foreground">Beginning Net Worth</span>
                  <span className="font-mono font-semibold blur-number">{formatCurrency(summary.beginningNetWorth)}</span>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                    <TrendingUp className="w-3.5 h-3.5" />
                    Increases
                  </div>
                  {drivers.increases.length === 0 ? (
                    <div className="text-[10px] text-muted-foreground italic pl-4">No increases this period.</div>
                  ) : (
                    drivers.increases.map((node) => (
                      <DriverLedgerSection
                        key={node.id}
                        label={node.label}
                        value={node.value}
                        sign="+"
                        accounts={node.accounts}
                        nodeId={node.id}
                        onAccountClick={() => handleNodeClick(node.id)}
                      />
                    ))
                  )}
                  <div className="flex justify-between items-center text-xs font-semibold text-muted-foreground pt-1">
                    <span>Total Increases</span>
                    <span className="font-mono blur-number">+{formatCurrency(summary.totalIncreases)}</span>
                  </div>
                </div>

                <div className="space-y-2 pt-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                    <TrendingDown className="w-3.5 h-3.5" />
                    Decreases
                  </div>
                  {drivers.decreases.length === 0 ? (
                    <div className="text-[10px] text-muted-foreground italic pl-4">No decreases this period.</div>
                  ) : (
                    drivers.decreases.map((node) => (
                      <DriverLedgerSection
                        key={node.id}
                        label={node.label}
                        value={node.value}
                        sign="-"
                        accounts={node.accounts}
                        nodeId={node.id}
                        onAccountClick={() => handleNodeClick(node.id)}
                      />
                    ))
                  )}
                  <div className="flex justify-between items-center text-xs font-semibold text-muted-foreground pt-1">
                    <span>Total Decreases</span>
                    <span className="font-mono blur-number">-{formatCurrency(summary.totalDecreases)}</span>
                  </div>
                </div>

                <div className="pt-3 mt-1">
                  <div className="flex justify-between items-center text-sm font-bold">
                    <span className="text-foreground">Ending Net Worth</span>
                    <span className="font-mono blur-number">{formatCurrency(summary.endingNetWorth)}</span>
                  </div>
                </div>

                <div className="flex justify-between items-center text-[11px] text-muted-foreground pt-1">
                  <span>Total Net Worth Change</span>
                  <span className={`font-semibold font-mono blur-number ${summary.netWorthChange >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {summary.netWorthChange >= 0 ? '+' : ''}{formatCurrency(summary.netWorthChange)}
                    {' '}({summary.percentChange >= 0 ? '+' : ''}{summary.percentChange.toFixed(1)}%)
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {selectedNodeDetails && (
        <DetailModal
          node={selectedNodeDetails}
          onClose={() => setSelectedNodeDetails(null)}
          allAccounts={allAccounts}
        />
      )}
    </>
  );
}

function DriverLedgerSection({
  label, value, sign, accounts, nodeId, onAccountClick,
}: {
  label: string;
  value: number;
  sign: '+' | '-';
  accounts?: WealthFlowAccountDetail[];
  nodeId: string;
  onAccountClick: () => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center text-xs p-1.5 -mx-1.5 rounded-lg">
        <span className="text-muted-foreground flex items-center gap-1.5 font-medium">
          <span className="font-bold text-muted-foreground/60">{sign}</span>
          {label}
          {accounts && accounts.length > 0 && (
            <span className="text-[9px] text-muted-foreground/60 font-normal">
              ({accounts.length} {accounts.length === 1 ? 'account' : 'accounts'})
            </span>
          )}
        </span>
        <span className="font-mono font-semibold text-muted-foreground blur-number">
          {sign}{formatCurrency(value)}
        </span>
      </div>

      {accounts && accounts.length > 0 && (
        <div className="pl-4 ml-2 space-y-0.5 pb-1">
          <table className="w-full text-[10px] text-left border-collapse font-mono">
            <thead>
              <tr className="text-[8px] uppercase tracking-wider text-muted-foreground/60">
                <th className="py-0.5 pr-2 font-semibold">Account</th>
                <th className="py-0.5 text-right pr-2 font-semibold">Start</th>
                <th className="py-0.5 text-right pr-2 font-semibold">End</th>
                <th className="py-0.5 text-right font-semibold">NW Impact</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((acc) => (
                <tr key={acc.id} className="hover:bg-muted/5 cursor-pointer" onClick={onAccountClick}>
                  <td className="py-0.5 pr-2 truncate max-w-[120px] font-sans text-muted-foreground/80">{acc.name}</td>
                  <td className="py-0.5 text-right pr-2 text-muted-foreground/60 blur-number">{formatCurrency(acc.beginningBalance)}</td>
                  <td className="py-0.5 text-right pr-2 text-muted-foreground/60 blur-number">{formatCurrency(acc.endingBalance)}</td>
                  <td className="py-0.5 text-right font-semibold text-muted-foreground blur-number">
                    {acc.signedNWDelta >= 0 ? '+' : ''}{formatCurrency(acc.signedNWDelta)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
