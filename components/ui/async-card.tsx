'use client';

import * as React from 'react';
import { AlertTriangle, type LucideIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * Loading / empty / error rendering for a data-fetching card.
 *
 * The failure mode this exists to kill (R-8): a fetch that 500s falls into a
 * `catch { console.error(...) }`, and the card renders as an *empty* panel —
 * visually identical to "no data", a wrong answer presented confidently, with
 * no retry. `AsyncCard` makes the three states explicit in one place:
 *
 * - `loading` → skeleton rows (shape of the answer, not a spinner wall)
 * - `empty`   → `EmptyState` ("legitimately none found")
 * - `error`   → `EmptyState` + message + working Retry
 *
 * ```tsx
 * <AsyncCard
 *   state={phase}
 *   error={error ? `Couldn't load duplicates (${error})` : undefined}
 *   onRetry={refetch}
 *   empty={{ icon: ClipboardCheck, title: 'No duplicate groups found', description: '…' }}
 >
 *   {groups.map(...)}          // rendered only when state === "ready"
 * </AsyncCard>
 * ```
 */
export interface AsyncCardProps {
  /** Explicit phase. Use "ready" to render `children` (fetched content). */
  state: 'loading' | 'empty' | 'error' | 'ready';
  /** Error description shown in the `error` state. */
  error?: string;
  /**
   * Config for the `empty` state. Pass an icon (e.g. `ClipboardCheck`) so the
   * empty state is specific to the scan scope rather than generic.
   */
  empty?: {
    icon?: LucideIcon;
    title: string;
    description?: string;
  };
  /** Enables the Retry button in the `error` state. */
  onRetry?: () => void;
  /** Label for the retry button. @default "Retry" */
  retryLabel?: string;
  /** Optional caption under the loading skeleton (e.g. "Scanning database…"). */
  loadingLabel?: string;
  /**
   * Skeleton layout override for the `loading` state. If omitted, a default
   * three-row skeleton block is shown.
   */
  children?: React.ReactNode;
  className?: string;
}

export function AsyncCard({
  state,
  error,
  empty,
  onRetry,
  retryLabel = 'Retry',
  loadingLabel,
  children,
  className,
}: AsyncCardProps) {
  if (state === 'loading') {
    return (
      <div className={cn('space-y-3', className)} role="status" aria-live="polite">
        {children ?? (
          <div className="space-y-3">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        )}
        {loadingLabel ? (
          <p className="text-sm text-muted-foreground">{loadingLabel}</p>
        ) : null}
        <span className="sr-only">Loading…</span>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Something went wrong"
        description={error ?? 'We couldn\'t load this data. Try again.'}
        action={
          onRetry ? (
            <Button size="sm" variant="outline" onClick={onRetry}>
              {retryLabel}
            </Button>
          ) : undefined
        }
        className={className}
      />
    );
  }

  if (state === 'empty') {
    if (!empty) {
      // An explicit empty state with no content configured is a bug in the
      // consumer; surface it in dev rather than rendering a blank card.
      if (process.env.NODE_ENV !== 'production') {
        console.warn('<AsyncCard state="empty"> needs an `empty={{ icon, title }}` description');
      }
      return null;
    }
    return (
      <EmptyState icon={empty.icon} title={empty.title} description={empty.description} className={className} />
    );
  }

  return (
    <div className={className}>
      {children}
    </div>
  );
}
