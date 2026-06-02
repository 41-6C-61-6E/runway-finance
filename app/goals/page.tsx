'use client';

import { Suspense } from 'react';
import { GoalsSummary } from '@/components/goals/goals-summary';
import { GoalsList } from '@/components/goals/goals-list';
import { MathDescription } from '@/components/features/settings/math-description';
import { useChartVisibility } from '@/lib/hooks/use-chart-visibility';
import { Target } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { PageHeader } from '@/components/page-header';
import PageContent from '@/components/page-content';

function GoalsContent() {
  const { isVisible } = useChartVisibility();

  return (
    <div className="min-h-screen w-full">
      {/* ── Page Header ── */}
      <PageHeader title="Financial Goals" icon={Target} />
      <PageContent>
        {isVisible('goalsSummary') && (
          <Suspense fallback={<LoadingSpinner category="summary" />}>
            <div>
              <GoalsSummary />
              <MathDescription chartId="goalsSummary" />
            </div>
          </Suspense>
        )}

        {isVisible('goalsList') && (
          <div className="mt-5">
            <Suspense fallback={<LoadingSpinner category="summary" />}>
              <div>
                <GoalsList />
                <MathDescription chartId="goalsList" />
              </div>
            </Suspense>
          </div>
        )}
      </PageContent>
    </div>
  );
}

export default function GoalsPage() {
  return (
    <Suspense fallback={<LoadingSpinner category="default" className="min-h-screen" />}>
      <GoalsContent />
    </Suspense>
  );
}
