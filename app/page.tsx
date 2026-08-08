'use client';

import { Suspense } from 'react';
import { NetWorthChart } from '@/components/net-worth/net-worth-chart';
import { DebtBreakdown } from '@/components/debt-breakdown';
import { NetWorthSidePanel } from '@/components/net-worth/net-worth-side-panel';
import { useChartVisibility } from '@/lib/hooks/use-chart-visibility';
import { ChartSpline } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { ChartSkeleton, StatCardSkeleton } from '@/components/ui/skeleton-loaders';
import { PageHeader } from '@/components/page-header';
import PageContent from '@/components/page-content';
import { MobileViewSwitcher } from '@/components/ui/mobile-view-switcher';

function NetWorthContent() {
  const { isVisible } = useChartVisibility();

  const showSummary = isVisible('netWorthSummary');
  const showChart = isVisible('netWorthChart');
  const showDebtBreakdown = isVisible('debtBreakdown');

  const mainContent = (
    <div className="space-y-6">
      {showChart && (
        <Suspense fallback={<ChartSkeleton />}>
          <NetWorthChart />
        </Suspense>
      )}

      {showDebtBreakdown && (
        <Suspense fallback={<ChartSkeleton />}>
          <DebtBreakdown />
        </Suspense>
      )}
    </div>
  );

  const summaryContent = (
    <Suspense fallback={<StatCardSkeleton count={4} />}>
      <NetWorthSidePanel />
    </Suspense>
  );

  return (
    <div className="min-h-screen w-full page-transition-enter">
      {/* ── Page Header ── */}
      <PageHeader title="Net Worth" icon={ChartSpline} />
      <PageContent>
        {showSummary ? (
          <MobileViewSwitcher
            main={mainContent}
            summary={summaryContent}
            mainLabel="Charts"
            summaryLabel="Summary"
          />
        ) : (
          mainContent
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
