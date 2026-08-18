'use client';

import { createContext, useContext, useCallback, useMemo, type ReactNode } from 'react';
import { useUserSettings } from '@/components/user-settings-provider';

type AccountSubheadingsContextType = {
  hideSubheadings: boolean;
  updateHideSubheadings: (val: boolean) => Promise<void>;
  loading: boolean;
};

const AccountSubheadingsContext = createContext<AccountSubheadingsContextType | null>(null);

export function AccountSubheadingsProvider({ children }: { children: ReactNode }) {
  const userSettingsCtx = useUserSettings();
  const hideSubheadings = userSettingsCtx?.settings?.hideAccountSubheadings === true;
  const loading = userSettingsCtx?.loading ?? false;

  const updateHideSubheadings = useCallback(async (val: boolean) => {
    if (userSettingsCtx?.updateSetting) {
      await userSettingsCtx.updateSetting('hideAccountSubheadings', val);
    }
  }, [userSettingsCtx]);

  const value = useMemo(
    () => ({ hideSubheadings, updateHideSubheadings, loading }),
    [hideSubheadings, updateHideSubheadings, loading],
  );

  return (
    <AccountSubheadingsContext.Provider value={value}>
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
