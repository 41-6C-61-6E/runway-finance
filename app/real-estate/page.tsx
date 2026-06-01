'use client';

import { Suspense } from 'react';
import { PropertyCards } from '@/components/real-estate/property-cards';
import { EquityOverTimeChart } from '@/components/real-estate/equity-over-time-chart';
import { PortfolioAllocationChart } from '@/components/real-estate/portfolio-allocation-chart';
import { MathDescription } from '@/components/features/settings/math-description';
import { useChartVisibility } from '@/lib/hooks/use-chart-visibility';
import { Home } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { PageHeader } from '@/components/page-header';

function RealEstateContent() {
  const { isVisible } = useChartVisibility();

  return (
    <div className="min-h-screen w-full">
      {/* ── Page Header ── */}
      <PageHeader title="Real Estate" icon={Home} />
      <div className="px-2 sm:px-6 lg:px-8 py-6">
        <div className="mx-auto max-w-[1600px]">

          {isVisible('equityOverTimeChart') && (
            <div className="mb-5">
              <Suspense fallback={<LoadingSpinner category="chart" />}>
                <div>
                  <EquityOverTimeChart />
                  <MathDescription chartId="equityOverTimeChart" />
                </div>
              </Suspense>
            </div>
          )}

          {(isVisible('propertyCards') || isVisible('portfolioAllocationChart')) && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {isVisible('propertyCards') && (
                <div className="lg:col-span-2">
                  <Suspense fallback={<LoadingSpinner category="chart" />}>
                    <PropertyCards />
                    <MathDescription chartId="propertyCards" />
                  </Suspense>
                </div>
              )}
              {isVisible('portfolioAllocationChart') && (
                <Suspense fallback={<LoadingSpinner category="chart" />}>
                  <div>
                    <PortfolioAllocationChart />
                    <MathDescription chartId="portfolioAllocationChart" />
                  </div>
                </Suspense>
              )}
            </div>
          )}

        </div>
      </div>
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
