'use client';

import { Suspense } from 'react';
import { BudgetPeriodProvider, BudgetPeriodSelector } from '@/components/budgets/budget-period-selector';
import { BudgetSummary } from '@/components/budgets/budget-summary';
import { BudgetTable } from '@/components/budgets/budget-table';
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
      <PageHeader title="Budgets" icon={Wallet} />
      <PageContent>
        <BudgetPeriodSelector />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {isVisible('budgetSummary') && (
            <div className="lg:col-span-1 order-first lg:order-last">
              <Suspense fallback={<LoadingSpinner category="summary" />}>
                <BudgetSummary />
              </Suspense>
            </div>
          )}

          {isVisible('budgetTable') && (
            <div className={isVisible('budgetSummary') ? 'lg:col-span-2' : 'lg:col-span-3'}>
              <Suspense fallback={<LoadingSpinner category="summary" />}>
                <BudgetTable />
              </Suspense>
            </div>
          )}
        </div>
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
