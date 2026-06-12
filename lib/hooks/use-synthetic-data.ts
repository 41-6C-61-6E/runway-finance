'use client';

import { useState, useEffect, useCallback } from 'react';

const DEFAULTS: {
  global: boolean;
  netWorth: boolean;
  investments: boolean;
  realEstate: boolean;
  cashFlowProjections: boolean;
} = {
  global: false,
  netWorth: false,
  investments: false,
  realEstate: false,
  cashFlowProjections: false,
};

export function useSyntheticData() {
  const [settings, setSettings] = useState<typeof DEFAULTS>(DEFAULTS);
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
    (module: keyof typeof DEFAULTS) => {
      if (loading) return true;
      // When global flag is not present, default to true for backward compatibility
      // But when it's explicitly false, respect the individual module toggle
      if (settings.global !== undefined && !settings.global) return false;
      return settings[module] !== false;
    },
    [settings, loading]
  );

  const updateSettings = useCallback(
    async (next: Partial<typeof DEFAULTS>) => {
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
