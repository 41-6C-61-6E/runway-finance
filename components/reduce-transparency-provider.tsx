'use client';

import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { useUserSettings } from '@/components/user-settings-provider';

type ReduceTransparencyContextType = {
  reduceTransparency: boolean;
  updateReduceTransparency: (val: boolean) => Promise<void>;
  loading: boolean;
};

const ReduceTransparencyContext = createContext<ReduceTransparencyContextType | null>(null);

export function ReduceTransparencyProvider({ children }: { children: ReactNode }) {
  const userSettingsCtx = useUserSettings();

  const [localReduceTransparency, setLocalReduceTransparency] = useState(false);
  const [localLoading, setLocalLoading] = useState(!userSettingsCtx);

  const fetchSetting = useCallback(async () => {
    try {
      const res = await fetch('/api/user-settings', { credentials: 'include', cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setLocalReduceTransparency(data?.reduceTransparency === true);
      }
    } catch {
      setLocalReduceTransparency(false);
    } finally {
      setLocalLoading(false);
    }
  }, []);

  useEffect(() => {
    if (userSettingsCtx) return;
    fetchSetting();
  }, [userSettingsCtx, fetchSetting]);

  const reduceTransparency = useMemo(() => {
    if (userSettingsCtx) {
      return userSettingsCtx.settings?.reduceTransparency === true;
    }
    return localReduceTransparency;
  }, [userSettingsCtx, userSettingsCtx?.settings?.reduceTransparency, localReduceTransparency]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (reduceTransparency) {
      document.documentElement.classList.add('reduce-transparency-active');
    } else {
      document.documentElement.classList.remove('reduce-transparency-active');
    }
  }, [reduceTransparency]);

  const loading = userSettingsCtx ? userSettingsCtx.loading : localLoading;

  const updateReduceTransparency = useCallback(
    async (val: boolean) => {
      if (userSettingsCtx) {
        await userSettingsCtx.updateSetting('reduceTransparency', val);
        return;
      }

      setLocalReduceTransparency(val);
      try {
        await fetch('/api/user-settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ reduceTransparency: val }),
        });
      } catch {
        setLocalReduceTransparency(!val);
      }
    },
    [userSettingsCtx]
  );

  const value = useMemo(
    () => ({ reduceTransparency, updateReduceTransparency, loading }),
    [reduceTransparency, updateReduceTransparency, loading],
  );

  return (
    <ReduceTransparencyContext.Provider value={value}>
      {children}
    </ReduceTransparencyContext.Provider>
  );
}

export function useReduceTransparency() {
  const ctx = useContext(ReduceTransparencyContext);
  if (!ctx) {
    return {
      reduceTransparency: false,
      updateReduceTransparency: async () => {},
      loading: false,
    };
  }
  return ctx;
}
