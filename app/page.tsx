'use client';

import { Suspense } from 'react';
import { NetWorthChart } from '@/components/net-worth-chart';

function DashboardContent() {
  return (
    <div className="min-h-screen w-full">
      <div className="px-4 sm:px-6 lg:px-8 py-6">
        <div className="mx-auto max-w-[1600px]">
          <h1 className="text-xl font-semibold text-foreground mb-5">Dashboard</h1>
          <Suspense fallback={<div className="text-muted-foreground">Loading chart...</div>}>
            <NetWorthChart />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading...</div>}>
      <DashboardContent />
    </Suspense>
  );
}
