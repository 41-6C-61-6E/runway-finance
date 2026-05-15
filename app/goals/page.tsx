'use client';

import { Suspense } from 'react';
import { GoalsSummary } from '@/components/goals/goals-summary';
import { GoalsList } from '@/components/goals/goals-list';
import { useChartVisibility } from '@/lib/hooks/use-chart-visibility';

function GoalsContent() {
  const { isVisible } = useChartVisibility();

  return (
    <div className="min-h-screen w-full">
      <div className="px-4 sm:px-6 lg:px-8 py-6">
        <div className="mx-auto max-w-[1600px]">
          <div className="flex items-center justify-between mb-5">
            <h1 className="text-xl font-semibold text-foreground">Financial Goals</h1>
          </div>

          {isVisible('goalsSummary') && (
            <Suspense fallback={<div className="text-muted-foreground">Loading summary...</div>}>
              <GoalsSummary />
            </Suspense>
          )}

          {isVisible('goalsList') && (
            <div className="mt-5">
              <Suspense fallback={<div className="text-muted-foreground">Loading goals...</div>}>
                <GoalsList />
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
