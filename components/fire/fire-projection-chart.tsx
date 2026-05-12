'use client';

import { useMemo, useState } from 'react';
import { ResponsiveLine } from '@nivo/line';
import { ResponsiveBar } from '@nivo/bar';
import { formatCurrency } from '@/lib/utils/format';
import { nivoTheme } from '@/components/charts/shared-chart-theme';
import { ChartTooltip, TooltipRow, TooltipHeader } from '@/components/charts/chart-tooltip';
import { ChartEmptyState } from '@/components/charts/chart-empty-state';
import { ChartTypeSelector, type ChartType } from '@/components/charts/chart-type-selector';

interface FireScenario {
  currentAge: number;
  targetAge: number;
  targetAnnualExpenses: number;
  currentInvestableAssets: number;
  annualContributions: number;
  expectedReturnRate: number;
  inflationRate: number;
  safeWithdrawalRate: number;
}

function calculatePortfolioValue(
  currentInvestableAssets: number,
  annualContributions: number,
  rate: number,
  years: number,
): number {
  const realRate = rate;
  if (realRate === 0) return currentInvestableAssets + annualContributions * years;
  return currentInvestableAssets * Math.pow(1 + realRate, years) +
    annualContributions * ((Math.pow(1 + realRate, years) - 1) / realRate);
}

const typeOptions = [
  { value: 'line' as ChartType, label: 'Line' },
  { value: 'bar' as ChartType, label: 'Bar' },
];

export function FireProjectionChart({ scenario }: { scenario: FireScenario }) {
  const [chartType, setChartType] = useState<ChartType>('line');

  const fireNumber = scenario.safeWithdrawalRate > 0
    ? scenario.targetAnnualExpenses / scenario.safeWithdrawalRate
    : 0;
  const numYears = Math.max(scenario.targetAge - scenario.currentAge, 1);
  const baseRate = scenario.expectedReturnRate - scenario.inflationRate;

  const series = useMemo(() => {
    const labels: string[] = [];
    for (let i = 0; i <= numYears; i++) {
      labels.push(String(scenario.currentAge + i));
    }

    const buildData = (rateOffset: number) => ({
      id: rateOffset === -0.02 ? 'Conservative' : rateOffset === 0.02 ? 'Aggressive' : 'Moderate',
      data: labels.map((age, i) => ({
        x: age,
        y: Math.round(calculatePortfolioValue(
          scenario.currentInvestableAssets,
          scenario.annualContributions,
          Math.max(baseRate + rateOffset, 0),
          i,
        )),
      })),
    });

    return [buildData(-0.02), buildData(0), buildData(0.02)];
  }, [scenario, baseRate, numYears]);

  const fireLine = Array.from({ length: numYears + 1 }, (_, i) => ({
    x: String(scenario.currentAge + i),
    y: Math.round(fireNumber),
  }));

  const allData = [
    ...series,
    { id: 'FIRE Number', data: fireLine },
  ];

  const minY = 0;
  const maxY = Math.max(
    ...series.flatMap((s) => s.data.map((d) => d.y)),
    fireNumber,
    1000,
  );

  if (numYears < 2 || (scenario.currentInvestableAssets === 0 && scenario.annualContributions === 0)) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">Portfolio Projection</h3>
        <div className="h-[400px]">
          <ChartEmptyState variant="insufficient" description="Enter your current assets and contributions to see projections" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">Portfolio Projection</h3>
        <ChartTypeSelector value={chartType} options={typeOptions} onChange={setChartType} />
      </div>
      <div className="h-[400px]">
        {chartType === 'bar' ? (
          <ResponsiveBar
            data={series[1].data.map((d) => ({ age: d.x, value: d.y }))}
            keys={['value']}
            indexBy="age"
            margin={{ top: 10, right: 10, left: 65, bottom: 40 }}
            padding={0.3}
            borderRadius={2}
            colors={['var(--color-chart-1)']}
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
              legend: 'Age',
              legendPosition: 'middle',
              legendOffset: 30,
            }}
            enableGridY={true}
            enableGridX={false}
            theme={nivoTheme}
            tooltip={({ indexValue, value }) => (
              <ChartTooltip>
                <TooltipHeader>Age {indexValue}</TooltipHeader>
                <TooltipRow label="Moderate" value={formatCurrency(value)} />
              </ChartTooltip>
            )}
          />
        ) : (
          <ResponsiveLine
            data={allData}
            margin={{ top: 10, right: 120, left: 65, bottom: 40 }}
            xScale={{ type: 'point' }}
            yScale={{ type: 'linear', min: minY, max: maxY * 1.1 }}
            curve="monotoneX"
            colors={['var(--color-chart-3)', 'var(--color-primary)', 'var(--color-chart-1)', 'var(--color-destructive)']}
            lineWidth={2}
            enablePoints={false}
            enableGridX={true}
            axisBottom={{
              tickSize: 0, tickPadding: 8,
              legend: 'Age',
              legendPosition: 'middle',
              legendOffset: 30,
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
                translateX: 120,
                translateY: 0,
                itemsSpacing: 0,
                itemDirection: 'left-to-right',
                itemWidth: 100,
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
