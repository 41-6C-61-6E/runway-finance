'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

type UserSettingsContextType = {
  settings: Record<string, any>;
  updateSetting: (key: string, value: any) => Promise<void>;
  loading: boolean;
};

const UserSettingsContext = createContext<UserSettingsContextType | null>(null);

export function UserSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/user-settings', { credentials: 'include', cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
      }
    } catch (e) {
      console.error('Failed to load user settings', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const updateSetting = useCallback(async (key: string, value: any) => {
    // Optimistically update local state
    setSettings((prev) => {
      if (key === 'chartSelections') {
        const mergedSelections = { ...(prev.chartSelections || {}), ...value };
        return { ...prev, chartSelections: mergedSelections };
      }
      return { ...prev, [key]: value };
    });

    try {
      const bodyPayload = key === 'chartSelections'
        ? { chartSelections: value } // For chartSelections, value is just the delta key-value object
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
    } catch (e) {
      console.error(`Failed to update setting ${key}`, e);
      // Re-fetch to ensure state consistency with database
      await fetchSettings();
    }
  }, [fetchSettings]);

  return (
    <UserSettingsContext.Provider value={{ settings, updateSetting, loading }}>
      {children}
    </UserSettingsContext.Provider>
  );
}

export function useUserSettings() {
  const context = useContext(UserSettingsContext);
  return context;
}
