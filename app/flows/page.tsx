'use client';

import { useState, Suspense, useEffect } from 'react';
import { WealthFlowSankey } from '@/components/net-worth/wealth-flow-sankey';
import { CashFlowSankey } from '@/components/cash-flow/cash-flow-sankey';
import { ArrowLeftRight } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { PageHeader } from '@/components/page-header';
import PageContent from '@/components/page-content';
import { ChartErrorBoundary } from '@/components/chart-error-boundary';
import { AppTabs } from '@/components/ui/app-tabs';
import { useChartVisibility } from '@/lib/hooks/use-chart-visibility';
import { MobileTabSwipeContainer } from '@/components/ui/mobile-view-switcher';

type Tab = 'wealth' | 'cash';

function FlowsContent() {
  const { isVisible } = useChartVisibility();
  const showWealth = isVisible('wealthFlowSankey');
  const showCash = isVisible('cashFlowSankey');

  const [activeTab, setActiveTab] = useState<Tab>('wealth');

  useEffect(() => {
    if (!showWealth && showCash) {
      setActiveTab('cash');
    } else if (showWealth && !showCash) {
      setActiveTab('wealth');
    }
  }, [showWealth, showCash]);

  const availableTabs = [
    showWealth && { id: 'wealth', label: 'Wealth Flow' },
    showCash && { id: 'cash', label: 'Cash Flow' },
  ].filter(Boolean) as { id: Tab; label: string }[];

  return (
    <div className="min-h-screen w-full">
      <PageHeader title="Flows" icon={ArrowLeftRight} />
      <PageContent>
        {availableTabs.length > 0 ? (
          <MobileTabSwipeContainer
            tabs={availableTabs}
            activeTabId={activeTab}
            onTabChange={(tabId) => setActiveTab(tabId as Tab)}
          >
            {availableTabs.length > 1 && (
              <div className="hidden md:block mb-5 sm:mb-6">
                <AppTabs
                  tabs={availableTabs}
                  activeTab={activeTab}
                  onChange={(tabId) => setActiveTab(tabId as Tab)}
                  variant="underline"
                />
              </div>
            )}

            {activeTab === 'wealth' && showWealth && (
              <Suspense fallback={<LoadingSpinner category="chart" />}>
                <WealthFlowSankey />
              </Suspense>
            )}

            {activeTab === 'cash' && showCash && (
              <Suspense fallback={<LoadingSpinner category="sankey" />}>
                <ChartErrorBoundary name="Cash Flow Sankey">
                  <div>
                    <CashFlowSankey />
                  </div>
                </ChartErrorBoundary>
              </Suspense>
            )}
          </MobileTabSwipeContainer>
        ) : (
          <div className="py-12 text-center text-muted-foreground text-sm">
            All flow charts are currently hidden in Settings &gt; Analytics &gt; Chart Visibility.
          </div>
        )}
      </PageContent>
    </div>
  );
}

export default function FlowsPage() {
  return (
    <Suspense fallback={<LoadingSpinner category="default" className="min-h-screen" />}>
      <FlowsContent />
    </Suspense>
  );
}
