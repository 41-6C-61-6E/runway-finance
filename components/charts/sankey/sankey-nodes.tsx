'use client';

import * as React from 'react';
import { formatCurrency, formatPlainPercent } from '@/lib/utils/format';
import { SankeyLabel, computeLabelGutter } from './sankey-label';

const SANITIZED_PROPS = new Set([
  'onMouseEnter', 'onMouseLeave', 'onMouseMove', 'onClick', 'onMouseDown', 'onMouseUp',
  'className', 'style', 'tabIndex', 'role',
]);

export function sanitizeRestProps(props: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(props)) {
    if (SANITIZED_PROPS.has(key) || key.startsWith('on')) {
      out[key] = val;
    }
  }
  return out;
}

export interface SankeyNodePayload {
  id: string;
  name?: string;
  label?: string;
  color?: string;
  value?: number;
  percentage?: number;
  netChange?: number;
  visualImbalance?: number;
  type?: 'increase' | 'decrease' | 'hub' | string;
  isHub?: boolean;
  targetLinks?: unknown[];
  sourceLinks?: unknown[];
  [key: string]: unknown;
}

export interface SankeyCustomNodeProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: SankeyNodePayload;
  onClick?: (id: string) => void;
  hoveredNode?: string | null;
  setHoveredNode?: (id: string | null) => void;
  showPercentages?: boolean;
  isMobile?: boolean;
  nodes?: SankeyNodePayload[];
  columnMetrics?: { columns: number[] };
  columnOffsets?: number[];
  margin?: { top?: number; right?: number; bottom?: number; left?: number };
  chartWidth?: number;
  columnLeftXs?: number[];
  [key: string]: unknown;
}

