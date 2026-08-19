'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { Repeat } from 'lucide-react';
import { SubscriptionTracker } from '@/components/features/transactions/SubscriptionTracker';
import type { RecurringItem } from '@/components/features/transactions/RecurringCard';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { PageHeader } from '@/components/page-header';
import PageContent from '@/components/page-content';

function SubscriptionsContent() {
  const [items, setItems] = useState<RecurringItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch('/api/recurring?includeDismissed=true&status=all');
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
      } else {
        setError('Failed to load subscriptions. Please try again.');
      }
    } catch {
      setError('Failed to load subscriptions. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="min-h-screen w-full page-transition-enter">
      {/* ── Page Header ── */}
      <PageHeader title="Subscriptions" icon={Repeat} />
      <PageContent>
        {error ? (
          <div className="py-16 text-center space-y-4">
            <p className="text-sm text-muted-foreground">{error}</p>
            <button
              onClick={load}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Retry
            </button>
          </div>
        ) : (
          <SubscriptionTracker items={items} loading={loading} />
        )}
      </PageContent>
    </div>
  );
}

export default function SubscriptionsPage() {
  return (
    <Suspense fallback={<LoadingSpinner category="default" className="min-h-screen" />}>
      <SubscriptionsContent />
    </Suspense>
  );
}
