'use client';

import { Suspense } from 'react';
import { GoalsSidePanel } from '@/components/goals/goals-side-panel';
import { GoalsList } from '@/components/goals/goals-list';
import { MilestonesProjections } from '@/components/goals/milestones-projections';
import { GoalInflowProvider } from '@/components/goals/goal-inflow-context';
import { useChartVisibility } from '@/lib/hooks/use-chart-visibility';
import { Target } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { PageHeader } from '@/components/page-header';
import PageContent from '@/components/page-content';

function GoalsContent() {
  const { isVisible } = useChartVisibility();

  const showSummary = isVisible('goalsSummary');
  const showList = isVisible('goalsList');
  const showProjections = isVisible('milestonesProjections');

  return (
    <GoalInflowProvider>
      <div className="min-h-screen w-full">
        <PageHeader title="Goals" icon={Target} />
        <PageContent>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            {/* Right 1/3 Summary & Overview Panel */}
            {showSummary && (
              <div className="lg:col-span-1 order-first lg:order-last">
                <Suspense fallback={<LoadingSpinner category="summary" />}>
                  <GoalsSidePanel />
                </Suspense>
              </div>
            )}

            {/* Left 2/3 Main Content (Goals List & Milestones) */}
            <div className={showSummary ? 'lg:col-span-2 space-y-6' : 'lg:col-span-3 space-y-6'}>
              {showList && (
                <Suspense fallback={<LoadingSpinner category="summary" />}>
                  <GoalsList />
                </Suspense>
              )}

              {showProjections && (
                <Suspense fallback={<LoadingSpinner category="summary" />}>
                  <MilestonesProjections />
                </Suspense>
              )}
            </div>
          </div>
        </PageContent>
      </div>
    </GoalInflowProvider>
  );
}

export default function GoalsPage() {
  return (
    <Suspense fallback={<LoadingSpinner category="default" className="min-h-screen" />}>
      <GoalsContent />
    </Suspense>
  );
}
