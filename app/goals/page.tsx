'use client';

import { Suspense } from 'react';
import { GoalsSummary } from '@/components/goals/goals-summary';
import { GoalsList } from '@/components/goals/goals-list';
import { MathDescription } from '@/components/features/settings/math-description';
import { useChartVisibility } from '@/lib/hooks/use-chart-visibility';
import { Target } from 'lucide-react';
import { PageHeader } from '@/components/page-header';

function GoalsContent() {
  const { isVisible } = useChartVisibility();

  return (
    <div className="min-h-screen w-full">
      {/* ── Page Header ── */}
      <PageHeader title="Financial Goals" icon={Target} />
      <div className="px-4 sm:px-6 lg:px-8 py-6">
        <div className="mx-auto max-w-[1600px]">

          {isVisible('goalsSummary') && (
            <Suspense fallback={<div className="text-muted-foreground">Loading summary...</div>}>
              <div>
                <GoalsSummary />
                <MathDescription chartId="goalsSummary" />
              </div>
            </Suspense>
          )}

          {isVisible('goalsList') && (
            <div className="mt-5">
              <Suspense fallback={<div className="text-muted-foreground">Loading goals...</div>}>
                <div>
                  <GoalsList />
                  <MathDescription chartId="goalsList" />
                </div>
              </Suspense>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function GoalsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading...</div>}>
      <GoalsContent />
    </Suspense>
  );
}
