'use client';

import { Suspense } from 'react';
import { NetWorthChart } from '@/components/net-worth/net-worth-chart';
import { DebtBreakdown } from '@/components/debt-breakdown';
import { NetWorthSidePanel } from '@/components/net-worth/net-worth-side-panel';
import { useChartVisibility } from '@/lib/hooks/use-chart-visibility';
import { ChartSpline } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { PageHeader } from '@/components/page-header';
import PageContent from '@/components/page-content';

function NetWorthContent() {
  const { isVisible } = useChartVisibility();

  const showSummary = isVisible('netWorthSummary');
  const showChart = isVisible('netWorthChart');
  const showDebtBreakdown = isVisible('debtBreakdown');

  return (
    <div className="min-h-screen w-full">
      {/* ── Page Header ── */}
      <PageHeader title="Net Worth" icon={ChartSpline} />
      <PageContent>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Right 1/3 Overview & Summary Panel */}
          {showSummary && (
            <div className="lg:col-span-1 order-first lg:order-last">
              <Suspense fallback={<LoadingSpinner category="summary" />}>
                <NetWorthSidePanel />
              </Suspense>
            </div>
          )}

          {/* Left 2/3 Main Charts & Detailed Breakdown */}
          <div className={showSummary ? 'lg:col-span-2 space-y-6' : 'lg:col-span-3 space-y-6'}>
            {showChart && (
              <Suspense fallback={<LoadingSpinner category="chart" />}>
                <NetWorthChart />
              </Suspense>
            )}

            {showDebtBreakdown && (
              <Suspense fallback={<LoadingSpinner category="chart" />}>
                <DebtBreakdown />
              </Suspense>
            )}
          </div>
        </div>
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
