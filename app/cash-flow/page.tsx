'use client';

import { Suspense } from 'react';
import { IncomeExpenseChart } from '@/components/cash-flow/income-expense-chart';
import { CashFlowSankey } from '@/components/cash-flow/cash-flow-sankey';

import { CashFlowForecast } from '@/components/budgets/cash-flow-forecast';
import { MathDescription } from '@/components/features/settings/math-description';
import { useChartVisibility } from '@/lib/hooks/use-chart-visibility';
import { TrendingUp } from 'lucide-react';
import { PageHeader } from '@/components/page-header';

function CashFlowContent() {
  const { isVisible } = useChartVisibility();

  return (
    <div className="min-h-screen w-full">
      {/* ── Page Header ── */}
      <PageHeader title="Cash Flow" icon={TrendingUp} />
      <div className="px-4 sm:px-6 lg:px-8 py-6">
        <div className="mx-auto max-w-[1600px]">

          {isVisible('incomeExpenseChart') && (
            <div className="mt-5">
              <Suspense fallback={<div className="text-muted-foreground">Loading chart...</div>}>
                <div>
                  <IncomeExpenseChart />
                  <MathDescription chartId="incomeExpenseChart" />
                </div>
              </Suspense>
            </div>
          )}

          {isVisible('cashFlowSankey') && (
            <div className="mt-5">
              <Suspense fallback={<div className="text-muted-foreground">Loading sankey...</div>}>
                <div>
                  <CashFlowSankey />
                  <MathDescription chartId="cashFlowSankey" />
                </div>
              </Suspense>
            </div>
          )}

          {isVisible('cashFlowForecast') && (
            <div className="mt-5">
              <Suspense fallback={<div className="text-muted-foreground">Loading forecast...</div>}>
                <div>
                  <CashFlowForecast />
                  <MathDescription chartId="cashFlowForecast" />
                </div>
              </Suspense>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CashFlowPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading...</div>}>
      <CashFlowContent />
    </Suspense>
  );
}
