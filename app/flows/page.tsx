'use client';

import { Suspense, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams, useRouter } from 'next/navigation';
import { ChartSkeleton } from '@/components/ui/skeleton';

const WealthFlowSankey = dynamic(
  () => import('@/components/net-worth/wealth-flow-sankey').then((m) => m.WealthFlowSankey),
  { loading: () => <ChartSkeleton className="h-[600px] w-full" />, ssr: false }
);
const CashFlowSankey = dynamic(
  () => import('@/components/cash-flow/cash-flow-sankey').then((m) => m.CashFlowSankey),
  { loading: () => <ChartSkeleton className="h-[600px] w-full" />, ssr: false }
);
const IncomeExpenseChart = dynamic(
  () => import('@/components/cash-flow/income-expense-chart').then((m) => m.IncomeExpenseChart),
  { loading: () => <ChartSkeleton className="h-[400px] w-full" />, ssr: false }
);
import { ArrowLeftRight } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { PageHeader } from '@/components/page-header';
import PageContent from '@/components/page-content';
import { ChartErrorBoundary } from '@/components/chart-error-boundary';
import { AppTabs } from '@/components/ui/app-tabs';
import { useChartVisibility } from '@/lib/hooks/use-chart-visibility';
import { MobileTabSwipeContainer } from '@/components/ui/mobile-view-switcher';

import { usePersistentState } from '@/lib/hooks/use-persistent-state';

type Tab = 'wealth' | 'cash' | 'income';

const parseTab = (value: string | null): Tab =>
  value === 'cash' || value === 'income' ? value : 'wealth';

function FlowsContent() {
  const { isVisible } = useChartVisibility();
  const searchParams = useSearchParams();
  const router = useRouter();

  const showWealth = isVisible('wealthFlowSankey');
  const showCash = isVisible('cashFlowSankey');
  const showIncome = isVisible('incomeExpenseChart');

  const hasUrlTab = searchParams?.has('tab') ?? false;
  const hasLegacyWealthParams =
    !hasUrlTab &&
    Boolean(
      searchParams?.get('timeframe') ||
        searchParams?.get('date') ||
        searchParams?.get('startDate') ||
        searchParams?.get('month')
    );
  const initialTab: Tab = hasUrlTab ? parseTab(searchParams?.get('tab') ?? null) : 'wealth';

  const [activeTab, setActiveTab] = usePersistentState<Tab>(
    'finance:flows:activeTab',
    initialTab,
    { skipRestore: hasUrlTab || hasLegacyWealthParams }
  );

  const handleTabChange = (tabId: string) => {
    const nextTab = parseTab(tabId);
    setActiveTab(nextTab);
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    params.set('tab', nextTab);
    params.delete('timeframe');
    params.delete('date');
    params.delete('startDate');
    params.delete('endDate');
    params.delete('month');
    const qs = params.toString();
    router.replace(qs ? `/flows?${qs}` : '/flows', { scroll: false });
  };

  useEffect(() => {
    if (!searchParams) return;
    if (searchParams.has('tab')) {
      const fromUrl = parseTab(searchParams.get('tab'));
      setActiveTab((prev) => (prev === fromUrl ? prev : fromUrl));
    } else if (
      searchParams.get('timeframe') ||
      searchParams.get('date') ||
      searchParams.get('startDate') ||
      searchParams.get('month')
    ) {
      if (showWealth) {
        setActiveTab((prev) => (prev === 'wealth' ? prev : 'wealth'));
      }
    }
  }, [searchParams, showWealth, setActiveTab]);

  useEffect(() => {
    const visible: Tab[] = [];
    if (showWealth) visible.push('wealth');
    if (showCash) visible.push('cash');
    if (showIncome) visible.push('income');
    if (visible.length > 0 && !visible.includes(activeTab)) {
      setActiveTab(visible[0]);
    }
  }, [showWealth, showCash, showIncome, activeTab, setActiveTab]);

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
            onTabChange={handleTabChange}
            header={
              availableTabs.length > 1 ? (
                <div className="mb-3 sm:mb-3.5">
                  <AppTabs
                    tabs={availableTabs}
                    activeTab={activeTab}
                    onChange={handleTabChange}
                    variant="underline"
                  />
                </div>
              ) : undefined
            }
          >

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

            {activeTab === 'income' && showIncome && (
              <Suspense fallback={<LoadingSpinner category="chart" />}>
                  <ChartErrorBoundary name="Net Income">
                    <IncomeExpenseChart />
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
