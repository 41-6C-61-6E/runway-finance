'use client';

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
  const needed = target - current * Math.pow(1 + rate, 0);
  const pmtPart = annual / rate;
  const years = Math.log((needed + pmtPart) / pmtPart) / Math.log(1 + rate);
  return years > 0 ? years : 0;
}

export function FireMetrics({ scenario }: { scenario: FireScenario }) {
  const fireNumber = scenario.safeWithdrawalRate > 0
    ? scenario.targetAnnualExpenses / scenario.safeWithdrawalRate
    : 0;
  const percentToFire = fireNumber > 0
    ? (scenario.currentInvestableAssets / fireNumber) * 100
    : 0;
  const realRate = scenario.expectedReturnRate - scenario.inflationRate;
  const yearsToFI = calculateYearsToFI(
    scenario.currentInvestableAssets,
    scenario.annualContributions,
    realRate,
    fireNumber,
  );

  const metrics = [
    { label: 'FIRE Number', value: formatCurrency(fireNumber) },
    { label: 'Current Savings', value: formatCurrency(scenario.currentInvestableAssets) },
    { label: '% to FIRE', value: `${Math.min(percentToFire, 9999).toFixed(1)}%` },
    {
      label: 'Years to FI',
      value: yearsToFI === Infinity ? '∞' : `${yearsToFI.toFixed(1)}yrs`,
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {metrics.map((m) => (
        <div
          key={m.label}
          className="bg-card border border-border rounded-xl shadow-sm p-5"
        >
          <p className="text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">
            {m.label}
          </p>
          <p className="text-xl font-bold text-foreground financial-value">
            {m.value}
          </p>
        </div>
      ))}
    </div>
  );
}
