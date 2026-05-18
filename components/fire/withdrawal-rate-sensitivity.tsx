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

const SWR_RATES = [0.025, 0.03, 0.035, 0.04, 0.045, 0.05, 0.055, 0.06];
const RATE_LABELS = ['2.5%', '3.0%', '3.5%', '4.0%', '4.5%', '5.0%', '5.5%', '6.0%'];

export function WithdrawalRateSensitivity({ scenario }: { scenario: FireScenario }) {
  const data = useMemo(() => {
    const realRate = scenario.expectedReturnRate - scenario.inflationRate;
    const currentSWR = scenario.safeWithdrawalRate;

    return SWR_RATES.map((swr, i) => {
      const fireNumber = scenario.targetAnnualExpenses / swr;
      const years = calculateYearsToFI(
        scenario.currentInvestableAssets,
        scenario.annualContributions,
        realRate,
        fireNumber,
      );
      return {
        rate: RATE_LABELS[i],
        fireNumber: Math.round(fireNumber),
        yearsToFI: years === Infinity ? 999 : Math.round(years * 10) / 10,
        isCurrent: swr === currentSWR ? 1 : 0,
      };
    });
  }, [scenario]);

  if (data.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">Withdrawal Rate Sensitivity</h3>
        <ChartEmptyState variant="nodata" description="Enter scenario data to see sensitivity analysis" />
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm p-5">
      <h3 className="text-sm font-semibold text-foreground mb-3">Withdrawal Rate Sensitivity</h3>
      <p className="text-xs text-muted-foreground mb-4">
        How different safe withdrawal rates affect your FIRE number and years to FI
      </p>
      <div className="h-[280px]">
        <ResponsiveBar
          data={data as any}
          keys={['yearsToFI']}
          indexBy="rate"
          margin={{ top: 10, right: 10, left: 55, bottom: 30 }}
          padding={0.25}
          borderRadius={2}
          colors={({ data: d }) =>
            (d as unknown as Record<string, unknown>).isCurrent
              ? 'var(--color-primary)'
              : 'var(--color-chart-2)'
          }
          axisLeft={{
            tickSize: 0, tickPadding: 8,
            format: (v: number) => `${v.toFixed(0)} yrs`,
          }}
          axisBottom={{
            tickSize: 0, tickPadding: 8,
            legend: 'Safe Withdrawal Rate',
            legendPosition: 'middle',
            legendOffset: 22,
          }}
          enableGridY={true}
          enableGridX={false}
          theme={nivoTheme}
          tooltip={({ indexValue, value, data: d }) => {
            const barData = d as unknown as { fireNumber: number; isCurrent: number };
            return (
              <ChartTooltip>
                <TooltipHeader>{String(indexValue)} SWR{barData.isCurrent ? ' (current)' : ''}</TooltipHeader>
                <TooltipRow label="Years to FI" value={`${value.toFixed(1)} yrs`} />
                <TooltipRow label="FIRE Number" value={formatCurrency(barData.fireNumber)} />
              </ChartTooltip>
            );
          }}
        />
      </div>
    </div>
  );
}
