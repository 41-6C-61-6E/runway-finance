'use client';

import { useId } from 'react';

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  isPositive: boolean;
}

export function Sparkline({ data, width = 120, height = 30, isPositive }: SparklineProps) {
  const id = useId();

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

  const pathD = `M ${points.join(' L ')}`;
  const areaD = `${pathD} L ${width},${height} L 0,${height} Z`;
  const strokeColor = isPositive ? '#10b981' : '#ef4444';
  const gradientId = `sparkline-gradient-${id}`;

  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={strokeColor} stopOpacity="0.3" />
          <stop offset="100%" stopColor={strokeColor} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#${gradientId})`} />
      <path
        d={pathD}
        fill="none"
        stroke={strokeColor}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
