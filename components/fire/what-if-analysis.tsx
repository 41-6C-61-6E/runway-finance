'use client';

import { useMemo } from 'react';
import { ResponsiveBar } from '@nivo/bar';
import { formatCurrency } from '@/lib/utils/format';
import { nivoTheme } from '@/components/charts/shared-chart-theme';
import { ChartEmptyState } from '@/components/charts/chart-empty-state';
import { ChartTooltip, TooltipRow, TooltipHeader } from '@/components/charts/chart-tooltip';

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
  const { rows, baseline } = useMemo(() => {
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

    const scenarios: { label: string; id: string; years: number }[] = [
      {
        label: 'Save $500 more/mo',
        id: 'save500',
        years: calculateYearsToFI(
          baseScenario.currentInvestableAssets,
          baseScenario.annualContributions + 500 * 12,
          realRate,
          fireNumber,
        ),
      },
      {
        label: 'Save $1,000 more/mo',
        id: 'save1000',
        years: calculateYearsToFI(
          baseScenario.currentInvestableAssets,
          baseScenario.annualContributions + 1000 * 12,
          realRate,
          fireNumber,
        ),
      },
      {
        label: '1% higher returns',
        id: 'higherRet',
        years: calculateYearsToFI(
          baseScenario.currentInvestableAssets,
          baseScenario.annualContributions,
          realRate + 0.01,
          fireNumber,
        ),
      },
      {
        label: '1% lower returns',
        id: 'lowerRet',
        years: calculateYearsToFI(
          baseScenario.currentInvestableAssets,
          baseScenario.annualContributions,
          realRate - 0.01,
          fireNumber,
        ),
      },
      {
        label: 'Retire with $10k less/yr',
        id: 'lessExpense',
        years: calculateYearsToFI(
          baseScenario.currentInvestableAssets,
          baseScenario.annualContributions,
          realRate,
          (baseScenario.targetAnnualExpenses - 10000) / baseScenario.safeWithdrawalRate,
        ),
      },
    ];

    return { rows: scenarios, baseline };
  }, [baseScenario]);

  const chartData = rows.map((r) => ({
    scenario: r.label,
    id: r.id,
    years: r.years === Infinity ? 999 : r.years,
    isFaster: r.years !== Infinity && r.years < baseline ? 1 : 0,
    diff: r.years === Infinity || baseline === Infinity ? 0 : baseline - r.years,
  }));

  const maxY = Math.max(...chartData.map((d) => d.years), baseline, 10);

  if (chartData.length === 0 || maxY >= 999) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">What-If Analysis</h3>
        <ChartEmptyState variant="nodata" description="Adjust scenario inputs to see what-if analysis" />
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm p-5">
      <h3 className="text-sm font-semibold text-foreground mb-4">What-If Analysis</h3>
      <p className="text-xs text-muted-foreground mb-4">
        Baseline: {baseline === Infinity ? '∞' : `${baseline.toFixed(1)} yrs`} to FI
      </p>
      <div className="h-[280px]">
        <ResponsiveBar
          data={chartData as any}
          keys={['years']}
          indexBy="scenario"
          margin={{ top: 10, right: 80, left: 110, bottom: 40 }}
          padding={0.3}
          borderRadius={2}
          layout="horizontal"
          colors={({ data: d }) =>
            (d as unknown as { isFaster: number }).isFaster
              ? 'var(--color-chart-1)'
              : 'var(--color-destructive)'
          }
          axisLeft={{
            tickSize: 0, tickPadding: 8,
            format: (v: string) => v.length > 18 ? v.slice(0, 16) + '…' : v,
          }}
          axisBottom={{
            tickSize: 0, tickPadding: 8,
            legend: 'Years to FI',
            legendPosition: 'middle',
            legendOffset: 30,
          }}
          enableGridY={false}
          enableGridX={true}
          theme={nivoTheme}
          tooltip={({ indexValue, value, data: d }) => {
            const barData = d as unknown as { diff: number; isFaster: boolean };
            return (
              <ChartTooltip>
                <TooltipHeader>{String(indexValue)}</TooltipHeader>
                <TooltipRow label="Years to FI" value={`${value.toFixed(1)} yrs`} />
                {barData.isFaster ? (
                  <TooltipRow label="vs Baseline" value={`-${barData.diff.toFixed(1)} yrs`} color="var(--color-chart-1)" />
                ) : !barData.diff ? (
                  <TooltipRow label="vs Baseline" value="Same" color="var(--color-muted-foreground)" />
                ) : (
                  <TooltipRow label="vs Baseline" value={`+${Math.abs(barData.diff).toFixed(1)} yrs`} color="var(--color-destructive)" />
                )}
              </ChartTooltip>
            );
          }}
        />
      </div>
    </div>
  );
}
