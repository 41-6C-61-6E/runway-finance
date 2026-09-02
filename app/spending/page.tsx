'use client';

import { Suspense, useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { SpendingBreakdown } from '@/components/cash-flow/spending-breakdown';
import { CashVsCreditCard } from '@/components/cash-flow/cash-vs-credit-card';
import { useChartVisibility } from '@/lib/hooks/use-chart-visibility';
import { DollarSign } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { SubscriptionTracker } from '@/components/features/transactions/SubscriptionTracker';
import type { RecurringItem } from '@/components/features/transactions/RecurringCard';
import { PageHeader } from '@/components/page-header';
import PageContent from '@/components/page-content';
import { ChartErrorBoundary } from '@/components/chart-error-boundary';
import { AppTabs } from '@/components/ui/app-tabs';
import { MobileTabSwipeContainer } from '@/components/ui/mobile-view-switcher';

type SpendingTab = 'spending' | 'cash' | 'subscriptions';

const parseTab = (value: string | null): SpendingTab =>
  (value === 'cash' || value === 'subscriptions') ? value : 'spending';

function HiddenChartNote() {
  return (
    <div className="py-16 text-center rounded-2xl border border-dashed border-border/80 p-8">
      <p className="text-sm text-muted-foreground">
        This chart is hidden. You can re-enable it in Settings &rarr; Charts.
      </p>
    </div>
  );
}

function SubscriptionsTab() {
  const [items, setItems] = useState<RecurringItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch('/api/recurring?includeDismissed=true&status=all');
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
      } else {
        setError('Failed to load subscriptions. Please try again.');
      }
    } catch {
      setError('Failed to load subscriptions. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <div className="py-16 text-center space-y-4">
        <p className="text-sm text-muted-foreground">{error}</p>
        <button
          onClick={load}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return <SubscriptionTracker items={items} loading={loading} />;
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
    { id: 'spending', label: 'Breakdown' },
    { id: 'cash', label: 'Coverage' },
    { id: 'subscriptions', label: 'Subscriptions' },
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
          <div className="hidden md:block mb-3 sm:mb-3.5">
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

          {activeTab === 'cash' &&
            (isVisible('cashVsCredit') ? (
              <Suspense fallback={<LoadingSpinner category="chart" />}>
                <CashVsCreditCard />
              </Suspense>
            ) : (
              <HiddenChartNote />
            ))}

          {activeTab === 'subscriptions' && (
            <Suspense fallback={<LoadingSpinner category="chart" />}>
              <SubscriptionsTab />
            </Suspense>
          )}
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
