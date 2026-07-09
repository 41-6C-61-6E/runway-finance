'use client';

import { Suspense } from 'react';
import { BudgetPeriodProvider, BudgetPeriodSelector } from '@/components/budgets/budget-period-selector';
import { BudgetSummary } from '@/components/budgets/budget-summary';
import { BudgetTable } from '@/components/budgets/budget-table';
import { MathDescription } from '@/components/features/settings/math-description';
import { useChartVisibility } from '@/lib/hooks/use-chart-visibility';
import { Wallet } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { PageHeader } from '@/components/page-header';
import PageContent from '@/components/page-content';

function BudgetsContent() {
  const { isVisible } = useChartVisibility();

  return (
    <div className="min-h-screen w-full">
      {/* ── Page Header ── */}
      <PageHeader title="Budgets" icon={Wallet}>
        <BudgetPeriodSelector />
      </PageHeader>
      <PageContent>
        {isVisible('budgetSummary') && (
          <Suspense fallback={<LoadingSpinner category="summary" />}>
            <div>
              <BudgetSummary />
              <MathDescription chartId="budgetSummary" />
            </div>
          </Suspense>
        )}

        {isVisible('budgetTable') && (
          <div className="mt-5 sm:mt-6">
            <Suspense fallback={<LoadingSpinner category="summary" />}>
              <div>
                <BudgetTable />
                <MathDescription chartId="budgetTable" />
              </div>
            </Suspense>
          </div>
        )}
      </PageContent>
    </div>
  );
}

export default function BudgetsPage() {
  return (
    <Suspense fallback={<LoadingSpinner category="default" className="min-h-screen" />}>
      <BudgetPeriodProvider>
        <BudgetsContent />
      </BudgetPeriodProvider>
    </Suspense>
  );
}
