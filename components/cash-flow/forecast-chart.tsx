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

  if (visibleData.length === 0) return null;

  const renderCustomLines = (props: Record<string, unknown>) => {
    const lines = props.lines as Array<{
      id: string | number;
      path: string;
      color: string;
    }>;
    return (
      <>
        {lines.map((line) => {
          const isProjected = String(line.id).includes('(Projected)');
          return (
            <path
              key={String(line.id)}
              d={line.path}
              fill="none"
              stroke={line.color}
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
          yScale={{ type: 'linear', min: 0, max: Math.max(...data.flatMap((s) => s.data.map((d) => d.y)), 1) * 1.1 }}
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
            tickValues: visibleData[0]?.data.length > 30 ? Math.max(4, Math.floor(visibleData[0].data.length / 6)) : undefined,
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