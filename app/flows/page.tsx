'use client';

import { useState, Suspense, useEffect } from 'react';
import { WealthFlowSankey } from '@/components/net-worth/wealth-flow-sankey';
import { CashFlowSankey } from '@/components/cash-flow/cash-flow-sankey';
import { IncomeExpenseChart } from '@/components/cash-flow/income-expense-chart';
import { ArrowLeftRight } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { PageHeader } from '@/components/page-header';
import PageContent from '@/components/page-content';
import { ChartErrorBoundary } from '@/components/chart-error-boundary';
import { AppTabs } from '@/components/ui/app-tabs';
import { useChartVisibility } from '@/lib/hooks/use-chart-visibility';
import { MobileTabSwipeContainer } from '@/components/ui/mobile-view-switcher';

type Tab = 'wealth' | 'cash' | 'income';

function FlowsContent() {
  const { isVisible } = useChartVisibility();
  const showWealth = isVisible('wealthFlowSankey');
  const showCash = isVisible('cashFlowSankey');
  const showIncome = isVisible('incomeExpenseChart');

  const [activeTab, setActiveTab] = useState<Tab>('wealth');

  // Track which tabs the user has actually selected. Panels stay mounted
  // once visited (their data is memoized in lib/fetch-cache, so re-showing
  // is instant and free) — but we never mount a tab the user hasn't asked
  // for, which keeps the initial page load to a single chart fetch.
  const [visited, setVisited] = useState<Set<Tab>>(new Set(['wealth']));
  const selectTab = (tabId: Tab) => {
    setActiveTab(tabId);
    setVisited((v) => (v.has(tabId) ? v : new Set(v).add(tabId)));
  };

  useEffect(() => {
    const visible: Tab[] = [];
    if (showWealth) visible.push('wealth');
    if (showCash) visible.push('cash');
    if (showIncome) visible.push('income');
    if (visible.length > 0 && !visible.includes(activeTab)) {
      setActiveTab(visible[0]);
      setVisited((v) => new Set(v).add(visible[0]));
    }
  }, [showWealth, showCash, showIncome, activeTab]);

  const availableTabs = [
    showWealth && { id: 'wealth', label: 'Wealth' },
    showCash && { id: 'cash', label: 'Cash' },
    showIncome && { id: 'income', label: 'Income' },
  ].filter(Boolean) as { id: Tab; label: string }[];

  return (
    <div className="min-h-screen w-full">
      <PageHeader title="Flows" icon={ArrowLeftRight} />
      <PageContent>
        {availableTabs.length > 0 ? (
          <MobileTabSwipeContainer
            tabs={availableTabs}
            activeTabId={activeTab}
            onTabChange={(tabId) => selectTab(tabId as Tab)}
          >
            {availableTabs.length > 1 && (
              <div className="hidden md:block mb-5 sm:mb-6">
                <AppTabs
                  tabs={availableTabs}
                  activeTab={activeTab}
                  onChange={(tabId) => selectTab(tabId as Tab)}
                  variant="underline"
                />
              </div>
            )}

            {(visited.has('wealth') && showWealth && (
              <div
                aria-hidden={activeTab !== 'wealth'}
                className={
                  activeTab === 'wealth'
                    ? undefined
                    : 'pointer-events-none opacity-60'
                }
              >
                <Suspense fallback={null}>
                  <WealthFlowSankey />
                </Suspense>
              </div>
            ))}

            {(visited.has('cash') && showCash && (
              <div
                aria-hidden={activeTab !== 'cash'}
                className={
                  activeTab === 'cash'
                    ? undefined
                    : 'pointer-events-none opacity-60'
                }
              >
                <Suspense fallback={null}>
                  <ChartErrorBoundary name="Cash Flow Sankey">
                    <div>
                      <CashFlowSankey />
                    </div>
                  </ChartErrorBoundary>
                </Suspense>
              </div>
            ))}

            {(visited.has('income') && showIncome && (
              <div
                aria-hidden={activeTab !== 'income'}
                className={
                  activeTab === 'income'
                    ? undefined
                    : 'pointer-events-none opacity-60'
                }
              >
                <Suspense fallback={null}>
                  <ChartErrorBoundary name="Net Income">
                    <IncomeExpenseChart />
                  </ChartErrorBoundary>
                </Suspense>
              </div>
            ))}
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
