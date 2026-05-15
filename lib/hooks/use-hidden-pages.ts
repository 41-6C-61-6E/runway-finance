'use client';

import { useState, useEffect, useCallback } from 'react';

export const HIDDEN_PAGE_KEYS = [
  'netWorth',
  'transactions',
  'cashFlow',
  'budgets',
  'realEstate',
  'fire',
  'dataExplorer',
  'goals',
  'spending',
] as const;

export type HiddenPageKey = (typeof HIDDEN_PAGE_KEYS)[number];

export type HiddenPages = Partial<Record<HiddenPageKey, boolean>>;

const defaultHiddenPages: HiddenPages = {};

export function useHiddenPages() {
  const [hiddenPages, setHiddenPages] = useState<HiddenPages>(defaultHiddenPages);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/user-settings', { credentials: 'include', cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        setHiddenPages(data.hiddenPages ?? {});
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

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
      setHiddenPages(next);
      try {
        await fetch('/api/user-settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ hiddenPages: next }),
        });
      } catch {}
    },
    [hiddenPages]
  );

  return { hiddenPages, loading, isHidden, updateHidden };
}
