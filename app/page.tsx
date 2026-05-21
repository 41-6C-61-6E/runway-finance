'use client';

import { Suspense } from 'react';
import { NetWorthChart } from '@/components/net-worth-chart';
import { NetWorthSummary } from '@/components/net-worth/net-worth-summary';
import { DebtToAssetRatio } from '@/components/debt-to-asset-ratio';
import { MathDescription } from '@/components/features/settings/math-description';
import { useChartVisibility } from '@/lib/hooks/use-chart-visibility';
import { ChartSpline } from 'lucide-react';
import { PageHeader } from '@/components/page-header';

function NetWorthContent() {
  const { isVisible } = useChartVisibility();

  return (
    <div className="min-h-screen w-full">
      {/* ── Page Header ── */}
      <PageHeader title="Net Worth" icon={ChartSpline} />
      <div className="px-4 sm:px-6 lg:px-8 py-6">
        <div className="mx-auto max-w-[1600px]">
          
          {isVisible('netWorthSummary') && isVisible('debtToAssetRatio') && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <div className="lg:col-span-2 space-y-5">
                <Suspense fallback={<div className="text-muted-foreground">Loading summary...</div>}>
                  <div>
                    <NetWorthSummary />
                    <MathDescription chartId="netWorthSummary" />
                  </div>
                </Suspense>
                {isVisible('netWorthChart') && (
                  <Suspense fallback={<div className="text-muted-foreground">Loading chart...</div>}>
                    <div>
                      <NetWorthChart />
                      <MathDescription chartId="netWorthChart" />
                    </div>
                  </Suspense>
                )}
              </div>
              <div>
                <Suspense fallback={<div className="text-muted-foreground">Loading ratio...</div>}>
                  <div>
                    <DebtToAssetRatio />
                    <MathDescription chartId="debtToAssetRatio" />
                  </div>
                </Suspense>
              </div>
            </div>
          )}

          {isVisible('netWorthSummary') && !isVisible('debtToAssetRatio') && (
            <div className="space-y-5">
              <Suspense fallback={<div className="text-muted-foreground">Loading summary...</div>}>
                <div>
                  <NetWorthSummary />
                  <MathDescription chartId="netWorthSummary" />
                </div>
              </Suspense>
              {isVisible('netWorthChart') && (
                <Suspense fallback={<div className="text-muted-foreground">Loading chart...</div>}>
                  <div>
                    <NetWorthChart />
                    <MathDescription chartId="netWorthChart" />
                  </div>
                </Suspense>
              )}
            </div>
          )}

          {!isVisible('netWorthSummary') && isVisible('debtToAssetRatio') && (
            <div className="space-y-5">
              <Suspense fallback={<div className="text-muted-foreground">Loading ratio...</div>}>
                <div>
                  <DebtToAssetRatio />
                  <MathDescription chartId="debtToAssetRatio" />
                </div>
              </Suspense>
              {isVisible('netWorthChart') && (
                <Suspense fallback={<div className="text-muted-foreground">Loading chart...</div>}>
                  <div>
                    <NetWorthChart />
                    <MathDescription chartId="netWorthChart" />
                  </div>
                </Suspense>
              )}
            </div>
          )}

          {!isVisible('netWorthSummary') && !isVisible('debtToAssetRatio') && isVisible('netWorthChart') && (
            <Suspense fallback={<div className="text-muted-foreground">Loading chart...</div>}>
              <div>
                <NetWorthChart />
                <MathDescription chartId="netWorthChart" />
              </div>
            </Suspense>
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
