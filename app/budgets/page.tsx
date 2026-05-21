'use client';

import { Suspense } from 'react';
import { BudgetPeriodProvider, BudgetPeriodSelector } from '@/components/budgets/budget-period-selector';
import { BudgetSummary } from '@/components/budgets/budget-summary';
import { BudgetVsActualChart } from '@/components/budgets/budget-vs-actual-chart';
import { BudgetTable } from '@/components/budgets/budget-table';
import { MathDescription } from '@/components/features/settings/math-description';
import { useChartVisibility } from '@/lib/hooks/use-chart-visibility';
import { Wallet } from 'lucide-react';
import { PageHeader } from '@/components/page-header';

function BudgetsContent() {
  const { isVisible } = useChartVisibility();

  return (
    <div className="min-h-screen w-full">
      {/* ── Page Header ── */}
      <PageHeader title="Budgets" icon={Wallet}>
        <BudgetPeriodSelector />
      </PageHeader>
      <div className="px-4 sm:px-6 lg:px-8 py-6">
        <div className="mx-auto max-w-[1600px]">

          {isVisible('budgetSummary') && (
            <Suspense fallback={<div className="text-muted-foreground">Loading summary...</div>}>
              <div>
                <BudgetSummary />
                <MathDescription chartId="budgetSummary" />
              </div>
            </Suspense>
          )}

          {isVisible('budgetVsActualChart') && (
            <div className="mt-5">
              <Suspense fallback={<div className="text-muted-foreground">Loading chart...</div>}>
                <div>
                  <BudgetVsActualChart />
                  <MathDescription chartId="budgetVsActualChart" />
                </div>
              </Suspense>
            </div>
          )}

          {isVisible('budgetTable') && (
            <div className="mt-5">
              <Suspense fallback={<div className="text-muted-foreground">Loading budgets...</div>}>
                <div>
                  <BudgetTable />
                  <MathDescription chartId="budgetTable" />
                </div>
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
