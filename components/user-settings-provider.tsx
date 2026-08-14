'use client';

import { createContext, useContext, useCallback, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

type UserSettingsContextType = {
  settings: Record<string, any>;
  updateSetting: (key: string, value: any) => Promise<void>;
  loading: boolean;
  refreshSettings: () => Promise<void>;
};

const UserSettingsContext = createContext<UserSettingsContextType | null>(null);

export function UserSettingsProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const { data: settings = {}, isLoading: loading, refetch } = useQuery<Record<string, any>>({
    queryKey: ['user-settings'],
    queryFn: async () => {
      const res = await fetch('/api/user-settings', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load user settings');
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const refreshSettings = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const updateSetting = useCallback(async (key: string, value: any) => {
    // Optimistically update local query cache
    queryClient.setQueryData<Record<string, any>>(['user-settings'], (prev = {}) => {
      if (key === 'chartSelections' || key === 'cardCollapsedStates' || key === 'accountTagVisibility') {
        const existingData = prev[key] || {};
        const mergedData = { ...existingData, ...value };
        return { ...prev, [key]: mergedData };
      }
      return { ...prev, [key]: value };
    });

    try {
      const bodyPayload = (key === 'chartSelections' || key === 'cardCollapsedStates' || key === 'accountTagVisibility')
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
      queryClient.invalidateQueries({ queryKey: ['user-settings'] });
    } catch (e) {
      console.error(`Failed to update setting ${key}`, e);
      queryClient.invalidateQueries({ queryKey: ['user-settings'] });
    }
  }, [queryClient]);

  return (
    <UserSettingsContext.Provider value={{ settings, updateSetting, loading, refreshSettings }}>
      {children}
    </UserSettingsContext.Provider>
  );
}

export function useUserSettings() {
  const context = useContext(UserSettingsContext);
  return context;
}
