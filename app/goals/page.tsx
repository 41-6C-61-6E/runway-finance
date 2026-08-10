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
import { MobileViewSwitcher } from '@/components/ui/mobile-view-switcher';

function GoalsContent() {
  const { isVisible } = useChartVisibility();

  const showSummary = isVisible('goalsSummary');
  const showList = isVisible('goalsList');
  const showProjections = isVisible('milestonesProjections');

  const mainContent = (
    <div className="space-y-6">
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
  );

  const summaryContent = (
    <Suspense fallback={<LoadingSpinner category="summary" />}>
      <GoalsSidePanel />
    </Suspense>
  );

  return (
    <GoalInflowProvider>
      <div className="min-h-screen w-full page-transition-enter">
        <PageHeader title="Goals" icon={Target} />
        <PageContent>
          {showSummary ? (
            <MobileViewSwitcher
              main={mainContent}
              summary={summaryContent}
              mainLabel="Goals"
              summaryLabel="Overview"
              summaryCardId="goalsSidePanel"
            />
          ) : (
            mainContent
          )}
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
