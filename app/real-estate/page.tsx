'use client';

import { Suspense, useEffect, useState } from 'react';
import { PropertyCards } from '@/components/real-estate/property-cards';
import { EquityOverTimeChart } from '@/components/real-estate/equity-over-time-chart';
import { PortfolioAllocationChart } from '@/components/real-estate/portfolio-allocation-chart';
import { useChartVisibility } from '@/lib/hooks/use-chart-visibility';
import { Home } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { PageHeader } from '@/components/page-header';
import PageContent from '@/components/page-content';
import { AppTabs } from '@/components/ui/app-tabs';
import { MobileTabSwipeContainer, MobileViewSwitcher } from '@/components/ui/mobile-view-switcher';

type RealEstateTab = 'equity' | 'properties';

function RealEstateContent() {
  const { isVisible } = useChartVisibility();
  const showOverview = isVisible('portfolioAllocationChart');
  const showEquity = isVisible('equityOverTimeChart');
  const showProperties = isVisible('propertyCards');
  const availableTabs = [
    ...(showEquity ? [{ id: 'equity', label: 'Equity' }] : []),
    ...(showProperties ? [{ id: 'properties', label: 'Properties' }] : []),
  ];
  const [activeTab, setActiveTab] = useState<RealEstateTab>(showEquity ? 'equity' : 'properties');

  useEffect(() => {
    if (!availableTabs.some((tab) => tab.id === activeTab)) {
      setActiveTab((availableTabs[0]?.id as RealEstateTab) || 'equity');
    }
  }, [activeTab, availableTabs]);

  const mainContent = (
    <div className="space-y-5 sm:space-y-6">
      {activeTab === 'equity' && showEquity && (
        <Suspense fallback={<LoadingSpinner category="chart" />}>
          <EquityOverTimeChart />
        </Suspense>
      )}
      {activeTab === 'properties' && showProperties && (
        <Suspense fallback={<LoadingSpinner category="chart" />}>
          <PropertyCards />
        </Suspense>
      )}
    </div>
  );

  const summaryContent = (
    <Suspense fallback={<LoadingSpinner category="chart" />}>
      <PortfolioAllocationChart />
    </Suspense>
  );

  return (
    <div className="min-h-screen w-full">
      {/* ── Page Header ── */}
      <PageHeader title="Real Estate" icon={Home} />
      <PageContent>
        {showOverview ? (
          <MobileViewSwitcher
            main={mainContent}
            summary={summaryContent}
            summaryLabel="Overview"
            summaryCardId="portfolioAllocationChart"
            mainTabs={availableTabs.length > 0 ? availableTabs : undefined}
            activeMainTab={activeTab}
            onMainTabChange={(tab) => setActiveTab(tab as RealEstateTab)}
          />
        ) : availableTabs.length > 1 ? (
          <MobileTabSwipeContainer
            tabs={availableTabs}
            activeTabId={activeTab}
            onTabChange={(tab) => setActiveTab(tab as RealEstateTab)}
            header={
              <div className="mb-3 sm:mb-3.5">
                <AppTabs
                  tabs={availableTabs}
                  activeTab={activeTab}
                  onChange={(tab) => setActiveTab(tab as RealEstateTab)}
                  variant="underline"
                />
              </div>
            }
          >
            {mainContent}
          </MobileTabSwipeContainer>
        ) : (
          mainContent
        )}
      </PageContent>
    </div>
  );
}

export default function RealEstatePage() {
  return (
    <Suspense fallback={<LoadingSpinner category="default" className="min-h-screen" />}>
      <RealEstateContent />
    </Suspense>
  );
}
