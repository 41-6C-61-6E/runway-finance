'use client';

import { Suspense } from 'react';
import { NetWorthSummary } from '@/components/net-worth/net-worth-summary';
import { AssetAllocation } from '@/components/net-worth/asset-allocation';
import { DebtToAssetRatio } from '@/components/debt-to-asset-ratio';
import { DebtBreakdown } from '@/components/debt-breakdown';
import { useChartVisibility } from '@/lib/hooks/use-chart-visibility';
import { ChartSpline } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { PageHeader } from '@/components/page-header';
import PageContent from '@/components/page-content';
import { NetWorthChart } from '@/components/net-worth/net-worth-chart';

function NetWorthContent() {
  const { isVisible } = useChartVisibility();

  const showSummary = isVisible('netWorthSummary');
  const showRatio = isVisible('debtToAssetRatio');
  const showChart = isVisible('netWorthChart');

  return (
    <div className="min-h-screen w-full">
      {/* ── Page Header ── */}
      <PageHeader title="Net Worth" icon={ChartSpline} />
      <PageContent>
        {showChart && (
          <div className="mb-5 sm:mb-6">
            <Suspense fallback={<LoadingSpinner category="chart" />}>
              <div className="space-y-5 sm:space-y-6">
                <NetWorthChart />
              </div>
            </Suspense>
          </div>
        )}

        {showSummary && (
          <Suspense fallback={<LoadingSpinner category="summary" />}>
            <div className="space-y-5 sm:space-y-6">
              <NetWorthSummary />
            </div>
          </Suspense>
        )}

        {!showSummary && showRatio && (
          <Suspense fallback={<div className="text-muted-foreground">Loading ratio...</div>}>
            <div className="space-y-5 sm:space-y-6">
              <DebtToAssetRatio />
            </div>
          </Suspense>
        )}

        {showSummary && (
          <div className="mt-5 sm:mt-6 grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-6 items-stretch">
            {showRatio && (
              <Suspense fallback={<LoadingSpinner category="chart" />}>
                <div className="h-full space-y-5">
                  <DebtToAssetRatio />
                </div>
              </Suspense>
            )}
            <Suspense fallback={<LoadingSpinner category="chart" />}>
              <AssetAllocation />
            </Suspense>
          </div>
        )}

        {showRatio && (
          <div className="mt-5 sm:mt-6">
            <Suspense fallback={<LoadingSpinner category="chart" />}>
              <DebtBreakdown />
            </Suspense>
          </div>
        )}
      </PageContent>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<LoadingSpinner category="default" className="min-h-screen" />}>
      <NetWorthContent />
    </Suspense>
  );
}
