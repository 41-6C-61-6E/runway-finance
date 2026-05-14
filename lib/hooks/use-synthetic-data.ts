'use client';

import { useState, useEffect, useCallback } from 'react';

export type SyntheticDataSettings = {
  global: boolean;
  netWorth: boolean;
  realEstate: boolean;
  cashFlowProjections: boolean;
};

const DEFAULTS: SyntheticDataSettings = {
  global: true,
  netWorth: true,
  realEstate: true,
  cashFlowProjections: true,
};

export function useSyntheticData() {
  const [settings, setSettings] = useState<SyntheticDataSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/user-settings', { credentials: 'include', cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        const s = data.showSyntheticData;
        if (s && typeof s === 'object') {
          setSettings({ ...DEFAULTS, ...s });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const isEnabled = useCallback(
    (module: keyof SyntheticDataSettings) => {
      if (loading) return true;
      if (!settings.global) return false;
      return settings[module] !== false;
    },
    [settings, loading]
  );

  const updateSettings = useCallback(
    async (next: Partial<SyntheticDataSettings>) => {
      const prev = settings;
      const merged = { ...prev, ...next };
      setSettings(merged);
      try {
        const res = await fetch('/api/user-settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ showSyntheticData: merged }),
        });
        if (!res.ok) throw new Error('Failed to save');
      } catch {
        setSettings(prev);
      }
    },
    [settings]
  );

  return { settings, loading, isEnabled, updateSettings };
}
