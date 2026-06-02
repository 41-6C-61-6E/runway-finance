'use client';

import { Suspense } from 'react';
import { SpendingBreakdown } from '@/components/cash-flow/spending-breakdown';
import { CategorySummaries } from '@/components/cash-flow/category-summaries';
import { MathDescription } from '@/components/features/settings/math-description';
import { useChartVisibility } from '@/lib/hooks/use-chart-visibility';
import { DollarSign } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { PageHeader } from '@/components/page-header';
import PageContent from '@/components/page-content';

function SpendingContent() {
  const { isVisible } = useChartVisibility();

  return (
    <div className="min-h-screen w-full">
      {/* ── Page Header ── */}
      <PageHeader title="Spending" icon={DollarSign} />
      <PageContent>
        {isVisible('spendingBreakdown') && (
          <div>
            <Suspense fallback={<LoadingSpinner category="chart" />}>
              <div>
                <SpendingBreakdown />
                <MathDescription chartId="spendingBreakdown" />
              </div>
            </Suspense>
          </div>
        )}

        {isVisible('categorySummaries') && (
          <div className="mt-5">
            <Suspense fallback={<LoadingSpinner category="chart" />}>
              <div>
                <CategorySummaries />
                <MathDescription chartId="categorySummaries" />
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
