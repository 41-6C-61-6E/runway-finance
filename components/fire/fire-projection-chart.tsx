'use client';

import { useMemo } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { formatCurrency } from '@/lib/utils/format';
import { ChartTooltip, TooltipRow, TooltipHeader } from '@/components/charts/chart-tooltip';
import { ChartEmptyState } from '@/components/charts/chart-empty-state';
import { ChartTypeSelector, type ChartType } from '@/components/charts/chart-type-selector';
import { usePersistentState } from '@/lib/hooks/use-persistent-state';

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
  const [chartType, setChartType] = usePersistentState<ChartType>('runway:fire-projection:chartType', 'line');

  const fireNumber = scenario.safeWithdrawalRate > 0
    ? scenario.targetAnnualExpenses / scenario.safeWithdrawalRate
    : 0;
  const numYears = Math.max(scenario.targetAge - scenario.currentAge, 1);
  const baseRate = scenario.expectedReturnRate - scenario.inflationRate;

  const chartData = useMemo(() => {
    const list = [];
    for (let i = 0; i <= numYears; i++) {
      const age = String(scenario.currentAge + i);
      list.push({
        age,
        Conservative: Math.round(calculatePortfolioValue(
          scenario.currentInvestableAssets,
          scenario.annualContributions,
          Math.max(baseRate - 0.02, 0),
          i,
        )),
        Moderate: Math.round(calculatePortfolioValue(
          scenario.currentInvestableAssets,
          scenario.annualContributions,
          Math.max(baseRate, 0),
          i,
        )),
        Aggressive: Math.round(calculatePortfolioValue(
          scenario.currentInvestableAssets,
          scenario.annualContributions,
          Math.max(baseRate + 0.02, 0),
          i,
        )),
        'FIRE Number': Math.round(fireNumber),
      });
    }
    return list;
  }, [scenario, baseRate, numYears, fireNumber]);

  const formatTick = (v: number) => {
    if (v >= 1000000) return `$${(v / 1000000).toFixed(1)}M`;
    if (v >= 1000) return `$${(v / 1000).toFixed(0)}K`;
    return `$${v}`;
  };

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

  const xInterval = Math.max(1, Math.ceil(chartData.length / 10));

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">Portfolio Projection</h3>
        <ChartTypeSelector value={chartType} options={typeOptions} onChange={setChartType} />
      </div>
      <div className="h-[400px]">
        {chartType === 'bar' ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 10, right: 10, left: 10, bottom: 20 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} horizontal={true} />
              <XAxis
                dataKey="age"
                tickLine={false}
                axisLine={{ stroke: 'var(--color-border)' }}
                tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
                interval={xInterval}
                label={{ value: 'Age', position: 'insideBottom', offset: -5, fill: 'var(--color-muted-foreground)', fontSize: 11 }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
                width={65}
                tickFormatter={formatTick}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload || !payload.length) return null;
                  const item = payload[0].payload;
                  return (
                    <ChartTooltip>
                      <TooltipHeader>Age {item.age}</TooltipHeader>
                      <TooltipRow label="Moderate" value={formatCurrency(item.Moderate)} color="var(--color-chart-1)" />
                    </ChartTooltip>
                  );
                }}
                cursor={{ fill: 'var(--color-border)', opacity: 0.15 }}
              />
              <Bar dataKey="Moderate" fill="var(--color-chart-1)" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 10, right: 120, left: 10, bottom: 20 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={true} horizontal={true} />
              <XAxis
                dataKey="age"
                tickLine={false}
                axisLine={{ stroke: 'var(--color-border)' }}
                tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
                interval={xInterval}
                label={{ value: 'Age', position: 'insideBottom', offset: -5, fill: 'var(--color-muted-foreground)', fontSize: 11 }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
                width={65}
                tickFormatter={formatTick}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload || !payload.length) return null;
                  return (
                    <ChartTooltip>
                      <TooltipHeader>Age {label}</TooltipHeader>
                      {payload.map((p) => (
                        <TooltipRow
                          key={p.name}
                          label={String(p.name)}
                          value={formatCurrency(Number(p.value))}
                          color={p.color}
                        />
                      ))}
                    </ChartTooltip>
                  );
                }}
              />
              <Legend
                layout="vertical"
                align="right"
                verticalAlign="top"
                wrapperStyle={{ right: 0, paddingLeft: 10, fontSize: 12 }}
              />
              <Line
                type="monotone"
                dataKey="Conservative"
                stroke="var(--color-chart-3)"
                strokeWidth={2}
                dot={false}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="Moderate"
                stroke="var(--color-primary)"
                strokeWidth={2}
                dot={false}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="Aggressive"
                stroke="var(--color-chart-1)"
                strokeWidth={2}
                dot={false}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="FIRE Number"
                stroke="var(--color-destructive)"
                strokeWidth={2}
                strokeDasharray="4 4"
                dot={false}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
