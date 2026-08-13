'use client';

import React, { useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { usePersistentState } from '@/lib/hooks/use-persistent-state';
import { BalanceForecastChart } from './BalanceForecastChart';
import { RecurringStreamsHub } from './RecurringStreamsHub';
import { SubscriptionInsights } from './SubscriptionInsights';
import type {
  Account,
  TagItem,
  ForecastHorizon,
  RecurringStreamItem,
  ForecastSummaryData,
  BalanceForecastPointData,
  HistoricalBalancePointData,
  SubscriptionInsightData,
} from '../account-types';

interface AccountForecastTabProps {
  filteredAllAccounts: Account[];
  allTags: TagItem[];
  historyData: any[];
  reportableAccounts: any[];
  isMobile: boolean;
}

export function AccountForecastTab({
  filteredAllAccounts,
  allTags,
  historyData,
  reportableAccounts,
  isMobile,
}: AccountForecastTabProps) {
  const queryClient = useQueryClient();

  const [horizon, setHorizon] = usePersistentState<ForecastHorizon>(
    'finance:accounts:forecastHorizon',
    '90d'
  );

  // 1. Fetch Forecast & Recurring Engine data
  const { data, isLoading, error, refetch } = useQuery<{
    projections: BalanceForecastPointData[];
    historical: HistoricalBalancePointData[];
    summary: ForecastSummaryData;
    recurringStreams: RecurringStreamItem[];
    accounts: Array<{ id: string; name: string; type: string; balance: number }>;
    insights: SubscriptionInsightData[];
  }>({
    queryKey: ['accounts-forecast', horizon],
    queryFn: async () => {
      const params = new URLSearchParams({ horizon });
      const res = await fetch(`/api/accounts/forecast?${params.toString()}`, {
        credentials: 'include',
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || errorData.error || 'Failed to fetch forecast');
      }
      return res.json();
    },
  });

  // Create account lookup map
  const accountNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const acc of filteredAllAccounts) {
      map[acc.id] = acc.name;
    }
    return map;
  }, [filteredAllAccounts]);

  // 2. Mutations for Recurring Streams
  const saveStreamMutation = useMutation({
    mutationFn: async (streamData: Partial<RecurringStreamItem>) => {
      if (streamData.id && !streamData.id.startsWith('detected-')) {
        // PATCH existing
        const res = await fetch(`/api/accounts/forecast/recurring/${streamData.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(streamData),
          credentials: 'include',
        });
        if (!res.ok) throw new Error('Failed to update recurring stream');
        return res.json();
      } else {
        // POST new or confirmed
        const res = await fetch(`/api/accounts/forecast/recurring`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(streamData),
          credentials: 'include',
        });
        if (!res.ok) throw new Error('Failed to save recurring stream');
        return res.json();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts-forecast'] });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async (stream: RecurringStreamItem) => {
      if (stream.id && !stream.id.startsWith('detected-')) {
        const res = await fetch(`/api/accounts/forecast/recurring/${stream.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isActive: !stream.isActive }),
          credentials: 'include',
        });
        if (!res.ok) throw new Error('Failed to toggle status');
        return res.json();
      } else {
        // Saving a detected stream as inactive in DB
        const res = await fetch(`/api/accounts/forecast/recurring`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...stream, isActive: !stream.isActive }),
          credentials: 'include',
        });
        if (!res.ok) throw new Error('Failed to toggle status');
        return res.json();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts-forecast'] });
    },
  });

  const deleteStreamMutation = useMutation({
    mutationFn: async (stream: RecurringStreamItem) => {
      if (stream.id && !stream.id.startsWith('detected-')) {
        const res = await fetch(`/api/accounts/forecast/recurring/${stream.id}`, {
          method: 'DELETE',
          credentials: 'include',
        });
        if (!res.ok) throw new Error('Failed to delete recurring stream');
        return res.json();
      } else {
        // Mark detected stream as excluded/inactive in DB
        const res = await fetch(`/api/accounts/forecast/recurring`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...stream, isActive: false }),
          credentials: 'include',
        });
        if (!res.ok) throw new Error('Failed to dismiss recurring stream');
        return res.json();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts-forecast'] });
    },
  });

  const handleSaveStream = useCallback(
    async (streamData: Partial<RecurringStreamItem>) => {
      await saveStreamMutation.mutateAsync(streamData);
    },
    [saveStreamMutation]
  );

  const handleToggleActive = useCallback(
    async (stream: RecurringStreamItem) => {
      await toggleActiveMutation.mutateAsync(stream);
    },
    [toggleActiveMutation]
  );

  const handleDeleteStream = useCallback(
    async (stream: RecurringStreamItem) => {
      await deleteStreamMutation.mutateAsync(stream);
    },
    [deleteStreamMutation]
  );

  const horizonLabels: Record<ForecastHorizon, string> = {
    '30d': '30 Days',
    '60d': '60 Days',
    '90d': '90 Days',
    '6m': '6 Months',
    '1y': '1 Year',
  };

  if (isLoading && !data) {
    return (
      <div className="space-y-6">
        <LoadingSpinner category="chart" className="py-20" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="p-8 text-center rounded-2xl border border-destructive/30 bg-destructive/5 backdrop-blur-sm space-y-3 my-6">
        <div className="w-10 h-10 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mx-auto">
          <AlertCircle className="w-5 h-5" />
        </div>
        <h3 className="font-semibold text-base text-foreground">Unable to Load Forecast</h3>
        <p className="text-xs text-muted-foreground max-w-md mx-auto">
          {error instanceof Error ? error.message : 'An error occurred while loading recurring streams and projections.'}
        </p>
        <Button size="sm" variant="outline" onClick={() => refetch()} className="text-xs mt-2">
          Retry
        </Button>
      </div>
    );
  }

  const projections = data?.projections || [];
  const historical = data?.historical || [];
  const recurringStreams = data?.recurringStreams || [];
  const accounts = data?.accounts || [];
  const insights = data?.insights || [];

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* ── 1. Balance Forecast Chart ── */}
      <BalanceForecastChart
        projections={projections}
        historical={historical}
        accounts={accounts}
        horizon={horizon}
        onHorizonChange={setHorizon}
        safeReserve={1000}
      />

      {/* ── 2. Chronological Timeline & Stream Manager Hub ── */}
      <RecurringStreamsHub
        streams={recurringStreams}
        accounts={filteredAllAccounts}
        onSaveStream={handleSaveStream}
        onToggleActive={handleToggleActive}
        onDeleteStream={handleDeleteStream}
        accountNames={accountNames}
      />

      {/* ── 3. Subscription Intelligence & Price Change Detector ── */}
      {insights.length > 0 && (
        <SubscriptionInsights insights={insights} streams={recurringStreams} />
      )}
    </div>
  );
}
