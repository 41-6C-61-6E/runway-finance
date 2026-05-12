'use client';

import { Suspense } from 'react';
import { BudgetPeriodProvider, BudgetPeriodSelector } from '@/components/budgets/budget-period-selector';
import { BudgetSummary } from '@/components/budgets/budget-summary';
import { BudgetVsActualChart } from '@/components/budgets/budget-vs-actual-chart';
import { BudgetTable } from '@/components/budgets/budget-table';
import { CashFlowForecast } from '@/components/budgets/cash-flow-forecast';
import { useChartVisibility } from '@/lib/hooks/use-chart-visibility';

function BudgetsContent() {
  const { isVisible } = useChartVisibility();

  return (
    <div className="min-h-screen w-full">
      <div className="px-4 sm:px-6 lg:px-8 py-6">
        <div className="mx-auto max-w-[1600px]">
          <div className="flex items-center justify-between mb-5">
            <h1 className="text-xl font-semibold text-foreground">Budgets</h1>
            <BudgetPeriodSelector />
          </div>

          {isVisible('budgetSummary') && (
            <Suspense fallback={<div className="text-muted-foreground">Loading summary...</div>}>
              <BudgetSummary />
            </Suspense>
          )}

          {isVisible('budgetVsActualChart') && (
            <div className="mt-5">
              <Suspense fallback={<div className="text-muted-foreground">Loading chart...</div>}>
                <BudgetVsActualChart />
              </Suspense>
            </div>
          )}

          {isVisible('budgetTable') && (
            <div className="mt-5">
              <Suspense fallback={<div className="text-muted-foreground">Loading budgets...</div>}>
                <BudgetTable />
              </Suspense>
            </div>
          )}

          {isVisible('cashFlowForecast') && (
            <div className="mt-5">
              <Suspense fallback={<div className="text-muted-foreground">Loading forecast...</div>}>
                <CashFlowForecast />
              </Suspense>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function BudgetsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading...</div>}>
      <BudgetPeriodProvider>
        <BudgetsContent />
      </BudgetPeriodProvider>
    </Suspense>
  );
}
