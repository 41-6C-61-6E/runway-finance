'use client';

import React from 'react';
import { formatCurrency, formatPlainPercent } from '@/lib/utils/format';
import { sanitizeRestProps } from './sankey-links';
import { SankeyLabel, computeLabelGutter } from './sankey-label';

export interface SankeyNodeProps {
  x: number;
  y: number;
  width: number;
  height: number;
  payload: any;
  onClick?: (id: string) => void;
  hoveredNode?: string | null;
  setHoveredNode?: (id: string | null) => void;
  showPercentages?: boolean;
  isMobile?: boolean;
  nodes?: any[];
  columnMetrics?: any;
  columnOffsets?: number[];
  margin?: { top?: number; right?: number; bottom?: number; left?: number };
  chartWidth?: number;
  columnLeftXs?: number[];
  [key: string]: any;
}

export function SankeyCustomNode({
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
  nodes,
  columnMetrics,
  columnOffsets,
  margin,
  chartWidth,
  columnLeftXs,
  ...restProps
}: SankeyNodeProps) {
  if (
    typeof x !== 'number' ||
    Number.isNaN(x) ||
    typeof y !== 'number' ||
    Number.isNaN(y)
  ) {
    return null;
  }

  const isRightSide = !payload.sourceLinks || payload.sourceLinks.length === 0;
  const isDimmed =
    hoveredNode !== null &&
    hoveredNode !== undefined &&
    hoveredNode !== payload.id;

  // R-2: labels are full-size and get wrapped/ellipsized by SankeyLabel
  // against this node's measured gutter width, not a character clip.
  let label = String(payload.label ?? payload.name ?? '');
  const labelMaxW = computeLabelGutter(x, width, isRightSide, columnLeftXs, chartWidth ?? 0);

  // Apply optional column offset for vertical centering
  let shiftedY = y;
  if (nodes && columnMetrics && columnOffsets) {
    const nodeIdx = nodes.findIndex((n: any) => n.id === payload.id);
    const colIndex = columnMetrics?.columns?.[nodeIdx] ?? -1;
    const offset = colIndex >= 0 ? columnOffsets[colIndex] ?? 0 : 0;
    shiftedY = y + offset;

    const isLeaf = colIndex === 0 || colIndex === 4;
    if (isLeaf) {
      const parentCol = colIndex === 0 ? 1 : 3;
      const hasSameNamedParent = nodes.some((n: any, idx: number) => {
        const col = columnMetrics?.columns?.[idx];
        return col === parentCol && (n.label === label || n.name === label);
      });
      if (hasSameNamedParent) {
        label = '';
      }
    }
  }

  const nodeType = payload.type as string | undefined;
  const isIncrease = nodeType === 'increase';
  const isDecrease = nodeType === 'decrease';
  const isHub = payload.isHub || nodeType === 'hub';

  const signPrefix = isIncrease ? '+' : isDecrease ? '-' : '';
  const valueLabel = isHub
    ? payload.netChange !== undefined
      ? formatCurrency(payload.netChange)
      : ''
    : showPercentages && payload.percentage !== undefined
    ? `${signPrefix}${formatPlainPercent(payload.percentage)}`
    : payload.value !== undefined
    ? `${signPrefix}${formatCurrency(payload.value)}`
    : '';

  const hubVisualImbalance =
    payload.visualImbalance !== undefined
      ? (payload.visualImbalance as number)
      : (payload.netChange as number | undefined);

  const maxFlow = payload.value || 0;
  const imbalance = Math.abs(hubVisualImbalance || 0);
  const hubDeltaRatio = isHub && maxFlow > 0 ? Math.min(1, imbalance / maxFlow) : 0;
  const hubDeltaHeight = Math.max(0, height * hubDeltaRatio);
  const hubDeltaY = shiftedY + height - hubDeltaHeight;
  const hubDeltaCenterY = hubDeltaY + hubDeltaHeight / 2;

  const safeProps = sanitizeRestProps(restProps);
  // R-2: the hub total lives in the reserved right-margin column (with a 1px
  // leader to the delta strip) instead of a panel floating over the flow band.
  const hasChartWidth = typeof chartWidth === 'number' && chartWidth > 0;
  const mRight = margin?.right ?? 140;
  const hubBadgeX = hasChartWidth ? chartWidth - mRight + 8 : 0;
  const hubBadgeW = Math.max(0, Math.min(400, mRight - 16));

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
        stroke={isHub ? payload.color || '#0ea5e9' : 'none'}
        strokeWidth={isHub ? 1.5 : 0}
      />

      {isHub && (
        <>
          {hubVisualImbalance !== undefined && hubDeltaHeight > 0 && (
            <rect
              x={x}
              y={hubDeltaY}
              width={width}
              height={hubDeltaHeight}
              fill={hubVisualImbalance >= 0 ? '#10b981' : '#ef4444'}
              rx={0}
              fillOpacity={isDimmed ? 0.2 : 1}
            />
          )}
            {hasChartWidth && (
              <>
                <line
                  x1={x + width + 1}
                  y1={hubDeltaCenterY}
                  x2={chartWidth - mRight + 6}
                  y2={hubDeltaCenterY}
                  stroke="var(--border)"
                  strokeWidth={1}
                  pointerEvents="none"
                  opacity={isDimmed ? 0.3 : 0.9}
                />
                <foreignObject
                  x={hubBadgeX}
                  y={Math.max(2, hubDeltaCenterY - 29)}
                  width={hubBadgeW}
                  height={58}
                  pointerEvents="none"
                  style={{ opacity: isDimmed ? 0.3 : 1 }}
                >
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'center',
                      gap: 2,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        lineHeight: 1.3,
                      }}
                    >
                      {payload.label || payload.name}
                    </div>
                    {hubVisualImbalance !== undefined && (
                      <div
                        className="blur-number"
                        style={{
                          fontSize: isMobile ? 13 : 17,
                          fontWeight: 800,
                          color: hubVisualImbalance >= 0 ? '#10b981' : '#ef4444',
                          lineHeight: 1.2,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {hubVisualImbalance >= 0 ? '+' : ''}
                        {formatCurrency(hubVisualImbalance)}
                      </div>
                    )}
                  </div>
                </foreignObject>
              </>
            )}
        </>
      )}

      {!isHub && (
        <>
          <text
            x={isRightSide ? x - 8 : x + width + 8}
            y={shiftedY + height / 2 - (valueLabel ? 4 : 0)}
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
              y={shiftedY + height / 2 + 5}
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
}
