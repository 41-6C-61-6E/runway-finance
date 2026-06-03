'use client';

import { useMemo } from 'react';
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatCurrency } from '@/lib/utils/format';
import { ChartEmptyState } from '@/components/charts/chart-empty-state';
import { ChartTooltip, TooltipRow, TooltipHeader } from '@/components/charts/chart-tooltip';
import { useCardCollapsed } from '@/lib/hooks/use-card-collapsed';
import { CollapsibleCardHeader } from '@/components/ui/collapsible-card-header';
import { Percent } from 'lucide-react';

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
  const [isCollapsed, setIsCollapsed] = useCardCollapsed('withdrawalRateSensitivity');
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
      <div className="bg-card border border-border rounded-xl shadow-sm">
        <CollapsibleCardHeader
          isCollapsed={isCollapsed}
          onToggle={setIsCollapsed}
          title={
            <h3 className="text-sm sm:text-base font-normal text-foreground flex items-center gap-2">
              <Percent className="w-4 h-4 text-primary" /> Withdrawal Rate Sensitivity
            </h3>
          }
        />
        {!isCollapsed && (
          <div className="px-5 pb-5">
            <ChartEmptyState variant="nodata" description="Enter scenario data to see sensitivity analysis" />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm">
      <CollapsibleCardHeader
        isCollapsed={isCollapsed}
        onToggle={setIsCollapsed}
        title={
          <h3 className="text-sm sm:text-base font-normal text-foreground flex items-center gap-2">
            <Percent className="w-4 h-4 text-primary" /> Withdrawal Rate Sensitivity
          </h3>
        }
      />
      {!isCollapsed && (
        <div className="px-5 pb-5">
          <p className="text-xs text-muted-foreground mb-4 font-normal">
            How different safe withdrawal rates affect your FIRE number and years to FI
          </p>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 100, height: 100 }}>
              <BarChart
                data={data}
                margin={{ top: 10, right: 10, left: 10, bottom: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} horizontal={true} />
                <XAxis
                  dataKey="rate"
                  tickLine={false}
                  axisLine={{ stroke: 'var(--color-border)' }}
                  tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
                  label={{ value: 'Safe Withdrawal Rate', position: 'insideBottom', offset: -5, fill: 'var(--color-muted-foreground)', fontSize: 11 }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
                  tickFormatter={(v: number) => `${v.toFixed(0)} yrs`}
                  width={50}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload || !payload.length) return null;
                    const item = payload[0].payload;
                    return (
                      <ChartTooltip>
                        <TooltipHeader>{String(item.rate)} SWR{item.isCurrent ? ' (current)' : ''}</TooltipHeader>
                        <TooltipRow label="Years to FI" value={`${item.yearsToFI.toFixed(1)} yrs`} />
                        <TooltipRow label="FIRE Number" value={formatCurrency(item.fireNumber)} />
                      </ChartTooltip>
                    );
                  }}
                  cursor={{ fill: 'var(--color-border)', opacity: 0.15 }}
                />
                <Bar dataKey="yearsToFI" radius={[2, 2, 0, 0]}>
                  {data.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.isCurrent ? 'var(--color-primary)' : 'var(--color-chart-2)'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
