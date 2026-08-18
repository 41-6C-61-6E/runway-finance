'use client';

import { createContext, useContext, useCallback, useMemo, useEffect, useRef, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';

type UserSettingsContextType = {
  settings: Record<string, any>;
  updateSetting: (key: string, value: any) => Promise<void>;
  loading: boolean;
  refreshSettings: () => Promise<void>;
};

const UserSettingsContext = createContext<UserSettingsContextType | null>(null);

export function UserSettingsProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const channelRef = useRef<BroadcastChannel | null>(null);

  const { data: settings = {}, isLoading: loading, refetch } = useQuery<Record<string, any>>({
    queryKey: queryKeys.userSettings.all,
    queryFn: async () => {
      const res = await fetch('/api/user-settings', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load user settings');
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  // Cross-tab sync: when another tab changes a setting, refresh this tab's cache.
  // BroadcastChannel only delivers to OTHER contexts, so we never echo our own writes.
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel('runway-settings');
    channelRef.current = channel;
    channel.onmessage = () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.userSettings.all });
    };
    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, [queryClient]);

  const refreshSettings = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const updateSetting = useCallback(async (key: string, value: any) => {
    // Optimistically update local query cache
    queryClient.setQueryData<Record<string, any>>(queryKeys.userSettings.all, (prev = {}) => {
      if (key === 'chartSelections' || key === 'cardCollapsedStates' || key === 'accountTagVisibility' || key === 'budgetExclusions') {
        const existingData = prev[key] || {};
        const mergedData = { ...existingData, ...value };
        return { ...prev, [key]: mergedData };
      }
      return { ...prev, [key]: value };
    });

    try {
      const bodyPayload = (key === 'chartSelections' || key === 'cardCollapsedStates' || key === 'accountTagVisibility' || key === 'budgetExclusions')
        ? { [key]: value }
        : { [key]: value };

      const res = await fetch('/api/user-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(bodyPayload),
      });

      if (!res.ok) {
        throw new Error('Failed to update setting');
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.userSettings.all });
      // Notify other open tabs so they refresh their settings cache.
      channelRef.current?.postMessage({ type: 'settings-changed', key });
    } catch (e) {
      console.error(`Failed to update setting ${key}`, e);
      queryClient.invalidateQueries({ queryKey: queryKeys.userSettings.all });
    }
  }, [queryClient]);

  const value = useMemo(
    () => ({ settings, updateSetting, loading, refreshSettings }),
    [settings, updateSetting, loading, refreshSettings],
  );

  return (
    <UserSettingsContext.Provider value={value}>
      {children}
    </UserSettingsContext.Provider>
  );
}

export function useUserSettings() {
  const context = useContext(UserSettingsContext);
  return context;
}
