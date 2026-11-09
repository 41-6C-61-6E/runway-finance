'use client';

import { createContext, useContext, useCallback, useMemo, useEffect, useRef, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { invalidateAfterAccountChange } from '@/lib/query-invalidation';

// Early bootstrap saved text size before React renders
if (typeof window !== 'undefined') {
  try {
    const savedTextSize = localStorage.getItem('finance-text-size');
    if (savedTextSize) {
      document.documentElement.classList.add(`text-size-${savedTextSize}`);
    }
  } catch {}
}

type UserSettingsContextType = {
  settings: Record<string, any>;
  updateSetting: (key: string, value: any) => Promise<void>;
  loading: boolean;
  refreshSettings: () => Promise<void>;
  /**
   * Compact layout toggle (Settings → General). When true, main-content
   * horizontal padding and vertical gaps are tightened one step (scoped CSS
   * under `.compact-layout`). Mirrored on `<html>` as the same class.
   */
  compactMode: boolean;
};

const UserSettingsContext = createContext<UserSettingsContextType | null>(null);

function isTransientNetworkOrAbortError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const name = (err as { name?: string }).name;
  const message = String((err as { message?: string }).message || '');
  if (name === 'AbortError') return true;
  if (
    name === 'TypeError' &&
    /load failed|failed to fetch|networkerror|network connection was lost|cancelled|canceled|aborted/i.test(message)
  ) {
    return true;
  }
  return false;
}

function isSignInRoute(): boolean {
  return typeof window !== 'undefined' && (window.location.pathname === '/signin' || window.location.pathname.startsWith('/signin/'));
}

export function UserSettingsProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const isSignIn = isSignInRoute();
  const channelRef = useRef<BroadcastChannel | null>(null);
  const pendingChartSelectionsRef = useRef<Record<string, Record<string, any>>>({});
  const chartFlushPromiseRef = useRef<Promise<void> | null>(null);
  const inFlightChartPatchRef = useRef<Promise<void>>(Promise.resolve());

  const { data: settings = {}, isLoading: loading, refetch } = useQuery<Record<string, any>>({
    queryKey: queryKeys.userSettings.all,
    queryFn: async () => {
      const res = await fetch('/api/user-settings', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load user settings');
      return res.json();
    },
    enabled: !isSignIn,
    staleTime: 5 * 60 * 1000,
  });

  // Apply text size class to root html element
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const textSize = settings.textSize || 'default';
    document.documentElement.classList.remove('text-size-sm', 'text-size-default', 'text-size-base', 'text-size-lg');
    document.documentElement.classList.add(`text-size-${textSize}`);
    try {
      localStorage.setItem('finance-text-size', textSize);
    } catch {}
  }, [settings.textSize]);

  /** True when the user has enabled Compact Mode in Settings → General. */
  const compactMode = settings?.compactMode === true;

  // Apply the compact layout flag to <html> so scoped CSS (styles/globals.css,
  // `.compact-layout`) can tighten main-content padding. Mirrors the existing
  // text-size class pattern; the sidebar is unaffected (its margin lives on a
  // separate wrapper in authenticated-layout.tsx).
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (compactMode) {
      document.documentElement.classList.add('compact-layout');
    } else {
      document.documentElement.classList.remove('compact-layout');
    }
  }, [compactMode]);

  // Cross-tab sync: when another tab changes a setting, refresh this tab's cache.
  // BroadcastChannel only delivers to OTHER contexts, so we never echo our own writes.
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return undefined;
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
    if (key === 'textSize') {
      if (typeof document !== 'undefined') {
        document.documentElement.classList.remove('text-size-sm', 'text-size-default', 'text-size-base', 'text-size-lg');
        document.documentElement.classList.add(`text-size-${value}`);
        try {
          localStorage.setItem('finance-text-size', value);
        } catch {}
      }
    }

    // Optimistically update local query cache
    queryClient.setQueryData<Record<string, any>>(queryKeys.userSettings.all, (prev = {}) => {
      if (
        key === 'chartSelections' ||
        key === 'cardCollapsedStates' ||
        key === 'accountTagVisibility' ||
        key === 'budgetExclusions' ||
        key === 'showSyntheticData' ||
        key === 'showImportedData' ||
        key === 'chartVisibility' ||
        key === 'hiddenPages'
      ) {
        const existingData = prev[key] || {};
        const mergedData = typeof value === 'object' && value !== null ? { ...existingData, ...value } : value;
        return { ...prev, [key]: mergedData };
      }
      return { ...prev, [key]: value };
    });

    const sendPatchRequest = async (bodyPayload: Record<string, any>, keys: string[]) => {
      try {
        const res = await fetch('/api/user-settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(bodyPayload),
        });

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.error || `HTTP ${res.status}`);
        }

        if (Object.keys(pendingChartSelectionsRef.current).length === 0) {
          queryClient.invalidateQueries({ queryKey: queryKeys.userSettings.all });
        }
        if (keys.includes('showImportedData') || keys.includes('showSyntheticData')) {
          invalidateAfterAccountChange(queryClient);
        }
        // Notify other open tabs so they refresh their settings cache.
        for (const k of keys) {
          channelRef.current?.postMessage({ type: 'settings-changed', key: k });
        }
      } catch (e) {
        if (isTransientNetworkOrAbortError(e)) {
          return;
        }
        console.error(`Failed to update setting ${keys.join(', ')}:`, e);
        if (Object.keys(pendingChartSelectionsRef.current).length === 0) {
          queryClient.invalidateQueries({ queryKey: queryKeys.userSettings.all });
        }
      }
    };

    if (
      (key === 'chartSelections' || key === 'cardCollapsedStates') &&
      typeof value === 'object' &&
      value !== null
    ) {
      pendingChartSelectionsRef.current[key] = {
        ...(pendingChartSelectionsRef.current[key] || {}),
        ...value,
      };

      if (!chartFlushPromiseRef.current) {
        chartFlushPromiseRef.current = Promise.resolve().then(() => {
          chartFlushPromiseRef.current = null;
          const nextPatch = inFlightChartPatchRef.current.then(async () => {
            const payload = pendingChartSelectionsRef.current;
            const keys = Object.keys(payload);
            if (keys.length === 0) return;
            pendingChartSelectionsRef.current = {};
            await sendPatchRequest(payload, keys);
          });
          inFlightChartPatchRef.current = nextPatch.catch(() => {});
          return nextPatch;
        });
      }

      return chartFlushPromiseRef.current;
    }

    await sendPatchRequest({ [key]: value }, [key]);
  }, [queryClient]);

  const value = useMemo(
    () => ({ settings, updateSetting, loading, refreshSettings, compactMode }),
    [settings, updateSetting, loading, refreshSettings, compactMode],
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
