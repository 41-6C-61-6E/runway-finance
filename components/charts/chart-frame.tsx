'use client';

import * as React from 'react';
import { ResponsiveContainer } from 'recharts';
import { ChartErrorBoundary } from '@/components/chart-error-boundary';
import { ChartEmptyState } from '@/components/charts/chart-empty-state';
import { ChartSkeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export interface ChartFrameProps {
  name?: string;
  height?: number | string;
  className?: string;
  isLoading?: boolean;
  isEmpty?: boolean;
  emptyVariant?: 'nodata' | 'empty' | 'error' | 'insufficient';
  emptyTitle?: string;
  emptyDescription?: string;
  emptyError?: string;
  children: React.ReactNode;
  responsive?: boolean;
  overlay?: React.ReactNode;
}

export function ChartFrame({
  name = 'Chart',
  height,
  className,
  isLoading = false,
  isEmpty = false,
  emptyVariant = 'nodata',
  emptyTitle,
  emptyDescription,
  emptyError,
  children,
  responsive = true,
  overlay,
}: ChartFrameProps) {
  const heightStyle = height !== undefined ? { height } : undefined;

  return (
    <ChartErrorBoundary name={name}>
      <div
        className={cn('w-full relative', className)}
        style={heightStyle}
      >
        {isLoading ? (
          <div className="flex items-center justify-center h-full w-full p-4">
            <ChartSkeleton className="w-full h-full" />
          </div>
        ) : isEmpty ? (
          <ChartEmptyState
            variant={emptyVariant}
            title={emptyTitle}
            description={emptyDescription}
            error={emptyError}
          />
        ) : (
          <>
            {responsive ? (
              <ResponsiveContainer
                width="100%"
                height="100%"
                minWidth={0}
                minHeight={0}
                initialDimension={{ width: 100, height: 100 }}
              >
                {children as React.ReactElement}
              </ResponsiveContainer>
            ) : (
              children
            )}
            {overlay}
          </>
        )}
      </div>
    </ChartErrorBoundary>
  );
}
