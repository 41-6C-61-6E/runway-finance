'use client';

import { useMemo } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import type { DailyCashFlowDay, DailyCashFlowResult } from '@/lib/finance/daily-cash-flow';

export interface DateRange {
  startDate: string;
  endDate: string;
}

/**
 * Hook to fetch daily cash flow actuals for a given date range.
 */
export function useDailyCashFlow(range: DateRange | null, search?: string) {
  const startDate = range?.startDate;
  const endDate = range?.endDate;
  const trimmedSearch = search?.trim() || '';

  const queryKey = useMemo(
    () => [...queryKeys.calendar.dailyCashFlow, startDate, endDate, trimmedSearch] as const,
    [startDate, endDate, trimmedSearch]
  );

  const query = useQuery<DailyCashFlowResult>({
    queryKey,
    queryFn: async () => {
      if (!startDate || !endDate) {
        return { startDate: '', endDate: '', days: [] };
      }
      const params = new URLSearchParams({ startDate, endDate });
      if (trimmedSearch) {
        params.set('search', trimmedSearch);
      }
      const res = await fetch(`/api/cash-flow/daily?${params.toString()}`);
      if (!res.ok) {
        throw new Error('Failed to fetch daily cash flow');
      }
      return res.json();
    },
    enabled: Boolean(startDate && endDate),
    staleTime: 60 * 1000, // 1 minute
    placeholderData: keepPreviousData,
  });

  const byDate = useMemo(() => {
    const map = new Map<string, DailyCashFlowDay>();
    if (query.data?.days) {
      for (const day of query.data.days) {
        map.set(day.date, day);
      }
    }
    return map;
  }, [query.data]);

  return {
    ...query,
    byDate,
  };
}

/**
 * Hook to fetch transactions for a single calendar day (for Day Inspector & Mobile Agenda).
 */
export function useDayTransactions(
  date: string | null,
  options?: {
    search?: string;
    excludeCategoryIds?: string;
  }
) {
  const trimmedSearch = options?.search?.trim() || '';
  const excludeCategoryIds = options?.excludeCategoryIds || '';

  const queryKey = useMemo(
    () => [...queryKeys.calendar.dayTransactions, date, trimmedSearch, excludeCategoryIds] as const,
    [date, trimmedSearch, excludeCategoryIds]
  );

  const query = useQuery<{ data: any[]; total: number }>({
    queryKey,
    queryFn: async () => {
      if (!date) return { data: [], total: 0 };
      const params = new URLSearchParams({
        startDate: date,
        endDate: date,
        limit: '200',
        sort: 'date',
        order: 'desc',
      });
      if (trimmedSearch) {
        params.set('search', trimmedSearch);
      }
      if (excludeCategoryIds) {
        params.set('excludeCategoryIds', excludeCategoryIds);
      }
      const res = await fetch(`/api/transactions?${params.toString()}`);
      if (!res.ok) {
        throw new Error('Failed to fetch day transactions');
      }
      return res.json();
    },
    enabled: Boolean(date),
    staleTime: 30 * 1000,
  });

  return {
    ...query,
    transactions: query.data?.data ?? [],
    total: query.data?.total ?? 0,
  };
}
