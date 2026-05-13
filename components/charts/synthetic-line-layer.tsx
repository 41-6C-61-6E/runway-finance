import { ReactNode } from 'react';

interface SyntheticLineLayerProps {
  series: Array<{
    id: string;
    data: Array<{
      data: { x: string | number; y: number | null; isSynthetic?: boolean };
      position?: { x: number; y: number };
    }>;
  }>;
  lineGenerator: (points: Array<{ x: number; y: number }>) => string | null;
  xScale: (value: string | number) => number | null;
  yScale: (value: number) => number | null;
}

export function SyntheticLineLayer({ series, xScale, yScale }: SyntheticLineLayerProps): ReactNode {
  const estimatedSeries = series.find(
    (s) => typeof s.id === 'string' && s.id.toString().includes('(Estimated)')
  );
  if (!estimatedSeries) return null;

  const points: Array<{ x: number; y: number }> = [];
  for (const d of estimatedSeries.data) {
    if (d.data.y == null) continue;
    const x = xScale(d.data.x);
    const y = yScale(d.data.y);
    if (x != null && y != null) {
      points.push({ x, y });
    }
  }

  if (points.length < 2) return null;

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');

  return (
    <path
      d={path}
      fill="none"
      stroke="var(--color-chart-1)"
      strokeWidth={2.5}
      strokeDasharray="6 4"
      opacity={0.5}
    />
  );
}
