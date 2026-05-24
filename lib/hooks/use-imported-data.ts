'use client';

import { useState, useEffect, useCallback } from 'react';

export type ImportedDataSettings = {
  global: boolean;
  netWorth: boolean;
  realEstate: boolean;
  cashFlowProjections: boolean;
};

const DEFAULTS: ImportedDataSettings = {
  global: true,
  netWorth: true,
  realEstate: true,
  cashFlowProjections: true,
};

export function useImportedData() {
  const [settings, setSettings] = useState<ImportedDataSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/user-settings', { credentials: 'include', cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        const s = data.showImportedData;
        if (s && typeof s === 'object') {
          setSettings({ ...DEFAULTS, ...s });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const isEnabled = useCallback(
    (module: keyof ImportedDataSettings) => {
      if (loading) return true;
      if (settings.global !== undefined && !settings.global) return false;
      return settings[module] !== false;
    },
    [settings, loading]
  );

  const updateSettings = useCallback(
    async (next: Partial<ImportedDataSettings>) => {
      const prev = settings;
      const merged = { ...prev, ...next };
      setSettings(merged);
      try {
        const res = await fetch('/api/user-settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ showImportedData: merged }),
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
