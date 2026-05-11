'use client';

import { useMemo } from 'react';
import { formatCurrency } from '@/lib/utils/format';

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

function calculateYearsToFI(
  current: number,
  annual: number,
  rate: number,
  target: number,
): number {
  if (target <= current) return 0;
  if (rate <= 0) {
    return annual > 0 ? (target - current) / annual : Infinity;
  }
  const pmtPart = annual / rate;
  const needed = target - current;
  const years = Math.log((needed + pmtPart) / pmtPart) / Math.log(1 + rate);
  return years > 0 ? years : 0;
}

export function WhatIfAnalysis({ baseScenario }: { baseScenario: FireScenario }) {
  const rows = useMemo(() => {
    const fireNumber = baseScenario.safeWithdrawalRate > 0
      ? baseScenario.targetAnnualExpenses / baseScenario.safeWithdrawalRate
      : 0;
    const realRate = baseScenario.expectedReturnRate - baseScenario.inflationRate;

    const baseline = calculateYearsToFI(
      baseScenario.currentInvestableAssets,
      baseScenario.annualContributions,
      realRate,
      fireNumber,
    );

    const scenarios: { label: string; years: number }[] = [
      {
        label: 'Save $500 more / month',
        years: calculateYearsToFI(
          baseScenario.currentInvestableAssets,
          baseScenario.annualContributions + 500 * 12,
          realRate,
          fireNumber,
        ),
      },
      {
        label: 'Save $1,000 more / month',
        years: calculateYearsToFI(
          baseScenario.currentInvestableAssets,
          baseScenario.annualContributions + 1000 * 12,
          realRate,
          fireNumber,
        ),
      },
      {
        label: '1% higher returns',
        years: calculateYearsToFI(
          baseScenario.currentInvestableAssets,
          baseScenario.annualContributions,
          realRate + 0.01,
          fireNumber,
        ),
      },
      {
        label: '1% lower returns',
        years: calculateYearsToFI(
          baseScenario.currentInvestableAssets,
          baseScenario.annualContributions,
          realRate - 0.01,
          fireNumber,
        ),
      },
      {
        label: 'Retire with $10k less/yr',
        years: calculateYearsToFI(
          baseScenario.currentInvestableAssets,
          baseScenario.annualContributions,
          realRate,
          (baseScenario.targetAnnualExpenses - 10000) / baseScenario.safeWithdrawalRate,
        ),
      },
    ];

    return scenarios.map((s) => ({
      ...s,
      diff: s.years === Infinity || baseline === Infinity
        ? 0
        : baseline - s.years,
    }));
  }, [baseScenario]);

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm p-5">
      <h3 className="text-sm font-semibold text-foreground mb-4">What-If Analysis</h3>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">No analysis available</p>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <div
              key={row.label}
              className="flex items-center justify-between py-2 border-b border-border last:border-0"
            >
              <span className="text-sm text-foreground">{row.label}</span>
              <div className="text-right">
                <span className="text-sm font-medium text-foreground">
                  {row.years === Infinity ? '∞' : `${row.years.toFixed(1)} yrs`}
                </span>
                <span
                  className={`ml-2 text-xs font-semibold ${
                    row.diff > 0 ? 'text-chart-1' : row.diff < 0 ? 'text-destructive' : 'text-muted-foreground'
                  }`}
                >
                  {row.diff > 0 ? '-' : row.diff < 0 ? '+' : ''}
                  {row.diff === Infinity || isNaN(row.diff)
                    ? '—'
                    : `${Math.abs(row.diff).toFixed(1)} yrs`}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
