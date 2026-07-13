'use client';

import { Suspense } from 'react';
import { SpendingBreakdown } from '@/components/cash-flow/spending-breakdown';
import { CashVsCreditCard } from '@/components/cash-flow/cash-vs-credit-card';
import { IncomeExpenseChart } from '@/components/cash-flow/income-expense-chart';
import { useChartVisibility } from '@/lib/hooks/use-chart-visibility';
import { DollarSign } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { PageHeader } from '@/components/page-header';
import PageContent from '@/components/page-content';
import { ChartErrorBoundary } from '@/components/chart-error-boundary';

function SpendingContent() {
  const { isVisible } = useChartVisibility();

  return (
    <div className="min-h-screen w-full">
      {/* ── Page Header ── */}
      <PageHeader title="Spend / Save" icon={DollarSign} />
      <PageContent className="space-y-5 sm:space-y-6">
        {isVisible('incomeExpenseChart') && (
          <div>
            <Suspense fallback={<LoadingSpinner category="chart" />}>
              <ChartErrorBoundary name="Income vs Expenses">
                <div>
                  <IncomeExpenseChart />
                </div>
              </ChartErrorBoundary>
            </Suspense>
          </div>
        )}

        {isVisible('spendingBreakdown') && (
          <div>
            <Suspense fallback={<LoadingSpinner category="chart" />}>
              <div>
                <SpendingBreakdown />
              </div>
            </Suspense>
          </div>
        )}

        {isVisible('cashVsCredit') && (
          <div>
            <Suspense fallback={<LoadingSpinner category="chart" />}>
                <div>
                  <CashVsCreditCard />
                </div>
            </Suspense>
          </div>
        )}
      </PageContent>
    </div>
  );
}

export default function SpendingPage() {
  return (
    <Suspense fallback={<LoadingSpinner category="default" className="min-h-screen" />}>
      <SpendingContent />
    </Suspense>
  );
}
