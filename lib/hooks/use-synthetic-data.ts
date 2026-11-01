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
  global: false,
  netWorth: false,
  investments: false,
  realEstate: false,
  cashFlowProjections: false,
};

export function useSyntheticData() {
  const userSettingsCtx = useUserSettings();

  const [localSettings, setLocalSettings] = useState<typeof DEFAULTS>(DEFAULTS);
  const [localLoading, setLocalLoading] = useState(!userSettingsCtx);

  // If outside provider, fetch manually
  useEffect(() => {
    if (userSettingsCtx) return;
    fetch('/api/user-settings', { credentials: 'include', cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        const s = data?.showSyntheticData;
        if (s && typeof s === 'object') {
          setLocalSettings({ ...DEFAULTS, ...s });
        }
      })
      .catch(() => {})
      .finally(() => setLocalLoading(false));
  }, [userSettingsCtx]);

  const settings = useMemo(() => {
    if (userSettingsCtx) {
      const s = userSettingsCtx.settings?.showSyntheticData;
      if (s && typeof s === 'object') {
        return { ...DEFAULTS, ...s };
      }
      return DEFAULTS;
    }
    return localSettings;
  }, [userSettingsCtx, userSettingsCtx?.settings?.showSyntheticData, localSettings]);

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
        await userSettingsCtx.updateSetting('showSyntheticData', merged);
        return;
      }

      setLocalSettings(merged);
      try {
        const res = await fetch('/api/user-settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ showSyntheticData: merged }),
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
