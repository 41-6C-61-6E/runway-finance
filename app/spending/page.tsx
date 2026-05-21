'use client';

import { Suspense } from 'react';
import { SpendingBreakdown } from '@/components/cash-flow/spending-breakdown';
import { CategorySummaries } from '@/components/cash-flow/category-summaries';
import { MathDescription } from '@/components/features/settings/math-description';
import { useChartVisibility } from '@/lib/hooks/use-chart-visibility';

function SpendingContent() {
  const { isVisible } = useChartVisibility();

  return (
    <div className="min-h-screen w-full">
      {/* ── Page Header ── */}
      <div className="border-b border-border/40 bg-card/10 backdrop-blur-md sticky top-0 z-40 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">Spending</h1>
      </div>
      <div className="px-4 sm:px-6 lg:px-8 py-6">
        <div className="mx-auto max-w-[1600px]">

          {isVisible('spendingBreakdown') && (
            <div className="mt-5">
              <Suspense fallback={<div className="text-muted-foreground">Loading breakdown...</div>}>
                <div>
                  <SpendingBreakdown />
                  <MathDescription chartId="spendingBreakdown" />
                </div>
              </Suspense>
            </div>
          )}

          {isVisible('categorySummaries') && (
            <div className="mt-5">
              <Suspense fallback={<div className="text-muted-foreground">Loading categories...</div>}>
                <div>
                  <CategorySummaries />
                  <MathDescription chartId="categorySummaries" />
                </div>
              </Suspense>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SpendingPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading...</div>}>
      <SpendingContent />
    </Suspense>
  );
}
