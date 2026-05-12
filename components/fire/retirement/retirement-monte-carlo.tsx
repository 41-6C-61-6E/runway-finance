'use client';

import { useMemo } from 'react';
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

export function RetirementMonteCarlo({
  monteCarlo,
}: {
  monteCarlo: MonteCarloResult;
}) {
  const grade = useMemo(() => getGrade(monteCarlo.successRate), [monteCarlo.successRate]);

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

      <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${monteCarlo.successRate}%`,
            background: getSuccessColor(monteCarlo.successRate),
          }}
        />
      </div>

      <div className="flex justify-between text-[10px] text-muted-foreground mt-1.5">
        <span>0%</span>
        <span>50%</span>
        <span>100%</span>
      </div>

      <div className="grid grid-cols-3 gap-4 mt-5 pt-4 border-t border-border">
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">P10 (Worst)</p>
          <p className="text-sm font-semibold text-destructive">
            {monteCarlo.p10Path.length > 0
              ? `$${(monteCarlo.p10Path[monteCarlo.p10Path.length - 1].balance / 1000).toFixed(0)}K`
              : '$0'}
          </p>
          <p className="text-[10px] text-muted-foreground">End balance at 10th percentile</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">Median (P50)</p>
          <p className="text-sm font-semibold text-foreground">
            {monteCarlo.medianPath.length > 0
              ? `$${(monteCarlo.medianPath[monteCarlo.medianPath.length - 1].balance / 1000).toFixed(0)}K`
              : '$0'}
          </p>
          <p className="text-[10px] text-muted-foreground">Median end balance</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">P90 (Best)</p>
          <p className="text-sm font-semibold text-chart-1">
            {monteCarlo.p90Path.length > 0
              ? `$${(monteCarlo.p90Path[monteCarlo.p90Path.length - 1].balance / 1000).toFixed(0)}K`
              : '$0'}
          </p>
          <p className="text-[10px] text-muted-foreground">End balance at 90th percentile</p>
        </div>
      </div>
    </div>
  );
}
