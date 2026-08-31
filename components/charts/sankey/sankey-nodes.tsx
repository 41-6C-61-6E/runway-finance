'use client';

import React from 'react';
import { formatCurrency, formatPlainPercent } from '@/lib/utils/format';
import { sanitizeRestProps } from './sankey-links';

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

  const rawLabel = payload.label ?? payload.name ?? '';
  const maxLabelLen = isMobile ? 10 : 22;
  let label =
    rawLabel.length > maxLabelLen ? `${rawLabel.slice(0, maxLabelLen)}..` : rawLabel;

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
        return col === parentCol && (n.label === rawLabel || n.name === rawLabel);
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
          <foreignObject
            x={x + width + 4}
            y={hubDeltaCenterY - 24}
            width={400}
            height={50}
            pointerEvents="none"
            style={{ opacity: isDimmed ? 0.3 : 1 }}
          >
            <div
              style={{
                display: 'inline-block',
                width: 'fit-content',
                background: 'var(--background)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                padding: '4px 10px',
              }}
            >
              <div
                style={{
                  fontSize: isMobile ? 8 : 10,
                  fontWeight: 600,
                  lineHeight: 1.4,
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
                    lineHeight: 1.3,
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
