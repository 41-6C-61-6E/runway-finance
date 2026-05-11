'use client';

import { useState, Suspense } from 'react';
import { FireMetrics } from '@/components/fire/fire-metrics';
import { FireProjectionChart } from '@/components/fire/fire-projection-chart';
import { FireProgressRing } from '@/components/fire/fire-progress-ring';
import { FireCalculator } from '@/components/fire/fire-calculator';
import { WhatIfAnalysis } from '@/components/fire/what-if-analysis';
import { FireScenarios } from '@/components/fire/fire-scenarios';

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

function FireContent() {
  const [scenario, setScenario] = useState<FireScenario>(defaultScenario);

  const handleScenarioUpdate = (updates: Partial<FireScenario>) => {
    setScenario((prev) => ({ ...prev, ...updates }));
  };

  const handleLoadScenario = (s: FireScenario) => {
    setScenario(s);
  };

  return (
    <div className="min-h-screen w-full">
      <div className="px-4 sm:px-6 lg:px-8 py-6">
        <div className="mx-auto max-w-[1600px]">
          <h1 className="text-xl font-semibold text-foreground mb-5">FIRE</h1>

          <Suspense fallback={<div className="text-muted-foreground">Loading metrics...</div>}>
            <FireMetrics scenario={scenario} />
          </Suspense>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mt-5">
            <div className="lg:col-span-2">
              <Suspense fallback={<div className="text-muted-foreground">Loading projection...</div>}>
                <FireProjectionChart scenario={scenario} />
              </Suspense>
            </div>
            <div>
              <FireProgressRing
                current={scenario.currentInvestableAssets}
                target={scenario.targetAnnualExpenses / scenario.safeWithdrawalRate}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-5">
            <FireCalculator scenario={scenario} onUpdate={handleScenarioUpdate} />
            <Suspense fallback={<div className="text-muted-foreground">Loading analysis...</div>}>
              <WhatIfAnalysis baseScenario={scenario} />
            </Suspense>
          </div>

          <div className="mt-5">
            <FireScenarios onLoad={handleLoadScenario} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function FirePage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading...</div>}>
      <FireContent />
    </Suspense>
  );
}
