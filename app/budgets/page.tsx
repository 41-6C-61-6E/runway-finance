'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { BudgetPeriodProvider, BudgetPeriodSelector, useBudgetPeriod, type PeriodType } from '@/components/budgets/budget-period-selector';
import { BudgetSummary } from '@/components/budgets/budget-summary';
import { BudgetTable } from '@/components/budgets/budget-table';
import { useChartVisibility } from '@/lib/hooks/use-chart-visibility';
import { Wallet, Info, X } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { PageHeader } from '@/components/page-header';
import PageContent from '@/components/page-content';
import { MobileTabSwipeContainer, MobileViewSwitcher } from '@/components/ui/mobile-view-switcher';

const ENVELOPE_BANNER_KEY = 'finance:budgets:envelope-info-dismissed';

/**
 * Dismissible one-time explainer for "envelope" (longer-timeframe) budgets:
 * a yearly/quarterly budget is judged over its FULL native period — a
 * lumpy month (a $6,000 vacation under a $12,000/yr budget) is not an
 * overrun. Shown until the user dismisses it (persisted in localStorage).
 */
function EnvelopeInfoBanner() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    try {
      if (!window.localStorage.getItem(ENVELOPE_BANNER_KEY)) setVisible(true);
    } catch {
      setVisible(true);
    }
  }, []);
  if (!visible) return null;
  const dismiss = () => {
    setVisible(false);
    try {
      window.localStorage.setItem(ENVELOPE_BANNER_KEY, 'true');
    } catch {
      // ignore storage errors
    }
  };
  return (
    <div className="flex items-start gap-2.5 p-3 bg-primary/5 border border-primary/20 rounded-xl text-xs">
      <Info className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
      <div className="flex-1 space-y-1 min-w-0">
        <p className="font-semibold text-foreground">Longer-timeframe budgets are tracked over their full period</p>
        <p className="text-muted-foreground leading-relaxed">
          Yearly and quarterly budgets aren&rsquo;t monthly limits. A {`$12,000/yr`} vacation budget shows an
          average of {`≈ $1,000/mo`} in the table, but it won&rsquo;t be marked over after a {`$6,000`} vacation
          month. It only goes over when the full-year total passes {`$12,000`}.
        </p>
      </div>
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        className="p-0.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent cursor-pointer shrink-0"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function BudgetsContent() {
  const { periodType, setPeriodType } = useBudgetPeriod();
  const { isVisible } = useChartVisibility();
  const showSummary = isVisible('budgetSummary');
  const showTable = isVisible('budgetTable');

  // Notification deep-linking: read ?categoryId=<id> (from budget alerts) and
  // clear it after applying so a manual table re-render keeps the highlight.
  const searchParams = useSearchParams();
  const router = useRouter();
  const [targetCategoryId, setTargetCategoryId] = useState<string | null>(null);
  useEffect(() => {
    const cid = searchParams.get('categoryId');
    if (cid) {
      setTargetCategoryId(cid);
      // Strip the param so refreshing/leaving doesn't re-trigger the scroll.
      const params = new URLSearchParams(searchParams.toString());
      params.delete('categoryId');
      const qs = params.toString();
      router.replace(`/budgets${qs ? `?${qs}` : ''}`);
    }
    return () => setTargetCategoryId(null);
  }, [searchParams, router]);

  const mainContent = (
    <div className="space-y-6">
      {/* On mobile, selector appears inside the main view content below swipe indicator */}
      <div className="lg:hidden">
        <BudgetPeriodSelector hideTypeTabsOnMobile />
      </div>
      <EnvelopeInfoBanner />
      {showTable && (
        <Suspense fallback={<LoadingSpinner category="summary" />}>
          <BudgetTable targetCategoryId={targetCategoryId} />
        </Suspense>
      )}
    </div>
  );

  const summaryContent = (
    <div className="space-y-6">
      <div className="lg:hidden">
        <BudgetPeriodSelector hideTypeTabsOnMobile />
      </div>
      <Suspense fallback={<LoadingSpinner category="summary" />}>
        <BudgetSummary />
      </Suspense>
    </div>
  );

  return (
    <div className="min-h-screen w-full page-transition-enter">
      {/* ── Page Header ── */}
      <PageHeader title="Budgets" icon={Wallet} />
      <PageContent>
        <MobileTabSwipeContainer
          tabs={[
            { id: 'monthly', label: 'Monthly' },
            { id: 'quarterly', label: 'Quarterly' },
            { id: 'yearly', label: 'Yearly' },
          ]}
          activeTabId={periodType}
          onTabChange={(tabId) => setPeriodType(tabId as PeriodType)}
        >
          {showSummary ? (
            <MobileViewSwitcher
              desktopHeader={<BudgetPeriodSelector hideTypeTabsOnMobile />}
              main={mainContent}
              summary={summaryContent}
              mainLabel="Table"
              summaryLabel="Overview"
              summaryCardId="budgetSummary"
            />
          ) : (
            <div className="space-y-6">
              <div className="hidden lg:block">
                <BudgetPeriodSelector hideTypeTabsOnMobile />
              </div>
              {mainContent}
            </div>
          )}
        </MobileTabSwipeContainer>
      </PageContent>
    </div>
  );
}

export default function BudgetsPage() {
  return (
    <Suspense fallback={<LoadingSpinner category="default" className="min-h-screen" />}>
      <BudgetPeriodProvider>
        <BudgetsContent />
      </BudgetPeriodProvider>
    </Suspense>
  );
}
