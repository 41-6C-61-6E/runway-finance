'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';

type PrivacyModeContextType = {
  privacyMode: boolean;
  togglePrivacyMode: () => Promise<void>;
  loading: boolean;
};

const PrivacyModeContext = createContext<PrivacyModeContextType | null>(null);

export function PrivacyModeProvider({ children }: { children: React.ReactNode }) {
  const [privacyMode, setPrivacyMode] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchPrivacyMode = useCallback(async () => {
    try {
      const res = await fetch('/api/user-settings', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setPrivacyMode(data.privacyMode || false);
      }
    } catch {
      setPrivacyMode(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPrivacyMode();
  }, [fetchPrivacyMode]);

  useEffect(() => {
    if (loading) return;
    if (privacyMode) {
      document.documentElement.classList.add('privacy-mode-active');
    } else {
      document.documentElement.classList.remove('privacy-mode-active');
    }
  }, [privacyMode, loading]);

  const togglePrivacyMode = useCallback(async () => {
    const newMode = !privacyMode;
    setPrivacyMode(newMode);
    try {
      await fetch('/api/user-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ privacyMode: newMode }),
      });
    } catch {
      setPrivacyMode(privacyMode);
    }
  }, [privacyMode]);

  return (
    <PrivacyModeContext.Provider value={{ privacyMode, togglePrivacyMode, loading }}>
      {children}
    </PrivacyModeContext.Provider>
  );
}

export function usePrivacyMode() {
  const context = useContext(PrivacyModeContext);
  if (!context) {
    throw new Error('usePrivacyMode must be used within a PrivacyModeProvider');
  }
  return context;
}
