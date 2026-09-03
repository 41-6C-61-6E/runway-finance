'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { ResponsiveContainer, Sankey, Tooltip } from 'recharts';
import { formatCurrency, formatPlainPercent } from '@/lib/utils/format';
import { SankeyLabel, computeLabelGutter } from '@/components/charts/sankey/sankey-label';
import { ChartTooltip, TooltipRow, TooltipHeader } from '@/components/charts/chart-tooltip';
import { ChartEmptyState } from '@/components/charts/chart-empty-state';
import { ChartTimeframeBar } from '@/components/charts/chart-timeframe-bar';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useCardCollapsed } from '@/lib/hooks/use-card-collapsed';
import { TrendingUp, TrendingDown, Info, ChevronDown } from 'lucide-react';
import { useDateWindow } from '@/lib/hooks/use-date-window';
import { DateWindowNav } from '@/components/charts/date-window-nav';
import { getOrFetch } from '@/lib/fetch-cache';
import { SegPill } from '@/components/ui/seg-pill';
import type { WealthFlowData, WealthFlowNode, WealthFlowAccountDetail } from '@/lib/types/financial';

interface AccountData {
  id: string;
  name: string;
  type: string;
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
  showPercentages, isMobile,
  margin, chartWidth, columnLeftXs, ...restProps
}: any) => {
  if (typeof x !== 'number' || Number.isNaN(x) || typeof y !== 'number' || Number.isNaN(y)) {
    return null;
  }
  const isRightSide = !payload.sourceLinks || payload.sourceLinks.length === 0;
  const isDimmed = hoveredNode !== null && hoveredNode !== payload.id;

  const label = payload.label ?? payload.name ?? '';
  const labelMaxW = computeLabelGutter(x, width, isRightSide, columnLeftXs, chartWidth ?? 0);

  const nodeType = payload.type as string | undefined;
  const isIncrease = nodeType === 'increase';
  const isDecrease = nodeType === 'decrease';
  const isHub = nodeType === 'hub';

  const signPrefix = isIncrease ? '+' : (isDecrease ? '-' : '');
  const valueLabel = showPercentages && payload.percentage !== undefined
    ? `${signPrefix}${formatPlainPercent(payload.percentage)}`
    : payload.value !== undefined ? `${signPrefix}${formatCurrency(payload.value)}` : '';

  const hubVisualImbalance = payload.visualImbalance as number | undefined;
  const maxFlow = payload.value || 0;
  const imbalance = Math.abs(hubVisualImbalance || 0);

  const hubDeltaRatio = isHub && maxFlow > 0 ? Math.min(1, imbalance / maxFlow) : 0;
  const hubDeltaHeight = Math.max(0, height * hubDeltaRatio);
  const hubDeltaY = y + height - hubDeltaHeight;
  const hubDeltaCenterY = hubDeltaY + hubDeltaHeight / 2;
  const hubBadgeW = Math.min(180, Math.max(width + 40, 140));
  const hubBadgeH = 48;
  const HUB_GAP = 10;
  let hubBadgeX = x + width + HUB_GAP;
  let hubBadgeY = Math.max(2, hubDeltaCenterY - hubBadgeH / 2);
  const showHubBadge = !isMobile;
  if (showHubBadge && typeof chartWidth === 'number' && chartWidth > 0) {
    const chartRight = chartWidth - (margin?.right ?? 0);
    if (hubBadgeX + hubBadgeW > chartRight) {
      const leftX = x - hubBadgeW - HUB_GAP;
      if (leftX >= (margin?.left ?? 0)) hubBadgeX = leftX;
    }
  }

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
        x={x} y={y} width={width} height={Math.max(0, height)}
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
          {showHubBadge && (
            <foreignObject
              x={hubBadgeX}
              y={hubBadgeY}
              width={hubBadgeW}
              height={hubBadgeH}
              pointerEvents="none"
              style={{ opacity: isDimmed ? 0.3 : 1, overflow: 'visible' }}
            >
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  textAlign: 'center',
                  gap: 1,
                  background: 'transparent',
                  border: 'none',
                  padding: 0,
                }}
              >
                <div style={{ fontSize: 10, fontWeight: 700, lineHeight: 1.4, letterSpacing: 0.3, textTransform: 'uppercase' as const, color: 'hsl(var(--muted-foreground))', whiteSpace: 'nowrap' }}>
                  {payload.label}
                </div>
                {hubVisualImbalance !== undefined && (
                  <div className="blur-number" style={{
                    fontSize: 16, fontWeight: 800, whiteSpace: 'nowrap',
                    color: hubVisualImbalance >= 0 ? '#10b981' : '#ef4444',
                    lineHeight: 1.3,
                  }}>
                    {hubVisualImbalance >= 0 ? '+' : ''}{formatCurrency(hubVisualImbalance)}
                  </div>
                )}
              </div>
            </foreignObject>
          )}
        </>
      )}

      {!isHub && (
        <SankeyLabel
          text={label}
          x={isRightSide ? x - 8 : x + width + 8}
          y={y + height / 2}
          maxW={labelMaxW}
          anchor={isRightSide ? 'end' : 'start'}
          value={valueLabel || undefined}
          opacity={isDimmed ? 0.3 : 1}
        />
      )}
    </g>
  );
};

