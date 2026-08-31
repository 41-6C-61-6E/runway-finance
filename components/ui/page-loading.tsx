'use client';

import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

interface PageLoadingProps {
  /** Number of card-shaped blocks to render. */
  cards?: number;
  /** Number of shimmer lines inside each card. */
  lines?: number;
  /** Keep the previous content dimmed underneath instead of a blank panel. Pass the
   *  rendered previous UI as children and it will sit under the skeleton at 50% opacity. */
  children?: React.ReactNode;
  className?: string;
  'aria-label'?: string;
}

/**
 * The single sanctioned page-level loading UI.
 *
 * Replaces the old "blank page + centered spinner" pattern: skeleton cards
 * render immediately (no layout jump), and if `children` are passed the
 * previous content stays visible dimmed underneath so tab switches feel
 * instant.
 *
 * Usage:
 *   <PageLoading />                                  // card grid shimmer
 *   <PageLoading>{previousContent}</PageLoading>     // dimmed-tab pattern
 */
export function PageLoading({
  cards = 3,
  lines = 4,
  children,
  className,
  'aria-label': ariaLabel = 'Loading',
}: PageLoadingProps) {
  return (
    <div
      role="status"
      aria-label={ariaLabel}
      aria-busy="true"
      className={cn('relative w-full min-w-0', className)}
    >
      {children && (
        <div className="pointer-events-none select-none opacity-50 scale-[0.995]">{children}</div>
      )}
      <div className={cn('grid gap-3 sm:gap-4', children && 'animate-pulse')}>
        {Array.from({ length: cards }).map((_, i) => (
          <div key={i} className="bg-card border border-border rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
            <div className="space-y-2">
              {Array.from({ length: lines }).map((_, j) => (
                <Skeleton key={j} className={cn('h-3', (i + j) % 3 === 0 ? 'w-3/4' : (i + j) % 3 === 1 ? 'w-full' : 'w-5/6')} />
              ))}
            </div>
          </div>
        ))}
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