export function SankeyCustomNode({
  x,
  y,
  width = 24,
  height = 0,
  payload,
  onClick,
  hoveredNode,
  setHoveredNode,
  showPercentages = false,
  isMobile = false,
  nodes,
  columnMetrics,
  columnOffsets,
  margin,
  chartWidth = 0,
  columnLeftXs,
  ...restProps
}: SankeyCustomNodeProps) {
  if (typeof x !== 'number' || Number.isNaN(x) || typeof y !== 'number' || Number.isNaN(y) || !payload) {
    return null;
  }

  const nodeIdx = nodes ? nodes.findIndex((n) => n.id === payload.id) : -1;
  const colIndex = (columnMetrics && nodeIdx >= 0) ? (columnMetrics.columns[nodeIdx] ?? -1) : -1;
  const isLeftSide = colIndex === 0 || (payload.depth !== undefined && payload.depth === 0) || (!payload.sourceLinks || payload.sourceLinks.length === 0);
  const isDimmed = hoveredNode !== null && hoveredNode !== undefined && hoveredNode !== payload.id;

  const rawLabel = payload.label ?? payload.name ?? '';
  let label = rawLabel;
  const labelMaxW = computeLabelGutter(x, width, isLeftSide, columnLeftXs, chartWidth);

  const nodeType = payload.type;
  const isIncrease = nodeType === 'increase';
  const isDecrease = nodeType === 'decrease';
  const isHub = payload.isHub || nodeType === 'hub';

  const signPrefix = isIncrease ? '+' : isDecrease ? '-' : '';
  const valueLabel = isHub && payload.netChange !== undefined
    ? formatCurrency(payload.netChange)
    : showPercentages && payload.percentage !== undefined
      ? `${signPrefix}${formatPlainPercent(payload.percentage)}`
      : payload.value !== undefined
        ? `${signPrefix}${formatCurrency(payload.value)}`
        : '';

  const offset = (colIndex >= 0 && columnOffsets) ? (columnOffsets[colIndex] ?? 0) : 0;
  const shiftedY = y + offset;

  const netChange = payload.netChange ?? payload.visualImbalance ?? 0;
  const isNetSurplus = netChange >= 0;
  const imbalance = Math.abs(netChange);
  const maxFlow = payload.value || 0;

  const hubDeltaRatio = isHub && maxFlow > 0 ? Math.min(1, imbalance / maxFlow) : 0;
  const hubDeltaHeight = Math.max(0, height * hubDeltaRatio);
  const hubDeltaY = shiftedY + height - hubDeltaHeight;
  const hubDeltaCenterY = hubDeltaY + hubDeltaHeight / 2;

  const hubBadgeW = Math.min(180, Math.max(width + 40, 140));
  const hubBadgeH = 48;
  const HUB_GAP = 10;
  const showHubBadge = chartWidth >= 480 || !isMobile;
  let hubBadgeX = x + width + HUB_GAP;
  let hubBadgeY = Math.max(2, hubDeltaCenterY - hubBadgeH / 2);

  if (showHubBadge && chartWidth > 0) {
    const chartRight = chartWidth - (margin?.right ?? 0);
    if (hubBadgeX + hubBadgeW > chartRight) {
      const leftX = x - hubBadgeW - HUB_GAP;
      if (leftX >= (margin?.left ?? 0)) hubBadgeX = leftX;
    }
  }

  // Deduplicate leaf names if parent column already shares the name
  if (nodes && columnMetrics && (colIndex === 0 || colIndex === 4)) {
    const parentCol = colIndex === 0 ? 1 : 3;
    const hasSameNamedParent = nodes.some((n, idx) => {
      const col = columnMetrics.columns[idx];
      return col === parentCol && (n.label === rawLabel || n.name === rawLabel);
    });
    if (hasSameNamedParent) {
      label = '';
    }
  }

  const safeProps = sanitizeRestProps(restProps) as React.SVGProps<SVGGElement>;

  return (
    <g
      {...safeProps}
      onMouseEnter={(e) => {
        setHoveredNode?.(payload.id);
        if (safeProps.onMouseEnter) safeProps.onMouseEnter(e);
      }}
      onMouseLeave={(e) => {
        setHoveredNode?.(null);
        if (safeProps.onMouseLeave) safeProps.onMouseLeave(e);
      }}
      onClick={(e) => {
        onClick?.(payload.id);
        if (safeProps.onClick) safeProps.onClick(e);
      }}
      className="cursor-pointer"
    >
      <rect
        x={x}
        y={shiftedY}
        width={width}
        height={Math.max(0, height)}
        fill={payload.color || 'var(--color-primary)'}
        rx={0}
        fillOpacity={isDimmed ? 0.3 : 0.95}
        stroke={isHub ? (payload.color || '#0ea5e9') : 'none'}
        strokeWidth={isHub ? 1.5 : 0}
      />

      {isHub ? (
        <>
          {hubDeltaHeight > 0 && (
            <rect
              x={x}
              y={hubDeltaY}
              width={width}
              height={hubDeltaHeight}
              fill={isNetSurplus ? '#10b981' : '#ef4444'}
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
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    lineHeight: 1.4,
                    letterSpacing: 0.3,
                    textTransform: 'uppercase' as const,
                    color: 'hsl(var(--muted-foreground))',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {payload.label}
                </div>
                <div
                  className="blur-number"
                  style={{
                    fontSize: 16,
                    fontWeight: 800,
                    color: isNetSurplus ? '#10b981' : '#ef4444',
                    lineHeight: 1.3,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {isNetSurplus ? '+' : ''}{formatCurrency(netChange)}
                </div>
              </div>
            </foreignObject>
          )}
        </>
      ) : (
        <SankeyLabel
          text={label}
          x={isLeftSide ? x - 8 : x + width + 8}
          y={shiftedY + height / 2}
          maxW={labelMaxW}
          anchor={isLeftSide ? 'end' : 'start'}
          value={valueLabel || undefined}
          opacity={isDimmed ? 0.3 : 1}
        />
      )}
    </g>
  );
}
