'use client';

import { ResponsiveLine } from '@nivo/line';
import { formatCurrency } from '@/lib/utils/format';
import { nivoTheme } from '@/components/charts/shared-chart-theme';
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
  const visibleData = showProjections
    ? data
    : data.filter((s) => !String(s.id).includes('(Projected)'));

  if (visibleData.length === 0 || !visibleData.some((s) => s.data.length > 0)) return null;

  const allValues = visibleData.flatMap((s) => s.data.map((d) => d.y));
  const maxVal = allValues.length > 0 ? Math.max(...allValues, 1) : 1;
  const minVal = allValues.length > 0 ? Math.min(...allValues, 0) : 0;
  const safeMax = Math.max(maxVal, minVal + 1);

  const renderCustomLines = (props: Record<string, unknown>) => {
    const series = props.series as Array<{
      id: string;
      data: readonly Record<string, unknown>[];
      color: string;
    }>;
    const lineGen = props.lineGenerator as ((d: readonly unknown[]) => string | null) | undefined;
    if (!series || typeof lineGen !== 'function') return null;
    return (
      <>
        {series.map((s) => {
          const isProjected = String(s.id).includes('(Projected)');
          const path = lineGen(s.data);
          return (
            <path
              key={String(s.id)}
              d={path || ''}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeDasharray={isProjected ? '8 4' : undefined}
              opacity={isProjected ? 0.8 : 1}
            />
          );
        })}
      </>
    );
  };

  return (
    <div className="h-[320px]">
      <div className="financial-chart h-full">
        <ResponsiveLine
          data={visibleData}
          margin={{ top: 10, right: 20, left: 60, bottom: 30 }}
          xScale={{ type: 'point' }}
          yScale={{ type: 'linear', min: minVal, max: safeMax * 1.1 }}
          curve="monotoneX"
          colors={({ id }) => {
            const idx = data.findIndex((s) => s.id === id);
            return LINE_COLORS[idx % LINE_COLORS.length];
          }}
          lineWidth={2}
          enablePoints={false}
          enableGridX={false}
          enableGridY={true}
          axisLeft={{
            tickSize: 0, tickPadding: 8,
            format: (v: number) => {
              if (v >= 1000000) return `$${(v / 1000000).toFixed(1)}M`;
              if (v >= 1000) return `$${(v / 1000).toFixed(0)}K`;
              return `$${v}`;
            },
          }}
          axisBottom={{
            tickSize: 0, tickPadding: 8,
            tickValues: visibleData[0]?.data && visibleData[0].data.length > 30 ? Math.max(4, Math.floor(visibleData[0].data.length / 6)) : undefined,
            format: (v: string) => {
              const d = new Date(v + '-01');
              return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
            },
          }}
          theme={nivoTheme}
          useMesh={true}
          animate={visibleData[0]?.data.length < 100}
          layers={[
            'grid',
            'axes',
            'crosshair',
            renderCustomLines as never,
            'points',
            'slices',
            'mesh',
          ]}
          tooltip={({ point }) => {
            const isProjected = String(point.seriesId).includes('(Projected)');
            return (
              <ChartTooltip>
                <TooltipHeader>{String(point.data.xFormatted)}</TooltipHeader>
                <TooltipRow
                  label={`${String(point.seriesId)}${isProjected ? ' (projected)' : ''}`}
                  value={formatCurrency(Number(point.data.y))}
                  color={point.color}
                />
              </ChartTooltip>
            );
          }}
        />
      </div>
    </div>
  );
}