const SankeyCustomLink = ({
  sourceX, sourceY, targetX, targetY, linkWidth, index,
  payload, onClick, hoveredNode, ...restProps
}: any) => {
  if (
    typeof sourceX !== 'number' || Number.isNaN(sourceX) ||
    typeof sourceY !== 'number' || Number.isNaN(sourceY) ||
    typeof targetX !== 'number' || Number.isNaN(targetX) ||
    typeof targetY !== 'number' || Number.isNaN(targetY)
  ) {
    return null;
  }
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
                  <thead className="bg-muted/30 text-muted-foreground uppercase tracking-wider text-micro font-semibold border-b border-border/40">
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
  // Force collapsed by default via new key; previous `wealthFlowDrivers` state ignored.
  const [isDriversCollapsed, setIsDriversCollapsed] = useCardCollapsed('wealthFlowDrivers_v2', true);

  const {
    timeframe, setTimeframe, windowEnd, setWindowEnd,
    nextWindow, prevWindow, isNextDisabled, windowLabel,
    showWindowNav, periodOptions, dateRange,
  } = useDateWindow('finance:sankey:timeframe', 'finance:sankey:windowEnd', '1m');

  const [wealthFlowData, setWealthFlowData] = useState<WealthFlowData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allAccounts, setAllAccounts] = useState<AccountData[]>([]);
  const [isMobile, setIsMobile] = useState(false);
  const [routeThroughAccounts, setRouteThroughAccounts] = useState(false);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [themeVersion, setThemeVersion] = useState(0);
  const [chartWidth, setChartWidth] = useState(0);
  const [chartMounted, setChartMounted] = useState(false);
  const [selectedNodeDetails, setSelectedNodeDetails] = useState<WealthFlowNode | null>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const showPercentages = false;

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    getOrFetch('/api/accounts')
      .then((r) => (r.ok ? r.json() : []))
      .then((json) => setAllAccounts(Array.isArray(json) ? json : []))
      .catch(() => setAllAccounts([]));
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

  useEffect(() => {
    let isCurrent = true;

    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const url = `/api/wealth-flow?startDate=${dateRange.start}&endDate=${dateRange.end}&timeframe=${timeframe}`;

        const res = await getOrFetch(url);
        if (!res.ok) throw new Error(`Failed to load wealth flow data (${res.status})`);
        const data = (await res.json()) as WealthFlowData;
        if (isCurrent) setWealthFlowData(data);
      } catch (err) {
        if (isCurrent) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (isCurrent) setLoading(false);
      }
    };

    fetchData();
    return () => { isCurrent = false; };
  }, [timeframe, windowEnd, dateRange.start, dateRange.end]);

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
      ? { top: 15, right: 140, bottom: 15, left: 100 }
      : { top: 25, right: 180, bottom: 25, left: 180 },
    [isMobile]
  );

  const nodePadding = isMobile ? 14 : 26;

  const sankeyNodeWidth = 12;

  const columnLeftXs = useMemo(() => {
    if (chartWidth <= 0 || !columnMetrics) return null;
    const contentW = chartWidth - margin.left - margin.right;
    if (contentW <= 0) return null;
    const maxDepth = Math.max(1, columnMetrics.metrics.length - 1);
    const childWidth = (contentW - sankeyNodeWidth) / maxDepth;
    return Array.from({ length: maxDepth + 1 }, (_, d) => margin.left + d * childWidth);
  }, [chartWidth, margin, columnMetrics, sankeyNodeWidth]);

  const chartHeight = useMemo(() => {
    if (!columnMetrics || columnMetrics.metrics.length === 0) return 520;
    const maxNodes = Math.max(...columnMetrics.metrics.map((m) => m.count));
    const minNodeHeight = isMobile ? 15 : 20;
    const requiredUsableHeight = maxNodes * minNodeHeight + (maxNodes - 1) * nodePadding;
    const verticalMargin = margin.top + margin.bottom;
    return Math.max(520, requiredUsableHeight + verticalMargin + 30);
  }, [columnMetrics, isMobile, nodePadding, margin]);

  const sankeyNode = useMemo(
    () => (
      <SankeyCustomNode
        onClick={handleNodeClick}
        hoveredNode={hoveredNode}
        setHoveredNode={setHoveredNode}
        showPercentages={showPercentages}
        isMobile={isMobile}
        margin={margin}
        chartWidth={chartWidth}
        columnLeftXs={columnLeftXs}
      />
    ),
    [handleNodeClick, hoveredNode, setHoveredNode, showPercentages, themeVersion, isMobile, margin, chartWidth, columnLeftXs]
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
            ? `${formatPlainPercent(node.percentage)}`
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
                  <div className="text-[10px] text-muted-foreground leading-relaxed break-words whitespace-normal">
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
                    <div key={a.id} className="flex justify-between gap-2 text-xs break-words">
                      <span className="text-muted-foreground break-words min-w-0 flex-1 pr-2">{a.name}</span>
                      <span className={`font-mono tabular-nums shrink-0 text-right ${a.signedNWDelta >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
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

  const drivers = useMemo(() => {
    if (!displayWealthFlowData) return { increases: [], decreases: [] };
    return {
      increases: displayWealthFlowData.nodes.filter(n => n.type === 'increase'),
      decreases: displayWealthFlowData.nodes.filter(n => n.type === 'decrease'),
    };
  }, [displayWealthFlowData]);

  const summary = wealthFlowData?.summary;

  return (
    <>
      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="px-3 sm:px-5 py-3 flex flex-wrap items-center justify-center gap-2 border-b border-border bg-muted/20">
          <SegPill
            options={[{ id: 'grouped', label: 'Grouped' }, { id: 'perAccount', label: 'Per Account' }]}
            value={routeThroughAccounts ? 'perAccount' : 'grouped'}
            onChange={(v) => setRouteThroughAccounts(v === 'perAccount')}
            aria-label="Account breakdown"
          />
        </div>
        <ChartTimeframeBar value={timeframe} onChange={setTimeframe} windowNav={showWindowNav ? <DateWindowNav prev={prevWindow} next={nextWindow} nextDisabled={isNextDisabled} label={windowLabel} options={periodOptions} currentValue={windowEnd} onSelect={setWindowEnd} timeframe={timeframe} /> : undefined} />

        <div className="p-4 md:p-6 pt-0">
          {loading ? (
            <LoadingSpinner category="sankey" className="h-[400px]" />
          ) : error ? (
            <div className="h-[400px] flex items-center justify-center">
              <ChartEmptyState variant="error" error={error} />
            </div>
          ) : processedData.nodes.length === 0 || processedData.links.length === 0 ? (
            <div className="h-[400px] flex items-center justify-center">
              <ChartEmptyState variant="nodata" description="No data available for the selected range." />
            </div>
          ) : (
            <div ref={chartContainerRef} style={{ height: chartHeight }} className="w-full min-w-0">
              {chartMounted && chartHeight > 0 && (
                <ResponsiveContainer
                  width="100%"
                  height="100%"
                  minWidth={0}
                  onResize={(w: number) => setChartWidth((prev) => (prev === w ? prev : w))}
                >
                  <Sankey
                    data={processedData}
                    node={sankeyNode}
                    link={sankeyLink}
                    nodeWidth={sankeyNodeWidth}
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
      </div>

      {summary && processedData.nodes.length > 0 && (
        <div className="border border-dashed border-border/60 bg-muted/5 rounded-xl overflow-hidden">
          <button
            type="button"
            onClick={() => setIsDriversCollapsed(!isDriversCollapsed)}
            aria-expanded={!isDriversCollapsed}
            aria-label={isDriversCollapsed ? 'Expand Net Worth Drivers' : 'Collapse Net Worth Drivers'}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-muted-foreground hover:text-foreground hover:bg-muted/20 transition-colors group"
          >
            <span className="text-xs italic">Net worth drivers for {windowLabel}</span>
            <span className="ml-1 inline-flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 border border-primary/20 text-primary group-hover:bg-primary/15 transition-colors shrink-0">
              <ChevronDown
                size={16}
                strokeWidth={2.5}
                className={`transition-transform duration-200 ${!isDriversCollapsed ? 'rotate-180' : ''}`}
              />
            </span>
          </button>
          {!isDriversCollapsed && (
            <div className="p-5 border-t border-dashed border-border/50 bg-card">
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
                    {' '}({summary.percentChange >= 0 ? '+' : ''}{formatPlainPercent(summary.percentChange)})
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
            <span className="text-[11px] text-muted-foreground/60 font-normal">
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
              <tr className="text-micro uppercase tracking-wider text-muted-foreground/60">
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
