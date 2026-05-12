'use client';

import { formatCurrency } from '@/lib/utils/format';
import type { ProjectionResult } from '@/lib/services/retirement';

export function RetirementMetrics({
  projection,
  successRate,
}: {
  projection: ProjectionResult;
  successRate?: number;
}) {
  const metrics = [
    {
      label: 'Portfolio Runway',
      value: `${projection.yearsOfRunway}yrs`,
      sub: `of ${projection.years.length} years`,
      color: projection.success ? 'text-chart-1' : 'text-destructive',
    },
    {
      label: 'End Balance',
      value: formatCurrency(projection.endBalance),
      sub: projection.success ? 'Legacy goal met' : 'Portfolio depleted',
      color: projection.success ? 'text-chart-1' : 'text-destructive',
    },
    {
      label: 'Peak Portfolio',
      value: formatCurrency(projection.peakPortfolio),
      sub: 'Highest balance in retirement',
      color: 'text-foreground',
    },
    {
      label: 'Total Withdrawn',
      value: formatCurrency(projection.totalWithdrawn),
      sub: `vs ${formatCurrency(projection.totalIncome)} total income`,
      color: 'text-foreground',
    },
  ];

  const mcMetrics = successRate !== undefined
    ? {
        label: 'Monte Carlo Success',
        value: `${successRate}%`,
        sub: `${1000} simulations`,
        color: successRate >= 80 ? 'text-chart-1' : successRate >= 50 ? 'text-chart-3' : 'text-destructive',
      }
    : null;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {metrics.map((m) => (
        <div key={m.label} className="bg-card border border-border rounded-xl shadow-sm p-5">
          <p className="text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">{m.label}</p>
          <p className={`text-xl font-bold financial-value ${m.color}`}>{m.value}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">{m.sub}</p>
        </div>
      ))}
      {mcMetrics && (
        <div className="bg-card border border-border rounded-xl shadow-sm p-5 lg:col-span-4">
          <p className="text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">{mcMetrics.label}</p>
          <p className={`text-xl font-bold financial-value ${mcMetrics.color}`}>{mcMetrics.value}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">{mcMetrics.sub}</p>
        </div>
      )}
    </div>
  );
}
