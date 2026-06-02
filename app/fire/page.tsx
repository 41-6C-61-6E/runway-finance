'use client';

import { useState, Suspense } from 'react';
import { FireMetrics } from '@/components/fire/fire-metrics';
import { FireProjectionChart } from '@/components/fire/fire-projection-chart';
import { FireProgressRing } from '@/components/fire/fire-progress-ring';
import { FireCalculator } from '@/components/fire/fire-calculator';
import { WhatIfAnalysis } from '@/components/fire/what-if-analysis';
import { FireScenarios } from '@/components/fire/fire-scenarios';
import { RetirementAccountAllocation } from '@/components/fire/retirement-account-allocation';
import { WithdrawalRateSensitivity } from '@/components/fire/withdrawal-rate-sensitivity';
import { RetirementPlanner } from '@/components/fire/retirement/retirement-planner';
import { MathDescription } from '@/components/features/settings/math-description';
import { useChartVisibility } from '@/lib/hooks/use-chart-visibility';
import { Flame } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { PageHeader } from '@/components/page-header';
import PageContent from '@/components/page-content';

export interface FireScenario {
  id?: string;
  name: string;
  isDefault: boolean;
  currentAge: number;
  targetAge: number;
  targetAnnualExpenses: number;
  currentInvestableAssets: number;
  annualContributions: number;
  expectedReturnRate: number;
  inflationRate: number;
  safeWithdrawalRate: number;
}

const defaultScenario: FireScenario = {
  name: 'Primary Scenario',
  isDefault: true,
  currentAge: 30,
  targetAge: 65,
  targetAnnualExpenses: 40000,
  currentInvestableAssets: 0,
  annualContributions: 12000,
  expectedReturnRate: 0.07,
  inflationRate: 0.03,
  safeWithdrawalRate: 0.04,
};

type Tab = 'forecaster' | 'retirement';

function FireContent() {
  const [tab, setTab] = useState<Tab>('forecaster');
  const [scenario, setScenario] = useState<FireScenario>(defaultScenario);
  const { isVisible } = useChartVisibility();

  const handleScenarioUpdate = (updates: Partial<FireScenario>) => {
    setScenario((prev) => ({ ...prev, ...updates }));
  };

  const handleLoadScenario = (s: FireScenario) => {
    setScenario(s);
  };

  return (
    <div className="min-h-screen w-full">
      {/* ── Page Header ── */}
      <PageHeader title="FIRE" icon={Flame}>
        <div className="flex gap-1 bg-muted/50 rounded-lg p-0.5 w-fit">
          <button
            onClick={() => setTab('forecaster')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
              tab === 'forecaster'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Forecaster
          </button>
          <button
            onClick={() => setTab('retirement')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
              tab === 'retirement'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Retirement Planner
          </button>
        </div>
      </PageHeader>
      <PageContent>
        {tab === 'forecaster' && (
            <>
              {isVisible('fireMetrics') && (
                <Suspense fallback={<LoadingSpinner category="analysis" />}>
                  <div>
                    <FireMetrics scenario={scenario} />
                    <MathDescription chartId="fireMetrics" />
                  </div>
                </Suspense>
              )}

              {(isVisible('fireProjectionChart') || isVisible('fireProgressRing')) && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mt-5">
                  {isVisible('fireProjectionChart') && (
                    <div className="lg:col-span-2">
                      <Suspense fallback={<LoadingSpinner category="forecast" />}>
                        <div>
                          <FireProjectionChart scenario={scenario} />
                          <MathDescription chartId="fireProjectionChart" />
                        </div>
                      </Suspense>
                    </div>
                  )}
                  {isVisible('fireProgressRing') && (
                    <div>
                      <div>
                        <FireProgressRing
                          current={scenario.currentInvestableAssets}
                          target={scenario.targetAnnualExpenses / scenario.safeWithdrawalRate}
                        />
                        <MathDescription chartId="fireProgressRing" />
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-5">
                <FireCalculator scenario={scenario} onUpdate={handleScenarioUpdate} />
                {isVisible('whatIfAnalysis') && (
                  <Suspense fallback={<LoadingSpinner category="analysis" />}>
                    <div>
                      <WhatIfAnalysis baseScenario={scenario} />
                      <MathDescription chartId="whatIfAnalysis" />
                    </div>
                  </Suspense>
                )}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-5">
                <Suspense fallback={<LoadingSpinner category="chart" />}>
                  <RetirementAccountAllocation />
                </Suspense>
                <WithdrawalRateSensitivity scenario={scenario} />
              </div>

              {isVisible('fireScenarios') && (
                <div className="mt-5">
                  <div>
                    <FireScenarios onLoad={handleLoadScenario} />
                    <MathDescription chartId="fireScenarios" />
                  </div>
                </div>
              )}
            </>
          )}

          {tab === 'retirement' && (
            <RetirementPlanner />
          )}
      </PageContent>
    </div>
  );
}

export default function FirePage() {
  return (
    <Suspense fallback={<LoadingSpinner category="default" className="min-h-screen" />}>
      <FireContent />
    </Suspense>
  );
}
