'use client';

import { Suspense } from 'react';
import { NetWorthChart } from '@/components/net-worth-chart';
import { NetWorthSummary } from '@/components/net-worth/net-worth-summary';
import { AssetAllocationChart } from '@/components/net-worth/asset-allocation-chart';
import { AccountValuesChart } from '@/components/net-worth/account-values-chart';
import { GoalsProgress } from '@/components/net-worth/goals-progress';
import { DebtToAssetRatio } from '@/components/debt-to-asset-ratio';

function NetWorthContent() {
  return (
    <div className="min-h-screen w-full">
      <div className="px-4 sm:px-6 lg:px-8 py-6">
        <div className="mx-auto max-w-[1600px]">
          <h1 className="text-xl font-semibold text-foreground mb-5">Net Worth</h1>
          
          {/* Summary Cards */}
          <Suspense fallback={<div className="text-muted-foreground">Loading summary...</div>}>
            <NetWorthSummary />
          </Suspense>
          
          {/* Main Chart + Debt Ratio */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mt-5">
            <div className="lg:col-span-2">
              <Suspense fallback={<div className="text-muted-foreground">Loading chart...</div>}>
                <NetWorthChart />
              </Suspense>
            </div>
            <div>
              <Suspense fallback={<div className="text-muted-foreground">Loading ratio...</div>}>
                <DebtToAssetRatio />
              </Suspense>
            </div>
          </div>
          
          {/* Asset Allocation + Account Values */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-5">
            <Suspense fallback={<div className="text-muted-foreground">Loading allocation...</div>}>
              <AssetAllocationChart />
            </Suspense>
            <Suspense fallback={<div className="text-muted-foreground">Loading account values...</div>}>
              <AccountValuesChart />
            </Suspense>
          </div>
          
          {/* Goals */}
          <div className="mt-5">
            <Suspense fallback={<div className="text-muted-foreground">Loading goals...</div>}>
              <GoalsProgress />
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading...</div>}>
      <NetWorthContent />
    </Suspense>
  );
}
