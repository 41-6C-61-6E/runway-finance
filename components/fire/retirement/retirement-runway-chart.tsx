'use client';

import { useMemo, useState } from 'react';
import { ResponsiveLine } from '@nivo/line';
import { ResponsiveBar } from '@nivo/bar';
import { formatCurrency } from '@/lib/utils/format';
import { nivoTheme } from '@/components/charts/shared-chart-theme';
import { ChartTooltip, TooltipRow, TooltipHeader } from '@/components/charts/chart-tooltip';
import { ChartEmptyState } from '@/components/charts/chart-empty-state';
import { ChartTypeSelector, type ChartType } from '@/components/charts/chart-type-selector';
import type { ProjectionResult, MonteCarloResult } from '@/lib/services/retirement';

const typeOptions = [
  { value: 'line' as ChartType, label: 'Line' },
  { value: 'bar' as ChartType, label: 'Bar' },
];

export function RetirementRunwayChart({
  projection,
  monteCarlo,
}: {
  projection: ProjectionResult;
  monteCarlo?: MonteCarloResult;
}) {
  const [chartType, setChartType] = useState<ChartType>('line');

  const lineData = useMemo(() => {
    const mainLine = {
      id: 'Portfolio Balance',
      data: projection.years.map((y) => ({
        x: String(y.age),
        y: y.endBalance,
      })),
    };

    const zeroLine = {
      id: 'Depleted',
      data: projection.years.map((y) => ({
        x: String(y.age),
        y: 0,
      })),
    };

    const series = [mainLine, zeroLine];

    if (monteCarlo) {
      series.push({
        id: 'Median (MC)',
        data: monteCarlo.medianPath.map((p) => ({ x: String(p.age), y: p.balance })),
      });
      series.push({
        id: 'P10 (MC)',
        data: monteCarlo.p10Path.map((p) => ({ x: String(p.age), y: p.balance })),
      });
      series.push({
        id: 'P90 (MC)',
        data: monteCarlo.p90Path.map((p) => ({ x: String(p.age), y: p.balance })),
      });
    }

    return series;
  }, [projection, monteCarlo]);

  const maxY = Math.max(
    ...projection.years.map((y) => y.endBalance),
    monteCarlo ? Math.max(...monteCarlo.p90Path.map((p) => p.balance)) : 0,
    1000,
  );

  if (projection.years.length < 2) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">Retirement Runway</h3>
        <div className="h-[400px]">
          <ChartEmptyState variant="insufficient" description="Adjust retirement assumptions to see projections" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">Retirement Runway</h3>
        <ChartTypeSelector value={chartType} options={typeOptions} onChange={setChartType} />
      </div>
      <div className="h-[400px]">
        {chartType === 'bar' ? (
          <ResponsiveBar
            data={projection.years.map((y) => ({ age: String(y.age), balance: y.endBalance }))}
            keys={['balance']}
            indexBy="age"
            margin={{ top: 10, right: 10, left: 65, bottom: 40 }}
            padding={0.1}
            borderRadius={2}
            colors={[projection.success ? 'var(--color-chart-1)' : 'var(--color-destructive)']}
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
              tickValues: projection.years.length > 40 ? Math.max(4, Math.floor(projection.years.length / 8)) : undefined,
              legend: 'Age', legendPosition: 'middle', legendOffset: 30,
            }}
            enableGridY={true}
            enableGridX={false}
            theme={nivoTheme}
            animate={projection.years.length < 100}
            tooltip={({ indexValue, value }) => (
              <ChartTooltip>
                <TooltipHeader>Age {indexValue}</TooltipHeader>
                <TooltipRow label="Portfolio" value={formatCurrency(value)} />
              </ChartTooltip>
            )}
          />
        ) : (
          <ResponsiveLine
            data={lineData}
            margin={{ top: 10, right: monteCarlo ? 140 : 30, left: 65, bottom: 40 }}
            xScale={{ type: 'point' }}
            yScale={{ type: 'linear', min: 0, max: maxY * 1.1 }}
            curve="monotoneX"
            colors={[
              'var(--color-primary)',
              'var(--color-destructive)',
              'var(--color-chart-3)',
              'var(--color-chart-2)',
              'var(--color-chart-1)',
            ]}
            lineWidth={2}
            enablePoints={false}
            enableGridX={true}
            axisBottom={{
              tickSize: 0, tickPadding: 8,
              legend: 'Age', legendPosition: 'middle', legendOffset: 30,
            }}
            axisLeft={{
              tickSize: 0, tickPadding: 8,
              format: (v: number) => {
                if (v >= 1000000) return `$${(v / 1000000).toFixed(1)}M`;
                if (v >= 1000) return `$${(v / 1000).toFixed(0)}K`;
                return `$${v}`;
              },
            }}
            theme={nivoTheme}
            useMesh={true}
            enableSlices="x"
            animate={projection.years.length < 100}
            sliceTooltip={({ slice }) => (
              <ChartTooltip>
                <TooltipHeader>Age {String(slice.points[0]?.data.xFormatted)}</TooltipHeader>
                {slice.points.map((point) => (
                  <TooltipRow
                    key={point.id}
                    label={String(point.seriesId)}
                    value={formatCurrency(Number(point.data.y))}
                    color={point.color}
                  />
                ))}
              </ChartTooltip>
            )}
            legends={[
              {
                anchor: 'top-right',
                direction: 'column',
                justify: false,
                translateX: 140,
                translateY: 0,
                itemsSpacing: 0,
                itemDirection: 'left-to-right',
                itemWidth: 120,
                itemHeight: 20,
                itemOpacity: 0.75,
                symbolSize: 12,
                symbolShape: 'circle',
                effects: [{ on: 'hover', style: { itemOpacity: 1 } }],
              },
            ]}
          />
        )}
      </div>
    </div>
  );
}
