'use client';

import { Suspense, useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { SpendingBreakdown } from '@/components/cash-flow/spending-breakdown';
import { CashVsCreditCard } from '@/components/cash-flow/cash-vs-credit-card';
import { IncomeExpenseChart } from '@/components/cash-flow/income-expense-chart';
import { useChartVisibility } from '@/lib/hooks/use-chart-visibility';
import { DollarSign } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { PageHeader } from '@/components/page-header';
import PageContent from '@/components/page-content';
import { ChartErrorBoundary } from '@/components/chart-error-boundary';
import { AppTabs } from '@/components/ui/app-tabs';
import { MobileTabSwipeContainer } from '@/components/ui/mobile-view-switcher';

type SpendingTab = 'spending' | 'income' | 'cash';

const parseTab = (value: string | null): SpendingTab =>
  value === 'income' || value === 'cash' ? value : 'spending';

function HiddenChartNote() {
  return (
    <div className="py-16 text-center rounded-2xl border border-dashed border-border/80 p-8">
      <p className="text-sm text-muted-foreground">
        This chart is hidden. You can re-enable it in Settings &rarr; Charts.
      </p>
    </div>
  );
}

function SpendingContent() {
  const { isVisible } = useChartVisibility();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<SpendingTab>(() => parseTab(searchParams.get('tab')));

  const handleTabChange = (tabId: string) => {
    const nextTab = parseTab(tabId);
    setActiveTab(nextTab);
    const params = new URLSearchParams(searchParams.toString());
    if (nextTab === 'spending') {
      params.delete('tab');
    } else {
      params.set('tab', nextTab);
    }
    router.replace(`/spending${params.toString() ? '?' + params.toString() : ''}`);
  };

  useEffect(() => {
    const fromUrl = parseTab(searchParams.get('tab'));
    setActiveTab((prev) => (prev === fromUrl ? prev : fromUrl));
  }, [searchParams]);

  const availableTabs = [
    { id: 'spending', label: 'Spending Breakdown' },
    { id: 'income', label: 'Net Income' },
    { id: 'cash', label: 'Cash vs Credit' },
  ];

  return (
    <div className="min-h-screen w-full">
      {/* ── Page Header ── */}
      <PageHeader title="Spending" icon={DollarSign} />

      <PageContent className="space-y-5 sm:space-y-6">
        <MobileTabSwipeContainer
          tabs={availableTabs}
          activeTabId={activeTab}
          onTabChange={(tabId) => handleTabChange(tabId)}
        >
          <div className="hidden md:block mb-5 sm:mb-6">
            <AppTabs
              tabs={availableTabs}
              activeTab={activeTab}
              onChange={(tabId) => handleTabChange(tabId)}
              variant="underline"
            />
          </div>

          {activeTab === 'spending' &&
            (isVisible('spendingBreakdown') ? (
              <Suspense fallback={<LoadingSpinner category="chart" />}>
                <SpendingBreakdown />
              </Suspense>
            ) : (
              <HiddenChartNote />
            ))}

          {activeTab === 'income' &&
            (isVisible('incomeExpenseChart') ? (
              <Suspense fallback={<LoadingSpinner category="chart" />}>
                <ChartErrorBoundary name="Net Income">
                  <IncomeExpenseChart />
                </ChartErrorBoundary>
              </Suspense>
            ) : (
              <HiddenChartNote />
            ))}

          {activeTab === 'cash' &&
            (isVisible('cashVsCredit') ? (
              <Suspense fallback={<LoadingSpinner category="chart" />}>
                <CashVsCreditCard />
              </Suspense>
            ) : (
              <HiddenChartNote />
            ))}
        </MobileTabSwipeContainer>
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
