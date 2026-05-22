'use client';

import { Suspense } from 'react';
import { NetWorthSummary } from '@/components/net-worth/net-worth-summary';
import { AssetAllocation } from '@/components/net-worth/asset-allocation';
import { DebtToAssetRatio } from '@/components/debt-to-asset-ratio';
import { DebtBreakdown } from '@/components/debt-breakdown';
import { MathDescription } from '@/components/features/settings/math-description';
import { useChartVisibility } from '@/lib/hooks/use-chart-visibility';
import { ChartSpline } from 'lucide-react';
import { PageHeader } from '@/components/page-header';

function NetWorthContent() {
  const { isVisible } = useChartVisibility();

  const showSummary = isVisible('netWorthSummary');
  const showRatio = isVisible('debtToAssetRatio');

  return (
    <div className="min-h-screen w-full">
      {/* ── Page Header ── */}
      <PageHeader title="Net Worth" icon={ChartSpline} />
      <div className="px-4 sm:px-6 lg:px-8 py-6">
        <div className="mx-auto max-w-[1600px]">
          
          {showSummary && showRatio && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <div className="lg:col-span-2">
                <Suspense fallback={<div className="text-muted-foreground">Loading summary...</div>}>
                  <div className="h-full space-y-5">
                    <NetWorthSummary />
                    <MathDescription chartId="netWorthSummary" />
                  </div>
                </Suspense>
              </div>
              <div className="h-full">
                <Suspense fallback={<div className="text-muted-foreground">Loading ratio...</div>}>
                  <div className="h-full space-y-5">
                    <DebtToAssetRatio />
                    <MathDescription chartId="debtToAssetRatio" />
                  </div>
                </Suspense>
              </div>
            </div>
          )}

          {showSummary && !showRatio && (
            <Suspense fallback={<div className="text-muted-foreground">Loading summary...</div>}>
              <div className="space-y-5">
                <NetWorthSummary />
                <MathDescription chartId="netWorthSummary" />
              </div>
            </Suspense>
          )}

          {!showSummary && showRatio && (
            <Suspense fallback={<div className="text-muted-foreground">Loading ratio...</div>}>
              <div className="space-y-5">
                <DebtToAssetRatio />
                <MathDescription chartId="debtToAssetRatio" />
              </div>
            </Suspense>
          )}

          {showSummary && (
            <div className="mt-5">
              <Suspense fallback={<div className="text-muted-foreground">Loading allocation...</div>}>
                <AssetAllocation />
              </Suspense>
            </div>
          )}

          {showRatio && (
            <div className="mt-5">
              <Suspense fallback={<div className="text-muted-foreground">Loading breakdown...</div>}>
                <DebtBreakdown />
              </Suspense>
            </div>
          )}
          
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading...</div>}>
      <NetWorthContent />
    </Suspense>
  );
}
