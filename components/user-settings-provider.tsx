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
      if (key === 'chartSelections' || key === 'cardCollapsedStates') {
        const existingData = prev[key] || {};
        const mergedData = { ...existingData, ...value };
        return { ...prev, [key]: mergedData };
      }
      return { ...prev, [key]: value };
    });

    try {
      const bodyPayload = (key === 'chartSelections' || key === 'cardCollapsedStates')
        ? { [key]: value } // For these, value is just the delta key-value object
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
