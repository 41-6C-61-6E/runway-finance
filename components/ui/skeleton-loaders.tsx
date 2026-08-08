'use client';

import { Skeleton } from '@/components/ui/skeleton';

/**
 * Skeleton loader for chart areas — mimics the shape of a line/area chart.
 */
export function ChartSkeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`space-y-4 ${className}`}>
      {/* Chart header */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-32" />
        <div className="flex gap-2">
          <Skeleton className="h-7 w-14 rounded-md" />
          <Skeleton className="h-7 w-14 rounded-md" />
          <Skeleton className="h-7 w-14 rounded-md" />
        </div>
      </div>
      {/* Chart area */}
      <div className="relative h-64 w-full overflow-hidden rounded-xl">
        <Skeleton className="h-full w-full" />
        {/* Fake line overlay */}
        <svg
          className="absolute inset-0 w-full h-full text-muted-foreground/5"
          viewBox="0 0 400 200"
          preserveAspectRatio="none"
        >
          <path
            d="M0,150 C50,130 100,140 150,100 C200,60 250,80 300,50 C350,30 380,40 400,35"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
          />
        </svg>
      </div>
    </div>
  );
}

/**
 * Skeleton loader for stat cards / summary panels.
 */
export function StatCardSkeleton({ count = 3, className = '' }: { count?: number; className?: string }) {
  return (
    <div className={`space-y-4 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center justify-between py-3">
          <div className="space-y-2 flex-1">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-6 w-28" />
          </div>
          <Skeleton className="h-4 w-12" />
        </div>
      ))}
    </div>
  );
}

/**
 * Skeleton loader for transaction list items — mimics the compact card layout.
 */
export function TransactionListSkeleton({ count = 8, className = '' }: { count?: number; className?: string }) {
  return (
    <div className={`divide-y divide-border/30 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <div className="flex-1 space-y-2 min-w-0">
            <div className="flex items-center gap-2">
              <Skeleton className="h-3 w-14 shrink-0" />
              <Skeleton className="h-4 w-full max-w-[200px]" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-3 w-16 rounded-full" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
          <Skeleton className="h-4 w-16 shrink-0" />
        </div>
      ))}
    </div>
  );
}

/**
 * Skeleton loader for the net worth dashboard page.
 */
export function NetWorthSkeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`min-h-screen w-full ${className}`}>
      {/* Header skeleton */}
      <div className="px-4 pt-6 pb-3">
        <div className="flex items-center gap-3">
          <Skeleton className="w-6 h-6 rounded" />
          <Skeleton className="h-6 w-28" />
        </div>
      </div>
      {/* Content */}
      <div className="px-4 sm:px-6 lg:px-8 pt-3 pb-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Side panel skeleton */}
          <div className="lg:col-span-1 order-first lg:order-last">
            <StatCardSkeleton count={4} />
          </div>
          {/* Chart skeleton */}
          <div className="lg:col-span-2 space-y-6">
            <ChartSkeleton />
          </div>
        </div>
      </div>
    </div>
  );
}
