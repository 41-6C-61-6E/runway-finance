'use client';

import React from 'react';

const SANITIZED_PROPS = new Set([
  'onMouseEnter',
  'onMouseLeave',
  'onMouseMove',
  'onClick',
  'onMouseDown',
  'onMouseUp',
  'className',
  'style',
  'tabIndex',
  'role',
]);

export function sanitizeRestProps(props: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [key, val] of Object.entries(props)) {
    if (SANITIZED_PROPS.has(key) || key.startsWith('on')) {
      out[key] = val;
    }
  }
  return out;
}

export interface SankeyLinkProps {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  linkWidth: number;
  index: number;
  payload: any;
  onClick?: (sourceId: string, targetId: string) => void;
  hoveredNode?: string | null;
  gradientPrefix?: string;
  [key: string]: any;
}

export function SankeyCustomLink({
  sourceX,
  sourceY,
  targetX,
  targetY,
  linkWidth,
  index,
  payload,
  onClick,
  hoveredNode,
  gradientPrefix = 'sankey-link-grad',
  ...restProps
}: SankeyLinkProps) {
  if (
    typeof sourceX !== 'number' ||
    Number.isNaN(sourceX) ||
    typeof sourceY !== 'number' ||
    Number.isNaN(sourceY) ||
    typeof targetX !== 'number' ||
    Number.isNaN(targetX) ||
    typeof targetY !== 'number' ||
    Number.isNaN(targetY)
  ) {
    return null;
  }

  const gradId = `${gradientPrefix}-${index}`;
  const midX = (sourceX + targetX) / 2;
  const halfW = (linkWidth || 1) / 2;

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
  const isDimmed =
    hoveredNode !== null &&
    hoveredNode !== undefined &&
    sourceId !== hoveredNode &&
    targetId !== hoveredNode;
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
}
