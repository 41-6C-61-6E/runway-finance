'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useUserSettings } from '@/components/user-settings-provider';

export const HIDDEN_PAGE_KEYS = [
  'netWorth',
  'transactions',
  'budgets',
  'realEstate',
  'dataExplorer',
  'goals',
  'spending',
  'financialLogic',
  'investments',
  'flows',
] as const;

// Pages that only appear in the nav when developer mode is enabled
export const DEV_MODE_PAGE_KEYS = ['financialLogic', 'dataExplorer'] as const;

export type HiddenPageKey = (typeof HIDDEN_PAGE_KEYS)[number];

const defaultHiddenPages: Partial<Record<HiddenPageKey, boolean>> = {};

export function useHiddenPages() {
  const userSettingsCtx = useUserSettings();

  const [localHiddenPages, setLocalHiddenPages] = useState<Partial<Record<HiddenPageKey, boolean>>>(defaultHiddenPages);
  const [localLoading, setLocalLoading] = useState(!userSettingsCtx);

  useEffect(() => {
    if (userSettingsCtx) return;
    fetch('/api/user-settings', { credentials: 'include', cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        setLocalHiddenPages(data?.hiddenPages ?? {});
      })
      .catch(() => {})
      .finally(() => setLocalLoading(false));
  }, [userSettingsCtx]);

  const hiddenPages = useMemo<Partial<Record<HiddenPageKey, boolean>>>(() => {
    if (userSettingsCtx) {
      return (userSettingsCtx.settings?.hiddenPages as Partial<Record<HiddenPageKey, boolean>>) ?? defaultHiddenPages;
    }
    return localHiddenPages;
  }, [userSettingsCtx, userSettingsCtx?.settings?.hiddenPages, localHiddenPages]);

  const loading = userSettingsCtx ? userSettingsCtx.loading : localLoading;

  const isHidden = useCallback(
    (pageKey: HiddenPageKey) => {
      if (loading) return false;
      return hiddenPages[pageKey] === true;
    },
    [hiddenPages, loading]
  );

  const updateHidden = useCallback(
    async (pageKey: HiddenPageKey, hidden: boolean) => {
      const prev = hiddenPages;
      const next = { ...prev, [pageKey]: hidden };

      if (userSettingsCtx) {
        await userSettingsCtx.updateSetting('hiddenPages', next);
        return;
      }

      setLocalHiddenPages(next);
      try {
        await fetch('/api/user-settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ hiddenPages: next }),
        });
      } catch {}
    },
    [hiddenPages, userSettingsCtx]
  );

  return { hiddenPages, loading, isHidden, updateHidden };
}
