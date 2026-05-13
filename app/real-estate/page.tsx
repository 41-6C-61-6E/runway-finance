'use client';

import { Suspense } from 'react';
import { RealEstateSummary } from '@/components/real-estate/real-estate-summary';
import { PropertyCards } from '@/components/real-estate/property-cards';
import { EquityOverTimeChart } from '@/components/real-estate/equity-over-time-chart';
import { PortfolioAllocationChart } from '@/components/real-estate/portfolio-allocation-chart';
import { MortgagePaydownSection } from '@/components/real-estate/mortgage-paydown-section';
import { useChartVisibility } from '@/lib/hooks/use-chart-visibility';

function RealEstateContent() {
  const { isVisible } = useChartVisibility();

  return (
    <div className="min-h-screen w-full">
      <div className="px-4 sm:px-6 lg:px-8 py-6">
        <div className="mx-auto max-w-[1600px]">
          <h1 className="text-xl font-semibold text-foreground mb-5">Real Estate</h1>

          {isVisible('realEstateSummary') && (
            <Suspense fallback={<div className="text-muted-foreground">Loading summary...</div>}>
              <RealEstateSummary />
            </Suspense>
          )}

          {(isVisible('equityOverTimeChart') || isVisible('portfolioAllocationChart')) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-5">
              {isVisible('equityOverTimeChart') && (
                <Suspense fallback={<div className="text-muted-foreground">Loading chart...</div>}>
                  <EquityOverTimeChart />
                </Suspense>
              )}
              {isVisible('portfolioAllocationChart') && (
                <Suspense fallback={<div className="text-muted-foreground">Loading allocation...</div>}>
                  <PortfolioAllocationChart />
                </Suspense>
              )}
            </div>
          )}

          {isVisible('propertyCards') && (
            <div className="mt-5">
              <Suspense fallback={<div className="text-muted-foreground">Loading properties...</div>}>
                <PropertyCards />
              </Suspense>
            </div>
          )}

          {isVisible('mortgagePaydown') && (
            <div className="mt-5">
              <Suspense fallback={<div className="text-muted-foreground">Loading mortgage paydown...</div>}>
                <MortgagePaydownSection />
              </Suspense>
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
