'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useUserSettings } from '@/components/user-settings-provider';

const DEFAULTS: {
  global: boolean;
  netWorth: boolean;
  investments: boolean;
  realEstate: boolean;
  cashFlowProjections: boolean;
} = {
  global: true,
  netWorth: true,
  investments: true,
  realEstate: true,
  cashFlowProjections: true,
};

export function useImportedData() {
  const userSettingsCtx = useUserSettings();

  const [localSettings, setLocalSettings] = useState<typeof DEFAULTS>(DEFAULTS);
  const [localLoading, setLocalLoading] = useState(!userSettingsCtx);

  useEffect(() => {
    if (userSettingsCtx) return;
    fetch('/api/user-settings', { credentials: 'include', cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        const s = data?.showImportedData;
        if (s && typeof s === 'object') {
          setLocalSettings({ ...DEFAULTS, ...s });
        }
      })
      .catch(() => {})
      .finally(() => setLocalLoading(false));
  }, [userSettingsCtx]);

  const settings = useMemo(() => {
    if (userSettingsCtx) {
      const s = userSettingsCtx.settings?.showImportedData;
      if (s && typeof s === 'object') {
        return { ...DEFAULTS, ...s };
      }
      return DEFAULTS;
    }
    return localSettings;
  }, [userSettingsCtx, userSettingsCtx?.settings?.showImportedData, localSettings]);

  const loading = userSettingsCtx ? userSettingsCtx.loading : localLoading;

  const isEnabled = useCallback(
    (module: keyof typeof DEFAULTS) => {
      if (loading) return true;
      if (settings.global !== undefined && !settings.global) return false;
      return settings[module] !== false;
    },
    [settings, loading]
  );

  const updateSettings = useCallback(
    async (next: Partial<typeof DEFAULTS>) => {
      const prev = settings;
      const merged = { ...prev, ...next };

      if (userSettingsCtx) {
        await userSettingsCtx.updateSetting('showImportedData', merged);
        return;
      }

      setLocalSettings(merged);
      try {
        const res = await fetch('/api/user-settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ showImportedData: merged }),
        });
        if (!res.ok) throw new Error('Failed to save');
      } catch {
        setLocalSettings(prev);
      }
    },
    [settings, userSettingsCtx]
  );

  return { settings, loading, isEnabled, updateSettings };
}
