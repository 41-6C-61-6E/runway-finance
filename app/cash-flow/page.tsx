'use client';

import { Suspense } from 'react';
import { CashFlowSummary } from '@/components/cash-flow/cash-flow-summary';
import { IncomeExpenseChart } from '@/components/cash-flow/income-expense-chart';
import { NetIncomeAnalysis } from '@/components/cash-flow/net-income-analysis';

import { CashFlowSankey } from '@/components/cash-flow/cash-flow-sankey';
import { CashFlowForecast } from '@/components/budgets/cash-flow-forecast';
import { MathDescription } from '@/components/features/settings/math-description';
import { useChartVisibility } from '@/lib/hooks/use-chart-visibility';

function CashFlowContent() {
  const { isVisible } = useChartVisibility();

  return (
    <div className="min-h-screen w-full">
      <div className="px-4 sm:px-6 lg:px-8 py-6">
        <div className="mx-auto max-w-[1600px]">
          <h1 className="text-xl font-semibold text-foreground mb-5">Cash Flow</h1>

          {isVisible('cashFlowSummary') && (
            <Suspense fallback={<div className="text-muted-foreground">Loading summary...</div>}>
              <div>
                <CashFlowSummary />
                <MathDescription chartId="cashFlowSummary" />
              </div>
            </Suspense>
          )}

          {(isVisible('incomeExpenseChart') || isVisible('netIncomeAnalysis')) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-5">
              {isVisible('incomeExpenseChart') && (
                <Suspense fallback={<div className="text-muted-foreground">Loading chart...</div>}>
                  <div>
                    <IncomeExpenseChart />
                    <MathDescription chartId="incomeExpenseChart" />
                  </div>
                </Suspense>
              )}
              {isVisible('netIncomeAnalysis') && (
                <Suspense fallback={<div className="text-muted-foreground">Loading analysis...</div>}>
                  <div>
                    <NetIncomeAnalysis />
                    <MathDescription chartId="netIncomeAnalysis" />
                  </div>
                </Suspense>
              )}
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
