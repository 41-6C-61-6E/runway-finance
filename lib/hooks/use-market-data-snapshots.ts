'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useUserSettings } from '@/components/user-settings-provider';

export function useMarketDataForSnapshots() {
  const userSettingsCtx = useUserSettings();

  const [localEnabled, setLocalEnabled] = useState(false);
  const [localLoading, setLocalLoading] = useState(!userSettingsCtx);

  useEffect(() => {
    if (userSettingsCtx) return;
    fetch('/api/user-settings', { credentials: 'include', cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (typeof data?.useMarketDataForSnapshots === 'boolean') {
          setLocalEnabled(data.useMarketDataForSnapshots);
        }
      })
      .catch(() => {})
      .finally(() => setLocalLoading(false));
  }, [userSettingsCtx]);

  const enabled = useMemo(() => {
    if (userSettingsCtx) {
      return userSettingsCtx.settings?.useMarketDataForSnapshots === true;
    }
    return localEnabled;
  }, [userSettingsCtx, userSettingsCtx?.settings?.useMarketDataForSnapshots, localEnabled]);

  const loading = userSettingsCtx ? userSettingsCtx.loading : localLoading;

  const updateEnabled = useCallback(
    async (next: boolean) => {
      const prev = enabled;

      if (userSettingsCtx) {
        await userSettingsCtx.updateSetting('useMarketDataForSnapshots', next);
        return;
      }

      setLocalEnabled(next);
      try {
        const res = await fetch('/api/user-settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ useMarketDataForSnapshots: next }),
        });
        if (!res.ok) throw new Error('Failed to save');
      } catch {
        setLocalEnabled(prev);
      }
    },
    [enabled, userSettingsCtx]
  );

  return { enabled, loading, updateEnabled };
}
