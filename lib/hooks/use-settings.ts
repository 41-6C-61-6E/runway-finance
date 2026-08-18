'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';

/**
 * Shared React Query-backed access to the user's settings.
 *
 * This reads the SAME `['user-settings']` cache that
 * `UserSettingsProvider` populates, so any component using these hooks
 * shares one cache entry (one network request, one staleTime window)
 * instead of issuing its own raw `fetch('/api/user-settings')`.
 *
 * These hooks are additive and non-breaking: existing consumers of
 * `useUserSettings()` continue to work unchanged. New code should prefer
 * these hooks so it participates in the shared cache and the cross-tab
 * invalidation the provider performs.
 */

/**
 * Returns the full user settings object from the shared React Query cache.
 *
 * @returns The settings record, plus standard React Query status flags.
 */
export function useUserSettingsQuery() {
  return useQuery({
    queryKey: queryKeys.userSettings.all,
    queryFn: async () => {
      const res = await fetch('/api/user-settings', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load user settings');
      return (await res.json()) as Record<string, any>;
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Returns a single setting value from the shared React Query cache.
 *
 * @param key The settings key to read (e.g. `chartSelections`, `privacyMode`).
 * @param fallback Value returned while the query is loading or if the key is absent.
 */
export function useSetting<T = any>(key: string, fallback: T): T {
  const { data } = useUserSettingsQuery();
  return (data?.[key] as T) ?? fallback;
}
