'use client';

import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatCurrency } from '@/lib/utils/format';
import { ChartTooltip, TooltipRow, TooltipHeader } from '@/components/charts/chart-tooltip';

interface ChartSeries {
  id: string;
  data: Array<{ x: string; y: number }>;
}

interface ForecastChartProps {
  data: ChartSeries[];
  showProjections?: boolean;
}

const LINE_COLORS = [
  'var(--color-chart-1)',
  'var(--color-chart-2)',
  'var(--color-chart-3)',
  'var(--color-chart-4)',
  'var(--color-chart-5)',
];

export function ForecastChart({ data, showProjections = true }: ForecastChartProps) {
  const visibleData = useMemo(() => {
    return showProjections
      ? data
      : data.filter((s) => !String(s.id).includes('(Projected)'));
  }, [data, showProjections]);

  const chartData = useMemo(() => {
    if (visibleData.length === 0 || !visibleData.some((s) => s.data.length > 0)) return [];
    // Collect all unique x values
    const xValues = Array.from(new Set(visibleData.flatMap((s) => s.data.map((d) => d.x)))).sort();
    return xValues.map((x) => {
      const item: Record<string, any> = { x };
      for (const s of visibleData) {
        const match = s.data.find((d) => d.x === x);
        if (match) {
          item[s.id] = match.y;
        }
      }
      return item;
    });
  }, [visibleData]);

  if (chartData.length === 0) return null;

  return (
    <div className="h-[320px]">
      <div className="financial-chart h-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 10, right: 20, left: 10, bottom: 10 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} horizontal={true} />
            <XAxis
              dataKey="x"
              tickLine={false}
              axisLine={{ stroke: 'var(--color-border)' }}
              tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
              interval={chartData.length > 30 ? Math.max(4, Math.floor(chartData.length / 6)) : 0}
              tickFormatter={(v: string) => {
                const d = new Date(v + '-01');
                return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
              }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
              width={60}
              tickFormatter={(v: number) => {
                if (v >= 1000000) return `$${(v / 1000000).toFixed(1)}M`;
                if (v >= 1000) return `$${(v / 1000).toFixed(0)}K`;
                return `$${v}`;
              }}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload || !payload.length) return null;
                const d = new Date(label + '-01');
                const xFormatted = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
                return (
                  <ChartTooltip>
                    <TooltipHeader>{xFormatted}</TooltipHeader>
                    {payload.map((p) => {
                      const isProjected = String(p.name).includes('(Projected)');
                      return (
                        <TooltipRow
                          key={p.name}
                          label={`${String(p.name)}${isProjected ? ' (projected)' : ''}`}
                          value={formatCurrency(Number(p.value))}
                          color={p.color}
                        />
                      );
                    })}
                  </ChartTooltip>
                );
              }}
            />
            {visibleData.map((s, idx) => {
              const isProjected = String(s.id).includes('(Projected)');
              const strokeColor = LINE_COLORS[idx % LINE_COLORS.length];
              return (
                <Line
                  key={s.id}
                  type="monotone"
                  dataKey={s.id}
                  stroke={strokeColor}
                  strokeWidth={2}
                  dot={false}
                  strokeDasharray={isProjected ? '8 4' : undefined}
                  connectNulls
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}