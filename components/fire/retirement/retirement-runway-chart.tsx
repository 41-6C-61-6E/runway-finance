'use client';

import { useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { formatCurrency } from '@/lib/utils/format';
import { ChartTooltip, TooltipRow, TooltipHeader } from '@/components/charts/chart-tooltip';
import { ChartEmptyState } from '@/components/charts/chart-empty-state';
import { ChartTypeSelector, type ChartType } from '@/components/charts/chart-type-selector';
import type { ProjectionResult, MonteCarloResult } from '@/lib/services/retirement';
import { usePersistentState } from '@/lib/hooks/use-persistent-state';

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
  const [chartType, setChartType] = usePersistentState<ChartType>('runway:retirement-runway:chartType', 'line');

  const chartData = useMemo(() => {
    return projection.years.map((y, idx) => {
      const dataPoint: any = {
        age: String(y.age),
        'Portfolio Balance': y.endBalance,
        Depleted: 0,
      };

      if (monteCarlo) {
        const medianP = monteCarlo.medianPath[idx];
        const p10P = monteCarlo.p10Path[idx];
        const p90P = monteCarlo.p90Path[idx];
        if (medianP) dataPoint['Median (MC)'] = medianP.balance;
        if (p10P) dataPoint['P10 (MC)'] = p10P.balance;
        if (p90P) dataPoint['P90 (MC)'] = p90P.balance;
      }
      return dataPoint;
    });
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

  const xInterval = projection.years.length > 40 ? Math.max(4, Math.floor(projection.years.length / 8)) : 0;

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">Retirement Runway</h3>
        <ChartTypeSelector value={chartType} options={typeOptions} onChange={setChartType} />
      </div>
      <div className="h-[400px]">
        {chartType === 'bar' ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={projection.years.map((y) => ({ age: String(y.age), balance: y.endBalance }))}
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
                tickFormatter={(v: number) => {
                  if (v >= 1000000) return `$${(v / 1000000).toFixed(1)}M`;
                  if (v >= 1000) return `$${(v / 1000).toFixed(0)}K`;
                  return `$${v}`;
                }}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload || !payload.length) return null;
                  const item = payload[0].payload;
                  return (
                    <ChartTooltip>
                      <TooltipHeader>Age {item.age}</TooltipHeader>
                      <TooltipRow label="Portfolio" value={formatCurrency(item.balance)} />
                    </ChartTooltip>
                  );
                }}
                cursor={{ fill: 'var(--color-border)', opacity: 0.15 }}
              />
              <Bar
                dataKey="balance"
                fill={projection.success ? 'var(--color-chart-1)' : 'var(--color-destructive)'}
                radius={[2, 2, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 10, right: monteCarlo ? 120 : 30, left: 10, bottom: 20 }}
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
                tickFormatter={(v: number) => {
                  if (v >= 1000000) return `$${(v / 1000000).toFixed(1)}M`;
                  if (v >= 1000) return `$${(v / 1000).toFixed(0)}K`;
                  return `$${v}`;
                }}
                domain={[0, Math.ceil(maxY * 1.1)]}
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
              {monteCarlo && (
                <Legend
                  layout="vertical"
                  align="right"
                  verticalAlign="top"
                  wrapperStyle={{ right: 0, paddingLeft: 10, fontSize: 12 }}
                />
              )}
              <Line
                type="monotone"
                dataKey="Portfolio Balance"
                stroke="var(--color-primary)"
                strokeWidth={2}
                dot={false}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="Depleted"
                stroke="var(--color-destructive)"
                strokeWidth={2}
                strokeDasharray="4 4"
                dot={false}
                connectNulls
              />
              {monteCarlo && (
                <>
                  <Line
                    type="monotone"
                    dataKey="Median (MC)"
                    stroke="var(--color-chart-3)"
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="P10 (MC)"
                    stroke="var(--color-chart-2)"
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="P90 (MC)"
                    stroke="var(--color-chart-1)"
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                </>
              )}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
