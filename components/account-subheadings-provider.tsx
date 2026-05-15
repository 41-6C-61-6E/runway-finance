'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

type AccountSubheadingsContextType = {
  hideSubheadings: boolean;
  updateHideSubheadings: (val: boolean) => Promise<void>;
  loading: boolean;
};

const AccountSubheadingsContext = createContext<AccountSubheadingsContextType | null>(null);

export function AccountSubheadingsProvider({ children }: { children: ReactNode }) {
  const [hideSubheadings, setHideSubheadings] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchSetting = useCallback(async () => {
    try {
      const res = await fetch('/api/user-settings', { credentials: 'include', cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setHideSubheadings(data.hideAccountSubheadings === true);
      }
    } catch {
      setHideSubheadings(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSetting();
  }, [fetchSetting]);

  const updateHideSubheadings = useCallback(async (val: boolean) => {
    setHideSubheadings(val);
    try {
      await fetch('/api/user-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ hideAccountSubheadings: val }),
      });
    } catch {
      setHideSubheadings(!val);
    }
  }, []);

  return (
    <AccountSubheadingsContext.Provider value={{ hideSubheadings, updateHideSubheadings, loading }}>
      {children}
    </AccountSubheadingsContext.Provider>
  );
}

export function useAccountSubheadings() {
  const context = useContext(AccountSubheadingsContext);
  if (!context) {
    throw new Error('useAccountSubheadings must be used within an AccountSubheadingsProvider');
  }
  return context;
}
