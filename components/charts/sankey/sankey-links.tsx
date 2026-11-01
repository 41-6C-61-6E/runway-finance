'use client';

import * as React from 'react';
import { sanitizeRestProps, type SankeyNodePayload } from './sankey-nodes';

export interface SankeyLinkPayload {
  source?: { id: string; color?: string; [key: string]: unknown };
  target?: { id: string; color?: string; [key: string]: unknown };
  value?: number;
  [key: string]: unknown;
}

export interface SankeyCustomLinkProps {
  sourceX?: number;
  sourceY?: number;
  targetX?: number;
  targetY?: number;
  linkWidth?: number;
  index?: number;
  payload?: SankeyLinkPayload;
  onClick?: (sourceId: string, targetId: string) => void;
  hoveredNode?: string | null;
  nodes?: SankeyNodePayload[];
  columnMetrics?: { columns: number[] };
  columnOffsets?: number[];
  [key: string]: unknown;
}

export function SankeyCustomLink({
  sourceX,
  sourceY,
  targetX,
  targetY,
  linkWidth = 0,
  index = 0,
  payload,
  onClick,
  hoveredNode,
  nodes,
  columnMetrics,
  columnOffsets,
  ...restProps
}: SankeyCustomLinkProps) {
  if (
    typeof sourceX !== 'number' || Number.isNaN(sourceX) ||
    typeof sourceY !== 'number' || Number.isNaN(sourceY) ||
    typeof targetX !== 'number' || Number.isNaN(targetX) ||
    typeof targetY !== 'number' || Number.isNaN(targetY)
  ) {
    return null;
  }

  const gradId = `sankey-link-grad-${index}`;

  const sourceIdx = nodes ? nodes.findIndex((n) => n.id === payload?.source?.id) : -1;
  const targetIdx = nodes ? nodes.findIndex((n) => n.id === payload?.target?.id) : -1;

  const sourceCol = (columnMetrics && sourceIdx >= 0) ? (columnMetrics.columns[sourceIdx] ?? -1) : -1;
  const targetCol = (columnMetrics && targetIdx >= 0) ? (columnMetrics.columns[targetIdx] ?? -1) : -1;

  const sourceOffset = (sourceCol >= 0 && columnOffsets) ? (columnOffsets[sourceCol] ?? 0) : 0;
  const targetOffset = (targetCol >= 0 && columnOffsets) ? (columnOffsets[targetCol] ?? 0) : 0;

  const shiftedSourceY = sourceY + sourceOffset;
  const shiftedTargetY = targetY + targetOffset;

  const midX = (sourceX + targetX) / 2;
  const halfW = linkWidth / 2;

  const path = [
    `M ${sourceX},${shiftedSourceY - halfW}`,
    `C ${midX},${shiftedSourceY - halfW} ${midX},${shiftedTargetY - halfW} ${targetX},${shiftedTargetY - halfW}`,
    `L ${targetX},${shiftedTargetY + halfW}`,
    `C ${midX},${shiftedTargetY + halfW} ${midX},${shiftedSourceY + halfW} ${sourceX},${shiftedSourceY + halfW}`,
    'Z',
  ].join(' ');

  const sourceColor = payload?.source?.color || '#94a3b8';
  const targetColor = payload?.target?.color || '#94a3b8';

  const sourceId = payload?.source?.id;
  const targetId = payload?.target?.id;
  const isDimmed = hoveredNode !== null && hoveredNode !== undefined && sourceId !== hoveredNode && targetId !== hoveredNode;
  const opacity = isDimmed ? 0.08 : 0.45;

  const safeProps = sanitizeRestProps(restProps) as React.SVGProps<SVGGElement>;

  return (
    <g
      {...safeProps}
      onClick={(e) => {
        if (onClick && sourceId && targetId) onClick(sourceId, targetId);
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
}
