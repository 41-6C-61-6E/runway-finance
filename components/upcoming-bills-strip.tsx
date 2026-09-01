'use client';

import { useEffect, useMemo, useState } from 'react';
import { Clock4, Inbox, RefreshCw } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { usePrivacyMode } from '@/components/privacy-mode-provider';
import { formatCurrency } from '@/lib/utils/format';
import type { UpcomingBill } from '@/lib/services/recurring-detection';

/**
 * Home "Up next" strip (R-9): a next-5 view over the same recurring-bills data
 * `components/cash-flow/upcoming-bills.tsx` already computes, rendered under
 * the Home charts to fill the 1440px bottom-half void with content. Links the
 * full feed to /transactions.
 */

const HORIZON_DAYS = 30;
const STRIP_COUNT = 5;

function formatDue(b: UpcomingBill): string {
  if (b.isOverdue) return b.daysUntil === 0 ? 'Overdue' : `Overdue · ${Math.abs(b.daysUntil)}d ago`;
  if (b.daysUntil === 0) return 'Today';
  if (b.daysUntil === 1) return 'Tomorrow';
  if (b.daysUntil <= 7) return `In ${b.daysUntil} days`;
  return new Date(`${b.expectedDate}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function UpcomingBillsStrip() {
  const { privacyMode } = usePrivacyMode();
  const [bills, setBills] = useState<UpcomingBill[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      setFailed(false);
      fetch(`/api/recurring/upcoming?days=${HORIZON_DAYS}&flowType=all`, { credentials: 'include' })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (!cancelled) setBills(data?.bills ?? []);
        })
        .catch(() => {
          if (!cancelled) {
            setBills([]);
            setFailed(true);
          }
        });
    };
    load();
    document.addEventListener('visibilitychange', load);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', load);
    };
  }, []);

  const strip = useMemo(
    () => [...(bills ?? [])].sort((a, b) => (a.isOverdue === b.isOverdue ? a.daysUntil - b.daysUntil : a.isOverdue ? -1 : 1)).slice(0, STRIP_COUNT),
    [bills]
  );

  if (!bills) {
    return (
      <div className="lg:col-span-3 rounded-xl border border-border bg-card/50 p-4" aria-busy="true" aria-label="Loading upcoming bills">
        <Skeleton className="h-3.5 w-24 mb-3" />
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-2.5 w-1/2" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (bills.length === 0 && !failed) {
    return (
      <div className="lg:col-span-3 rounded-xl border border-dashed border-border/80 p-4 flex items-center gap-3">
        <Inbox className="h-4 w-4 text-foreground/50 shrink-0" />
        <div>
          <p className="text-xs font-medium">No upcoming bills in the next {HORIZON_DAYS} days</p>
          <p className="text-xs text-foreground/50">Tracked recurring bills and income will show up here.</p>
        </div>
        <a href="/transactions" className="text-xs font-medium text-foreground/60 hover:text-foreground underline underline-offset-2 whitespace-nowrap">
          View all
        </a>
      </div>
    );
  }

  return (
    <div className="lg:col-span-3 rounded-xl border border-border bg-card/50 p-4">
      <div className="flex items-center justify-between mb-3 gap-3">
        <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-foreground/60 uppercase">
          <Clock4 className="h-3.5 w-3.5" />
          Up next
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-foreground/40 whitespace-nowrap">Next {HORIZON_DAYS} days</span>
          <a
            href="/transactions"
            className="text-xs font-medium text-foreground/60 hover:text-foreground whitespace-nowrap shrink-0"
          >
            View all
          </a>
        </div>
      </div>

      {failed ? (
        <div className="py-2 flex items-center justify-center gap-2">
          <p className="text-xs text-foreground/50">Couldn&rsquo;t load upcoming bills.</p>
          <Button variant="ghost" size="sm" className="text-xs" onClick={() => setBills(null)}>
            <RefreshCw className="h-3 w-3" /> Retry
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {strip.map((b) => (
            <div key={b.id} className="min-w-0 rounded-lg border border-border/60 bg-card/60 px-3 py-2">
              <p
                className={`text-xs font-medium truncate ${b.isOverdue ? 'text-destructive' : b.flowType === 'income' ? 'text-chart-1' : ''}`}
                title={b.displayName}
              >
                {privacyMode ? '•'.repeat(6) : b.displayName}
              </p>
              <p className="text-sm font-semibold tabular-nums">
                {privacyMode ? '••••••' : b.flowType === 'income' ? `+${formatCurrency(b.amount)}` : formatCurrency(b.amount)}
              </p>
              <p className={`text-xs ${b.isOverdue ? 'text-destructive/70' : 'text-foreground/40'}`}>{formatDue(b)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default UpcomingBillsStrip;
