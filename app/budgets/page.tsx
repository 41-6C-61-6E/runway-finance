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
import { MobileViewSwitcher } from '@/components/ui/mobile-view-switcher';

function BudgetsContent() {
  const { isVisible } = useChartVisibility();
  const showSummary = isVisible('budgetSummary');
  const showTable = isVisible('budgetTable');

  const mainContent = (
    <div className="space-y-6">
      {/* On mobile, selector appears inside the main view content below swipe indicator */}
      <div className="lg:hidden">
        <BudgetPeriodSelector />
      </div>
      {showTable && (
        <Suspense fallback={<LoadingSpinner category="summary" />}>
          <BudgetTable />
        </Suspense>
      )}
    </div>
  );

  const summaryContent = (
    <div className="space-y-6">
      <div className="lg:hidden">
        <BudgetPeriodSelector />
      </div>
      <Suspense fallback={<LoadingSpinner category="summary" />}>
        <BudgetSummary />
      </Suspense>
    </div>
  );

  return (
    <div className="min-h-screen w-full page-transition-enter">
      {/* ── Page Header ── */}
      <PageHeader title="Budgets" icon={Wallet} />
      <PageContent>
        {showSummary ? (
          <MobileViewSwitcher
            desktopHeader={<BudgetPeriodSelector />}
            main={mainContent}
            summary={summaryContent}
            mainLabel="Table"
            summaryLabel="Overview"
            summaryCardId="budgetSummary"
          />
        ) : (
          <div className="space-y-6">
            <BudgetPeriodSelector />
            {mainContent}
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
