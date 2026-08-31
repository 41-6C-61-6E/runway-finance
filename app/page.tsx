'use client';

import { Suspense, useEffect, useState } from 'react';
import { NetWorthChart } from '@/components/net-worth/net-worth-chart';
import { DebtBreakdown } from '@/components/debt-breakdown';
import { NetWorthSidePanel } from '@/components/net-worth/net-worth-side-panel';
import { useChartVisibility } from '@/lib/hooks/use-chart-visibility';
import { ChartSpline } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { ChartSkeleton, StatCardSkeleton } from '@/components/ui/skeleton-loaders';
import { PageHeader } from '@/components/page-header';
import PageContent from '@/components/page-content';
import { AppTabs, type TabItem } from '@/components/ui/app-tabs';
import { MobileViewSwitcher } from '@/components/ui/mobile-view-switcher';
import { UpcomingBillsStrip } from '@/components/upcoming-bills-strip';

type ChartTab = 'history' | 'breakdown';

const CHART_TABS: TabItem[] = [
  { id: 'history', label: 'History' },
  { id: 'breakdown', label: 'Breakdown' },
];

function HiddenChartNote() {
  return (
    <div className="py-16 text-center rounded-2xl border border-dashed border-border/80 p-8">
      <p className="text-sm text-muted-foreground">
        This chart is hidden. You can re-enable it in Settings &rarr; Charts.
      </p>
    </div>
  );
}

function NetWorthContent() {
  const { isVisible } = useChartVisibility();

  const showSummary = isVisible('netWorthSummary');
  const showChart = isVisible('netWorthChart');
  const showDebtBreakdown = isVisible('debtBreakdown');

  // History & Breakdown are tabs now (like Spending / Investments /
  // Accounts); the Overview side panel stays on the right.
  const [activeChartTab, setActiveChartTab] = useState<ChartTab>('history');

  // If the active tab's chart gets hidden in settings, fall back to the
  // other one (mirrors the Flows page behavior).
  useEffect(() => {
    setActiveChartTab((tab) => {
      if (tab === 'history' && !showChart) return showDebtBreakdown ? 'breakdown' : tab;
      if (tab === 'breakdown' && !showDebtBreakdown) return showChart ? 'history' : tab;
      return tab;
    });
  }, [showChart, showDebtBreakdown]);

  const visibleTabs: TabItem[] = CHART_TABS.filter((t) =>
    t.id === 'history' ? showChart : showDebtBreakdown
  );

  const mainContent = (
    <>
      {/* Desktop / tablet: tab row at the top of the main column, above the
          active chart card (hidden on mobile, where the floating sub-nav
          capsule carries the same tabs — same as the other tabbed pages). */}
      {visibleTabs.length > 0 && (
        <div className="hidden md:block">
          <AppTabs
            tabs={visibleTabs}
            activeTab={activeChartTab}
            onChange={(tabId) => setActiveChartTab(tabId as ChartTab)}
            size="sm"
          />
        </div>
      )}

      {visibleTabs.length > 0 ? (
        activeChartTab === 'history'
          ? showChart ? (
              <Suspense fallback={<ChartSkeleton />}>
                <NetWorthChart />
              </Suspense>
            ) : (
              <HiddenChartNote />
            )
          : showDebtBreakdown ? (
              <Suspense fallback={<ChartSkeleton />}>
                <DebtBreakdown />
              </Suspense>
            ) : (
              <HiddenChartNote />
            )
      ) : (
        <div className="py-16 text-center rounded-2xl border border-dashed border-border/80 p-8">
          <p className="text-sm text-muted-foreground">
            All net worth charts are currently hidden in Settings &rarr; Analytics &rarr; Chart Visibility.
          </p>
        </div>
      )}
    </>
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
            summaryLabel="Overview"
            summaryCardId="netWorthSidePanel"
            mainTabs={visibleTabs.length > 0 ? visibleTabs : undefined}
            activeMainTab={activeChartTab}
            onMainTabChange={(tabId) => setActiveChartTab(tabId as ChartTab)}
          />
        ) : (
          mainContent
        )}
        <div className="mt-4">
          <UpcomingBillsStrip />
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
