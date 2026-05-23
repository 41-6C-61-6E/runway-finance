'use client';

import { Suspense } from 'react';
import { PropertyCards } from '@/components/real-estate/property-cards';
import { EquityOverTimeChart } from '@/components/real-estate/equity-over-time-chart';
import { PortfolioAllocationChart } from '@/components/real-estate/portfolio-allocation-chart';
import { MathDescription } from '@/components/features/settings/math-description';
import { useChartVisibility } from '@/lib/hooks/use-chart-visibility';
import { Home } from 'lucide-react';
import { PageHeader } from '@/components/page-header';

function RealEstateContent() {
  const { isVisible } = useChartVisibility();

  return (
    <div className="min-h-screen w-full">
      {/* ── Page Header ── */}
      <PageHeader title="Real Estate" icon={Home} />
      <div className="px-4 sm:px-6 lg:px-8 py-6">
        <div className="mx-auto max-w-[1600px]">

          {isVisible('propertyCards') && (
            <div className="mb-5">
              <Suspense fallback={<div className="text-muted-foreground">Loading properties...</div>}>
                <div>
                  <PropertyCards />
                  <MathDescription chartId="propertyCards" />
                </div>
              </Suspense>
            </div>
          )}

          {(isVisible('equityOverTimeChart') || isVisible('portfolioAllocationChart')) && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {isVisible('equityOverTimeChart') && (
                <Suspense fallback={<div className="text-muted-foreground">Loading chart...</div>}>
                  <div className="lg:col-span-2">
                    <EquityOverTimeChart />
                    <MathDescription chartId="equityOverTimeChart" />
                  </div>
                </Suspense>
              )}
              {isVisible('portfolioAllocationChart') && (
                <Suspense fallback={<div className="text-muted-foreground">Loading allocation...</div>}>
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
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading...</div>}>
      <RealEstateContent />
    </Suspense>
  );
}
