'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatCurrency } from '@/lib/utils/format';
import { formatSafeUTCDate } from '@/lib/utils/date';
import { formatChartYAxisCurrency, formatChartXAxisDate, getChartXTicksUnified } from '@/lib/utils/chart-format';
import { ChartTooltip, TooltipRow, TooltipHeader } from '@/components/charts/chart-tooltip';
import { usePrivacyMode } from '@/components/privacy-mode-provider';

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
  const { privacyMode } = usePrivacyMode();
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

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const xAxisTicks = useMemo(() => {
    return getChartXTicksUnified(chartData, 'all', isMobile, 'x');
  }, [chartData, isMobile]);

  const yDomain = useMemo(() => {
    if (chartData.length === 0) return [0, 0];
    let min = Infinity;
    let max = -Infinity;
    for (const d of chartData) {
      for (const key of Object.keys(d)) {
        if (key !== 'x' && typeof d[key] === 'number') {
          min = Math.min(min, d[key]);
          max = Math.max(max, d[key]);
        }
      }
    }
    if (min === Infinity) min = 0;
    if (max === -Infinity) max = 0;
    return [min, max];
  }, [chartData]);

  const formatXTick = useCallback((v: string) => {
    return formatChartXAxisDate(v + '-01', 'all', { isMonthly: true });
  }, []);

  const formatYTick = useCallback((v: number) => {
    return formatChartYAxisCurrency(v, yDomain[0], yDomain[1]);
  }, [yDomain]);

  const srSummary = useMemo(() => {
    if (chartData.length === 0) return '';
    const lastPoint = chartData[chartData.length - 1];
    const firstPoint = chartData[0];
    const seriesNames = visibleData.map(s => s.id).join(', ');
    return `Cash Flow projections chart showing trend for: ${seriesNames}. Start date is ${firstPoint.x}, end date is ${lastPoint.x}.`;
  }, [chartData, visibleData]);

  if (chartData.length === 0) return null;

  return (
    <div className="h-[320px] touch-pan-y">
      {!privacyMode && (
        <div className="sr-only" aria-live="polite">
          {srSummary}
        </div>
      )}
      <div className="h-full w-full overflow-x-auto overflow-y-hidden scroll-contain-x">
        <div className="min-w-max h-full px-2 pb-2">
          <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 100, height: 100 }}>
            <LineChart
            role="img"
            aria-label="Cash Flow Projections Line Chart"
            data={chartData}
            margin={{ top: 10, right: 20, left: 10, bottom: 10 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} horizontal={true} />
            <XAxis
              dataKey="x"
              tickLine={false}
              axisLine={{ stroke: 'var(--color-border)' }}
              tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
              ticks={xAxisTicks}
              tickFormatter={formatXTick}
              minTickGap={30}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
              width={60}
              tickFormatter={formatYTick}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload || !payload.length) return null;
                const xFormatted = formatChartXAxisDate(label + '-01', 'all', { isMonthly: true });
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
    </div>
  );
}