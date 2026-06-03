'use client';

import { Suspense } from 'react';
import { IncomeExpenseChart } from '@/components/cash-flow/income-expense-chart';
import { CashFlowSankey } from '@/components/cash-flow/cash-flow-sankey';

import { CashFlowForecast } from '@/components/budgets/cash-flow-forecast';
import { MathDescription } from '@/components/features/settings/math-description';
import { useChartVisibility } from '@/lib/hooks/use-chart-visibility';
import { TrendingUp } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { PageHeader } from '@/components/page-header';
import PageContent from '@/components/page-content';
import { ChartErrorBoundary } from '@/components/chart-error-boundary';

function CashFlowContent() {
  const { isVisible } = useChartVisibility();

  return (
    <div className="min-h-screen w-full">
      {/* ── Page Header ── */}
      <PageHeader title="Cash Flow" icon={TrendingUp} />
      <PageContent>
        {isVisible('cashFlowSankey') && (
          <div>
            <Suspense fallback={<LoadingSpinner category="sankey" />}>
              <ChartErrorBoundary name="Cash Flow Sankey">
                <div>
                  <CashFlowSankey />
                  <MathDescription chartId="cashFlowSankey" />
                </div>
              </ChartErrorBoundary>
            </Suspense>
          </div>
        )}

        {isVisible('incomeExpenseChart') && (
          <div className="mt-5 sm:mt-6">
            <Suspense fallback={<LoadingSpinner category="chart" />}>
              <ChartErrorBoundary name="Income vs Expenses">
                <div>
                  <IncomeExpenseChart />
                  <MathDescription chartId="incomeExpenseChart" />
                </div>
              </ChartErrorBoundary>
            </Suspense>
          </div>
        )}

        {isVisible('cashFlowForecast') && (
          <div className="mt-5 sm:mt-6">
            <Suspense fallback={<LoadingSpinner category="forecast" />}>
              <ChartErrorBoundary name="Cash Flow Forecast">
                <div>
                  <CashFlowForecast />
                  <MathDescription chartId="cashFlowForecast" />
                </div>
              </ChartErrorBoundary>
            </Suspense>
          </div>
        )}
      </PageContent>
    </div>
  );
}

export default function CashFlowPage() {
  return (
    <Suspense fallback={<LoadingSpinner category="default" className="min-h-screen" />}>
      <CashFlowContent />
    </Suspense>
  );
}
