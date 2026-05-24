'use client';

import { useMemo } from 'react';
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ChartTooltip, TooltipRow, TooltipHeader } from '@/components/charts/chart-tooltip';
import type { MonteCarloResult } from '@/lib/services/retirement';

function getSuccessColor(rate: number): string {
  if (rate >= 80) return 'var(--color-chart-1)';
  if (rate >= 50) return 'var(--color-chart-3)';
  return 'var(--color-destructive)';
}

function getGrade(rate: number): { label: string; color: string } {
  if (rate >= 90) return { label: 'A', color: 'text-chart-1' };
  if (rate >= 80) return { label: 'B', color: 'text-chart-1' };
  if (rate >= 70) return { label: 'C', color: 'text-chart-3' };
  if (rate >= 50) return { label: 'D', color: 'text-chart-3' };
  return { label: 'F', color: 'text-destructive' };
}

function formatCompact(value: number): string {
  if (value >= 1000000000) return `$${(value / 1000000000).toFixed(1)}B`;
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

export function RetirementMonteCarlo({
  monteCarlo,
}: {
  monteCarlo: MonteCarloResult;
}) {
  const grade = useMemo(() => getGrade(monteCarlo.successRate), [monteCarlo.successRate]);

  const histData = useMemo(() => {
    return monteCarlo.histogram.map((bin) => ({
      id: `${formatCompact(bin.min)}-${formatCompact(bin.max)}`,
      range: `${formatCompact(bin.min)}-${formatCompact(bin.max)}`,
      count: bin.count,
      pct: ((bin.count / monteCarlo.simulations) * 100).toFixed(1),
      min: bin.min,
      max: bin.max,
    }));
  }, [monteCarlo]);

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm p-5">
      <h3 className="text-sm font-semibold text-foreground mb-4">Monte Carlo Analysis</h3>
      <p className="text-xs text-muted-foreground mb-4">
        Based on {monteCarlo.simulations.toLocaleString()} simulations with randomized annual returns (normal distribution, 10% std dev)
      </p>

      <div className="flex items-center gap-8 mb-5">
        <div className="flex flex-col items-center">
          <div
            className="text-4xl font-bold"
            style={{ color: getSuccessColor(monteCarlo.successRate) }}
          >
            {monteCarlo.successRate}%
          </div>
          <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wider">Success Rate</p>
        </div>
        <div className="flex flex-col items-center">
          <div className={`text-4xl font-bold ${grade.color}`}>{grade.label}</div>
          <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wider">Grade</p>
        </div>
      </div>

      <div className="w-full bg-muted rounded-full h-3 overflow-hidden mb-5">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${monteCarlo.successRate}%`,
            background: getSuccessColor(monteCarlo.successRate),
          }}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">P10 (Worst)</p>
          <p className="text-sm font-semibold text-destructive">
            {monteCarlo.p10Path.length > 0
              ? formatCompact(monteCarlo.p10Path[monteCarlo.p10Path.length - 1].balance)
              : '$0'}
          </p>
          <p className="text-[10px] text-muted-foreground">End balance at 10th percentile</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">Median (P50)</p>
          <p className="text-sm font-semibold text-foreground">
            {monteCarlo.medianPath.length > 0
              ? formatCompact(monteCarlo.medianPath[monteCarlo.medianPath.length - 1].balance)
              : '$0'}
          </p>
          <p className="text-[10px] text-muted-foreground">Median end balance</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">P90 (Best)</p>
          <p className="text-sm font-semibold text-chart-1">
            {monteCarlo.p90Path.length > 0
              ? formatCompact(monteCarlo.p90Path[monteCarlo.p90Path.length - 1].balance)
              : '$0'}
          </p>
          <p className="text-[10px] text-muted-foreground">End balance at 90th percentile</p>
        </div>
      </div>

      <div className="pt-4 border-t border-border">
        <p className="text-xs font-semibold text-foreground mb-3">End Balance Distribution</p>
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 100, height: 100 }}>
            <BarChart
              data={histData}
              margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} horizontal={true} />
              <XAxis
                dataKey="id"
                tick={false}
                tickLine={false}
                axisLine={{ stroke: 'var(--color-border)' }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
                width={35}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload || !payload.length) return null;
                  const item = payload[0].payload;
                  return (
                    <ChartTooltip>
                      <TooltipHeader>{item.range}</TooltipHeader>
                      <TooltipRow label="Simulations" value={`${item.count} (${item.pct}%)`} />
                    </ChartTooltip>
                  );
                }}
                cursor={{ fill: 'var(--color-border)', opacity: 0.15 }}
              />
              <Bar dataKey="count" radius={[2, 2, 0, 0]}>
                {histData.map((entry, index) => {
                  const fillCol = entry.min >= 0 ? 'var(--color-chart-1)' : 'var(--color-destructive)';
                  return <Cell key={`cell-${index}`} fill={fillCol} />;
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
          <span>{formatCompact(monteCarlo.histogram[0]?.min ?? 0)}</span>
          <span>{formatCompact(monteCarlo.histogram[monteCarlo.histogram.length - 1]?.max ?? 0)}</span>
        </div>
      </div>
    </div>
  );
}
